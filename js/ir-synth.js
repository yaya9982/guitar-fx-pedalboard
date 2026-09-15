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

export async function generateReverbIR(sampleRate, type = 'room') {
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

export async function generateCabIR(sampleRate, opts = {}) {
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

export async function generateAcousticBodyIR(sampleRate) {
  return render(sampleRate, 0.35, (ctx, source, envelope) => {
    const bodyLow = ctx.createBiquadFilter();
    bodyLow.type = 'peaking'; bodyLow.frequency.value = 100; bodyLow.Q.value = 1.4; bodyLow.gain.value = 6; // low-end "boom"
    const bodyMid = ctx.createBiquadFilter();
    bodyMid.type = 'peaking'; bodyMid.frequency.value = 220; bodyMid.Q.value = 1.1; bodyMid.gain.value = 4;
    const woodResonance = ctx.createBiquadFilter();
    woodResonance.type = 'peaking'; woodResonance.frequency.value = 480; woodResonance.Q.value = 2; woodResonance.gain.value = 3;
    const airiness = ctx.createBiquadFilter();
    airiness.type = 'highshelf'; airiness.frequency.value = 6000; airiness.gain.value = 3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 9000;

    source.connect(bodyLow).connect(bodyMid).connect(woodResonance).connect(airiness).connect(lp).connect(envelope).connect(ctx.destination);
  });
}
