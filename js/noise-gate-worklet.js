// Envelope-follower noise gate. No native Web Audio node does this, so it runs
// sample-accurately in the audio thread via AudioWorklet to avoid zipper noise.
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -80, maxValue: 0, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 150, minValue: 5, maxValue: 1000, automationRate: 'k-rate' },
      { name: 'holdMs', defaultValue: 60, minValue: 0, maxValue: 500, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
    this.gain = 1;
    this.holdCounter = 0;
    this.enabled = true;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.enabled === 'boolean') this.enabled = e.data.enabled;
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    if (!this.enabled) {
      for (let ch = 0; ch < input.length; ch++) output[ch].set(input[ch]);
      return true;
    }

    const thresholdLin = Math.pow(10, parameters.threshold[0] / 20); // linear compare: no per-sample log10
    const releaseMs = parameters.release[0];
    const holdMs = parameters.holdMs[0];

    const attackCoef = Math.exp(-1 / (0.003 * sampleRate));   // ~3ms envelope attack
    const envReleaseCoef = Math.exp(-1 / (0.06 * sampleRate)); // ~60ms envelope release
    const gateOpenCoef = Math.exp(-1 / (0.005 * sampleRate));  // fast open, ~5ms
    const gateCloseCoef = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
    const holdSamples = (holdMs / 1000) * sampleRate;

    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      let envelope = this.envelope;
      let gain = this.gain;
      let holdCounter = this.holdCounter;

      for (let i = 0; i < inCh.length; i++) {
        const abs = Math.abs(inCh[i]);
        envelope = abs > envelope
          ? attackCoef * envelope + (1 - attackCoef) * abs
          : envReleaseCoef * envelope + (1 - envReleaseCoef) * abs;

        let target;
        if (envelope + 1e-8 > thresholdLin) {
          holdCounter = holdSamples;
          target = 1;
        } else if (holdCounter > 0) {
          holdCounter -= 1;
          target = 1;
        } else {
          target = 0;
        }

        const coef = target > gain ? gateOpenCoef : gateCloseCoef;
        gain = coef * gain + (1 - coef) * target;

        outCh[i] = inCh[i] * gain;
      }

      if (ch === input.length - 1) {
        this.envelope = envelope;
        this.gain = gain;
        this.holdCounter = holdCounter;
      }
    }
    return true;
  }
}

// Shares the noise gate's envelope-follower technique, but outputs the tracked
// envelope itself as an audio-rate control signal (0..1) instead of gating —
// used to drive an Envelope Filter (auto-wah controlled by playing dynamics).
class EnvelopeFollowerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'sensitivity', defaultValue: 1, minValue: 0.2, maxValue: 4, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output[0]) return true;

    const sensitivity = parameters.sensitivity[0];
    const inCh = input[0];
    const outCh = output[0];
    const attackCoef = Math.exp(-1 / (0.004 * sampleRate));
    const releaseCoef = Math.exp(-1 / (0.15 * sampleRate));
    let envelope = this.envelope;

    for (let i = 0; i < inCh.length; i++) {
      const abs = Math.abs(inCh[i]);
      envelope = abs > envelope ? attackCoef * envelope + (1 - attackCoef) * abs : releaseCoef * envelope + (1 - releaseCoef) * abs;
      outCh[i] = envelope * sensitivity;
    }
    for (let ch = 1; ch < output.length; ch++) output[ch].set(outCh);

    this.envelope = envelope;
    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
registerProcessor('envelope-follower-processor', EnvelopeFollowerProcessor);
