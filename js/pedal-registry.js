import { generateReverbIR, REVERB_TYPES } from './ir-synth.js';

export const CATEGORIES = {
  dynamics: { label: 'Dynamics', swatch: 'oklch(64% 0.03 250)' },
  drive: { label: 'Drive', swatch: 'oklch(70% 0.17 55)' },
  filter: { label: 'Filter / Wah', swatch: 'oklch(55% 0.2 25)' },
  modulation: { label: 'Modulation', swatch: 'oklch(58% 0.18 310)' },
  pitch: { label: 'Pitch', swatch: 'oklch(50% 0.15 280)' },
  time: { label: 'Time-Based', swatch: 'oklch(55% 0.14 40)' },
  eq: { label: 'EQ', swatch: 'oklch(60% 0.15 145)' },
};

export function driveCurve(k, bias = 0, samples = 4096) {
  const curve = new Float32Array(samples);
  const zero = Math.tanh(k * bias);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * (x + bias)) - zero;
  }
  return curve;
}

function rampParam(audioParam, ctx, targetValue, timeConstant = 0.03) {
  audioParam.cancelScheduledValues(ctx.currentTime);
  audioParam.setTargetAtTime(targetValue, ctx.currentTime, timeConstant);
}

// ---------------------------------------------------------------------------

