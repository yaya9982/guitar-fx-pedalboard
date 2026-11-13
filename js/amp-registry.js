import { generateCabIR, generateAcousticBodyIR } from './ir-synth.js?v=4';
import { driveCurve } from './pedal-registry.js?v=123';

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
      driveRange: [0.4, 1.6], curveK: 1.5, oversample: 'none', makeup: 60, // calibrated with test-ampcal.html to match Crunch/Lead at ~0.1 input (was 8); tune by ear
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
  // Classic amp families. Voicing facts (tone-stack scoop, speaker range, gain structure) are
  // sourced in BAND-PRESETS-RESEARCH.md; the numbers are estimates fitted to those facts, and
  // makeup values are calibrated with test-presets.html. Tune by ear.
  // ---------------------------------------------------------------------
  {
    id: 'blackface', label: 'Blackface', group: 'standard', color: 'oklch(30% 0.01 250)',
    blurb: 'Scooped, sparkling American clean that only breaks up when you crank it.',
    about: 'A small American combo in the Princeton/Deluxe Reverb mould: a tone stack that dips the mids around 500 Hz, a bright top, and a soft, nearly symmetric clip that stays clean through most of the Gain range and turns to a sweet breakup near the top.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [0.5, 10], curveK: 2, oversample: '2x', makeup: 5,
      preEQ: [{ type: 'highpass', freq: 70 }],
      postEQ: [
        { type: 'peaking', freq: 3500, Q: 1, gain: 2 },
        { type: 'peaking', freq: 500, Q: 0.8, gain: -4 },
        { type: 'highshelf', freq: 6000, gain: 2 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 5,
      cab: { resonanceHz: 2600, resonanceQ: 1.7, lowpassHz: 5500, highpassHz: 85, decayMs: 14, reflections: 1 },
    }),
    params: ampParams(),
  },
  {
    id: 'plexi', label: 'Plexi', group: 'standard', color: 'oklch(28% 0.02 60)',
    blurb: 'Loud, mid-forward British stack: clean at low Gain, roaring when turned up.',
    about: 'A non-master-volume British 100-watt head in the Super Lead mould. A simple preamp with two gain stages, so it is not a high-gain amp: low Gain is nearly clean, and the crunch arrives as you turn it up, with an upper-mid bite and a 4x12 that rolls off above 5 kHz.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [0.6, 12], curveK: 3, oversample: '2x', makeup: 1.6,
      preEQ: [{ type: 'highpass', freq: 80 }, { type: 'peaking', freq: 800, Q: 0.8, gain: 3 }],
      postEQ: [
        { type: 'peaking', freq: 2400, Q: 1, gain: 4 },
        { type: 'lowshelf', freq: 110, gain: 1 },
        { type: 'highshelf', freq: 6500, gain: -2 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 6,
      cab: { resonanceHz: 2400, resonanceQ: 2.2, lowpassHz: 5000, highpassHz: 100, decayMs: 18, reflections: 2 },
    }),
    params: ampParams(),
  },
  {
    id: 'brit800', label: 'Brit 800', group: 'standard', color: 'oklch(22% 0.01 60)',
    blurb: 'Master-volume British head: tighter and hotter than the Plexi, short of full metal.',
    about: 'A master-volume British head in the JCM800 2203 mould. An extra preamp gain stage gives it more gain and a harder edge than the Plexi, with snarling upper mids. It sits between Crunch and Lead.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [1.2, 18], curveK: 7, oversample: '4x',
      preEQ: [{ type: 'highpass', freq: 100 }, { type: 'peaking', freq: 1000, Q: 0.9, gain: 3 }],
      postEQ: [
        { type: 'peaking', freq: 2800, Q: 1, gain: 5 },
        { type: 'lowshelf', freq: 100, gain: -1 },
        { type: 'highshelf', freq: 6000, gain: -1 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 7,
      cab: { resonanceHz: 2800, resonanceQ: 2.2, lowpassHz: 5000, highpassHz: 100, decayMs: 18, reflections: 2 },
    }),
    params: ampParams(),
  },
  {
    id: 'ac30', label: 'AC30', group: 'standard', color: 'oklch(35% 0.04 40)',
    blurb: 'Chimey British combo: jangly cleans that slide smoothly into a gritty breakup.',
    about: 'A British combo in the AC30 Top Boost mould: no mid control, no negative feedback, and a cathode-biased class AB output stage, so it chimes in the upper mids, runs light in the lows, and breaks up early and gradually with a slightly asymmetric clip.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [0.8, 9], curveK: 3.5, curveBias: 0.03, oversample: '2x', makeup: 2.5,
      preEQ: [{ type: 'highpass', freq: 110 }, { type: 'peaking', freq: 1400, Q: 0.8, gain: 2 }],
      postEQ: [
        { type: 'peaking', freq: 3200, Q: 1.1, gain: 4 },
        { type: 'lowshelf', freq: 120, gain: -2 },
        { type: 'highshelf', freq: 7000, gain: 1.5 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 6,
      cab: { resonanceHz: 3000, resonanceQ: 2.2, lowpassHz: 5200, highpassHz: 110, decayMs: 15, reflections: 1 },
    }),
    params: ampParams(),
  },
  {
    id: 'dr103', label: 'DR103', group: 'standard', color: 'oklch(25% 0.005 250)',
    blurb: 'Huge British clean headroom with full mids: a loud, firm platform for fuzz and delay.',
    about: 'A 100-watt British head in the Hiwatt DR103 mould, built for headroom rather than distortion: big, punchy cleans, a full low end and present mids, with only a light edge at the top of the Gain range.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [0.4, 4], curveK: 2, oversample: '2x', makeup: 7,
      preEQ: [{ type: 'highpass', freq: 55 }],
      postEQ: [
        { type: 'peaking', freq: 3200, Q: 1, gain: 2 },
        { type: 'lowshelf', freq: 100, gain: 1.5 },
        { type: 'peaking', freq: 1000, Q: 0.8, gain: 1.5 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 5,
      cab: { resonanceHz: 2800, resonanceQ: 1.8, lowpassHz: 5400, highpassHz: 80, decayMs: 16, reflections: 2 },
    }),
    params: ampParams(),
  },
  {
    id: 'markiic', label: 'Mark IIC+', group: 'standard', color: 'oklch(20% 0.01 280)',
    blurb: 'Tight, saturated California lead with the graphic-EQ V: the thrash rhythm sound.',
    about: 'A cascaded-gain California head in the Mark IIC+ mould. Bass is cut before the gain stages so palm mutes stay tight, the lead channel is saturated throughout, and a post-gain five-band graphic EQ (80, 240, 750, 2200, 6600 Hz) is set to the classic thrash curve: lows lifted, a deep 750 Hz scoop, slight cuts at 240 and 2200 Hz, a small lift at 6600 Hz.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      driveRange: [5, 28], curveK: 10, oversample: '4x',
      preEQ: [{ type: 'highpass', freq: 135 }, { type: 'peaking', freq: 1000, Q: 1, gain: 3 }],
      // Index 0 is the Presence band (its gain is set by the knob). The rest is the post-gain
      // five-band graphic EQ (80/240/750/2200/6600 Hz) set to the thrash curve from the
      // Tone Master Pro Metallica screenshot: +2.5, -1.4, -10.9, -2.8, +2.0 dB.
      postEQ: [
        { type: 'peaking', freq: 4000, Q: 1, gain: 0 },
        { type: 'lowshelf', freq: 80, gain: 2.5 },
        { type: 'peaking', freq: 240, Q: 0.7, gain: -1.4 },
        { type: 'peaking', freq: 750, Q: 0.7, gain: -10.9 },
        { type: 'peaking', freq: 2200, Q: 0.9, gain: -2.8 },
        { type: 'highshelf', freq: 6600, gain: 2 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 8,
      cab: { resonanceHz: 3200, resonanceQ: 2.4, lowpassHz: 5000, highpassHz: 100, decayMs: 16, reflections: 2 },
    }),
    params: ampParams(),
  },
  // ---------------------------------------------------------------------
  // Acoustic — a body model, not an amp: no preamp or cab, one Volume knob.
  // ---------------------------------------------------------------------
  {
    id: 'acoustic', label: 'Acoustic', group: 'acoustic', layout: 'guitar', color: 'oklch(62% 0.11 65)',
    blurb: 'Your pickup signal reshaped to sound like a miked acoustic guitar body.',
    about: 'Acoustic replaces the amp with a model of an acoustic guitar\'s wooden body. A corrective EQ trims the boxy, nasal and quacky bands a pickup exaggerates and adds a touch of air, then a synthesized body response adds the resonances a pickup misses: the air resonance near 110 Hz and the top-plate resonance near 220 Hz, each with a realistic ring time. Body sets how much of that resonance is added, Softness how deeply the nasal and quacky upper mids are cut, and Air how much top-end sparkle is restored; the middle position of each is the base voicing. It is an EQ and resonance approximation based on published guitar measurements, not a recording of a real guitar, and there is no gain stage, so it stays clean. It takes the amp slot, so it replaces any other amp.',
    createNodes: createAcousticNodes,
    params: [
      { key: 'volume', label: 'Volume', min: 0, max: 150, default: 100, unit: '%', apply: (n, v) => (n.outputLevel.gain.value = v / 100 * n.makeup) },
      // 50 = the base voicing; each knob scales one part of it between 0x and 2x.
      { key: 'body', label: 'Body', min: 0, max: 100, default: 50, corner: true, apply: (n, v) => (n.bodyGain.gain.value = v / 50) },
      { key: 'softness', label: 'Softness', min: 0, max: 100, default: 50, corner: true, apply: (n, v) => ['nasal', 'quack'].forEach((k) => (n.bands[k].node.gain.value = n.bands[k].base * v / 50)) },
      { key: 'air', label: 'Air', min: 0, max: 100, default: 50, corner: true, apply: (n, v) => (n.bands.air.node.gain.value = n.bands.air.base * v / 50) },
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
  { name: 'nasal', type: 'peaking', frequency: 1100, Q: 1, gain: -2 }, // nasal
  { name: 'quack', type: 'peaking', frequency: 2700, Q: 2, gain: -4 }, // piezo/pickup quack
  { type: 'highshelf', frequency: 6000, gain: -3 }, // brittleness
  { name: 'air', type: 'highshelf', frequency: 10000, gain: 3 }, // air (lifts back what the 6 kHz shelf takes off)
];

async function createAcousticNodes(ctx) {
  const input = ctx.createGain();
  const outputLevel = ctx.createGain();
  // Resonances run on a parallel path (modes-only IR, no direct impulse), so Body is a plain
  // gain on that path: 0 = EQ'd pickup signal only, 1 = the full modeled body, no IR swap or clicks.
  const convolver = ctx.createConvolver();
  convolver.normalize = false;
  convolver.buffer = await generateAcousticBodyIR(ctx.sampleRate, { direct: false });
  const bodyGain = ctx.createGain();

  const bands = {};
  let node = input;
  for (const band of ACOUSTIC_EQ) {
    const f = ctx.createBiquadFilter();
    f.type = band.type; f.frequency.value = band.frequency; f.gain.value = band.gain;
    if (band.Q !== undefined) f.Q.value = band.Q;
    if (band.name) bands[band.name] = { node: f, base: band.gain };
    node.connect(f); node = f;
  }
  node.connect(outputLevel);
  node.connect(convolver).connect(bodyGain).connect(outputLevel);

  return { input, output: outputLevel, nodes: { outputLevel, makeup: ACOUSTIC_MAKEUP, bodyGain, bands } };
}

