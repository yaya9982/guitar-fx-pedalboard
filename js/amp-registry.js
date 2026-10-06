import { generateCabIR, generateAcousticBodyIR } from './ir-synth.js?v=2';
import { driveCurve } from './pedal-registry.js?v=3';

function makeBand(ctx, band) {
  const f = ctx.createBiquadFilter();
  f.type = band.type; f.frequency.value = band.freq;
  if (band.Q !== undefined) f.Q.value = band.Q;
  if (band.gain !== undefined) f.gain.value = band.gain;
  return f;
}

// Shared amp factory: inputGain -> preEQ -> waveshaper(fixed curve) -> postEQ -> cab convolver -> outputLevel.
// The "gain" knob drives inputGain (how hard the signal hits the fixed curve, like a real preamp),
// "presence" scales a dedicated presence band in the post-EQ, "level" is a plain output trim.
async function createAmpNodes(ctx, cfg) {
  const inputGain = ctx.createGain();
  inputGain.gain.value = cfg.driveRange[0];

  const preEQNodes = cfg.preEQ.map((band) => makeBand(ctx, band));

  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(cfg.curveK, cfg.curveBias || 0);
  shaper.oversample = cfg.oversample || '2x';

  const postEQNodes = cfg.postEQ.map((band) => makeBand(ctx, band));
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

  // User-adjustable tone stack, on top of each amp's own fixed pre/post voicing bands above —
  // one shared frequency set across every amp (Bass/Middle/Treble knobs on a real amp panel
  // don't vary the underlying circuit's tuning per model either).
  const bassNode = ctx.createBiquadFilter(); bassNode.type = 'lowshelf'; bassNode.frequency.value = 120;
  const midNode = ctx.createBiquadFilter(); midNode.type = 'peaking'; midNode.frequency.value = 700; midNode.Q.value = 1;
  const trebleNode = ctx.createBiquadFilter(); trebleNode.type = 'highshelf'; trebleNode.frequency.value = 3000;

  const cabConvolver = ctx.createConvolver();
  cabConvolver.buffer = await generateCabIR(ctx.sampleRate, cfg.cab);

  const outputLevel = ctx.createGain();
  const makeup = cfg.makeup || 1; // per-amp trim for the cab IR's loudness loss
  outputLevel.gain.value = makeup;

  // wire it up
  let node = inputGain;
  if (dynamicsNode) { node.connect(dynamicsNode); node = dynamicsNode; }
  preEQNodes.forEach((n) => { node.connect(n); node = n; });
  node.connect(shaper); node = shaper;
  postEQNodes.forEach((n) => { node.connect(n); node = n; });
  node.connect(bassNode); node = bassNode;
  node.connect(midNode); node = midNode;
  node.connect(trebleNode); node = trebleNode;
  node.connect(cabConvolver);
  cabConvolver.connect(outputLevel);

  return {
    input: inputGain,
    output: outputLevel,
    nodes: { inputGain, preEQNodes, shaper, postEQNodes, presenceNode, bassNode, midNode, trebleNode, cabConvolver, outputLevel, driveRange: cfg.driveRange, makeup, presenceMaxDb: cfg.presenceMaxDb },
  };
}

