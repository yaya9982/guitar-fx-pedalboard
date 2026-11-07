// Hand-tuned starting points so a new user (or someone testing without a guitar plugged
// in yet) can hear a fully-dialed-in chain in one click, then tweak from there.
export const DEMO_PRESETS = [
  {
    name: 'Classic Rock Rhythm',
    blurb: 'Comp + Crunch amp + a touch of slap-back delay',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: true, threshold: -50, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'compressor', enabled: true, params: { threshold: -20, ratio: 4, level: 100 } },
        { kind: 'amp', typeId: 'crunch', enabled: true, params: { gain: 55, presence: 55, level: 100 } },
        { kind: 'pedal', typeId: 'delay', enabled: true, params: { time: 260, feedback: 18, mix: 18 } },
      ],
    },
  },
  {
    name: 'Blues Lead',
    blurb: 'Overdrive into a singing Lead/High-Gain amp with room verb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: true, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'overdrive', enabled: true, params: { drive: 55, tone: 60, level: 110 } },
        { kind: 'amp', typeId: 'lead', enabled: true, params: { gain: 45, presence: 60, level: 100 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'room', mix: 25 } },
      ],
    },
  },
  {
    name: 'AC/DC Crunch',
    blurb: 'Tight comp into the AC/DC signature amp',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: true, threshold: -46, holdMs: 40, release: 120 },
      chain: [
        { kind: 'pedal', typeId: 'compressor', enabled: true, params: { threshold: -18, ratio: 3, level: 100 } },
        { kind: 'amp', typeId: 'acdc', enabled: true, params: { gain: 60, presence: 60, level: 100 } },
      ],
    },
  },
  {
    name: 'Ambient Clean',
    blurb: 'Chorus + long hall reverb + delay over a Clean amp',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: true, threshold: -52, holdMs: 80, release: 200 },
      chain: [
        { kind: 'amp', typeId: 'clean', enabled: true, params: { gain: 30, presence: 55, level: 100 } },
        { kind: 'pedal', typeId: 'chorus', enabled: true, params: { rate: 0.6, depth: 5, mix: 40 } },
        { kind: 'pedal', typeId: 'delay', enabled: true, params: { time: 420, feedback: 35, mix: 25 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'hall', mix: 45 } },
      ],
    },
  },
  {
    name: 'Metal Rhythm',
    blurb: 'Fast gate + hard Distortion into the Lead amp',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: true, threshold: -38, holdMs: 20, release: 60 },
      chain: [
        { kind: 'pedal', typeId: 'distortion', enabled: true, params: { drive: 80, mid: -6, level: 100 } },
        { kind: 'amp', typeId: 'lead', enabled: true, params: { gain: 80, presence: 65, level: 100 } },
      ],
    },
  },
  {
    name: 'Dire Straits Glass',
    blurb: 'Barely-there chorus over the clean compressed Dire Straits amp',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: true, threshold: -52, holdMs: 60, release: 150 },
      chain: [
        { kind: 'amp', typeId: 'direstraits', enabled: true, params: { gain: 45, presence: 55, level: 100 } },
        { kind: 'pedal', typeId: 'chorus', enabled: true, params: { rate: 0.8, depth: 2.5, mix: 22 } },
      ],
    },
  },
  {
    name: 'Psychedelic Swirl',
    blurb: 'Phaser + Flanger stacked into a big hall reverb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: true, threshold: -50, holdMs: 60, release: 150 },
      chain: [
        { kind: 'amp', typeId: 'clean', enabled: true, params: { gain: 35, presence: 55, level: 100 } },
        { kind: 'pedal', typeId: 'phaser', enabled: true, params: { rate: 0.4, mix: 65 } },
        { kind: 'pedal', typeId: 'flanger', enabled: true, params: { rate: 0.25, feedback: 55, mix: 40 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'hall', mix: 40 } },
      ],
    },
  },
  {
    name: 'Funk Wah',
    blurb: 'Auto-wah + compressor over a Clean amp',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: true, threshold: -48, holdMs: 40, release: 100 },
      chain: [
        { kind: 'pedal', typeId: 'autowah', enabled: true, params: { rate: 3.5, depth: 650 } },
        { kind: 'pedal', typeId: 'compressor', enabled: true, params: { threshold: -22, ratio: 5, level: 100 } },
        { kind: 'amp', typeId: 'clean', enabled: true, params: { gain: 30, presence: 50, level: 100 } },
      ],
    },
  },
  {
    name: 'Van Halen - You Really Got Me',
    blurb: 'Dimed 1968 plexi on a Variac (89 V) with its built-in Sunset Sound chamber. No pedals documented on this one. Tune down a half step.',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 40, release: 120 },
      chain: [
        { kind: 'amp', typeId: 'vanhalen', enabled: true, params: { gain: 100, bass: 100, mid: 100, treble: 100, presence: 100, chamber: 24, variac: 89, level: 100 } },
      ],
    },
  },
  {
    name: "Van Halen - Ain't Talkin' 'bout Love",
    blurb: "Same plexi rig and built-in chamber. Phase 90 at Eddie's 9-10 o'clock setting, left off: switch it on for the solo if you like. Tune down a half step.",
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 40, release: 120 },
      chain: [
        { kind: 'pedal', typeId: 'phase90', enabled: false, params: { rate: 0.4, depth: 1200, feedback: 30, mix: 50 } },
        { kind: 'amp', typeId: 'vanhalen', enabled: true, params: { gain: 100, bass: 100, mid: 100, treble: 100, presence: 100, chamber: 24, variac: 89, level: 100 } },
      ],
    },
  },
];
