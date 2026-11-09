import { generateCabIR, generateAcousticBodyIR, generateReverbIR } from './ir-synth.js?v=6';
import { driveCurve } from './pedal-registry.js?v=7';

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
// Van Halen / Marshall 1959 Super Lead ("plexi") — a two-stage model, not createAmpNodes.
// Sources and the resolved conflicts are in PEDAL-RESEARCH.md §"Van Halen amp"; checks in
// test-vanhalen.html.
// ---------------------------------------------------------------------------
export const PLEXI = {
  // Tone stack: 33k slope, 500p / 22n / 22n (ampbooks: 1987 JMP50, assumed the same for a
  // 1959); 220k treble / 1M bass / 25k mid are typical Marshall pots (CAPS's JCM800 preset uses
  // 220k/1M/22k), unverified for a 1968 amp.
  stack: { R1: 220e3, R2: 1e6, R3: 25e3, R4: 33e3, C1: 500e-12, C2: 22e-9, C3: 22e-9 },
  driveRange: [0.5, 7], // ponytail: calibrated in test-vanhalen.html to "moderate" gain vs AC/DC/Lead
  preK: 2.5, preBias: 0.25, // V2a + cathode follower: grid-conduction side clips ~3x earlier
  powerDrive: 2.2, powerK: 1.2, powerBias: 0.02, // push-pull EL34: near-symmetric, odd harmonics
  presenceMaxDb: 5,
  // A WaveShaper clamps its input to +-1, so each tanh curve is stretched over HEADROOM x that
  // range (k x H, bias / H, signal / H). Both curves are flat well before the clamp, so loud
  // input saturates smoothly instead of hitting a hard edge (verification audit, 2026-11-07).
  headroom: 4,
  mainsVolts: 120, // Landee: "85 volts instead of 120" (Eddie counted from 110: ~1.2 dB difference)
  makeup: 0.145, // ~the driven amps' median level at default knobs, averaged over page loads (test-vanhalen.html)
  // Cab + mic, fitted to the user's own recording of the YRGM riff through their amp (2026-11-09):
  // flat 100 Hz-2.5 kHz, +5 dB at 4-5 kHz re 1 kHz, ~15 dB/oct fall above 6 kHz. Fixed filters,
  // not a noise-burst IR, whose 15 ms burst made 100-250 Hz both bass-light by design and random per
  // seed. Fit within 1.6 dB rms of the target over 8 modelled bridge-humbucker DIs playing the tab. The
  // 3-5 kHz lift holds for any pickup; bass and >5 kHz are +-5 dB pending the user's pickup/gain or a DI
  // (PEDAL-RESEARCH.md, "Cab vs the user's recording"). Web Audio Q units: LP/HP in dB, peaking linear.
  // The makeup above was re-measured with this chain (it passes ~unity; the noise IR did not).
  cab: [
    { type: 'highpass', freq: 60, Q: -3.0103 }, // the fit wants <=40 Hz, but the clip has no data below 100
    { type: 'peaking', freq: 4600, Q: 1.5, gain: 7.8 },
    { type: 'lowpass', freq: 8140, Q: -6.0206 }, // Q 0.5
    { type: 'lowpass', freq: 12000, Q: -3.0103 },
  ],
};

// Web Audio reads lowpass/highpass Q in dB; Butterworth (1/sqrt 2) is -3.01 dB, not 0.707.
const BUTTERWORTH_DB = -3.0103;

// Bass is an audio-taper (log) pot (Yeh & Smith), so mid-rotation is ~10% of its resistance.
const audioTaper = (v) => (Math.pow(10, 2 * v) - 1) / 99;

