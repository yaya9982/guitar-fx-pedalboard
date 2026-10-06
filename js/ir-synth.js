// Procedural impulse-response generation for reverb + cabinet simulation.
// Everything here is synthesized in code via OfflineAudioContext at startup —
// nothing is fetched, so it works fully offline.

function makeWhiteNoiseBuffer(offlineCtx, seconds) {
  const length = Math.max(1, Math.ceil(seconds * offlineCtx.sampleRate));
  const buffer = offlineCtx.createBuffer(1, length, offlineCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// Rendering an IR spins up an OfflineAudioContext, and the Signal Preview re-runs every
// pedal's createNodes on each knob move — cache by inputs so each IR renders once.
const irCache = new Map();
function cached(key, make) {
  if (!irCache.has(key)) irCache.set(key, make());
  return irCache.get(key);
}

async function render(sampleRate, seconds, build) {
  const length = Math.max(1, Math.ceil(seconds * sampleRate));
  const offlineCtx = new OfflineAudioContext(1, length, sampleRate);
  const noise = makeWhiteNoiseBuffer(offlineCtx, seconds);
  const source = offlineCtx.createBufferSource();
  source.buffer = noise;
  const envelope = offlineCtx.createGain();
  envelope.gain.setValueAtTime(1, 0);
  envelope.gain.exponentialRampToValueAtTime(0.0008, seconds);

  build(offlineCtx, source, envelope);

  source.start(0);
  const rendered = await offlineCtx.startRendering();
  return rendered;
}

export const REVERB_TYPES = {
  room: { label: 'Room', decaySeconds: 0.9 },
  plate: { label: 'Plate', decaySeconds: 1.8 },
  hall: { label: 'Hall', decaySeconds: 3.2 },
  spring: { label: 'Spring', decaySeconds: 1.2 },
};

export const generateReverbIR = (sampleRate, type = 'room') => cached(`rev:${sampleRate}:${type}`, () => buildReverbIR(sampleRate, type));

async function buildReverbIR(sampleRate, type) {
  const cfg = REVERB_TYPES[type] || REVERB_TYPES.room;
  return render(sampleRate, cfg.decaySeconds, (ctx, source, envelope) => {
    switch (type) {
      case 'plate': {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 150;
        const shimmer = ctx.createBiquadFilter();
        shimmer.type = 'peaking'; shimmer.frequency.value = 3200; shimmer.Q.value = 0.7; shimmer.gain.value = 4;
        source.connect(hp).connect(shimmer).connect(envelope).connect(ctx.destination);
        break;
      }
      case 'hall': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 6000;
        const early1 = ctx.createDelay(0.1); early1.delayTime.value = 0.021;
        const early2 = ctx.createDelay(0.1); early2.delayTime.value = 0.037;
        const earlyGain1 = ctx.createGain(); earlyGain1.gain.value = 0.5;
        const earlyGain2 = ctx.createGain(); earlyGain2.gain.value = 0.35;
        source.connect(lp);
        lp.connect(envelope);
        lp.connect(early1).connect(earlyGain1).connect(envelope);
        lp.connect(early2).connect(earlyGain2).connect(envelope);
        envelope.connect(ctx.destination);
        break;
      }
      case 'spring': {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 3.5;
        const comb = ctx.createDelay(0.05); comb.delayTime.value = 0.006;
        const combGain = ctx.createGain(); combGain.gain.value = 0.55;
        const combFeedback = ctx.createGain(); combFeedback.gain.value = 0.4;
        source.connect(bp);
        bp.connect(envelope);
        bp.connect(comb);
        comb.connect(combGain).connect(envelope);
        comb.connect(combFeedback).connect(comb);
        envelope.connect(ctx.destination);
        break;
      }
      case 'room':
      default: {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 3500;
        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 150; lowShelf.gain.value = 2;
        source.connect(lp).connect(lowShelf).connect(envelope).connect(ctx.destination);
        break;
      }
    }
  });
}

export const generateCabIR = (sampleRate, opts = {}) => cached(`cab:${sampleRate}:${JSON.stringify(opts)}`, () => buildCabIR(sampleRate, opts));

async function buildCabIR(sampleRate, opts) {
  const {
    resonanceHz = 2800,
    resonanceQ = 2.5,
    lowpassHz = 5000,
    highpassHz = 100,
    decayMs = 20,
    reflections = 2,
  } = opts;
  const seconds = decayMs / 1000;
  return render(sampleRate, seconds, (ctx, source, envelope) => {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = highpassHz;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = lowpassHz;
    const resonance = ctx.createBiquadFilter();
    resonance.type = 'peaking'; resonance.frequency.value = resonanceHz; resonance.Q.value = resonanceQ; resonance.gain.value = 7;

    source.connect(hp).connect(lp).connect(resonance).connect(envelope);
    envelope.connect(ctx.destination);

    for (let i = 1; i <= reflections; i++) {
      const delay = ctx.createDelay(0.02);
      delay.delayTime.value = (i * 3.5) / 1000;
      const tapGain = ctx.createGain();
      tapGain.gain.value = 0.35 / i;
      resonance.connect(delay).connect(tapGain).connect(envelope);
    }
  });
}

export const generateAcousticBodyIR = (sampleRate) => cached(`body:${sampleRate}`, () => buildAcousticBodyIR(sampleRate));

// Body resonances as a direct path plus a few damped cosines (the "least-damped modes as
// parametric resonators" idea of Karjalainen & Smith, 1996), not a noise burst. Keeping the
// direct impulse means the pick attack and the string's own tone pass through untouched and the
// body only adds its resonances on top, like a transfer function from pickup to mic.
//   f   resonance frequency (Hz); t60 ring time (s); g linear gain the mode adds at its peak.
// 116 and 219 Hz are the Helmholtz-coupled and top-plate modes measured on a steel-string
// guitar (Hess, Savart Journal 2014); 130 Hz is that guitar's Helmholtz antinode. Top-plate
// damping (Q ~ 9, ring ~ 0.1 s) is derived from the same paper's lumped-model table; the
// Helmholtz mode rings longer. The other modes are indicative values from a student FEM study.
const BODY_MODES = [
  { f: 108, t60: 0.30, g: 1.0 },
  { f: 147, t60: 0.15, g: 0.35 },
  { f: 190, t60: 0.12, g: 0.35 },
  { f: 219, t60: 0.10, g: 0.6 },
  { f: 272, t60: 0.08, g: 0.3 },
  { f: 302, t60: 0.07, g: 0.3 },
];

async function buildAcousticBodyIR(sampleRate) {
  const seconds = 0.4;
  const length = Math.ceil(seconds * sampleRate);
  const buffer = new AudioBuffer({ length, sampleRate, numberOfChannels: 1 });
  const h = buffer.getChannelData(0);
  h[0] = 1;
  for (const { f, t60, g } of BODY_MODES) {
    const tau = t60 / 6.908; // amplitude time constant: 60 dB = 6.908 tau
    const a = (2 * g) / (tau * sampleRate); // a damped cosine peaks at a*tau*fs/2 in the frequency domain
    for (let n = 0; n < length; n++) h[n] += a * Math.exp(-n / (tau * sampleRate)) * Math.cos((2 * Math.PI * f * n) / sampleRate);
  }
  return buffer;
}
