const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Autocorrelation pitch detection with parabolic interpolation for sub-sample precision.
// Standard technique for real-time instrument tuners; O(n^2) but fine at ~30fps with a 2048 buffer.
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

  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n - i; j++) sum += trimmed[j] * trimmed[j + i];
    c[i] = sum;
  }

  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;

  let maxVal = -1, maxPos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos <= 0 || maxPos >= n - 1) return -1;

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
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const freq = autoCorrelate(this.buf, this.sampleRate);
      if (freq !== -1 && freq > 60 && freq < 1300) callback(frequencyToNote(freq));
      else callback(null);
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
