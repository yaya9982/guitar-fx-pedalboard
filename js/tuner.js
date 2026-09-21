const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Standard 6-string tuning, low to high. Frequencies are the standard 12-TET values
// (A4 = 440Hz), not derived from any particular instrument or brand's spec.
// gaugeIn is a typical light-gauge electric set (e.g. Ernie Ball Regular Slinky:
// .010/.013/.017/.026/.036/.046") — used only to scale the string-line thickness
// in the tuner's guitar illustration, in real inches so the ~4.6x low-to-high
// ratio is accurate rather than eyeballed.
export const GUITAR_STRINGS = [
  { id: 'E2', label: 'E', octave: 2, freq: 82.41, gaugeIn: 0.046 },
  { id: 'A2', label: 'A', octave: 2, freq: 110.00, gaugeIn: 0.036 },
  { id: 'D3', label: 'D', octave: 3, freq: 146.83, gaugeIn: 0.026 },
  { id: 'G3', label: 'G', octave: 3, freq: 196.00, gaugeIn: 0.017 },
  { id: 'B3', label: 'B', octave: 3, freq: 246.94, gaugeIn: 0.013 },
  { id: 'E4', label: 'e', octave: 4, freq: 329.63, gaugeIn: 0.010 },
];

// Cents offset of a detected frequency from a specific target (e.g. a chosen string),
// rather than from whatever chromatic note happens to be nearest — used by "focused"
// per-string tuning mode, where a wildly out-of-tune string should still read as
// "flat/sharp of THIS string," not jump to a different note name.
export function centsFromTarget(freq, targetFreq) {
  return Math.round(1200 * Math.log2(freq / targetFreq));
}

// Autocorrelation pitch detection with parabolic interpolation for sub-sample precision.
// Standard technique for real-time instrument tuners; O(n*maxLag), run at ~30fps (see Tuner.start).
export function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // too quiet / silence

  const thres = 0.2;
  let r1 = 0, r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; } }

  const trimmed = buf.slice(r1, r2);
  const n = trimmed.length;
  if (n < 8) return -1;

  // Lags past one period of the lowest pitch we report (~55Hz) can't matter, so skip them.
  const maxLag = Math.min(n, Math.ceil(sampleRate / 55));
  const c = new Float32Array(maxLag);
  for (let i = 0; i < maxLag; i++) {
    let sum = 0;
    for (let j = 0; j < n - i; j++) sum += trimmed[j] * trimmed[j + i];
    c[i] = sum;
  }

  let d = 0;
  while (d < maxLag - 1 && c[d] > c[d + 1]) d++;

  let maxVal = -1, maxPos = -1;
  for (let i = d; i < maxLag; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos <= 0 || maxPos >= maxLag - 1) return -1;

  const x1 = c[maxPos - 1], x2 = c[maxPos], x3 = c[maxPos + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const refinedPos = a ? maxPos - b / (2 * a) : maxPos;

  return sampleRate / refinedPos;
}

export function frequencyToNote(freq) {
  const noteNum = 12 * Math.log2(freq / 440) + 69;
  const rounded = Math.round(noteNum);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  const cents = Math.round((noteNum - rounded) * 100);
  return { name, octave, cents, frequency: freq };
}

export class Tuner {
  constructor(analyserNode, sampleRate) {
    this.analyser = analyserNode;
    this.sampleRate = sampleRate;
    this.buf = new Float32Array(analyserNode.fftSize);
    this.running = false;
    this.rafId = null;
  }

  start(callback) {
    this.stop(); // re-entering the tab must not stack a second rAF loop
    this.running = true;
    let last = 0;
    const loop = (t = 0) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      if (t - last < 33) return; // ~30fps is plenty for a needle; halves main-thread work
      last = t;
      this.analyser.getFloatTimeDomainData(this.buf);
      const freq = autoCorrelate(this.buf, this.sampleRate);
      if (freq !== -1 && freq > 60 && freq < 1300) callback(frequencyToNote(freq));
      else callback(null);
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
