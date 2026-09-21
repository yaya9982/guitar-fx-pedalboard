// Feed-forward compressor/limiter — a from-scratch replacement for the native
// DynamicsCompressorNode, which carries a fixed ~6ms internal look-ahead buffer on
// every browser implementation, not exposed as a parameter and impossible to disable.
// This is the standard causal topology instead (soft-knee static curve, smoothed in
// the gain-reduction domain with separate attack/release coefficients — see e.g.
// Giannoulis/Massberg/Reiss, "Digital Dynamic Range Compressor Design"): it reacts to
// the signal as it arrives rather than a delayed copy, so it adds zero extra latency.
// The trade-off is the one every zero-latency limiter makes: without look-ahead, a
// very sharp transient can overshoot slightly before the gain catches up, instead of
// being caught pre-emptively.
//
// Multi-channel input is peak-detected across all channels together (stereo-linked)
// and the same gain reduction applied to each, avoiding the image-shift/pumping a
// per-channel-independent detector would cause on a stereo signal.
class DynamicsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -24, minValue: -60, maxValue: 0, automationRate: 'k-rate' },
      { name: 'ratio', defaultValue: 4, minValue: 1, maxValue: 20, automationRate: 'k-rate' },
      { name: 'knee', defaultValue: 30, minValue: 0, maxValue: 40, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 0.003, minValue: 0, maxValue: 0.2, automationRate: 'k-rate' }, // seconds
      { name: 'release', defaultValue: 0.15, minValue: 0.01, maxValue: 1, automationRate: 'k-rate' }, // seconds
    ];
  }

  constructor() {
    super();
    this.envDb = 0; // smoothed gain reduction in dB (0 = unity, negative = reducing)
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const threshold = parameters.threshold[0];
    const ratio = parameters.ratio[0];
    const knee = parameters.knee[0];
    const attackCoeff = Math.exp(-1 / (sampleRate * Math.max(parameters.attack[0], 0.0001)));
    const releaseCoeff = Math.exp(-1 / (sampleRate * Math.max(parameters.release[0], 0.01)));
    const halfKnee = knee / 2;
    const numCh = input.length;
    const numFrames = input[0] ? input[0].length : 0;

    for (let i = 0; i < numFrames; i++) {
      let peak = 0;
      for (let ch = 0; ch < numCh; ch++) {
        const v = Math.abs(input[ch][i]);
        if (v > peak) peak = v;
      }
      const levelDb = peak > 1e-6 ? 20 * Math.log10(peak) : -120;

      const over = levelDb - threshold;
      let targetReductionDb = 0;
      if (knee > 0 && over > -halfKnee && over < halfKnee) {
        const kneeOver = over + halfKnee;
        targetReductionDb = ((1 / ratio - 1) * kneeOver * kneeOver) / (2 * knee);
      } else if (over >= halfKnee) {
        targetReductionDb = (1 / ratio - 1) * over;
      }

      // Attack while gain reduction is deepening (getting more negative), release
      // while it's recovering back toward 0 — smoothing the gain computer's output,
      // not the level detector, which is what keeps this response musical.
      const coeff = targetReductionDb < this.envDb ? attackCoeff : releaseCoeff;
      this.envDb = targetReductionDb + coeff * (this.envDb - targetReductionDb);

      const gainLin = Math.exp(this.envDb * 0.11512925464970229); // 10^(dB/20) == e^(dB*ln10/20)
      for (let ch = 0; ch < numCh; ch++) output[ch][i] = input[ch][i] * gainLin;
    }
    return true;
  }
}

registerProcessor('dynamics-processor', DynamicsProcessor);