// Yeh & Smith, "Discretization of the '59 Fender Bassman Tone Stack", DAFx-06: the 3rd-order
// analog transfer function of the treble/middle/bass stack, then the bilinear transform.
// t/m/l = treble/middle/bass pot positions 0..1. Checked against an independent nodal solve.
export function plexiStackCoeffs(sampleRate, t, m, l, c = PLEXI.stack) {
  const { R1, R2, R3, R4, C1, C2, C3 } = c;
  const b1 = t * C1 * R1 + m * C3 * R3 + l * (C1 * R2 + C2 * R2) + (C1 * R3 + C2 * R3);
  const b2 = t * (C1 * C2 * R1 * R4 + C1 * C3 * R1 * R4) - m * m * (C1 * C3 * R3 * R3 + C2 * C3 * R3 * R3)
    + m * (C1 * C3 * R1 * R3 + C1 * C3 * R3 * R3 + C2 * C3 * R3 * R3)
    + l * (C1 * C2 * R1 * R2 + C1 * C2 * R2 * R4 + C1 * C3 * R2 * R4)
    + l * m * (C1 * C3 * R2 * R3 + C2 * C3 * R2 * R3)
    + (C1 * C2 * R1 * R3 + C1 * C2 * R3 * R4 + C1 * C3 * R3 * R4);
  const C123 = C1 * C2 * C3;
  const b3 = l * m * C123 * (R1 * R2 * R3 + R2 * R3 * R4) - m * m * C123 * (R1 * R3 * R3 + R3 * R3 * R4)
    + m * C123 * (R1 * R3 * R3 + R3 * R3 * R4) + t * C123 * R1 * R3 * R4 - t * m * C123 * R1 * R3 * R4
    + t * l * C123 * R1 * R2 * R4;
  const a1 = (C1 * R1 + C1 * R3 + C2 * R3 + C2 * R4 + C3 * R4) + m * C3 * R3 + l * (C1 * R2 + C2 * R2);
  const a2 = m * (C1 * C3 * R1 * R3 - C2 * C3 * R3 * R4 + C1 * C3 * R3 * R3 + C2 * C3 * R3 * R3)
    + l * m * (C1 * C3 * R2 * R3 + C2 * C3 * R2 * R3) - m * m * (C1 * C3 * R3 * R3 + C2 * C3 * R3 * R3)
    + l * (C1 * C2 * R2 * R4 + C1 * C2 * R1 * R2 + C1 * C3 * R2 * R4 + C2 * C3 * R2 * R4)
    + (C1 * C2 * R1 * R4 + C1 * C3 * R1 * R4 + C1 * C2 * R3 * R4 + C1 * C2 * R1 * R3 + C1 * C3 * R3 * R4 + C2 * C3 * R3 * R4);
  const a3 = l * m * C123 * (R1 * R2 * R3 + R2 * R3 * R4) - m * m * C123 * (R1 * R3 * R3 + R3 * R3 * R4)
    + m * C123 * (R3 * R3 * R4 + R1 * R3 * R3 - R1 * R3 * R4) + l * C123 * R1 * R2 * R4 + C123 * R1 * R3 * R4;
  const k = 2 * sampleRate, k2 = k * k, k3 = k2 * k;
  const bz = (p0, p1, p2, p3) => [p0 + p1 * k + p2 * k2 + p3 * k3, 3 * p0 + p1 * k - p2 * k2 - 3 * p3 * k3,
    3 * p0 - p1 * k - p2 * k2 + 3 * p3 * k3, p0 - p1 * k + p2 * k2 - p3 * k3];
  const B = bz(0, b1, b2, b3), A = bz(1, a1, a2, a3);
  return { feedforward: B.map((v) => v / A[0]), feedback: A.map((v) => v / A[0]) };
}

// IIRFilterNode coefficients are fixed at creation, so a knob move swaps in a new node. A fresh
// filter starts from zero state (the stack's time constants are ~22 ms), so the swap is a 50 ms
// crossfade, otherwise every knob step clicks (verification test, 2026-11-07).
const STACK_FADE_S = 0.05;
function setPlexiStack(n, ctx, change) {
  Object.assign(n.stackPos, change);
  const { t, m, l } = n.stackPos;
  const { feedforward, feedback } = plexiStackCoeffs(ctx.sampleRate, t, m, l);
  const iir = ctx.createIIRFilter(feedforward, feedback);
  const fade = ctx.createGain();
  n.stackIn.connect(iir).connect(fade).connect(n.stackOut);
  const old = n.stack;
  n.stack = { iir, fade };
  if (!old) return; // first build: no fade needed
  const now = ctx.currentTime;
  fade.gain.setValueAtTime(0, now);
  fade.gain.linearRampToValueAtTime(1, now + STACK_FADE_S);
  const g = old.fade.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0, now + STACK_FADE_S);
  setTimeout(() => { n.stackIn.disconnect(old.iir); old.fade.disconnect(); }, STACK_FADE_S * 2000);
}

// Lower mains scales every supply (B+, bias, heaters) together, so every stage clips at
// r = V/120 of its normal level: scale the signal by 1/r into both clippers and by r out.
function setVariac(n, volts) {
  const r = volts / PLEXI.mainsVolts;
  n.variacIn.gain.value = 1 / (r * PLEXI.headroom);
  n.variacOut.gain.value = r;
}

