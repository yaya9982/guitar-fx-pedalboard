import { AudioEngine } from './audio-engine.js?v=12';
import { renderChain, showAddMenu, showDemoMenu, showInfoPopover, updateLevelMeter, drawScope, drawWaveform, drawStaticWave } from './ui.js?v=1';
import { renderPreviewWaveform } from './wave-preview.js';
import { DEMO_PRESETS } from './demo-presets.js';
import { Tuner, GUITAR_STRINGS, centsFromTarget } from './tuner.js?v=3';
import { Looper } from './looper.js';
import { audioBufferToWavBlob } from './wav-encoder.js';
import { DrumKit, DRUM_PADS } from './drum-kit.js';
import { BEAT_PRESETS, PatternPlayer } from './beat-presets.js?v=2';
import {
  buildStateObject, loadPresetList, savePreset, deletePreset,
  saveAutosave, loadAutosave, exportStateAsFile, importStateFromFile,
} from './presets.js';

const $ = (id) => document.getElementById(id);

const enableAudioBtn = $('enableAudioBtn');
const inputDeviceSelect = $('inputDeviceSelect');
const outputDeviceSelect = $('outputDeviceSelect');
const latencyReadout = $('latencyReadout');
const inputMeterBar = $('inputMeterBar');
const scopeCanvas = $('scopeCanvas');
const waveCanvas = $('waveCanvas');

const inputGainRange = $('inputGainRange');
const inputTrimInfoBtn = $('inputTrimInfoBtn');
const muteInputBtn = $('muteInputBtn');
const masterVolRange = $('masterVolRange');
const masterInfoBtn = $('masterInfoBtn');
const noiseGateEnabled = $('noiseGateEnabled');
const noiseGateInfoBtn = $('noiseGateInfoBtn');
const gateThreshold = $('gateThreshold');
const gateThresholdInfoBtn = $('gateThresholdInfoBtn');
const denoiseEnabled = $('denoiseEnabled');
const denoiseStrength = $('denoiseStrength');
const denoiseStrengthInfoBtn = $('denoiseStrengthInfoBtn');
const denoiseInfoBtn = $('denoiseInfoBtn');
const acousticSimEnabled = $('acousticSimEnabled');
const addPedalBtn = $('addPedalBtn');
const demoSetupsBtn = $('demoSetupsBtn');
const clearSetupBtn = $('clearSetupBtn');
const pedalChain = $('pedalChain');
const pedalCardTemplate = $('pedalCardTemplate');

const tunerNote = $('tunerNote');
const tunerNeedle = $('tunerNeedle');
const tunerCents = $('tunerCents');
const tunerFreq = $('tunerFreq');
const tunerStringRow = $('tunerStringRow');
const tunerDirection = $('tunerDirection');
const tunerHint = $('tunerHint');

const looperRecordBtn = $('looperRecordBtn');
const looperPlayBtn = $('looperPlayBtn');
const looperStopBtn = $('looperStopBtn');
const looperLoopBtn = $('looperLoopBtn');
const looperClearBtn = $('looperClearBtn');
const looperDownloadBtn = $('looperDownloadBtn');
const looperStatus = $('looperStatus');
const looperWaveform = $('looperWaveform');
const drumKitSelect = $('drumKitSelect');
const drumVolRange = $('drumVolRange');
const drumPadGrid = $('drumPadGrid');
const beatPresetRow = $('beatPresetRow');
const beatTempoRange = $('beatTempoRange');
const beatTempoInput = $('beatTempoInput');

const presetName = $('presetName');
const presetSaveBtn = $('presetSaveBtn');
const presetList = $('presetList');
const presetExportBtn = $('presetExportBtn');
const presetImportInput = $('presetImportInput');

const engine = new AudioEngine();
window.engine = engine; // exposed for console-driven testing (inject synthetic notes, inspect chain state)
let tuner = null;
let looper = null;
let drumKit = null;
let drumBus = null;
let patternPlayer = null;
let isRecording = false;
let autosaveTimer = null;

// ---------------------------------------------------------------------------
// Drum pads
// ---------------------------------------------------------------------------

DRUM_PADS.forEach((pad) => {
  const btn = document.createElement('button');
  btn.className = 'drum-pad';
  btn.dataset.pad = pad.id;
  btn.type = 'button';
  const keyBadge = document.createElement('span');
  keyBadge.className = 'pad-key';
  keyBadge.textContent = pad.key;
  btn.appendChild(keyBadge);
  btn.appendChild(document.createTextNode(pad.label));
  btn.addEventListener('click', () => triggerDrumPad(pad.id));
  drumPadGrid.appendChild(btn);
});

