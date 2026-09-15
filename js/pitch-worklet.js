// Two pitch-related processors that can't be built from native nodes alone:
//  - OctaverProcessor: analog-style octave-down via zero-crossing frequency division
//  - PitchShifterProcessor: simple delay-line/granular pitch shifter (crossfaded dual taps)

class OctaverProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'octaveLevel', defaultValue: 60, minValue: 0, maxValue: 100, automationRate: 'k-rate' },
      { name: 'dryLevel', defaultValue: 100, minValue: 0, maxValue: 100, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.prevSample = [];
    this.squareSign = [];
    this.risingCount = [];
    this.smoothedSquare = [];
    this.envelope = [];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const octaveLevel = parameters.octaveLevel[0] / 100;
    const dryLevel = parameters.dryLevel[0] / 100;
    const envAttack = Math.exp(-1 / (0.005 * sampleRate));
    const envRelease = Math.exp(-1 / (0.08 * sampleRate));
    const smoothCoef = Math.exp(-1 / (0.00035 * sampleRate)); // soften the raw square wave

    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      if (this.prevSample[ch] === undefined) {
        this.prevSample[ch] = 0;
        this.squareSign[ch] = 1;
        this.risingCount[ch] = 0;
        this.smoothedSquare[ch] = 0;
        this.envelope[ch] = 0;
      }
      let prev = this.prevSample[ch];
      let sign = this.squareSign[ch];
      let count = this.risingCount[ch];
      let smoothed = this.smoothedSquare[ch];
      let env = this.envelope[ch];

      for (let i = 0; i < inCh.length; i++) {
        const sample = inCh[i];
        if (prev <= 0 && sample > 0) {
          count += 1;
          if (count % 2 === 0) sign = -sign;
        }
        prev = sample;

        const abs = Math.abs(sample);
        env = abs > env ? envAttack * env + (1 - envAttack) * abs : envRelease * env + (1 - envRelease) * abs;

        smoothed = smoothCoef * smoothed + (1 - smoothCoef) * sign;

        outCh[i] = sample * dryLevel + smoothed * env * 2.2 * octaveLevel;
      }

      this.prevSample[ch] = prev;
      this.squareSign[ch] = sign;
      this.risingCount[ch] = count;
      this.smoothedSquare[ch] = smoothed;
      this.envelope[ch] = env;
    }
    return true;
  }
}

class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'semitones', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 50, minValue: 0, maxValue: 100, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    // Delay-line pitch shifting has inherent latency of roughly half the buffer window
    // (2048 samples ≈ 21-23ms at 44.1/48kHz). Smaller trades a bit more grain for less lag.
    this.bufferSize = 2048;
    this.buffers = [];
    this.writeIndex = [];
    this.readA = [];
    this.readB = [];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const semitones = parameters.semitones[0];
    const mix = parameters.mix[0] / 100;
    const ratio = Math.pow(2, semitones / 12);
    const N = this.bufferSize;
    const half = N / 2;

    for (let ch = 0; ch < input.length; ch++) {
      if (!this.buffers[ch]) {
        this.buffers[ch] = new Float32Array(N);
        this.writeIndex[ch] = 0;
        this.readA[ch] = 0;
        this.readB[ch] = half;
      }
      const buf = this.buffers[ch];
      const inCh = input[ch];
      const outCh = output[ch];
      let w = this.writeIndex[ch];
      let rA = this.readA[ch];
      let rB = this.readB[ch];

      for (let i = 0; i < inCh.length; i++) {
        buf[w] = inCh[i];
        w = (w + 1) % N;

        const ia = Math.floor(rA), ia2 = (ia + 1) % N, fa = rA - ia;
        const sampleA = buf[ia] * (1 - fa) + buf[ia2] * fa;
        const ib = Math.floor(rB), ib2 = (ib + 1) % N, fb = rB - ib;
        const sampleB = buf[ib] * (1 - fb) + buf[ib2] * fb;

        let distA = w - rA; if (distA < 0) distA += N;
        let distB = w - rB; if (distB < 0) distB += N;
        const winA = Math.max(0, 1 - Math.abs(distA / half - 1));
        const winB = Math.max(0, 1 - Math.abs(distB / half - 1));
        const wSum = winA + winB || 1;

        const wet = (sampleA * winA + sampleB * winB) / wSum;
        outCh[i] = inCh[i] * (1 - mix) + wet * mix;

        rA += ratio; if (rA >= N) rA -= N; if (rA < 0) rA += N;
        rB += ratio; if (rB >= N) rB -= N; if (rB < 0) rB += N;
      }

      this.writeIndex[ch] = w;
      this.readA[ch] = rA;
      this.readB[ch] = rB;
    }
    return true;
  }
}

registerProcessor('octaver-processor', OctaverProcessor);
registerProcessor('pitch-shifter-processor', PitchShifterProcessor);