async function createPlexiNodes(ctx) {
  const input = ctx.createGain();
  // Bright-channel input: 0.0022uF coupling cap HPF (~72 Hz) and the 500pF bright cap
  // across the 470k mixer resistor, which stays active with Volume on 10 (~+4 dB above ~1 kHz).
  const inputHP = makeBand(ctx, { type: 'highpass', freq: 72, Q: BUTTERWORTH_DB });
  const bright = makeBand(ctx, { type: 'highshelf', freq: 1100, gain: 4 });
  const preGain = ctx.createGain();
  const variacIn = ctx.createGain();
  const preShaper = ctx.createWaveShaper();
  preShaper.curve = driveCurve(PLEXI.preK * PLEXI.headroom, PLEXI.preBias / PLEXI.headroom); preShaper.oversample = '4x';
  // Coupling caps strip the DC the asymmetric clip leaves behind.
  const dcBlock = makeBand(ctx, { type: 'highpass', freq: 20, Q: BUTTERWORTH_DB });
  const stackIn = ctx.createGain();
  const stackOut = ctx.createGain();
  const powerGain = ctx.createGain(); powerGain.gain.value = PLEXI.powerDrive / PLEXI.headroom;
  const powerShaper = ctx.createWaveShaper();
  powerShaper.curve = driveCurve(PLEXI.powerK * PLEXI.headroom, PLEXI.powerBias / PLEXI.headroom); powerShaper.oversample = '4x';
  const variacOut = ctx.createGain();
  // Presence: negative-feedback shelf, ~1 kHz corner, +5 dB at 10.
  const presenceNode = makeBand(ctx, { type: 'highshelf', freq: 1000, gain: PLEXI.presenceMaxDb });
  // Supply sag: solid-state rectifier, so modest — a gentle slow compressor. It sits before the
  // Variac's output scaling (normalized units), so it can't undo the Variac's level drop.
  const sag = new AudioWorkletNode(ctx, 'dynamics-processor');
  sag.parameters.get('ratio').value = 2;
  sag.parameters.get('threshold').value = -14;
  sag.parameters.get('knee').value = 6; // the worklet default (30 dB) would start compressing ~-29 dB
  sag.parameters.get('attack').value = 0.015;
  sag.parameters.get('release').value = 0.2;
  // Cab + mic: see PLEXI.cab.
  const cab = PLEXI.cab.map((b) => makeBand(ctx, b));
  cab.reduce((a, b) => a.connect(b));
  const outputLevel = ctx.createGain(); outputLevel.gain.value = PLEXI.makeup;
  // Sunset Sound Studio 1 live chamber as a send after the miked cab, where the studio had it.
  // (The app's Reverb pedal can only sit before the amp, which would put the room through the
  // dimed preamp: about 10 dB more tail, distorted.)
  const output = ctx.createGain();
  const chamber = ctx.createConvolver();
  chamber.buffer = await generateReverbIR(ctx.sampleRate, 'chamber');
  const chamberWet = ctx.createGain(); const chamberDry = ctx.createGain();

  input.connect(inputHP).connect(bright).connect(preGain).connect(variacIn).connect(preShaper)
    .connect(dcBlock).connect(stackIn);
  stackOut.connect(powerGain).connect(powerShaper).connect(sag).connect(variacOut).connect(presenceNode)
    .connect(cab[0]); cab[cab.length - 1].connect(outputLevel);
  outputLevel.connect(chamberDry).connect(output);
  outputLevel.connect(chamber).connect(chamberWet).connect(output);
  // Variac in normalized units: the guitar hits a preamp ceiling r times lower (x 1/r in);
  // preamp output and power ceiling both scale by r, so the power stage's drive is unchanged;
  // the speaker output is r times smaller (x r out).
  const nodes = { preGain, preShaper, powerShaper, variacIn, variacOut, stackIn, stackOut, stack: null, stackPos: { t: 1, m: 1, l: 1 }, presenceNode, outputLevel, sag, wet: chamberWet, dry: chamberDry };
  setPlexiStack(nodes, ctx, {});
  setVariac(nodes, 89);
  return { input, output, nodes };
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
    about: 'Signal is driven hot into saturation for a thick, bright rhythm crunch, but the gain ceiling and EQ are deliberately reined in from a full "wall of sound" so strummed chords stay legible rather than turning into a wash — a lot of gain on several simultaneous notes creates intermodulation mush, and cutting mids (the classic scooped-metal move) removes the band chord-tone separation actually lives in. Oasis-inspired voicing goes for the bright crunch of cranked amps (Noel: "I never used distortion pedals"). The records\' size came from overdubbing several guitar parts and loud, compression-heavy mastering, so this single amp stays a driven crunch rather than a fuzz: a rhythm tone built for chord-heavy Britpop electric strumming (Don\'t Look Back in Anger, Champagne Supernova, Supersonic) rather than layered lead-guitar walls.',
    createNodes: (ctx) => createAmpNodes(ctx, {
      // driveRange/curveK pulled back from an earlier [8,30]/k=12 (the hottest, most
      // scooped config of the four signature amps) specifically because that combo
      // shredded chord clarity — great for single-note riffs, mud on strummed chords.
      // Pulled back again (was [6,20], 2026-11-07): at default knobs that was a near-Lead-level
      // single tanh (small-signal slope 123 vs AC/DC 63, Lead 170) that sat flat at the rails, i.e.
      // fuzz. Noel: "I used to just turn up the amps as full as I could get them – I never used
      // distortion pedals" (Guitar One, Sept 2002, via oasis-recordinginfo.co.uk). The albums' size
      // came from many overdubbed guitar parts ("maybe three, four, five", SOS Classic Tracks
      // Nov 2012; "loads" on Definitely Maybe per engineer Anjali Dutt) and compression-heavy
      // mastering, not one very hot amp. -3.2 dB: slope 86 (k=9 is flat by the +-1 clamp, so only
      // drive x k matters). Checked in test-oasis.html.
      driveRange: [4, 14], curveK: 9, oversample: '4x',
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
        // was a +2 dB highshelf at 6.5 kHz, boosting the clipping fizz a real guitar speaker rolls
        // off (e.g. Celestion G12M datasheet: 75-5000 Hz). A gentle Butterworth lowpass at 7.5 kHz
        // instead (Web Audio reads lowpass Q in dB: -3.01 = Butterworth). 5.5 kHz was tried first
        // and all three fact-checks found it made this bright amp darker than AC/DC.
        { type: 'lowpass', freq: 7500, Q: -3.0103 },
      ],
      presenceBandIndex: 0, presenceMaxDb: 5,
      makeup: 1.2, // the drive cut cost picked notes ~1.5-2.8 dB (fact-check A); restores the level
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
  {
    id: 'vanhalen', label: 'Van Halen', group: 'signature', color: '#b5121b', accent: '#0b0b0b', trim: '#f2f2f2',
    blurb: '1967/68 Marshall Super Lead "plexi", every knob on 10, Variac at 89 V: the Van Halen I sound.',
    about: 'Modeled on the rig used for Van Halen\'s 1978 debut (You Really Got Me, Ain\'t Talkin\' \'bout Love): a 1967/68 100 W Marshall 1959 Super Lead (stock, by Eddie\'s own account) with every control on 10, run through a Variac turned down to about 89 volts, into one 4x12 (usually said to be Greenbacks) with a Shure SM57 on the speaker. It is a two-stage model: an asymmetric preamp and cathode-follower clip, the plexi tone-stack circuit (computed from typical late-\'60s component values, so Bass, Middle and Treble work like the real knobs, with 10 being Eddie\'s setting), then a near-symmetric EL34 power stage. The Variac knob lowers every supply voltage at once, so both stages clip earlier and the amp gets quieter and more compressed, as a starved real amp does. The gain is moderate by modern standards: the size comes from the power stage, the speaker and the studio chamber, which is why the studio chamber is built in (the Chamber knob) after the speaker, where it was on the record.',
    createNodes: createPlexiNodes,
    params: [
      // "Volume" on a non-master plexi; Eddie ran it on 10 and used the Variac as his volume.
      { key: 'gain', label: 'Volume', min: 0, max: 100, default: 100, apply: (n, v) => (n.preGain.gain.value = PLEXI.driveRange[0] + (PLEXI.driveRange[1] - PLEXI.driveRange[0]) * v / 100) },
      { key: 'bass', label: 'Bass', min: 0, max: 100, default: 100, apply: (n, v, ctx) => setPlexiStack(n, ctx, { l: audioTaper(v / 100) }) },
      { key: 'mid', label: 'Middle', min: 0, max: 100, default: 100, apply: (n, v, ctx) => setPlexiStack(n, ctx, { m: v / 100 }) },
      { key: 'treble', label: 'Treble', min: 0, max: 100, default: 100, apply: (n, v, ctx) => setPlexiStack(n, ctx, { t: v / 100 }) },
      { key: 'presence', label: 'Presence', min: 0, max: 100, default: 100, apply: (n, v) => (n.presenceNode.gain.value = (v / 100) * PLEXI.presenceMaxDb) },
      // Default set so wet/dry is ~-10 dB in 1-4 kHz, as measured from the YRGM mix (test-vanhalen.html).
      { key: 'chamber', label: 'Chamber', min: 0, max: 100, default: 28, unit: '%', apply: (n, v) => { n.wet.gain.value = v / 100; n.dry.gain.value = 1 - v / 100; } },
      { key: 'variac', label: 'Variac', min: 60, max: 120, default: 89, unit: 'V', apply: (n, v) => setVariac(n, v) },
      { key: 'level', label: 'Level', min: 0, max: 150, default: 100, unit: '%', apply: (n, v) => { n.levelPct = v; n.outputLevel.gain.value = v / 100 * PLEXI.makeup; } },
    ],
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