function flashDrumPad(padId) {
  const btn = drumPadGrid.querySelector(`[data-pad="${padId}"]`);
  if (btn) {
    btn.classList.add('hit');
    setTimeout(() => btn.classList.remove('hit'), 100);
  }
}

function triggerDrumPad(padId) {
  if (!drumKit) return;
  drumKit.trigger(padId);
  flashDrumPad(padId);
}

BEAT_PRESETS.forEach((preset) => {
  const btn = document.createElement('button');
  btn.className = 'beat-preset-btn';
  btn.type = 'button';
  btn.dataset.preset = preset.id;
  const name = document.createElement('span');
  name.className = 'preset-name';
  name.textContent = preset.label;
  const genre = document.createElement('span');
  genre.className = 'preset-genre';
  genre.textContent = `${preset.genre} · ${preset.bpm} BPM`;
  btn.appendChild(name);
  btn.appendChild(genre);
  btn.addEventListener('click', () => {
    if (!patternPlayer) return;
    if (patternPlayer.isPlaying && patternPlayer.activePresetId === preset.id) {
      patternPlayer.stop();
    } else {
      patternPlayer.play(preset);
      // Reflect this preset's suggested tempo in the tempo controls — the user can
      // still drag/type over it immediately afterward to override.
      beatTempoRange.value = preset.bpm;
      beatTempoInput.value = preset.bpm;
    }
    updateBeatPresetButtons();
  });
  beatPresetRow.appendChild(btn);
});

function setTempo(bpm, { clampDisplay = true } = {}) {
  const clamped = Math.min(220, Math.max(40, bpm));
  beatTempoRange.value = clamped;
  if (clampDisplay) beatTempoInput.value = clamped;
  if (patternPlayer && patternPlayer.isPlaying) patternPlayer.bpm = clamped;
}
beatTempoRange.addEventListener('input', () => setTempo(parseInt(beatTempoRange.value, 10)));
// Live-apply the typed tempo without clamping the number box's own display on every
// keystroke — clamping mid-type (e.g. typing "150" briefly clamps at "5") fights typing.
// The slider still reflects the clamped value immediately; the number box only snaps to
// the clamped value once the user leaves the field.
beatTempoInput.addEventListener('input', () => {
  const v = parseInt(beatTempoInput.value, 10);
  if (Number.isFinite(v)) setTempo(v, { clampDisplay: false });
});
beatTempoInput.addEventListener('change', () => {
  const v = parseInt(beatTempoInput.value, 10);
  setTempo(Number.isFinite(v) ? v : 100);
});

function updateBeatPresetButtons() {
  beatPresetRow.querySelectorAll('.beat-preset-btn').forEach((btn) => {
    btn.classList.toggle('playing', !!patternPlayer && patternPlayer.isPlaying && patternPlayer.activePresetId === btn.dataset.preset);
  });
}

drumKitSelect.addEventListener('change', () => { if (drumKit) drumKit.setKit(drumKitSelect.value); });
drumVolRange.addEventListener('input', () => { if (drumBus) drumBus.gain.value = parseFloat(drumVolRange.value) / 100; });

// Number-key shortcuts for the pads — ignored while typing in a text field so preset
// names, etc. aren't hijacked by a stray "1"-"8" keypress.
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const pad = DRUM_PADS.find((p) => p.key === e.key);
  if (pad) { e.preventDefault(); triggerDrumPad(pad.id); }
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`panel-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'tuner') startTuner(); else stopTuner();
  });
});

// ---------------------------------------------------------------------------
// YouTube reference player — independent of the pedal chain/audio engine, so it
// works even before audio is enabled.
// ---------------------------------------------------------------------------

const youtubeUrlInput = $('youtubeUrlInput');
const youtubePlayerWrap = $('youtubePlayerWrap');
const YOUTUBE_URL_KEY = 'gfxYoutubeUrl';

function extractYouTubeId(url) {
  let u;
  try { u = new URL(url.trim()); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1) || null;
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const match = u.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/);
    if (match) return match[1];
  }
  return null;
}

function loadYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  youtubePlayerWrap.innerHTML = '';
  if (!id) return;
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}`;
  iframe.title = 'YouTube video player';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  youtubePlayerWrap.appendChild(iframe);
  localStorage.setItem(YOUTUBE_URL_KEY, url);
}

youtubeUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadYouTubeVideo(youtubeUrlInput.value); });
youtubeUrlInput.addEventListener('change', () => loadYouTubeVideo(youtubeUrlInput.value));

const savedYoutubeUrl = localStorage.getItem(YOUTUBE_URL_KEY);
if (savedYoutubeUrl) {
  youtubeUrlInput.value = savedYoutubeUrl;
  loadYouTubeVideo(savedYoutubeUrl);
}

// ---------------------------------------------------------------------------
// Enable audio
// ---------------------------------------------------------------------------

enableAudioBtn.addEventListener('click', async () => {
  enableAudioBtn.disabled = true;
  enableAudioBtn.textContent = 'Requesting microphone…';
  try {
    const devices = await engine.enableAudio();
    populateDeviceSelect(inputDeviceSelect, devices, engine.currentDeviceId, 'Input');
    await refreshOutputDeviceSelect(true);
    enableAudioBtn.textContent = 'Audio Enabled';
    enableAudioBtn.classList.add('enabled');
    inputDeviceSelect.disabled = false;
    startLiveLatencyLoop();
    addPedalBtn.disabled = false;
    demoSetupsBtn.disabled = false;
    clearSetupBtn.disabled = false;
    muteInputBtn.disabled = false;
    acousticSimEnabled.disabled = false;
    tunerStringRow.querySelectorAll('.tuner-string-btn').forEach((b) => { b.disabled = false; });

    // Drum bus: a plain gain node feeding both the speakers and the looper's recording
    // tap, so pad hits are audible live and captured into whatever's being recorded —
    // entirely independent of the guitar pedal chain (drums don't need effects applied).
    drumBus = engine.ctx.createGain();
    drumBus.gain.value = parseFloat(drumVolRange.value) / 100;
    drumBus.connect(engine.ctx.destination);
    drumBus.connect(engine.mediaStreamDest);
    drumKit = new DrumKit(engine.ctx, drumBus);
    drumKit.setKit(drumKitSelect.value);
    drumKit.preloadSamples(); // fire-and-forget — kicks off the fetch/decode for the
    // "Recorded" kit immediately so it's ready by the time someone switches to it
    patternPlayer = new PatternPlayer(drumKit);
    patternPlayer.onStep = (step) => {
      Object.entries(patternPlayer.pattern || {}).forEach(([padId, steps]) => {
        if (steps.includes(step)) flashDrumPad(padId);
      });
    };

    const autosaved = loadAutosave();
    if (autosaved) await restoreState(autosaved);
    else await loadDefaultChain();

    refreshPresetList();
    requestAnimationFrame(meterLoop);
  } catch (err) {
    enableAudioBtn.disabled = false;
    enableAudioBtn.textContent = 'Click to Enable Audio';
    alert('Could not access the microphone: ' + err.message + '\n\nMake sure this page is served over http://localhost and mic permission is allowed.');
  }
});

