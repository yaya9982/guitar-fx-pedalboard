// Synthesized drum pads for the Looper page — pure Web Audio oscillators/noise, no
// sample files, matching the project's 100%-offline / no-third-party-binaries rule.
// Two sound-descriptor shapes: a pitched 'tone' (sine with a pitch-drop envelope, for
// kick/tom/rim) and a filtered 'noise' burst (for snare/hats/clap/crash); 'layered'
// combines several of either, optionally offset in time, for composite hits like clap.

export const DRUM_PADS = [
  { id: 'kick', label: 'Kick', key: '1' },
  { id: 'snare', label: 'Snare', key: '2' },
  { id: 'hatClosed', label: 'Hat Cl.', key: '3' },
  { id: 'hatOpen', label: 'Hat Op.', key: '4' },
  { id: 'clap', label: 'Clap', key: '5' },
  { id: 'tomLow', label: 'Tom', key: '6' },
  { id: 'rim', label: 'Rim', key: '7' },
  { id: 'crash', label: 'Crash', key: '8' },
];

export const DRUM_KITS = {
  acoustic: {
    label: 'Acoustic Kit',
    sounds: {
      kick: { type: 'layered', layers: [
        { type: 'tone', freqStart: 150, freqEnd: 45, duration: 0.35, gain: 1.0 },
        { type: 'noise', filter: 'highpass', freq: 800, duration: 0.02, gain: 0.3 },
      ] },
      snare: { type: 'layered', layers: [
        { type: 'noise', filter: 'bandpass', freq: 1800, q: 1.2, duration: 0.18, gain: 0.8 },
        { type: 'tone', freqStart: 200, freqEnd: 150, duration: 0.08, gain: 0.4 },
      ] },
      hatClosed: { type: 'noise', filter: 'highpass', freq: 7000, duration: 0.05, gain: 0.5 },
      hatOpen: { type: 'noise', filter: 'highpass', freq: 7000, duration: 0.3, gain: 0.45 },
      clap: { type: 'layered', layers: [
        { type: 'noise', filter: 'bandpass', freq: 1500, q: 1.5, duration: 0.03, gain: 0.7 },
        { type: 'noise', filter: 'bandpass', freq: 1500, q: 1.5, duration: 0.03, gain: 0.6, delay: 0.015 },
        { type: 'noise', filter: 'bandpass', freq: 1500, q: 1.5, duration: 0.05, gain: 0.5, delay: 0.03 },
      ] },
      tomLow: { type: 'tone', freqStart: 180, freqEnd: 90, duration: 0.3, gain: 0.9 },
      rim: { type: 'layered', layers: [
        { type: 'tone', freqStart: 900, freqEnd: 850, duration: 0.05, gain: 0.6 },
        { type: 'noise', filter: 'highpass', freq: 3000, duration: 0.02, gain: 0.3 },
      ] },
      crash: { type: 'noise', filter: 'highpass', freq: 6000, duration: 1.2, gain: 0.5 },
    },
  },
  analog: {
    label: 'Analog Kit',
    sounds: {
      kick: { type: 'tone', freqStart: 110, freqEnd: 40, duration: 0.5, gain: 1.0 },
      snare: { type: 'noise', filter: 'bandpass', freq: 2200, q: 1.4, duration: 0.12, gain: 0.75 },
      hatClosed: { type: 'noise', filter: 'highpass', freq: 9000, duration: 0.04, gain: 0.45 },
      hatOpen: { type: 'noise', filter: 'highpass', freq: 9000, duration: 0.25, gain: 0.4 },
      clap: { type: 'noise', filter: 'bandpass', freq: 1800, q: 1.3, duration: 0.08, gain: 0.7 },
      tomLow: { type: 'tone', freqStart: 140, freqEnd: 70, duration: 0.35, gain: 0.85 },
      rim: { type: 'tone', freqStart: 1200, freqEnd: 1100, duration: 0.04, gain: 0.55 },
      crash: { type: 'noise', filter: 'highpass', freq: 7000, duration: 1.5, gain: 0.45 },
    },
  },
  electronic: {
    label: 'Electronic Kit',
    sounds: {
      kick: { type: 'tone', freqStart: 180, freqEnd: 55, duration: 0.3, gain: 1.0 },
      snare: { type: 'layered', layers: [
        { type: 'noise', filter: 'bandpass', freq: 2600, q: 1.5, duration: 0.15, gain: 0.8 },
        { type: 'tone', freqStart: 300, freqEnd: 260, duration: 0.06, gain: 0.4 },
      ] },
      hatClosed: { type: 'noise', filter: 'highpass', freq: 10000, duration: 0.035, gain: 0.5 },
      hatOpen: { type: 'noise', filter: 'highpass', freq: 10000, duration: 0.2, gain: 0.45 },
      clap: { type: 'layered', layers: [
        { type: 'noise', filter: 'bandpass', freq: 2000, q: 1.6, duration: 0.025, gain: 0.75 },
        { type: 'noise', filter: 'bandpass', freq: 2000, q: 1.6, duration: 0.025, gain: 0.6, delay: 0.012 },
        { type: 'noise', filter: 'bandpass', freq: 2000, q: 1.6, duration: 0.04, gain: 0.5, delay: 0.024 },
      ] },
      tomLow: { type: 'tone', freqStart: 220, freqEnd: 110, duration: 0.28, gain: 0.9 },
      rim: { type: 'tone', freqStart: 1500, freqEnd: 1400, duration: 0.035, gain: 0.6 },
      crash: { type: 'noise', filter: 'highpass', freq: 8000, duration: 1.0, gain: 0.5 },
    },
  },
  lofi: {
    label: 'Lo-Fi Kit',
    sounds: {
      kick: { type: 'tone', freqStart: 100, freqEnd: 45, duration: 0.3, gain: 0.85 },
      snare: { type: 'noise', filter: 'lowpass', freq: 1800, q: 0.8, duration: 0.2, gain: 0.65 },
      hatClosed: { type: 'noise', filter: 'lowpass', freq: 5000, duration: 0.06, gain: 0.4 },
      hatOpen: { type: 'noise', filter: 'lowpass', freq: 5000, duration: 0.25, gain: 0.35 },
      clap: { type: 'noise', filter: 'bandpass', freq: 1200, q: 1.1, duration: 0.1, gain: 0.55 },
      tomLow: { type: 'tone', freqStart: 150, freqEnd: 80, duration: 0.3, gain: 0.7 },
      rim: { type: 'tone', freqStart: 700, freqEnd: 650, duration: 0.05, gain: 0.45 },
      crash: { type: 'noise', filter: 'lowpass', freq: 4000, duration: 1.0, gain: 0.35 },
    },
  },
  // Real one-shot recordings (Creative Commons, see CREDITS.md) rather than a
  // synthesis recipe — trigger() special-cases this kit id to play a decoded sample
  // instead of running the tone/noise engine.
  recorded: { label: 'Recorded (Real Samples)', sounds: {} },
};

