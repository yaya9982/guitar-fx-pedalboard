import { generateCabIR, generateAcousticBodyIR } from './ir-synth.js';
import { driveCurve } from './pedal-registry.js?v=1';

// Shared amp factory: inputGain -> preEQ -> waveshaper(fixed curve) -> postEQ -> cab convolver -> outputLevel.
// The "gain" knob drives inputGain (how hard the signal hits the fixed curve, like a real preamp),
// "presence" scales a dedicated presence band in the post-EQ, "level" is a plain output trim.
async function createAmpNodes(ctx, cfg) {
  const inputGain = ctx.createGain();
  inputGain.gain.value = cfg.driveRange[0];

  const preEQNodes = cfg.preEQ.map((band) => {
    const f = ctx.createBiquadFilter();
    f.type = band.type; f.frequency.value = band.freq;
    if (band.Q !== undefined) f.Q.value = band.Q;
    if (band.gain !== undefined) f.gain.value = band.gain;
    return f;
  });

  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(cfg.curveK, cfg.curveBias || 0);
  shaper.oversample = cfg.oversample || '2x';

  const postEQNodes = cfg.postEQ.map((band) => {
    const f = ctx.createBiquadFilter();
    f.type = band.type; f.frequency.value = band.freq;
    if (band.Q !== undefined) f.Q.value = band.Q;
    if (band.gain !== undefined) f.gain.value = band.gain;
    return f;
  });
  const presenceNode = postEQNodes[cfg.presenceBandIndex];

  let dynamicsNode = null;
  if (cfg.builtInCompressor) {
    // AudioWorklet-based (js/dynamics-worklet.js) — see the Compressor pedal in
    // pedal-registry.js for why, in place of createDynamicsCompressor()'s fixed ~6ms
    // look-ahead, which used to cost every player 6ms just for picking this amp model.
    dynamicsNode = new AudioWorkletNode(ctx, 'dynamics-processor');
    dynamicsNode.parameters.get('ratio').value = cfg.builtInCompressor.ratio;
    dynamicsNode.parameters.get('threshold').value = cfg.builtInCompressor.threshold;
    dynamicsNode.parameters.get('attack').value = cfg.builtInCompressor.attack;
    dynamicsNode.parameters.get('release').value = cfg.builtInCompressor.release;
  }

  const cabConvolver = ctx.createConvolver();
  cabConvolver.buffer = await generateCabIR(ctx.sampleRate, cfg.cab);

  const outputLevel = ctx.createGain();
  outputLevel.gain.value = 1;

  // wire it up
  let node = inputGain;
  if (dynamicsNode) { node.connect(dynamicsNode); node = dynamicsNode; }
  preEQNodes.forEach((n) => { node.connect(n); node = n; });
  node.connect(shaper); node = shaper;
  postEQNodes.forEach((n) => { node.connect(n); node = n; });
  node.connect(cabConvolver);
  cabConvolver.connect(outputLevel);

  return {
    input: inputGain,
    output: outputLevel,
    nodes: { inputGain, preEQNodes, shaper, postEQNodes, presenceNode, cabConvolver, outputLevel, driveRange: cfg.driveRange, presenceMaxDb: cfg.presenceMaxDb },
  };
}

function ampParams() {
  return [
    { key: 'gain', label: 'Gain', min: 0, max: 100, default: 55, apply: (n, v) => { const [lo, hi] = n.driveRange; n.inputGain.gain.value = lo + (hi - lo) * (v / 100); } },
    { key: 'presence', label: 'Presence', min: 0, max: 100, default: 55, apply: (n, v) => { n.presenceNode.gain.value = (v / 100) * n.presenceMaxDb; } },
    { key: 'level', label: 'Level', min: 0, max: 150, default: 100, unit: '%', apply: (n, v) => (n.outputLevel.gain.value = v / 100) },
  ];
}

// ---------------------------------------------------------------------------
// Standard library — generic voicings, always available.
// ---------------------------------------------------------------------------