function populateDeviceSelect(selectEl, devices, currentId, fallbackLabel) {
  selectEl.innerHTML = '';
  devices.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `${fallbackLabel} ${i + 1}`;
    if (d.deviceId === currentId) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

inputDeviceSelect.addEventListener('change', async () => {
  await engine.switchInputDevice(inputDeviceSelect.value);
});

// Output routing (AudioContext.setSinkId) — Chrome 110+ only, feature-detected.
// Picking the same interface used for input keeps the round-trip on one driver's
// buffering instead of handing off to a separate, often higher-latency output path.
// autoMatch (only passed true right after enabling audio, never on a later device
// hotplug refresh) tries to default the output to whatever's paired with the current
// input — e.g. USB headphones with a built-in mic — instead of leaving it on whatever
// the OS happens to call the system default, which the user would otherwise have to
// notice and fix themselves.
async function refreshOutputDeviceSelect(autoMatch = false) {
  if (!engine.supportsOutputDeviceSelection) {
    outputDeviceSelect.disabled = true;
    outputDeviceSelect.title = 'Output device selection is not supported in this browser';
    return;
  }
  if (autoMatch) {
    const matchId = await engine.findMatchingOutputDeviceId();
    if (matchId) await engine.setOutputDevice(matchId);
  }
  const outputs = await engine.listOutputDevices();
  const withDefault = [{ deviceId: '', label: 'System Default' }, ...outputs];
  populateDeviceSelect(outputDeviceSelect, withDefault, engine.ctx.sinkId ?? '', 'Output');
  outputDeviceSelect.disabled = false;
}

outputDeviceSelect.addEventListener('change', async () => {
  try {
    await engine.setOutputDevice(outputDeviceSelect.value);
  } catch (err) {
    alert('Could not switch output device: ' + err.message);
  }
});

// Live "ping meter" — like a shooter HUD's latency indicator, this polls continuously
// once audio is on rather than requiring a manual re-check. It shows the silent output
// estimate (baseLatency + outputLatency).
function latencyClass(ms) {
  if (ms <= 20) return 'lat-good';
  if (ms <= 40) return 'lat-warn';
  return 'lat-bad';
}

function startLiveLatencyLoop() {
  const tick = () => {
    const ms = engine.getMeasuredLatencyMs();
    if (ms == null) return;
    latencyReadout.innerHTML = `<span class="live-dot"></span>Est. output: <span class="latency-value ${latencyClass(ms)}">${ms.toFixed(0)}ms</span>`;
  };
  tick();
  setInterval(tick, 500);
}

// The device list is otherwise only captured once, at Enable Audio — plugging in
// an interface afterward (e.g. a UMC 22) would never show up without this, since
// the browser never re-scans devices on its own.
navigator.mediaDevices.addEventListener('devicechange', async () => {
  if (!engine.isReady) return;
  const devices = await engine.listInputDevices();
  populateDeviceSelect(inputDeviceSelect, devices, engine.currentDeviceId, 'Input');
  await refreshOutputDeviceSelect();
});

// ---------------------------------------------------------------------------
// Toolbar controls
// ---------------------------------------------------------------------------

inputGainRange.addEventListener('input', () => { engine.setInputGainPct(parseFloat(inputGainRange.value)); autosave(); });
inputTrimInfoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showInfoPopover(inputTrimInfoBtn, 'Input Trim', 'Sets your guitar\'s input gain before any effects — raise it if the input meter barely moves, lower it if it\'s pinned red/clipping.');
});
muteInputBtn.addEventListener('click', () => {
  const muted = !engine.inputMuted;
  engine.setInputMuted(muted);
  muteInputBtn.classList.toggle('active', muted);
  muteInputBtn.textContent = muted ? 'Muted' : 'Mute';
  autosave();
});
masterVolRange.addEventListener('input', () => { engine.setMasterVolumePct(parseFloat(masterVolRange.value)); autosave(); });
masterInfoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showInfoPopover(masterInfoBtn, 'Master', 'The final output volume after every pedal/amp in your chain — turn it down if the board as a whole is too loud or clipping, up if it\'s too quiet.');
});
noiseGateEnabled.addEventListener('change', () => { engine.setNoiseGateEnabled(noiseGateEnabled.checked); autosave(); });
noiseGateInfoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showInfoPopover(noiseGateInfoBtn, 'Noise Gate', 'Automatically mutes your signal whenever it drops below the Threshold, silencing hiss and hum between notes instead of letting it ring through.');
});
gateThreshold.addEventListener('input', () => { engine.setNoiseGateParam('threshold', parseFloat(gateThreshold.value)); autosave(); });
gateThresholdInfoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showInfoPopover(gateThresholdInfoBtn, 'Threshold', 'The input level below which the Noise Gate cuts the signal — lower it if quiet notes get chopped off, raise it if hiss still leaks through between notes.');
});
denoiseEnabled.addEventListener('change', () => { engine.setDenoiseEnabled(denoiseEnabled.checked); autosave(); });
denoiseInfoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showInfoPopover(denoiseInfoBtn, 'Denoise', 'Adaptive spectral noise reduction that continuously learns your hiss/hum profile in real time with no manual setup step. It\'s automatic/adaptive DSP, not a literal neural network. Adds roughly 16-17ms of latency on top of your measured round-trip, which is why it\'s off by default — the Strength slider trades more reduction for more tonal thinning if pushed too far.');
});
denoiseStrength.addEventListener('input', () => { engine.setDenoiseStrength(parseFloat(denoiseStrength.value)); autosave(); });
denoiseStrengthInfoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showInfoPopover(denoiseStrengthInfoBtn, 'Strength', 'How aggressively Denoise reduces background noise — higher values remove more hiss but can thin out your tone if pushed too far.');
});
acousticSimEnabled.addEventListener('change', async () => { await engine.setAcousticSimEnabled(acousticSimEnabled.checked); autosave(); });