export const PEDAL_TYPES = [

  // ----- DYNAMICS -----
  {
    id: 'compressor', label: 'Compressor', category: 'dynamics', color: 'oklch(64% 0.03 250)',
    blurb: 'Evens out your dynamics — squashes loud notes and lifts quiet ones for a smoother, more consistent volume.',
    about: 'A compressor automatically reduces the volume of anything that crosses a threshold, then applies makeup gain to bring the overall level back up. The result is smoother, more consistent playing — quieter notes sustain longer and pick attacks feel less spiky. Classic for funk/country chicken-pickin\' and for tightening up a solo.',
    createNodes(ctx) {
      // AudioWorklet-based (js/dynamics-worklet.js), not createDynamicsCompressor() —
      // the native node's fixed ~6ms look-ahead isn't exposed as a parameter, so this
      // pedal used to cost every player 6ms whether they cared or not. See the master
      // output limiter's WaveShaper swap for the original version of this fix.
      const comp = new AudioWorkletNode(ctx, 'dynamics-processor');
      comp.parameters.get('knee').value = 12;
      const makeup = ctx.createGain();
      comp.connect(makeup);
      return { input: comp, output: makeup, nodes: { comp, makeup } };
    },
    params: [
      { key: 'threshold', label: 'Threshold', min: -60, max: 0, default: -24, unit: 'dB', apply: (n, v) => (n.comp.parameters.get('threshold').value = v) },
      { key: 'ratio', label: 'Ratio', min: 1, max: 20, default: 4, apply: (n, v) => (n.comp.parameters.get('ratio').value = v) },
      { key: 'attack', label: 'Attack', min: 0, max: 50, default: 5, unit: 'ms', apply: (n, v) => (n.comp.parameters.get('attack').value = v / 1000) },
      { key: 'release', label: 'Release', min: 10, max: 1000, default: 150, unit: 'ms', apply: (n, v) => (n.comp.parameters.get('release').value = v / 1000) },
      { key: 'level', label: 'Level', min: 0, max: 200, default: 100, unit: '%', apply: (n, v) => (n.makeup.gain.value = v / 100) },
    ],
  },
  {
    id: 'boost', label: 'Clean Boost', category: 'dynamics', color: 'oklch(90% 0.04 95)',
    blurb: 'A simple volume push with a hint of brightness — no distortion, just louder and clearer.',
    about: 'Clean Boost is a transparent gain stage that raises your signal level (and optionally brightens the top end) without adding distortion of its own. Use it to push a following amp/drive pedal harder, or as a solo-boost to cut through the mix without changing your tone\'s character.',
    createNodes(ctx) {
      const gain = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      tone.type = 'highshelf'; tone.frequency.value = 2200;
      gain.connect(tone);
      return { input: gain, output: tone, nodes: { gain, tone } };
    },
    params: [
      { key: 'level', label: 'Level', min: 0, max: 300, default: 150, unit: '%', apply: (n, v) => (n.gain.gain.value = v / 100) },
      { key: 'tone', label: 'Tone', min: -12, max: 12, default: 0, unit: 'dB', apply: (n, v) => (n.tone.gain.value = v) },
    ],
  },
  {
    id: 'limiter', label: 'Limiter', category: 'dynamics', color: 'oklch(56% 0.02 250)',
    blurb: 'A safety net that caps sudden loud peaks so nothing spikes or clips.',
    about: 'A limiter is a hard-ratio compressor that puts a ceiling on peak level — anything above the Ceiling knob gets clamped down fast. It\'s mostly transparent at moderate settings and mainly there to catch surprise volume spikes rather than shape your tone.',
    createNodes(ctx) {
      // AudioWorklet-based (js/dynamics-worklet.js) — see the Compressor pedal above
      // for why, in place of createDynamicsCompressor()'s fixed ~6ms look-ahead. A fast
      // fixed attack (not user-exposed, matching the original's default) since this is
      // meant to catch peaks quickly; without look-ahead a very sharp transient can
      // overshoot slightly before the gain catches up, the honest trade-off of zero
      // added latency instead of the native node hiding a delay to avoid it.
      const comp = new AudioWorkletNode(ctx, 'dynamics-processor');
      comp.parameters.get('ratio').value = 20;
      comp.parameters.get('knee').value = 2;
      comp.parameters.get('attack').value = 0.001;
      const makeup = ctx.createGain();
      comp.connect(makeup);
      return { input: comp, output: makeup, nodes: { comp, makeup } };
    },
    params: [
      { key: 'ceiling', label: 'Ceiling', min: -24, max: 0, default: -3, unit: 'dB', apply: (n, v) => (n.comp.parameters.get('threshold').value = v) },
      { key: 'release', label: 'Release', min: 10, max: 500, default: 80, unit: 'ms', apply: (n, v) => (n.comp.parameters.get('release').value = v / 1000) },
      { key: 'level', label: 'Level', min: 0, max: 200, default: 100, unit: '%', apply: (n, v) => (n.makeup.gain.value = v / 100) },
    ],
  },

  // ----- DRIVE -----
  {
    id: 'overdrive', label: 'Overdrive', category: 'drive', color: 'oklch(76% 0.15 85)',
    blurb: 'Warm, dynamic grit that cleans up when you play softer — classic blues/rock crunch.',
    about: 'Overdrive gently rounds off the peaks of your signal for a warm, tube-like breakup. It\'s touch-sensitive — dig in and it growls, back off your picking and it cleans up — making it the go-to for blues, classic rock rhythm, and pushing an amp that\'s already got some grit.',
    createNodes(ctx) {
      const shaper = ctx.createWaveShaper(); shaper.oversample = '2x';
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass';
      const level = ctx.createGain();
      shaper.connect(tone).connect(level);
      return { input: shaper, output: level, nodes: { shaper, tone, level } };
    },
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 100, default: 40, apply: (n, v) => (n.shaper.curve = driveCurve(1 + v * 0.14)) },
      { key: 'tone', label: 'Tone', min: 0, max: 100, default: 60, apply: (n, v) => (n.tone.frequency.value = 700 + v * 72) },
      { key: 'level', label: 'Level', min: 0, max: 200, default: 100, unit: '%', apply: (n, v) => (n.level.gain.value = v / 100) },
    ],
  },
  {
    id: 'distortion', label: 'Distortion', category: 'drive', color: 'oklch(66% 0.19 45)',
    blurb: 'Harder, more compressed clipping for a heavier, sustained rock/metal crunch.',
    about: 'Distortion clips your signal harder and more consistently than an overdrive, producing a thicker, more compressed, more sustained tone that doesn\'t clean up much no matter how softly you play. Good for rock rhythm and lead tones that need more aggression and sustain.',
    createNodes(ctx) {
      const shaper = ctx.createWaveShaper(); shaper.oversample = '4x';
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 900; mid.Q.value = 0.8;
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass';
      const level = ctx.createGain();
      shaper.connect(mid).connect(tone).connect(level);
      return { input: shaper, output: level, nodes: { shaper, mid, tone, level } };
    },
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 100, default: 55, apply: (n, v) => (n.shaper.curve = driveCurve(4 + v * 0.4)) },
      { key: 'mid', label: 'Mid', min: -12, max: 12, default: 3, unit: 'dB', apply: (n, v) => (n.mid.gain.value = v) },
      { key: 'tone', label: 'Tone', min: 0, max: 100, default: 55, apply: (n, v) => (n.tone.frequency.value = 600 + v * 75) },
      { key: 'level', label: 'Level', min: 0, max: 200, default: 90, unit: '%', apply: (n, v) => (n.level.gain.value = v / 100) },
    ],
  },
  {
    id: 'fuzz', label: 'Fuzz', category: 'drive', color: 'oklch(38% 0.17 18)',
    blurb: 'Thick, buzzy, almost synth-like saturation — the most extreme of the drive pedals.',
    about: 'Fuzz clips the waveform far harder and more asymmetrically than distortion, turning your signal into something closer to a buzzy square wave. It\'s the fuzziest, most saturated, most harmonically dense of the drive family — think 60s/70s psychedelic and stoner rock leads.',
    createNodes(ctx) {
      const shaper = ctx.createWaveShaper(); shaper.oversample = '4x';
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 4500;
      const level = ctx.createGain();
      shaper.connect(tone).connect(level);
      return { input: shaper, output: level, nodes: { shaper, tone, level } };
    },
    params: [
      { key: 'fuzz', label: 'Fuzz', min: 0, max: 100, default: 65, apply: (n, v) => (n.shaper.curve = driveCurve(8 + v * 0.45, 0.18)) },
      { key: 'tone', label: 'Tone', min: 0, max: 100, default: 50, apply: (n, v) => (n.tone.frequency.value = 1200 + v * 60) },
      { key: 'level', label: 'Level', min: 0, max: 200, default: 80, unit: '%', apply: (n, v) => (n.level.gain.value = v / 100) },
    ],
  },
  {
    id: 'bitcrusher', label: 'Bit Crusher', category: 'drive', color: 'oklch(64% 0.18 230)',
    blurb: 'Lo-fi, digital, crunchy degradation — like an old sampler or broken speaker.',
    about: 'Bit Crusher reduces the resolution and effective sample rate of your signal, adding gritty, aliased, digital-sounding artifacts rather than analog warmth. Great for lo-fi, glitchy, or industrial textures that sound deliberately broken/degraded.',
    createNodes(ctx) {
      const node = new AudioWorkletNode(ctx, 'bitcrusher-processor');
      return { input: node, output: node, nodes: { node } };
    },
    params: [
      { key: 'bits', label: 'Bits', min: 1, max: 16, default: 8, apply: (n, v) => (n.node.parameters.get('bits').value = v) },
      { key: 'reduction', label: 'Rate Reduce', min: 1, max: 60, default: 6, apply: (n, v) => (n.node.parameters.get('reduction').value = v) },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, unit: '%', apply: (n, v) => (n.node.parameters.get('mix').value = v) },
    ],
  },

  // ----- FILTER / WAH -----
  {
    id: 'wah', label: 'Wah', category: 'filter', color: 'oklch(55% 0.22 25)',
    blurb: 'A vocal "wah-wah" sweep you control manually with the Treadle knob.',
    about: 'Wah sweeps a narrow resonant filter across the frequency spectrum, creating the classic vocal-like "wah" sound. Here the Treadle knob stands in for the pedal\'s rocking motion — sweep it while playing for the classic funk/rock wah effect, or park it at a fixed spot for a fixed tonal color.',
    createNodes(ctx) {
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 5;
      const level = ctx.createGain();
      filter.connect(level);
      return { input: filter, output: level, nodes: { filter, level } };
    },
    params: [
      { key: 'position', label: 'Treadle', min: 300, max: 2200, default: 900, unit: 'Hz', apply: (n, v) => (n.filter.frequency.value = v) },
      { key: 'q', label: 'Vocal Q', min: 1, max: 12, default: 5, apply: (n, v) => (n.filter.Q.value = v) },
      { key: 'level', label: 'Level', min: 0, max: 300, default: 160, unit: '%', apply: (n, v) => (n.level.gain.value = v / 100) },
    ],
  },
  {
    id: 'autowah', label: 'Auto-Wah', category: 'filter', color: 'oklch(55% 0.16 305)',
    blurb: 'The same wah sweep, but automatic — a steady rhythmic filter cycle instead of manual control.',
    about: 'Auto-Wah applies the same vocal filter sweep as a manual wah, but driven by a built-in LFO instead of your foot, so it cycles automatically and rhythmically. Great for funk rhythm parts where you want a wah texture without having to work a treadle.',
    createNodes(ctx) {
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 700; filter.Q.value = 5;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 2;
      const depth = ctx.createGain(); depth.gain.value = 500;
      lfo.connect(depth).connect(filter.frequency);
      lfo.start();
      const level = ctx.createGain();
      filter.connect(level);
      return { input: filter, output: level, nodes: { filter, lfo, depth, level } };
    },
    params: [
      { key: 'rate', label: 'Rate', min: 0.1, max: 8, default: 2, unit: 'Hz', apply: (n, v) => (n.lfo.frequency.value = v) },
      { key: 'depth', label: 'Depth', min: 0, max: 1000, default: 500, unit: 'Hz', apply: (n, v) => (n.depth.gain.value = v) },
      { key: 'base', label: 'Base Freq', min: 200, max: 2000, default: 700, unit: 'Hz', apply: (n, v) => (n.filter.frequency.value = v) },
      { key: 'q', label: 'Q', min: 1, max: 12, default: 5, apply: (n, v) => (n.filter.Q.value = v) },
      { key: 'level', label: 'Level', min: 0, max: 300, default: 160, unit: '%', apply: (n, v) => (n.level.gain.value = v / 100) },
    ],
  },
  {
    id: 'envfilter', label: 'Envelope Filter', category: 'filter', color: 'oklch(58% 0.18 320)',
    blurb: 'A "touch wah" that opens up the harder you play, and closes as notes decay.',
    about: 'Envelope Filter (like a classic Mu-Tron) tracks your playing dynamics and opens its filter sweep in response — dig in and it snaps open, let a note decay and it closes back down. It\'s the funkiest of the filter pedals since the sweep responds directly to your picking touch rather than a fixed rate.',
    createNodes(ctx) {
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 600; filter.Q.value = 6;
      const follower = new AudioWorkletNode(ctx, 'envelope-follower-processor');
      const depth = ctx.createGain(); depth.gain.value = 3000;
      follower.connect(depth).connect(filter.frequency);
      const level = ctx.createGain();
      filter.connect(level);
      return { input: filter, output: level, sideChainInput: follower, nodes: { filter, follower, depth, level } };
    },
    params: [
      { key: 'sensitivity', label: 'Sensitivity', min: 0.2, max: 4, default: 1.5, apply: (n, v) => (n.follower.parameters.get('sensitivity').value = v) },
      { key: 'depth', label: 'Depth', min: 500, max: 5000, default: 3000, unit: 'Hz', apply: (n, v) => (n.depth.gain.value = v) },
      { key: 'base', label: 'Base Freq', min: 150, max: 1200, default: 500, unit: 'Hz', apply: (n, v) => (n.filter.frequency.value = v) },
      { key: 'q', label: 'Q', min: 1, max: 12, default: 6, apply: (n, v) => (n.filter.Q.value = v) },
      { key: 'level', label: 'Level', min: 0, max: 300, default: 160, unit: '%', apply: (n, v) => (n.level.gain.value = v / 100) },
    ],
  },

  // ----- MODULATION -----
  {
    id: 'chorus', label: 'Chorus', category: 'modulation', color: 'oklch(70% 0.13 235)',
    blurb: 'Thick, shimmery doubling — like two guitars playing slightly out of tune together.',
    about: 'Chorus splits your signal, delays and pitch-modulates one copy, and blends it back with the dry signal, creating a lush, shimmering, slightly detuned doubling effect. Classic for clean 80s rhythm tones and adding width/shimmer to a clean or lightly-driven sound.',
    createNodes(ctx) {
      const delay = ctx.createDelay(0.05); delay.delayTime.value = 0.02;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 1;
      const depth = ctx.createGain(); depth.gain.value = 0.004;
      const feedback = ctx.createGain(); feedback.gain.value = 0.15;
      const dry = ctx.createGain(); const wet = ctx.createGain();
      const inputNode = ctx.createGain(); const outputNode = ctx.createGain();
      lfo.connect(depth).connect(delay.delayTime);
      lfo.start();
      inputNode.connect(dry).connect(outputNode);
      inputNode.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(outputNode);
      return { input: inputNode, output: outputNode, nodes: { delay, lfo, depth, feedback, dry, wet } };
    },
    params: [
      { key: 'rate', label: 'Rate', min: 0.1, max: 4, default: 1, unit: 'Hz', apply: (n, v) => (n.lfo.frequency.value = v) },
      { key: 'depth', label: 'Depth', min: 0, max: 10, default: 4, unit: 'ms', apply: (n, v) => (n.depth.gain.value = v / 1000) },
      { key: 'feedback', label: 'Feedback', min: 0, max: 50, default: 15, unit: '%', apply: (n, v) => (n.feedback.gain.value = v / 100) },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 50, unit: '%', apply: (n, v) => { n.wet.gain.value = v / 100; n.dry.gain.value = 1 - v / 100; } },
    ],
  },
  {
    id: 'flanger', label: 'Flanger', category: 'modulation', color: 'oklch(60% 0.19 335)',
    blurb: 'Swooshy, jet-plane-like sweeping — more intense and metallic than chorus.',
    about: 'Flanger mixes your signal with a very short, modulated delayed copy plus feedback, creating a sweeping, metallic, "jet engine" comb-filtering sound. More aggressive and resonant than chorus — a signature of psychedelic and 80s rock.',
    createNodes(ctx) {
      const delay = ctx.createDelay(0.02); delay.delayTime.value = 0.003;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.3;
      const depth = ctx.createGain(); depth.gain.value = 0.0025;
      const feedback = ctx.createGain(); feedback.gain.value = 0.4;
      const dry = ctx.createGain(); const wet = ctx.createGain();
      const inputNode = ctx.createGain(); const outputNode = ctx.createGain();
      lfo.connect(depth).connect(delay.delayTime);
      lfo.start();
      inputNode.connect(dry).connect(outputNode);
      inputNode.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(outputNode);
      return { input: inputNode, output: outputNode, nodes: { delay, lfo, depth, feedback, dry, wet } };
    },
    params: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 3, default: 0.3, unit: 'Hz', apply: (n, v) => (n.lfo.frequency.value = v) },
      { key: 'depth', label: 'Depth', min: 0, max: 6, default: 2.5, unit: 'ms', apply: (n, v) => (n.depth.gain.value = v / 1000) },
      { key: 'feedback', label: 'Feedback', min: 0, max: 90, default: 40, unit: '%', apply: (n, v) => (n.feedback.gain.value = v / 100) },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 50, unit: '%', apply: (n, v) => { n.wet.gain.value = v / 100; n.dry.gain.value = 1 - v / 100; } },
    ],
  },
  {
    id: 'phaser', label: 'Phaser', category: 'modulation', color: 'oklch(52% 0.18 295)',
    blurb: 'Swirly, sweeping notches — a smoother, less metallic cousin of flanger.',
    about: 'Phaser sweeps a series of notch filters through the frequency spectrum using all-pass stages, producing a smooth, swirling modulation without the metallic comb-filtering of a flanger. Iconic on funk rhythm parts and classic rock leads.',
    createNodes(ctx) {
      const stageCount = 6;
      const stages = [];
      let chainIn = ctx.createGain();
      let node = chainIn;
      for (let i = 0; i < stageCount; i++) {
        const ap = ctx.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = 800;
        node.connect(ap); node = ap; stages.push(ap);
      }
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.5;
      const depth = ctx.createGain(); depth.gain.value = 1200;
      stages.forEach((ap) => lfo.connect(depth).connect(ap.frequency));
      lfo.start();
      const feedback = ctx.createGain(); feedback.gain.value = 0.3;
      node.connect(feedback).connect(chainIn);
      const dry = ctx.createGain(); const wet = ctx.createGain(); const outputNode = ctx.createGain();
      chainIn.connect(dry).connect(outputNode);
      node.connect(wet).connect(outputNode);
      return { input: chainIn, output: outputNode, nodes: { lfo, depth, feedback, dry, wet, stages } };
    },
    params: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 3, default: 0.5, unit: 'Hz', apply: (n, v) => (n.lfo.frequency.value = v) },
      { key: 'depth', label: 'Depth', min: 200, max: 3000, default: 1200, unit: 'Hz', apply: (n, v) => (n.depth.gain.value = v) },
      { key: 'feedback', label: 'Feedback', min: 0, max: 90, default: 30, unit: '%', apply: (n, v) => (n.feedback.gain.value = v / 100) },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 70, unit: '%', apply: (n, v) => { n.wet.gain.value = v / 100; n.dry.gain.value = 1 - v / 100; } },
    ],
  },
  {
    id: 'tremolo', label: 'Tremolo', category: 'modulation', color: 'oklch(65% 0.12 185)',
    blurb: 'Rhythmic volume pulsing — the sound turns up and down in a steady wave.',
    about: 'Tremolo rapidly and rhythmically raises and lowers your volume, creating a pulsing, throbbing effect. Simple but iconic — surf rock, spaghetti-western twang, and dreamy indie tones all lean on tremolo.',
    createNodes(ctx) {
      const gainNode = ctx.createGain(); gainNode.gain.value = 0.7;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5;
      const depth = ctx.createGain(); depth.gain.value = 0.3;
      lfo.connect(depth).connect(gainNode.gain);
      lfo.start();
      return { input: gainNode, output: gainNode, nodes: { gainNode, lfo, depth, depthPct: 0.6 } };
    },
    params: [
      { key: 'rate', label: 'Rate', min: 0.5, max: 12, default: 5, unit: 'Hz', apply: (n, v) => (n.lfo.frequency.value = v) },
      {
        key: 'depth', label: 'Depth', min: 0, max: 100, default: 60, unit: '%',
        apply: (n, v) => { const d = v / 100; n.depth.gain.value = d / 2; n.gainNode.gain.value = 1 - d / 2; },
      },
    ],
  },
  {
    id: 'vibrato', label: 'Vibrato', category: 'modulation', color: 'oklch(68% 0.13 200)',
    blurb: 'Pitch wobble instead of volume wobble — a warbling, seasick pitch shimmer.',
    about: 'Vibrato modulates pitch rather than volume, creating a warbling, wavering pitch effect (unlike tremolo, which it\'s often confused with). Used sparingly for a subtle wobble, or pushed hard for a woozy, seasick character.',
    createNodes(ctx) {
      const delay = ctx.createDelay(0.02); delay.delayTime.value = 0.005;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5;
      const depth = ctx.createGain(); depth.gain.value = 0.002;
      lfo.connect(depth).connect(delay.delayTime);
      lfo.start();
      return { input: delay, output: delay, nodes: { delay, lfo, depth } };
    },
    params: [
      { key: 'rate', label: 'Rate', min: 1, max: 10, default: 5, unit: 'Hz', apply: (n, v) => (n.lfo.frequency.value = v) },
      { key: 'depth', label: 'Depth', min: 0, max: 5, default: 2, unit: 'ms', apply: (n, v) => (n.depth.gain.value = v / 1000) },
    ],
  },
  {
    id: 'ringmod', label: 'Ring Modulator', category: 'modulation', color: 'oklch(75% 0.19 130)',
    blurb: 'Harsh, metallic, bell-like tones — sounds robotic and inharmonic, not "musical" in the usual sense.',
    about: 'Ring Modulator multiplies your signal by a separate carrier tone, generating new, often dissonant sum-and-difference frequencies that don\'t follow your original note\'s harmonics. The result is clangy, robotic, bell-like, and deliberately inharmonic — a sound-design/experimental effect more than a traditional tone pedal.',
    createNodes(ctx) {
      const carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = 220;
      const ringGain = ctx.createGain(); ringGain.gain.value = 0;
      carrier.connect(ringGain.gain);
      carrier.start();
      const dry = ctx.createGain(); const wet = ctx.createGain();
      const inputNode = ctx.createGain(); const outputNode = ctx.createGain();
      inputNode.connect(dry).connect(outputNode);
      inputNode.connect(ringGain).connect(wet).connect(outputNode);
      const level = ctx.createGain();
      outputNode.connect(level);
      return { input: inputNode, output: level, nodes: { carrier, ringGain, dry, wet, level } };
    },
    params: [
      { key: 'frequency', label: 'Frequency', min: 20, max: 2000, default: 220, unit: 'Hz', apply: (n, v) => (n.carrier.frequency.value = v) },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, unit: '%', apply: (n, v) => { n.wet.gain.value = v / 100; n.dry.gain.value = 1 - v / 100; } },
      { key: 'level', label: 'Level', min: 0, max: 300, default: 150, unit: '%', apply: (n, v) => (n.level.gain.value = v / 100) },
    ],
  },
  {
    id: 'rotary', label: 'Rotary / Leslie', category: 'modulation', color: 'oklch(58% 0.09 60)',
    blurb: 'Swirling, spinning speaker-cabinet sound — the classic rotating organ-speaker effect.',
    about: 'Rotary/Leslie emulates a rotating speaker cabinet\'s combination of pitch, volume, and stereo-panning modulation, creating a rich, swirling, organ-like motion. Classic on clean/lightly-driven tones for a vintage, hypnotic swirl.',
    createNodes(ctx) {
      const ampLfo = ctx.createOscillator(); ampLfo.type = 'sine'; ampLfo.frequency.value = 1.2;
      const ampDepth = ctx.createGain(); ampDepth.gain.value = 0.3;
      const ampGain = ctx.createGain(); ampGain.gain.value = 0.7;
      ampLfo.connect(ampDepth).connect(ampGain.gain);

      const delay = ctx.createDelay(0.02); delay.delayTime.value = 0.006;
      const delayLfo = ctx.createOscillator(); delayLfo.type = 'triangle'; delayLfo.frequency.value = 1.2;
      const delayDepth = ctx.createGain(); delayDepth.gain.value = 0.002;
      delayLfo.connect(delayDepth).connect(delay.delayTime);

      const panner = ctx.createStereoPanner();
      const panLfo = ctx.createOscillator(); panLfo.type = 'sine'; panLfo.frequency.value = 1.2;
      const panDepth = ctx.createGain(); panDepth.gain.value = 0.5;
      panLfo.connect(panDepth).connect(panner.pan);

      ampLfo.start(); delayLfo.start(); panLfo.start();

      ampGain.connect(delay).connect(panner);
      const level = ctx.createGain();
      panner.connect(level);
      return { input: ampGain, output: level, nodes: { ampLfo, ampDepth, ampGain, delay, delayLfo, delayDepth, panner, panLfo, panDepth, level } };
    },
    params: [
      {
        key: 'rate', label: 'Speed', min: 0.4, max: 7, default: 1.2, unit: 'Hz',
        apply: (n, v) => { n.ampLfo.frequency.value = v; n.delayLfo.frequency.value = v; n.panLfo.frequency.value = v; },
      },
      {
        key: 'depth', label: 'Depth', min: 0, max: 100, default: 70, unit: '%',
        apply: (n, v) => { const d = v / 100; n.ampDepth.gain.value = 0.4 * d; n.delayDepth.gain.value = 0.003 * d; n.panDepth.gain.value = d; },
      },
      { key: 'level', label: 'Level', min: 0, max: 300, default: 140, unit: '%', apply: (n, v) => (n.level.gain.value = v / 100) },
    ],
  },

  // ----- PITCH -----
  {
    id: 'octaver', label: 'Octaver', category: 'pitch', color: 'oklch(45% 0.13 260)',
    blurb: 'Adds a deep sub-octave layer underneath your notes for a huge, bass-like low end.',
    about: 'Octaver tracks your note and adds a synthesized copy pitched an octave down, thickening your sound with a deep, bass-like low layer. Great for heavy riffs (think classic doom/stoner tones) or making a single guitar sound twice as big.',
    createNodes(ctx) {
      const node = new AudioWorkletNode(ctx, 'octaver-processor');
      return { input: node, output: node, nodes: { node } };
    },
    params: [
      { key: 'octaveLevel', label: 'Octave Lvl', min: 0, max: 100, default: 60, unit: '%', apply: (n, v) => (n.node.parameters.get('octaveLevel').value = v) },
      { key: 'dryLevel', label: 'Dry Lvl', min: 0, max: 100, default: 100, unit: '%', apply: (n, v) => (n.node.parameters.get('dryLevel').value = v) },
    ],
  },
  {
    id: 'pitchshift', label: 'Pitch Shifter', category: 'pitch', color: 'oklch(55% 0.16 300)',
    blurb: 'Shifts your note up or down in pitch — from subtle detuning to full harmony intervals.',
    about: 'Pitch Shifter transposes your signal by a set number of semitones, from a slight detune-like thickening at small intervals up to full harmony or octave intervals at larger settings. Use it for harmonized leads, octave-up sparkle, or otherworldly pitch effects.',
    createNodes(ctx) {
      const node = new AudioWorkletNode(ctx, 'pitch-shifter-processor');
      return { input: node, output: node, nodes: { node } };
    },
    params: [
      { key: 'semitones', label: 'Semitones', min: -24, max: 24, default: 12, apply: (n, v) => (n.node.parameters.get('semitones').value = v) },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 50, unit: '%', apply: (n, v) => (n.node.parameters.get('mix').value = v) },
    ],
  },

  // ----- TIME-BASED -----
  {
    id: 'delay', label: 'Delay', category: 'time', color: 'oklch(62% 0.15 55)',
    blurb: 'Distinct echoes that repeat and fade — classic slap-back to ambient trailing repeats.',
    about: 'Delay records your signal and plays it back after a set time, repeating and fading with each pass. Short times give a tight slap-back (rockabilly), medium times give rhythmic echoes, and long times with high feedback build up into a wash of trailing repeats.',
    createNodes(ctx) {
      const delay = ctx.createDelay(2); delay.delayTime.value = 0.35;
      const feedback = ctx.createGain(); feedback.gain.value = 0.35;
      const toneFilter = ctx.createBiquadFilter(); toneFilter.type = 'lowpass'; toneFilter.frequency.value = 4000;
      const dry = ctx.createGain(); const wet = ctx.createGain();
      const inputNode = ctx.createGain(); const outputNode = ctx.createGain();
      inputNode.connect(dry).connect(outputNode);
      inputNode.connect(delay);
      delay.connect(toneFilter).connect(feedback).connect(delay);
      delay.connect(wet).connect(outputNode);
      return { input: inputNode, output: outputNode, nodes: { delay, feedback, toneFilter, dry, wet } };
    },
    params: [
      { key: 'time', label: 'Time', min: 20, max: 2000, default: 350, unit: 'ms', apply: (n, v, ctx) => n.delay.delayTime.linearRampToValueAtTime(v / 1000, ctx.currentTime + 0.05) },
      { key: 'feedback', label: 'Feedback', min: 0, max: 90, default: 35, unit: '%', apply: (n, v) => (n.feedback.gain.value = v / 100) },
      { key: 'tone', label: 'Tone', min: 1000, max: 8000, default: 4000, unit: 'Hz', apply: (n, v) => (n.toneFilter.frequency.value = v) },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 35, unit: '%', apply: (n, v) => { n.wet.gain.value = v / 100; n.dry.gain.value = 1 - v / 100; } },
    ],
  },
  {
    id: 'reverb', label: 'Reverb', category: 'time', color: 'oklch(45% 0.13 320)',
    blurb: 'Simulates the natural echo of a room, hall, or spring tank — adds space and depth.',
    about: 'Reverb simulates the reflections of a physical space, from a tight practice room to a huge hall to a classic spring tank. It doesn\'t repeat like delay — instead it blurs into a smooth wash that gives your tone a sense of size and depth.',
    async createNodes(ctx) {
      const convolver = ctx.createConvolver();
      convolver.buffer = await generateReverbIR(ctx.sampleRate, 'room');
      const dry = ctx.createGain(); const wet = ctx.createGain(); wet.gain.value = 0.3; dry.gain.value = 0.7;
      const inputNode = ctx.createGain(); const outputNode = ctx.createGain();
      inputNode.connect(dry).connect(outputNode);
      inputNode.connect(convolver).connect(wet).connect(outputNode);
      return { input: inputNode, output: outputNode, nodes: { convolver, dry, wet, currentType: 'room' } };
    },
    params: [
      {
        key: 'type', label: 'Type', type: 'select', default: 'room',
        options: Object.keys(REVERB_TYPES).map((id) => ({ value: id, label: REVERB_TYPES[id].label })),
        apply: async (n, v, ctx) => { n.convolver.buffer = await generateReverbIR(ctx.sampleRate, v); n.currentType = v; },
      },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 30, unit: '%', apply: (n, v) => { n.wet.gain.value = v / 100; n.dry.gain.value = 1 - v / 100; } },
    ],
  },

  // ----- EQ -----
  {
    id: 'exciter', label: 'Exciter', category: 'eq', color: 'oklch(82% 0.07 90)',
    blurb: 'Adds subtle high-frequency harmonics to cut through the mix — clearer and more present without just cranking the treble.',
    about: 'A harmonic exciter (the classic "Aphex Aural Exciter" technique) isolates the high end, adds a touch of harmonic saturation to just that band, then blends it back in. Unlike a plain EQ boost — which raises everything up there including hiss and noise — this generates new, musically related overtones, so you get more clarity and cut without harshness. A real mastering-engineer trick, applied straight to your guitar tone.',
    createNodes(ctx) {
      const inputNode = ctx.createGain();
      const highpass = ctx.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 3000; highpass.Q.value = 0.7;
      const shaper = ctx.createWaveShaper(); shaper.curve = driveCurve(3.5); shaper.oversample = '4x';
      const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 11000; // keeps the added harmonics musical, not harsh/aliased
      const wetGain = ctx.createGain();
      const dryGain = ctx.createGain(); dryGain.gain.value = 1;
      const outputNode = ctx.createGain();

      inputNode.connect(dryGain).connect(outputNode);
      inputNode.connect(highpass).connect(shaper).connect(lowpass).connect(wetGain).connect(outputNode);

      return { input: inputNode, output: outputNode, nodes: { highpass, shaper, lowpass, wetGain, dryGain } };
    },
    params: [
      { key: 'frequency', label: 'Frequency', min: 1500, max: 6000, default: 3000, unit: 'Hz', apply: (n, v) => (n.highpass.frequency.value = v) },
      { key: 'amount', label: 'Amount', min: 0, max: 100, default: 35, unit: '%', apply: (n, v) => (n.wetGain.gain.value = (v / 100) * 0.7) },
    ],
  },
  {
    id: 'graphiceq', label: 'Graphic EQ', category: 'eq', color: 'oklch(60% 0.15 145)',
    blurb: 'Shapes your tone by boosting or cutting specific frequency bands.',
    about: 'Graphic EQ gives you six frequency bands to boost or cut independently, letting you sculpt your tone precisely — tighten up boomy lows, scoop out boxy mids, or add sizzle on top. Less about a signature sound and more a shaping/correction tool for whatever\'s ahead of it in the chain.',
    createNodes(ctx) {
      const freqs = [100, 250, 630, 1600, 4000, 10000];
      const bands = freqs.map((f) => {
        const b = ctx.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.Q.value = 1.4; b.gain.value = 0;
        return b;
      });
      for (let i = 0; i < bands.length - 1; i++) bands[i].connect(bands[i + 1]);
      return { input: bands[0], output: bands[bands.length - 1], nodes: { bands } };
    },
    params: [100, 250, 630, 1600, 4000, 10000].map((f, i) => ({
      key: `band${i}`, label: `${f >= 1000 ? f / 1000 + 'k' : f}Hz`, min: -20, max: 20, default: 0, unit: 'dB',
      apply: (n, v) => (n.bands[i].gain.value = v),
    })),
  },
];

export function getPedalType(id) {
  return PEDAL_TYPES.find((p) => p.id === id);
}
