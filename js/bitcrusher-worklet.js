// Bit Crusher: true sample-and-hold (sample-rate reduction) + amplitude quantization
// (bit-depth reduction). Native nodes can't hold samples across time, hence a worklet.
class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'reduction', defaultValue: 4, minValue: 1, maxValue: 60, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 100, minValue: 0, maxValue: 100, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.holdCounters = [];
    this.holdValues = [];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const bits = Math.round(parameters.bits[0]);
    const reduction = Math.max(1, Math.round(parameters.reduction[0]));
    const mix = parameters.mix[0] / 100;
    const levels = Math.pow(2, bits);

    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      if (this.holdCounters[ch] === undefined) {
        this.holdCounters[ch] = 0;
        this.holdValues[ch] = 0;
      }
      let counter = this.holdCounters[ch];
      let held = this.holdValues[ch];

      for (let i = 0; i < inCh.length; i++) {
        if (counter <= 0) {
          const quantized = Math.round(inCh[i] * levels) / levels;
          held = Math.max(-1, Math.min(1, quantized));
          counter = reduction;
        }
        counter -= 1;
        outCh[i] = inCh[i] * (1 - mix) + held * mix;
      }
      this.holdCounters[ch] = counter;
      this.holdValues[ch] = held;
    }
    return true;
  }
}

registerProcessor('bitcrusher-processor', BitcrusherProcessor);