addPedalBtn.addEventListener('click', () => {
  showAddMenu(addPedalBtn, async (kind, typeId) => {
    await engine.addToChain(kind, typeId);
    refreshChainUI();
    autosave();
  });
});

demoSetupsBtn.addEventListener('click', () => {
  showDemoMenu(demoSetupsBtn, DEMO_PRESETS, async (demo) => {
    await restoreState(demo.state);
    autosave();
  });
});

clearSetupBtn.addEventListener('click', () => {
  engine.clearChain();
  refreshChainUI();
  autosave();
});

// ---------------------------------------------------------------------------
// Pedal chain rendering
// ---------------------------------------------------------------------------

function refreshChainUI() {
  renderChain(engine, pedalChain, pedalCardTemplate, {
    onParamChange: async (instanceId, key, value) => { await engine.setParam(instanceId, key, value); autosave(); scheduleWavePreview(); },
    onToggle: (instanceId) => { engine.toggleEnabled(instanceId); refreshChainUI(); autosave(); },
    onRemove: (instanceId) => { engine.removeFromChain(instanceId); refreshChainUI(); autosave(); },
    onReorder: (newOrder) => { engine.reorderChain(newOrder); autosave(); scheduleWavePreview(); },
  });
  scheduleWavePreview();
}

// ---------------------------------------------------------------------------
// Toolbar signal preview: a plain sine rendered offline through the current
// pedal chain (see wave-preview.js), so the "Signal Preview" scope shows what
// the chain would hypothetically do to a clean waveform.
// ---------------------------------------------------------------------------

let wavePreviewTimer = null;
function scheduleWavePreview() {
  clearTimeout(wavePreviewTimer);
  wavePreviewTimer = setTimeout(updateWavePreview, 120);
}

async function updateWavePreview() {
  if (!waveCanvas) return;
  const sampleRate = engine.ctx ? engine.ctx.sampleRate : 44100;
  try {
    const samples = await renderPreviewWaveform(engine.chain, sampleRate);
    drawStaticWave(samples, waveCanvas);
  } catch (e) {
    // Best-effort cosmetic preview — leave the last good trace on failure.
  }
}

// Draw a plain-sine baseline immediately, before audio is even enabled or any
// pedal exists — renderPreviewWaveform needs no live engine to do this.
scheduleWavePreview();

async function loadDefaultChain() {
  const defaults = [
    ['pedal', 'compressor'], ['pedal', 'overdrive'], ['amp', 'crunch'],
    ['pedal', 'chorus'], ['pedal', 'delay'], ['pedal', 'reverb'],
  ];
  for (const [kind, id] of defaults) await engine.addToChain(kind, id);
  refreshChainUI();
}

// ---------------------------------------------------------------------------
// Meters / scope
// ---------------------------------------------------------------------------

function meterLoop() {
  if (engine.isReady) {
    updateLevelMeter(engine.inputMeterAnalyser, inputMeterBar);
    drawScope(engine.scopeAnalyser, scopeCanvas);
  }
  requestAnimationFrame(meterLoop);
}

// ---------------------------------------------------------------------------
// Tuner
// ---------------------------------------------------------------------------

// Per-string "focused" mode: null means plain chromatic auto-detect (original
// behavior); set to a GUITAR_STRINGS entry to lock the display onto that string's
// exact target frequency, however far off the detected pitch actually is, instead
// of snapping to whatever chromatic note happens to be nearest.
let focusedString = null;
const CHROMATIC_HINT = 'Play a single string. Tuner reads the raw, pre-effects signal.';

function buildTunerStringRow() {
  GUITAR_STRINGS.forEach((str) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tuner-string-btn';
    btn.disabled = true;
    btn.title = `${str.label}${str.octave} · ${str.freq.toFixed(2)} Hz — click to hear it and focus the tuner on this string`;
    const letter = document.createElement('span');
    letter.className = 'string-letter';
    letter.textContent = str.label;
    const octave = document.createElement('span');
    octave.className = 'string-octave';
    octave.textContent = str.octave;
    btn.append(letter, octave);
    btn.addEventListener('click', () => {
      if (!engine.isReady) return;
      if (focusedString?.id === str.id) {
        focusedString = null;
        btn.classList.remove('active');
        tunerHint.textContent = CHROMATIC_HINT;
        return;
      }
      focusedString = str;
      tunerStringRow.querySelectorAll('.tuner-string-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      tunerHint.textContent = `Focused on ${str.label}${str.octave} (${str.freq.toFixed(2)} Hz) — click the string again to go back to auto chromatic mode.`;
      engine.playReferenceTone(str.freq);
    });

    const row = document.createElement('div');
    row.className = 'tuner-string';
    const line = document.createElement('span');
    line.className = 'string-line';
    line.style.height = `${(str.gaugeIn * 100).toFixed(1)}px`; // real gauge inches x100 -> px, keeps the ~4.6:1 low-to-high ratio
    row.append(line, btn);
    tunerStringRow.appendChild(row);
  });
}
buildTunerStringRow();

