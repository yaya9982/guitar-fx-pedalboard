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
  // Band setups, built from the classic amp models and existing pedals. The engine always runs
  // the amp last, so it is listed last. Where a Tone Master Pro screenshot exists, its knob values are
  // copied (percent knobs map straight across; level/output knobs map 50% = unity). Notes: BAND-PRESETS-RESEARCH.md.
  {
    name: "AC/DC: Thunderstruck",
    blurb: 'Angus rig from the video: a nearly clean Klon-style boost into a mid-forward Plexi, big plate reverb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'klon', enabled: true, params: { gain: 8, treble: -3.4, level: 152 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'plate', mix: 25 } },
        { kind: 'amp', typeId: 'plexi', enabled: true, params: { gain: 70, bass: 35, mid: 76, treble: 50, presence: 63, level: 78 } },
      ],
    },
  },
  {
    name: "Led Zeppelin",
    blurb: 'Jimmy Page recipe from the video: Tube Screamer-style drive into a cranked Princeton-style Blackface (a stand-in for the Supro), big room reverb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'ts9', enabled: true, params: { drive: 29, tone: 40, level: 138 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'room', mix: 45 } },
        { kind: 'amp', typeId: 'blackface', enabled: true, params: { gain: 100, bass: 53, mid: 50, treble: 64, presence: 0, level: 58 } },
      ],
    },
  },
  {
    name: "Van Halen: You Really Got Me",
    blurb: 'Brown sound rhythm: Plexi flat out, a little tape echo and plate, no modulation',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'boost', enabled: true, params: { level: 150, tone: 0 } },
        { kind: 'pedal', typeId: 'tapedelay', enabled: true, params: { time: 250, feedback: 15, wobble: 20, mix: 8 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'plate', mix: 15 } },
        { kind: 'amp', typeId: 'plexi', enabled: true, params: { gain: 95, bass: 55, mid: 60, treble: 55, presence: 50, level: 100 } },
      ],
    },
  },
  {
    name: "Van Halen: Eruption",
    blurb: 'Brown sound lead: slow Phase 90 into the dimed Plexi, tape echo and plate',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'phase90', enabled: true, params: { rate: 0.35, depth: 1200, feedback: 30, mix: 50 } },
        { kind: 'pedal', typeId: 'boost', enabled: true, params: { level: 150, tone: 0 } },
        { kind: 'pedal', typeId: 'tapedelay', enabled: true, params: { time: 250, feedback: 18, wobble: 20, mix: 15 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'plate', mix: 18 } },
        { kind: 'amp', typeId: 'plexi', enabled: true, params: { gain: 95, bass: 55, mid: 60, treble: 55, presence: 50, level: 100 } },
      ],
    },
  },
  {
    name: "Jimi Hendrix: Purple Haze",
    blurb: 'Recipe from the video: mid-lift EQ, treble boost and germanium fuzz into a Plexi with bass and mids pulled back; switch on the Pitch Shifter (octave up) for the solo',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'ge7', enabled: true, params: { band2: 1.4, band5: 4.5 } },
        { kind: 'pedal', typeId: 'boost', enabled: true, params: { level: 150, tone: 6 } },
        { kind: 'pedal', typeId: 'fuzzface', enabled: true, params: { fuzz: 50, tone: 50, level: 150 } },
        { kind: 'pedal', typeId: 'pitchshift', enabled: false, params: { semitones: 12, mix: 35 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'spring', mix: 45 } },
        { kind: 'amp', typeId: 'plexi', enabled: true, params: { gain: 35, bass: 18, mid: 28, treble: 69, presence: 68, level: 58 } },
      ],
    },
  },
  {
    name: "Guns N' Roses: Sweet Child O' Mine",
    blurb: 'Slash riff tone from the video: treble boost into a hot Brit 800 with the treble up, light tape echo; Cry Baby off until the solo',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'crybaby', enabled: false, params: { position: 1200, level: 160 } },
        { kind: 'pedal', typeId: 'boost', enabled: true, params: { level: 174, tone: 6 } },
        { kind: 'pedal', typeId: 'tapedelay', enabled: true, params: { time: 500, feedback: 10, wobble: 20, mix: 8 } },
        { kind: 'amp', typeId: 'brit800', enabled: true, params: { gain: 50, bass: 61, mid: 55, treble: 89, presence: 50, level: 94 } },
      ],
    },
  },
  {
    name: "Red Hot Chili Peppers: Can't Stop",
    blurb: 'Frusciante tone from the video: gentle 1176-style compression and a treble boost into a Plexi with the mids up, spring reverb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'compressor', enabled: true, params: { threshold: -20, ratio: 4, attack: 1, release: 400, level: 100 } },
        { kind: 'pedal', typeId: 'boost', enabled: true, params: { level: 159, tone: 6 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'spring', mix: 26 } },
        { kind: 'amp', typeId: 'plexi', enabled: true, params: { gain: 50, bass: 53, mid: 69, treble: 50, presence: 64, level: 109 } },
      ],
    },
  },
  {
    name: "Metallica",
    blurb: 'Hetfield tone from the video: low-drive Tube Screamer push into a Mark IIC+ with the mids at zero and the 750 Hz graphic-EQ scoop, a touch of room',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'ts9', enabled: true, params: { drive: 5, tone: 50, level: 100 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'room', mix: 6 } },
        { kind: 'amp', typeId: 'markiic', enabled: true, params: { gain: 90, bass: 18, mid: 0, treble: 90, presence: 18, level: 150 } },
      ],
    },
  },
  {
    name: "The Smiths: Heaven Knows",
    blurb: 'Marr jangle: light compression, bright Blackface clean, subtle CE-2 chorus and spring reverb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'compressor', enabled: true, params: { threshold: -24, ratio: 3, attack: 10, release: 200, level: 105 } },
        { kind: 'pedal', typeId: 'ce2', enabled: true, params: { rate: 0.6, depth: 3, feedback: 10, mix: 30 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'spring', mix: 20 } },
        { kind: 'amp', typeId: 'blackface', enabled: true, params: { gain: 40, bass: 45, mid: 50, treble: 65, presence: 55, level: 150 } },
      ],
    },
  },
  {
    name: "Pink Floyd: Time",
    blurb: 'Gilmour recipe from the video (2000s era): two compressors and a mild overdrive into a Hiwatt-style DR103, tape echo and a big hall; switch on the Big Muff for the solo',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'vintagecomp', enabled: true, params: { sensitivity: 30 } },
        { kind: 'pedal', typeId: 'cs3', enabled: true, params: { threshold: -30, attackRelease: 50, level: 100 } },
        { kind: 'pedal', typeId: 'overdrive', enabled: true, params: { drive: 34, tone: 40, level: 50 } },
        { kind: 'pedal', typeId: 'bigmuff', enabled: false, params: { sustain: 60, tone: 40, level: 100 } },
        { kind: 'pedal', typeId: 'tapedelay', enabled: true, params: { time: 350, feedback: 15, wobble: 20, mix: 29 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'hall', mix: 32 } },
        { kind: 'amp', typeId: 'dr103', enabled: true, params: { gain: 57, bass: 31, mid: 42, treble: 48, presence: 48, level: 92 } },
      ],
    },
  },
  {
    name: "Dire Straits: Sultans of Swing",
    blurb: 'Knopfler clean: Dyna Comp into a bright Blackface with a little spring reverb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'vintagecomp', enabled: true, params: { sensitivity: 35 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'spring', mix: 15 } },
        { kind: 'amp', typeId: 'blackface', enabled: true, params: { gain: 30, bass: 45, mid: 55, treble: 65, presence: 58, level: 100 } },
      ],
    },
  },
  {
    name: "Eric Clapton: 80s Strat",
    blurb: 'Fan recipe from the video: mid-boost EQ into a Tube Screamer and a cranked Princeton-style Blackface, large room reverb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'ge7', enabled: true, params: { band3: 2.6, band4: 7.4, band5: 5.4 } },
        { kind: 'pedal', typeId: 'ts9', enabled: true, params: { drive: 60, tone: 32, level: 180 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'room', mix: 32 } },
        { kind: 'amp', typeId: 'blackface', enabled: true, params: { gain: 100, bass: 47, mid: 50, treble: 74, presence: 0, level: 33 } },
      ],
    },
  },
  {
    name: "Oasis",
    blurb: 'Noel and Gem Archer from the video: Klon-style drive into a Bluesbreaker-style Plexi, Memory Man echo, room reverb',
    state: {
      inputGainPct: 100, masterVolumePct: 100,
      noiseGate: { enabled: false, threshold: -48, holdMs: 60, release: 150 },
      chain: [
        { kind: 'pedal', typeId: 'klon', enabled: true, params: { gain: 40, treble: 3.4, level: 138 } },
        { kind: 'pedal', typeId: 'analogdelay', enabled: true, params: { time: 350, feedback: 50, mix: 27 } },
        { kind: 'pedal', typeId: 'reverb', enabled: true, params: { type: 'room', mix: 38 } },
        { kind: 'amp', typeId: 'plexi', enabled: true, params: { gain: 46, bass: 40, mid: 44, treble: 70, presence: 64, level: 106 } },
      ],
    },
  },
];