export const AMP_TYPES = [
  {
    id: 'clean', label: 'Clean', group: 'standard', color: 'oklch(85% 0.02 90)',
    blurb: 'Bright, transparent headroom with no breakup — a blank canvas for pedals.',
    about: 'Signal passes through a wide-headroom gain stage that stays under the clipping threshold at any setting, so no distortion harmonics get added — only a flat-ish EQ curve and the cabinet\'s own frequency response shape the tone. Clean is a headroom-y, mostly transparent amp voicing with very light natural compression and no real breakup, even when pushed. It\'s a blank canvas — ideal for building your tone entirely from pedals in front of it, or for genuinely clean rhythm/jazz tones.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [0.4, 1.6], curveK: 1.5, oversample: 'none',
      preEQ: [{ type: 'highpass', freq: 60 }],
      postEQ: [
        { type: 'peaking', freq: 3000, Q: 1, gain: 2 },
        { type: 'lowshelf', freq: 120, gain: 0 },
        { type: 'highshelf', freq: 6000, gain: 1 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 6,
      cab: { resonanceHz: 3000, resonanceQ: 2, lowpassHz: 5500, highpassHz: 90, decayMs: 15 },
    }),
    params: ampParams(),
  },
  {
    id: 'crunch', label: 'Crunch', group: 'standard', color: 'oklch(45% 0.08 75)',
    blurb: 'Classic edge-of-breakup rock rhythm tone — not fully distorted, just gritty.',
    about: 'Signal is pushed just past the clipping threshold, so pick-attack transients round off into mild saturation while quieter passages ride under the threshold and stay fairly clean, with a broad midrange bump shaping the breakup. Crunch sits right at the edge of breakup — clean-ish when you play softly, growling and gritty when you dig in. This is the bread-and-butter classic-rock rhythm tone that most drive pedals are designed to be stacked in front of.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [2, 10], curveK: 6, oversample: '2x',
      preEQ: [{ type: 'highpass', freq: 70 }, { type: 'peaking', freq: 700, Q: 0.9, gain: 2 }],
      postEQ: [
        { type: 'peaking', freq: 2500, Q: 1, gain: 3 },
        { type: 'lowshelf', freq: 110, gain: -1 },
        { type: 'highshelf', freq: 6500, gain: -1 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 7,
      cab: { resonanceHz: 2500, resonanceQ: 2.3, lowpassHz: 5000, highpassHz: 100, decayMs: 18, reflections: 2 },
    }),
    params: ampParams(),
  },
  {
    id: 'lead', label: 'Lead / High-Gain', group: 'standard', color: 'oklch(50% 0.20 25)',
    blurb: 'Thick, saturated, modern high-gain lead tone with scooped mids and lots of sustain.',
    about: 'Signal is driven hard into an aggressive clipping curve, generating dense high-order harmonics for sustain, while a scooped-mid, boosted-presence EQ curve carves out space so the saturation doesn\'t turn to mud on chords. Lead/High-Gain is a hot, heavily-saturated modern amp voicing with scooped mids and boosted presence, built for singing sustain on solos and heavier riffing. It\'s the least "vintage" and most aggressive of the standard amps.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [6, 26], curveK: 10, oversample: '4x',
      preEQ: [{ type: 'highpass', freq: 90 }, { type: 'peaking', freq: 1000, Q: 1, gain: 3 }],
      postEQ: [
        { type: 'peaking', freq: 3600, Q: 1, gain: 5 },
        { type: 'peaking', freq: 500, Q: 1.2, gain: -4 },
        { type: 'lowshelf', freq: 100, gain: 1 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 8,
      cab: { resonanceHz: 3300, resonanceQ: 2.6, lowpassHz: 5000, highpassHz: 110, decayMs: 16, reflections: 2 },
    }),
    params: ampParams(),
  },

  // ---------------------------------------------------------------------
  // Signature extras — band-inspired voicings, layered on top of the standard library.
  // ---------------------------------------------------------------------
  {
    id: 'acdc', label: 'AC/DC', group: 'signature', color: '#874b4b', accent: '#fd5714', trim: '#e7e3c0',
    blurb: 'Tight, aggressive Marshall-plexi-style crunch — the sound of classic hard rock rhythm.',
    about: 'Signal hits a tight, fairly symmetric clipping curve with a highpassed low end and a boosted upper-mid peak, keeping each note of a chord distinct instead of smearing together under gain. AC/DC-inspired voicing evokes a tight, aggressive Marshall plexi-style crunch — punchy mids, controlled low end, and just enough grit for driving hard-rock rhythm without turning to mush on chords.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      // oversample 4x (was 2x) — its drive range peaks nearly as high as Lead's, and 2x
      // wasn't enough headroom to avoid audible aliasing/"static" on the clipped harmonics.
      driveRange: [3, 14], curveK: 7, oversample: '4x',
      preEQ: [{ type: 'highpass', freq: 80 }, { type: 'peaking', freq: 800, Q: 1, gain: 4 }],
      postEQ: [
        { type: 'peaking', freq: 3000, Q: 1.2, gain: 5 },
        { type: 'peaking', freq: 500, Q: 1, gain: -2 },
        { type: 'lowshelf', freq: 100, gain: -3 },
        { type: 'highshelf', freq: 6000, gain: -2 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 6,
      // resonanceQ eased from 3 to 2.4 — the narrower peak was ringing right where aliasing
      // artifacts sit, compounding the "static" character.
      cab: { resonanceHz: 2800, resonanceQ: 2.4, lowpassHz: 5000, highpassHz: 100, decayMs: 15, reflections: 2 },
    }),
    params: ampParams(),
  },
  {
    id: 'ledzeppelin', label: 'Led Zeppelin', group: 'signature', color: '#a7a195', accent: '#030207', trim: '#fdf7e7',
    blurb: 'Looser, bluesier vintage crunch with a fuller, woodier low end.',
    about: 'Signal is pushed through a deliberately asymmetric clipping curve (a slight DC bias skews the waveform unevenly), which generates even-order harmonics for a softer, "sagging" breakup instead of a tight symmetric crunch, under a broad woody midrange bump. Led Zeppelin-inspired voicing goes for a looser, bluesier vintage Marshall/Supro-style crunch — fuller low end, a broad woody midrange bump, and a slightly asymmetric, "sagging" drive character rather than a tight, aggressive one.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      // oversample 4x (was 2x) and curveBias eased (was 0.05) — the asymmetric clip that
      // gives this amp its "looser" character also generates more intermodulation mud
      // between simultaneous notes than a symmetric curve; less bias + more anti-aliasing
      // headroom keeps chords readable without fully sanitizing the vintage sag character.
      driveRange: [2, 10], curveK: 5, curveBias: 0.035, oversample: '4x',
      // highpass raised 50Hz -> 65Hz — less uncontrolled low end hitting the drive stage,
      // which is the main source of "boxy"/undefined mud specifically on chords.
      preEQ: [{ type: 'highpass', freq: 65 }, { type: 'peaking', freq: 300, Q: 0.8, gain: 3 }],
      postEQ: [
        { type: 'peaking', freq: 650, Q: 0.7, gain: 2.5 },
        { type: 'peaking', freq: 2200, Q: 1, gain: 2 },
        { type: 'lowshelf', freq: 100, gain: 2 },
      ],
      presenceBandIndex: 1, presenceMaxDb: 6,
      cab: { resonanceHz: 2200, resonanceQ: 1.8, lowpassHz: 4500, highpassHz: 90, decayMs: 23, reflections: 3 },
    }),
    params: ampParams(),
  },
  {
    id: 'oasis', label: 'Oasis', group: 'signature', color: '#dec182', accent: '#3e7474', trim: '#a3b49a',
    blurb: 'Big, dense, wall-of-sound crunch — thick and bright, built for layered rhythm.',
    about: 'Signal hits the hottest gain stage of the four signature amps, driving deep into saturation for thick harmonic density, while a scooped-mid, boosted-treble-and-presence EQ curve keeps that saturation from collapsing into mush when several guitar layers stack up. Oasis-inspired voicing goes for a dense, heavily-driven Marshall JCM "wall of sound" — the highest gain and brightest presence of the four signature amps, built to feel massive, especially with layered rhythm parts.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [8, 30], curveK: 12, oversample: '4x',
      preEQ: [{ type: 'highpass', freq: 70 }, { type: 'peaking', freq: 1000, Q: 1, gain: 3 }],
      postEQ: [
        { type: 'peaking', freq: 3800, Q: 1, gain: 6 },
        { type: 'peaking', freq: 500, Q: 1, gain: -3 },
        { type: 'lowshelf', freq: 90, gain: 2 },
        { type: 'highshelf', freq: 6500, gain: 2 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 7,
      cab: { resonanceHz: 3200, resonanceQ: 2.4, lowpassHz: 5200, highpassHz: 100, decayMs: 20, reflections: 3 },
    }),
    params: ampParams(),
  },
  {
    id: 'direstraits', label: 'Dire Straits', group: 'signature', color: '#3e6390', accent: '#9d2a2f', trim: '#dbdee6',
    blurb: 'Glassy, clean, compressed Strat tone with a distinctive "quack."',
    about: 'Signal barely reaches the clipping threshold at all — the input gain stage is set very low, so almost no distortion harmonics are added. Instead a built-in compressor evens out picking dynamics and a scooped-mid, boosted-treble EQ curve produces the glassy "quack." Dire Straits-inspired voicing is a near-clean, subtly compressed tone with a glassy top end and the scooped-mid "quack" character associated with a single-coil Strat played clean. Barely any distortion — the character comes from the EQ shape and built-in compression, not grit.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [0.6, 3], curveK: 2.5, oversample: '2x',
      preEQ: [{ type: 'highpass', freq: 60 }, { type: 'peaking', freq: 2500, Q: 1, gain: 1 }],
      postEQ: [
        { type: 'peaking', freq: 3500, Q: 1, gain: 4 },
        { type: 'peaking', freq: 550, Q: 1.4, gain: -3 },
        { type: 'highshelf', freq: 8000, gain: 2 },
        { type: 'lowshelf', freq: 100, gain: -1 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 6,
      builtInCompressor: { ratio: 4, threshold: -24, attack: 0.005, release: 0.15 },
      cab: { resonanceHz: 3700, resonanceQ: 2, lowpassHz: 6800, highpassHz: 100, decayMs: 12, reflections: 1 },
    }),
    params: ampParams(),
  },
];

export function getAmpType(id) {
  return AMP_TYPES.find((a) => a.id === id);
}

// Acoustic-simulation post-chain block (separate toggle, not part of the amp/pedal chain).
export async function createAcousticSimNodes(ctx) {
  const preEQ = ctx.createBiquadFilter(); preEQ.type = 'peaking'; preEQ.frequency.value = 200; preEQ.Q.value = 1; preEQ.gain.value = -3;
  const midCut = ctx.createBiquadFilter(); midCut.type = 'peaking'; midCut.frequency.value = 900; midCut.Q.value = 1.2; midCut.gain.value = -4;
  const convolver = ctx.createConvolver();
  convolver.buffer = await generateAcousticBodyIR(ctx.sampleRate);
  const dry = ctx.createGain(); dry.gain.value = 0.15;
  const wet = ctx.createGain(); wet.gain.value = 0.85;
  const inputNode = ctx.createGain();
  const outputNode = ctx.createGain();

  inputNode.connect(preEQ).connect(midCut);
  midCut.connect(dry).connect(outputNode);
  midCut.connect(convolver).connect(wet).connect(outputNode);

  return { input: inputNode, output: outputNode, nodes: { preEQ, midCut, convolver, dry, wet } };
}