function startTuner() {
  if (!engine.isReady) return;
  if (!tuner) tuner = new Tuner(engine.tunerAnalyser, engine.ctx.sampleRate);
  tuner.start((note) => {
    if (!note) {
      tunerNote.textContent = '—'; tunerNote.style.color = 'var(--text)';
      tunerCents.textContent = '0 cents'; tunerFreq.textContent = '0.0 Hz';
      tunerNeedle.style.transform = 'translateX(-50%) rotate(0deg)';
      tunerDirection.textContent = ''; tunerDirection.className = 'tuner-direction';
      return;
    }
    tunerFreq.textContent = `${note.frequency.toFixed(1)} Hz`;

    const cents = focusedString ? centsFromTarget(note.frequency, focusedString.freq) : note.cents;
    tunerNote.textContent = focusedString ? focusedString.label + focusedString.octave : note.name + note.octave;
    tunerCents.textContent = `${cents > 0 ? '+' : ''}${cents} cents`;
    const clamped = Math.max(-50, Math.min(50, cents));
    tunerNeedle.style.transform = `translateX(-50%) rotate(${clamped * 0.8}deg)`;
    const inTune = Math.abs(cents) < 5;
    tunerNote.style.color = inTune ? 'var(--ok)' : 'var(--text)';

    if (!focusedString) {
      tunerDirection.textContent = ''; tunerDirection.className = 'tuner-direction';
    } else if (inTune) {
      tunerDirection.textContent = '✓ In Tune'; tunerDirection.className = 'tuner-direction in-tune';
    } else if (cents < 0) {
      tunerDirection.textContent = '▲ Tune Up'; tunerDirection.className = 'tuner-direction tune-up';
    } else {
      tunerDirection.textContent = '▼ Tune Down'; tunerDirection.className = 'tuner-direction tune-down';
    }
  });
}

function stopTuner() { if (tuner) tuner.stop(); }

// ---------------------------------------------------------------------------
// Looper
// ---------------------------------------------------------------------------

// isStopping guards against a double-click firing stopRecording() twice concurrently —
// the second call would hit an already-inactive MediaRecorder and throw.
let isStopping = false;

function resetLooperControlsIdle() {
  isRecording = false;
  looperRecordBtn.disabled = false;
  looperRecordBtn.textContent = '● Record';
  looperStopBtn.textContent = '■ Stop';
  [looperPlayBtn, looperStopBtn, looperLoopBtn, looperClearBtn].forEach((b) => (b.disabled = false));
}

async function finishRecording() {
  if (isStopping) return;
  isStopping = true;
  looperStopBtn.disabled = true; // prevent a second click while the async stop is in flight
  try {
    const buffer = await looper.stopRecording();
    resetLooperControlsIdle();
    looperStatus.textContent = `Recorded ${buffer.duration.toFixed(1)}s`;
    drawWaveform(buffer, looperWaveform);
    const blob = audioBufferToWavBlob(buffer);
    looperDownloadBtn.href = URL.createObjectURL(blob);
    looperDownloadBtn.classList.remove('disabled');
  } catch (err) {
    // A failed stop (e.g. nothing captured) must not leave the UI stuck showing
    // "Stop Recording" with no way to escape it — always fall back to a clean idle state.
    resetLooperControlsIdle();
    looperStatus.textContent = `Recording failed: ${err.message}`;
  } finally {
    isStopping = false;
  }
}

