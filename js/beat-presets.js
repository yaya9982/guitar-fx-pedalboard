// Generic, widely-taught rhythm-section drum patterns — the "basic rock beat," "four-
// on-the-floor," "boom-bap," "funk," "reggae one-drop," "train beat," "rockabilly
// backbeat," and "classic rock" groove are standard vocabulary from any drum method
// book or intro music-theory course, not derived from any specific recording or
// artist. 16 steps per pattern = one bar of 4/4 at 16th-note resolution (step 0 =
// beat 1, step 4 = beat 2, step 8 = beat 3, step 12 = beat 4).

export const BEAT_PRESETS = [
  {
    id: 'preset1', label: 'Preset 1', genre: 'Basic Rock', bpm: 100,
    pattern: {
      kick: [0, 8],
      snare: [4, 12],
      hatClosed: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  },
  {
    id: 'preset2', label: 'Preset 2', genre: 'Four-on-the-Floor', bpm: 122,
    pattern: {
      kick: [0, 4, 8, 12],
      clap: [4, 12],
      hatClosed: [2, 6, 10, 14],
    },
  },
  {
    id: 'preset3', label: 'Preset 3', genre: 'Boom-Bap Hip-Hop', bpm: 90,
    pattern: {
      kick: [0, 6, 10],
      snare: [4, 12],
      hatClosed: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  },
  {
    id: 'preset4', label: 'Preset 4', genre: 'Funk', bpm: 104,
    pattern: {
      kick: [0, 6, 9],
      snare: [4, 12],
      hatClosed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    },
  },
  {
    id: 'preset5', label: 'Preset 5', genre: 'Reggae One-Drop', bpm: 76,
    pattern: {
      kick: [8],
      snare: [8],
      hatClosed: [2, 6, 10, 14],
    },
  },
  // Rock and roll presets below: also generic drum-pedagogy vocabulary (the "train
  // beat" gallop, a rockabilly backbeat, and a crash-accented classic-rock groove),
  // not transcribed from any specific recording or drummer.
  {
    id: 'preset6', label: 'Preset 6', genre: 'Rock \'n\' Roll Train Beat', bpm: 160,
    pattern: {
      kick: [0, 6, 8, 14],
      snare: [4, 12],
      hatClosed: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  },
  {
    id: 'preset7', label: 'Preset 7', genre: 'Rockabilly Backbeat', bpm: 150,
    pattern: {
      kick: [0, 8],
      snare: [4, 12],
      rim: [2, 6, 10, 14],
    },
  },
  {
    id: 'preset8', label: 'Preset 8', genre: 'Classic Rock Anthem', bpm: 120,
    pattern: {
      kick: [0, 6, 8],
      snare: [4, 12],
      hatClosed: [0, 2, 4, 6, 8, 10, 12, 14],
      crash: [0],
    },
  },
];

const STEPS_PER_BAR = 16;

// Standard "lookahead" Web Audio scheduler (schedule a little ahead of real time on a
// steady timer, rather than triggering sounds exactly when a JS timer fires) — timer
// callbacks jitter by tens of milliseconds, which is audible as a wobbly tempo; the
// actual audio is always scheduled against the precise AudioContext clock instead.
export class PatternPlayer {
  constructor(drumKit) {
    this.drumKit = drumKit;
    this.ctx = drumKit.ctx;
    this.isPlaying = false;
    this.activePresetId = null;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.bpm = 100;
    this.pattern = null;
    this._timerId = null;
    this.onStep = null; // optional callback(stepIndex) for UI highlighting
  }

  play(preset) {
    this.stop();
    this.pattern = preset.pattern;
    this.bpm = preset.bpm;
    this.activePresetId = preset.id;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.isPlaying = true;
    this._scheduler();
  }

  stop() {
    this.isPlaying = false;
    this.activePresetId = null;
    if (this._timerId) { clearTimeout(this._timerId); this._timerId = null; }
  }

  _stepDuration() {
    return 60 / this.bpm / 4; // one 16th note, in seconds
  }

  _scheduler() {
    if (!this.isPlaying) return;
    const scheduleAheadTime = 0.1;
    while (this.nextStepTime < this.ctx.currentTime + scheduleAheadTime) {
      this._scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += this._stepDuration();
      this.currentStep = (this.currentStep + 1) % STEPS_PER_BAR;
    }
    this._timerId = setTimeout(() => this._scheduler(), 25);
  }

  _scheduleStep(step, time) {
    Object.entries(this.pattern).forEach(([padId, steps]) => {
      if (steps.includes(step)) this.drumKit.trigger(padId, time);
    });
    if (this.onStep) {
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      setTimeout(() => this.onStep(step), delayMs);
    }
  }
}