function ampParams() {
  return [
    { key: 'gain', label: 'Gain', min: 0, max: 100, default: 55, apply: (n, v) => { const [lo, hi] = n.driveRange; n.inputGain.gain.value = lo + (hi - lo) * (v / 100); } },
    // 50 = noon/flat (0dB); left of noon cuts, right boosts — standard amp tone-knob feel,
    // unlike Presence/Level below which are unidirectional 0..max/0..150% knobs.
    { key: 'bass', label: 'Bass', min: 0, max: 100, default: 50, apply: (n, v) => (n.bassNode.gain.value = (v - 50) / 50 * 12) },
    { key: 'mid', label: 'Middle', min: 0, max: 100, default: 50, apply: (n, v) => (n.midNode.gain.value = (v - 50) / 50 * 10) },
    { key: 'treble', label: 'Treble', min: 0, max: 100, default: 50, apply: (n, v) => (n.trebleNode.gain.value = (v - 50) / 50 * 12) },
    { key: 'presence', label: 'Presence', min: 0, max: 100, default: 55, apply: (n, v) => { n.presenceNode.gain.value = (v / 100) * n.presenceMaxDb; } },
    { key: 'level', label: 'Level', min: 0, max: 150, default: 100, unit: '%', apply: (n, v) => (n.outputLevel.gain.value = v / 100 * n.makeup) },
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
      driveRange: [0.4, 1.6], curveK: 1.5, oversample: 'none', makeup: 8, // ~+18dB, matches AC/DC default RMS at ~0.1 input; tune by ear
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
    id: 'acdc', label: 'AC/DC', group: 'signature', color: '#fe0100', accent: '#0d0503', trim: '#ac9e72',
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
    blurb: 'Big, bright Britpop crunch — driven enough to feel massive, tuned to keep chords readable.',
    about: 'Signal is driven hot into saturation for a thick, bright rhythm crunch, but the gain ceiling and EQ are deliberately reined in from a full "wall of sound" so strummed chords stay legible rather than turning into a wash — a lot of gain on several simultaneous notes creates intermodulation mush, and cutting mids (the classic scooped-metal move) removes the band chord-tone separation actually lives in. Oasis-inspired voicing goes for a bright, driven Marshall JCM rhythm tone built for chord-heavy Britpop strumming (Wonderwall, Don\'t Look Back in Anger, Champagne Supernova) rather than layered lead-guitar walls.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      // driveRange/curveK pulled back from an earlier [8,30]/k=12 (the hottest, most
      // scooped config of the four signature amps) specifically because that combo
      // shredded chord clarity — great for single-note riffs, mud on strummed chords.
      driveRange: [6, 20], curveK: 9, oversample: '4x',
      // tighter highpass (75Hz, was 70) keeps low strings from smearing into the clipper
      preEQ: [{ type: 'highpass', freq: 75 }, { type: 'peaking', freq: 1000, Q: 1, gain: 3 }],
      postEQ: [
        // presence peak eased (was +6dB) — the old setting sat right on top of chord
        // overtones and read as harsh/undefined once several notes were ringing together
        { type: 'peaking', freq: 3800, Q: 1, gain: 4 },
        // mid scoop nearly removed (was -3dB) — mids are where chord-tone separation
        // lives; scooping them is what made strummed chords unreadable
        { type: 'peaking', freq: 500, Q: 1, gain: -1 },
        { type: 'lowshelf', freq: 90, gain: 2 },
        { type: 'highshelf', freq: 6500, gain: 2 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 5,
      // tighter cab response (Q 2.4->2.0, decay 20ms->16ms) — a longer resonant ring
      // blurs the onset of several simultaneous notes into each other
      cab: { resonanceHz: 3200, resonanceQ: 2, lowpassHz: 5200, highpassHz: 100, decayMs: 16, reflections: 3 },
    }),
    params: ampParams(),
  },
  {
    id: 'direstraits', label: 'Dire Straits', group: 'signature', color: '#6c90f9', accent: '#91838e', trim: '#dcddee',
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
  // ---------------------------------------------------------------------
  // Acoustic — a body model, not an amp: no preamp or cab, one Volume knob.
  // ---------------------------------------------------------------------
  {
    id: 'acoustic', label: 'Acoustic', group: 'acoustic', layout: 'guitar', color: 'oklch(62% 0.11 65)',
    blurb: 'Your pickup signal reshaped to sound like a miked acoustic guitar body.',
    about: 'Acoustic replaces the amp with a model of an acoustic guitar\'s wooden body. A corrective EQ trims the boxy, nasal and quacky bands a pickup exaggerates and adds a touch of air, then a synthesized body response adds the resonances a pickup misses: the air resonance near 110 Hz and the top-plate resonance near 220 Hz, each with a realistic ring time. It is an EQ and resonance approximation based on published guitar measurements, not a recording of a real guitar, and there is no gain stage, so it stays clean. It takes the amp slot, so it replaces any other amp.',
    createNodes: createAcousticNodes,
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 150, default: 100, unit: '%', apply: (n, v) => (n.outputLevel.gain.value = v / 100 * n.makeup) },
    ],
  },
];

export function getAmpType(id) {
  return AMP_TYPES.find((a) => a.id === id);
}

const ACOUSTIC_MAKEUP = 0.2; // ~AC/DC's median level (test-acoustic.html; the amps' random cab IRs vary a few dB per load); this model itself keeps unity gain

// Pickup-to-mic corrective EQ: an under-saddle/magnetic pickup hears the string but not the
// body, and carries a "quack" in the upper mids. Frequencies/gains follow the recipes in
// faderandknob.com/blog/acoustic-pickup-tone-fix and Premier Guitar's "Acoustic EQ for Stage"
// (cut 0.8-1.6 kHz nasal tone by at most ~3 dB); the body resonances come from the IR below.
const ACOUSTIC_EQ = [
  { type: 'peaking', frequency: 400, Q: 1.5, gain: -3 }, // boxiness
  { type: 'peaking', frequency: 1100, Q: 1, gain: -2 }, // nasal
  { type: 'peaking', frequency: 2700, Q: 2, gain: -4 }, // piezo/pickup quack
  { type: 'highshelf', frequency: 6000, gain: -3 }, // brittleness
  { type: 'highshelf', frequency: 10000, gain: 3 }, // air (lifts back what the 6 kHz shelf takes off)
];

async function createAcousticNodes(ctx) {
  const input = ctx.createGain();
  const outputLevel = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.normalize = false; // the IR has a unity direct impulse; keep its gain exactly as designed
  convolver.buffer = await generateAcousticBodyIR(ctx.sampleRate);

  let node = input;
  for (const band of ACOUSTIC_EQ) {
    const f = ctx.createBiquadFilter();
    f.type = band.type; f.frequency.value = band.frequency; f.gain.value = band.gain;
    if (band.Q !== undefined) f.Q.value = band.Q;
    node.connect(f); node = f;
  }
  node.connect(convolver).connect(outputLevel);

  return { input, output: outputLevel, nodes: { outputLevel, makeup: ACOUSTIC_MAKEUP } };
}

