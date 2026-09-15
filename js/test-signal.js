// Synthesizes plucked notes/chords straight into the engine's input node, bypassing the
// mic, so the pedal/amp chain (distortion included) can be checked without a guitar plugged in.
const SEQUENCE = [
  { freqs: [82.41], dur: 0.9, amt: 0.3 },                                    // low E, single pluck
  { freqs: [82.41, 123.47, 164.81, 207.65, 246.94, 329.63], dur: 2.0, amt: 0.16 }, // E major
  { freqs: [110.0, 164.81, 220.0, 261.63, 329.63], dur: 2.0, amt: 0.16 },          // A minor
  { freqs: [98.0, 123.47, 146.83, 196.0, 246.94, 392.0], dur: 2.0, amt: 0.16 },    // G major
];

function pluck(ctx, targetNode, freq, time, dur, amt) {
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = freq;
  const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = freq * 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(amt, time + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0005, time + dur);
  const g2 = ctx.createGain(); g2.gain.value = 0.35;
  osc.connect(g);
  osc2.connect(g2).connect(g);
  g.connect(targetNode);
  osc.start(time); osc.stop(time + dur + 0.05);
  osc2.start(time); osc2.stop(time + dur + 0.05);
}

export function playTestSequence(engine) {
  if (!engine || !engine.ctx) return Promise.resolve();
  const ctx = engine.ctx;
  const gap = 0.35;
  let t = ctx.currentTime + 0.1;
  for (const step of SEQUENCE) {
    step.freqs.forEach((f) => pluck(ctx, engine.inputGain, f, t, step.dur, step.amt));
    t += step.dur + gap;
  }
  const totalMs = (t - ctx.currentTime) * 1000;
  return new Promise((resolve) => setTimeout(resolve, totalMs));
}
