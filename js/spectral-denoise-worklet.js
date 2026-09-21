// Real-time adaptive spectral noise reduction (classical spectral subtraction / Wiener-style
// gain masking) — not a neural network, but genuinely automatic: it continuously learns the
// ambient noise spectrum with no manual "capture profile" step, biased to update fast during
// quiet passages and hold/slow-adapt during loud playing so it can't mistake a sustained note
// for rising noise.
//
// Runs a 512-sample STFT with 256-sample (50%) hop, hand-written radix-2 FFT (no libraries).
// Hop = 2x the 128-sample render quantum, so buffering aligns cleanly across process() calls.

const N = 512;
const H = 256;
const HALF = N / 2;
const BITS = 9; // log2(512)

function buildBitRevTable() {
  const table = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    let x = i, r = 0;
    for (let b = 0; b < BITS; b++) { r = (r << 1) | (x & 1); x >>= 1; }
    table[i] = r;
  }
  return table;
}

function buildTwiddles() {
  const cosTable = new Float32Array(HALF);
  const sinTable = new Float32Array(HALF);
  for (let k = 0; k < HALF; k++) {
    const angle = (2 * Math.PI * k) / N;
    cosTable[k] = Math.cos(angle);
    sinTable[k] = Math.sin(angle);
  }
  return { cosTable, sinTable };
}

function buildHannWindow() {
  // Periodic Hann (denominator N, not N-1) — this is what makes 50%-overlap-add sum to a
  // constant with no separate normalization pass.
  const w = new Float32Array(N);
  for (let n = 0; n < N; n++) w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
  return w;
}

// Iterative radix-2 Cooley-Tukey, in place, shared for forward (inverse=false) and inverse.
function fftInPlace(real, imag, inverse, bitRev, cosTable, sinTable) {
  for (let i = 0; i < N; i++) {
    const j = bitRev[i];
    if (j > i) {
      let t = real[i]; real[i] = real[j]; real[j] = t;
      t = imag[i]; imag[i] = imag[j]; imag[j] = t;
    }
  }
  for (let size = 2; size <= N; size *= 2) {
    const half = size / 2;
    const tableStep = N / size;
    for (let b = 0; b < N; b += size) {
      for (let j = 0; j < half; j++) {
        const idx = j * tableStep;
        const wRe = cosTable[idx];
        const wIm = inverse ? sinTable[idx] : -sinTable[idx];
        const ai = b + j, bi = b + j + half;
        const tRe = real[bi] * wRe - imag[bi] * wIm;
        const tIm = real[bi] * wIm + imag[bi] * wRe;
        real[bi] = real[ai] - tRe;
        imag[bi] = imag[ai] - tIm;
        real[ai] += tRe;
        imag[ai] += tIm;
      }
    }
  }
}

class SpectralDenoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'strength', defaultValue: 50, minValue: 0, maxValue: 100, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.enabled = false; // opt-in: adds latency, so off by default until the user asks for it
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.enabled === 'boolean') this.enabled = e.data.enabled;
    };

    this.bitRev = buildBitRevTable();
    const tw = buildTwiddles();
    this.cosTable = tw.cosTable;
    this.sinTable = tw.sinTable;
    this.window = buildHannWindow();

    const hopSeconds = H / sampleRate;
    this.attackCoef = Math.exp(-hopSeconds / 0.008);  // ~8ms: mask opens fast on note attacks
    this.releaseCoef = Math.exp(-hopSeconds / 0.03);  // ~30ms: mask closes slowly, avoids chatter

    this.channels = [];
  }

  _ensureChannel(ch) {
    let st = this.channels[ch];
    if (st) return st;
    st = {
      pendingInput: new Float32Array(H),
      frameBuf: new Float32Array(N),
      real: new Float32Array(N),
      imag: new Float32Array(N),
      outAcc: new Float32Array(N),
      leftover: new Float32Array(H / 2),
      phase: 0,
      mag: new Float32Array(HALF + 1),
      noiseMag: new Float32Array(HALF + 1).fill(1e-6),
      rawGain: new Float32Array(HALF + 1),
      freqSmoothedGain: new Float32Array(HALF + 1),
      prevGain: new Float32Array(HALF + 1).fill(1),
      bootstrapCount: 0,
    };
    this.channels[ch] = st;
    return st;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    // This node sits permanently in the input path (see audio-engine.js), so when
    // Denoise is off — the default — every user was paying for the full 512-point
    // FFT/inverse-FFT on every render quantum just to throw the result away below.
    // Skip it entirely instead: a plain copy costs nothing and carries zero latency
    // either way. Trade-off: the noise-floor estimate stops adapting while off, so
    // turning Denoise on starts a ~15-frame (~80ms) re-bootstrap instead of already
    // having a warm profile — inaudible on its own, and far cheaper than spending
    // CPU on FFTs nobody's hearing the whole time the effect is off.
    if (!this.enabled) {
      for (let ch = 0; ch < input.length; ch++) output[ch].set(input[ch]);
      return true;
    }

    const strength = parameters.strength[0] / 100;
    const oversub = 1.0 + 2.5 * strength;
    const floorVal = 0.35 - 0.28 * strength;
    const globalMinGain = 0.12;

    for (let ch = 0; ch < input.length; ch++) {
      const st = this._ensureChannel(ch);
      const inCh = input[ch];
      const outCh = output[ch];

      st.pendingInput.set(inCh, st.phase * 128);

      if (st.phase === 0) {
        outCh.set(st.leftover);
      } else {
        st.frameBuf.copyWithin(0, H);
        st.frameBuf.set(st.pendingInput, N - H);

        for (let n = 0; n < N; n++) {
          st.real[n] = st.frameBuf[n] * this.window[n];
          st.imag[n] = 0;
        }

        fftInPlace(st.real, st.imag, false, this.bitRev, this.cosTable, this.sinTable);

        for (let k = 0; k <= HALF; k++) {
          st.mag[k] = Math.sqrt(st.real[k] * st.real[k] + st.imag[k] * st.imag[k]);
        }

        let frameSum = 0, noiseSum = 0;
        for (let k = 0; k <= HALF; k++) { frameSum += st.mag[k]; noiseSum += st.noiseMag[k]; }
        const ratio = frameSum / (noiseSum + 1e-8);

        if (st.bootstrapCount < 15) {
          for (let k = 0; k <= HALF; k++) st.noiseMag[k] = 0.9 * st.noiseMag[k] + 0.1 * st.mag[k];
          st.bootstrapCount++;
        } else if (ratio < 1.5) {
          for (let k = 0; k <= HALF; k++) st.noiseMag[k] = 0.9 * st.noiseMag[k] + 0.1 * st.mag[k];
        } else {
          for (let k = 0; k <= HALF; k++) {
            if (st.mag[k] < st.noiseMag[k]) st.noiseMag[k] = 0.997 * st.noiseMag[k] + 0.003 * st.mag[k];
          }
        }

        for (let k = 0; k <= HALF; k++) {
          const power = st.mag[k] * st.mag[k];
          const noisePower = st.noiseMag[k] * st.noiseMag[k];
          const subtracted = power - oversub * noisePower;
          const raw = Math.sqrt(Math.max(floorVal * floorVal, subtracted / (power + 1e-8)));
          st.rawGain[k] = Math.max(raw, globalMinGain);
        }

        st.freqSmoothedGain[0] = 0.75 * st.rawGain[0] + 0.25 * st.rawGain[1];
        for (let k = 1; k < HALF; k++) {
          st.freqSmoothedGain[k] = 0.25 * st.rawGain[k - 1] + 0.5 * st.rawGain[k] + 0.25 * st.rawGain[k + 1];
        }
        st.freqSmoothedGain[HALF] = 0.75 * st.rawGain[HALF] + 0.25 * st.rawGain[HALF - 1];

        for (let k = 0; k <= HALF; k++) {
          const target = st.freqSmoothedGain[k];
          const coef = target > st.prevGain[k] ? this.attackCoef : this.releaseCoef;
          const g = coef * st.prevGain[k] + (1 - coef) * target;
          st.prevGain[k] = g;
          st.real[k] *= g;
          st.imag[k] *= g;
        }
        st.imag[0] = 0;
        st.imag[HALF] = 0;
        for (let k = 1; k < HALF; k++) {
          st.real[N - k] = st.real[k];
          st.imag[N - k] = -st.imag[k];
        }

        fftInPlace(st.real, st.imag, true, this.bitRev, this.cosTable, this.sinTable);

        for (let n = 0; n < N; n++) st.outAcc[n] += st.real[n] / N;

        outCh.set(st.outAcc.subarray(0, 128));
        st.leftover.set(st.outAcc.subarray(128, 256));

        st.outAcc.copyWithin(0, H);
        st.outAcc.fill(0, N - H, N);
      }

      st.phase = 1 - st.phase;
    }
    return true;
  }
}

registerProcessor('spectral-denoise-processor', SpectralDenoiseProcessor);