// Pad id -> sample file, relative to the page (served alongside index.html).
export const DRUM_SAMPLE_URLS = {
  kick: 'drums/kick.wav',
  snare: 'drums/snare.wav',
  hatClosed: 'drums/hat-closed.wav',
  hatOpen: 'drums/hat-open.wav',
  clap: 'drums/clap.wav',
  tomLow: 'drums/tom.wav',
  rim: 'drums/rim.wav',
  crash: 'drums/crash.wav',
};

export class DrumKit {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output; // a GainNode the caller has already routed to destination/recorder
    this.kitId = 'acoustic';
    this._noiseBuffer = null;
    this._sampleBuffers = {}; // padId -> decoded AudioBuffer, filled in by preloadSamples()
    this._sampleLoadPromise = null;
  }

  setKit(kitId) {
    if (DRUM_KITS[kitId]) this.kitId = kitId;
  }

  // Decodes every sample once and caches the result; safe to call more than once
  // (returns the same in-flight/completed promise). Called eagerly at startup so the
  // first hit after switching to "Recorded" isn't delayed by a fetch+decode round trip.
  preloadSamples() {
    if (this._sampleLoadPromise) return this._sampleLoadPromise;
    this._sampleLoadPromise = Promise.all(
      Object.entries(DRUM_SAMPLE_URLS).map(async ([padId, url]) => {
        try {
          const res = await fetch(url);
          const arrayBuffer = await res.arrayBuffer();
          this._sampleBuffers[padId] = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (err) {
          console.warn(`Drum sample failed to load for "${padId}" (${url}):`, err);
        }
      })
    );
    return this._sampleLoadPromise;
  }

  _getNoiseBuffer() {
    if (this._noiseBuffer) return this._noiseBuffer;
    const length = Math.ceil(this.ctx.sampleRate * 1.6);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buffer;
    return buffer;
  }

  // `when` lets a caller (the beat-preset scheduler) schedule a hit precisely against
  // the AudioContext clock instead of "right now" — defaults to an immediate hit for
  // plain pad clicks/keyboard triggers.
  trigger(padId, when) {
    const t = when !== undefined ? when : this.ctx.currentTime;
    if (this.kitId === 'recorded') {
      const buffer = this._sampleBuffers[padId];
      if (!buffer) return; // still loading, or failed to load — stay silent rather than throw
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.output);
      src.start(t);
      return;
    }
    const kit = DRUM_KITS[this.kitId];
    const cfg = kit && kit.sounds[padId];
    if (!cfg) return;
    this._play(cfg, t);
  }

  _play(cfg, when) {
    if (cfg.type === 'layered') {
      cfg.layers.forEach((layer) => this._play(layer, when + (layer.delay || 0)));
      return;
    }
    if (cfg.type === 'tone') this._playTone(cfg, when);
    else if (cfg.type === 'noise') this._playNoise(cfg, when);
  }

  _playTone({ freqStart, freqEnd, duration, gain }, t) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.output);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  _playNoise({ filter, freq, q, duration, gain }, t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.output);
    src.start(t);
    src.stop(t + duration + 0.05);
  }
}
