// Sample-accurate arrival detector for the round-trip latency test (see
// AudioEngine.measureRoundTripLatency). Runs in the audio thread so the detected
// time comes from the same clock (AudioWorkletGlobalScope's `currentTime`) the
// main thread used to schedule the test click — no postMessage/rAF jitter in
// the measurement itself, unlike polling an AnalyserNode from the main thread.
class LatencyProbeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.state = 'idle'; // 'calibrating' | 'armed' | 'done'
    this.calibSamples = 0;
    this.calibPeak = 0;
    this.threshold = 0.02;
    this.port.onmessage = (e) => {
      if (e.data === 'calibrate') {
        this.state = 'calibrating';
        this.calibSamples = 0;
        this.calibPeak = 0;
      } else if (e.data === 'arm') {
        // A few times the ambient peak, with a floor — adapts to the room/gain
        // staging without false-triggering on the noise floor alone.
        this.threshold = Math.max(this.calibPeak * 4, 0.01);
        this.state = 'armed';
      }
    };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;

    if (this.state === 'calibrating') {
      for (let i = 0; i < ch.length; i++) this.calibPeak = Math.max(this.calibPeak, Math.abs(ch[i]));
      this.calibSamples += ch.length;
      if (this.calibSamples >= sampleRate * 0.15) {
        this.port.postMessage({ type: 'calibrated', peak: this.calibPeak });
        this.state = 'idle';
      }
    } else if (this.state === 'armed') {
      for (let i = 0; i < ch.length; i++) {
        if (Math.abs(ch[i]) > this.threshold) {
          this.port.postMessage({ type: 'detected', time: currentTime + i / sampleRate });
          this.state = 'done';
          break;
        }
      }
    }
    return true;
  }
}

registerProcessor('latency-probe-processor', LatencyProbeProcessor);
