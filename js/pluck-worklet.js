// Karplus-Strong plucked-string synthesis for the tuner's reference-tone button — a
// short filtered-noise burst recirculated through a damped delay loop, the classic
// physical-modeling trick for a cheap, convincingly acoustic guitar pluck without any
// sampled audio. The delay length is exactly the target frequency's period in samples,
// so the pitch stays sample-accurate for tuning purposes; it just sounds like a string
// instead of a lab tone.
class PluckProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const freq = (options.processorOptions && options.processorOptions.frequency) || 440;
    this.period = Math.max(2, Math.round(sampleRate / freq));
    this.buffer = new Float32Array(this.period);

    // Lightly smoothed noise burst, not pure white noise — a real pluck's attack is
    // bright but not harsh, and smoothing avoids a clicky, digital-sounding onset.
    let prev = 0;
    for (let i = 0; i < this.period; i++) {
      const white = Math.random() * 2 - 1;
      prev = 0.55 * white + 0.45 * prev;
      this.buffer[i] = prev;
    }
    this.readIndex = 0;

    // Damping just under 1: thinner/higher strings decay faster, same as a real guitar.
    this.damping = 0.994 - Math.min(0.02, freq / 100000);
    this.quietSamples = 0;
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      const cur = this.buffer[this.readIndex];
      const next = this.buffer[(this.readIndex + 1) % this.period];
      this.buffer[this.readIndex] = 0.5 * (cur + next) * this.damping;
      out[i] = cur;
      this.readIndex = (this.readIndex + 1) % this.period;
      this.quietSamples = Math.abs(cur) < 0.0005 ? this.quietSamples + 1 : 0;
    }
    return this.quietSamples < sampleRate * 0.5; // let the browser stop calling us once it's decayed to silence
  }
}

registerProcessor('pluck-processor', PluckProcessor);