looperRecordBtn.addEventListener('click', async () => {
  if (!engine.isReady) { alert('Click "Enable Audio" first.'); return; }
  if (!looper) looper = new Looper(engine.ctx, engine.mediaStreamDest);

  looper.startRecording();
  isRecording = true;
  looperStatus.textContent = 'Recording…';
  // The Record button itself never changes role or label — it just disables while a
  // recording is in progress. The one button that reads "Stop Recording" is the only
  // control that can end it, so there's never two differently-behaving buttons that
  // both say "Stop" at the same time.
  looperRecordBtn.disabled = true;
  looperStopBtn.textContent = '■ Stop Recording';
  looperStopBtn.disabled = false;
  [looperPlayBtn, looperLoopBtn, looperClearBtn].forEach((b) => (b.disabled = true));
  looperDownloadBtn.classList.add('disabled');
});

looperPlayBtn.addEventListener('click', () => looper && looper.play());
// Stop does double duty by design, but never by ambiguous labeling: its text is
// "Stop Recording" only while a recording is actually in progress, and plain "Stop"
// (halting loop playback) otherwise.
looperStopBtn.addEventListener('click', () => {
  if (isRecording) finishRecording();
  else if (looper) looper.stopPlayback();
});
looperLoopBtn.addEventListener('click', () => {
  if (!looper) return;
  const newLoop = !looper.loop;
  looper.setLoop(newLoop);
  looperLoopBtn.textContent = `↻ Loop: ${newLoop ? 'On' : 'Off'}`;
  looperLoopBtn.classList.toggle('active', newLoop);
});
looperClearBtn.addEventListener('click', () => {
  if (!looper) return;
  looper.clear();
  looperStatus.textContent = 'No recording yet.';
  drawWaveform(null, looperWaveform);
  [looperPlayBtn, looperStopBtn, looperLoopBtn, looperClearBtn].forEach((b) => (b.disabled = true));
  looperDownloadBtn.classList.add('disabled');
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { if (engine.isReady) saveAutosave(buildStateObject(engine)); }, 400);
}

async function restoreState(state) {
  inputGainRange.value = state.inputGainPct; engine.setInputGainPct(state.inputGainPct);
  const muted = !!state.inputMuted;
  engine.setInputMuted(muted);
  muteInputBtn.classList.toggle('active', muted);
  muteInputBtn.textContent = muted ? 'Muted' : 'Mute';
  masterVolRange.value = state.masterVolumePct; engine.setMasterVolumePct(state.masterVolumePct);
  noiseGateEnabled.checked = state.noiseGate.enabled; engine.setNoiseGateEnabled(state.noiseGate.enabled);
  gateThreshold.value = state.noiseGate.threshold;
  engine.setNoiseGateParam('threshold', state.noiseGate.threshold);
  engine.setNoiseGateParam('holdMs', state.noiseGate.holdMs);
  engine.setNoiseGateParam('release', state.noiseGate.release);
  const denoiseOn = !!state.denoise?.enabled;
  const denoiseAmt = state.denoise?.strength ?? 50;
  denoiseEnabled.checked = denoiseOn; engine.setDenoiseEnabled(denoiseOn);
  denoiseStrength.value = denoiseAmt; engine.setDenoiseStrength(denoiseAmt);
  acousticSimEnabled.checked = state.acousticSim.enabled;
  await engine.setAcousticSimEnabled(state.acousticSim.enabled);

  engine.clearChain();
  for (const inst of state.chain) {
    const instanceId = await engine.addToChain(inst.kind, inst.typeId, inst.params);
    if (!inst.enabled) engine.toggleEnabled(instanceId);
  }
  refreshChainUI();
}

function refreshPresetList() {
  presetList.innerHTML = '';
  loadPresetList().forEach((p) => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    const actions = document.createElement('span');
    actions.className = 'preset-actions';
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', async () => { await restoreState(p.state); autosave(); });
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => { deletePreset(p.name); refreshPresetList(); });
    actions.appendChild(loadBtn); actions.appendChild(delBtn);
    li.appendChild(nameSpan); li.appendChild(actions);
    presetList.appendChild(li);
  });
}

presetSaveBtn.addEventListener('click', () => {
  if (!engine.isReady) return;
  const name = presetName.value.trim();
  if (!name) return;
  savePreset(name, buildStateObject(engine));
  presetName.value = '';
  refreshPresetList();
});

presetExportBtn.addEventListener('click', () => {
  if (!engine.isReady) return;
  exportStateAsFile(buildStateObject(engine));
});

presetImportInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const state = await importStateFromFile(file);
    await restoreState(state);
    autosave();
  } catch (err) {
    alert('Could not read that preset file: ' + err.message);
  }
  e.target.value = '';
});
