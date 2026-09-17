import { AudioEngine } from './audio-engine.js';
import { renderChain, showAddMenu, showDemoMenu, showInfoPopover, updateLevelMeter, drawScope, drawWaveform, drawStaticWave } from './ui.js';
import { renderPreviewWaveform } from './wave-preview.js';
import { DEMO_PRESETS } from './demo-presets.js';
import { Tuner } from './tuner.js';
import { Looper } from './looper.js';
import { audioBufferToWavBlob } from './wav-encoder.js';
import { playTestSequence } from './test-signal.js';
import { DrumKit, DRUM_PADS } from './drum-kit.js';
import { BEAT_PRESETS, PatternPlayer } from './beat-presets.js';
import {
  buildStateObject, loadPresetList, savePreset, deletePreset,
  saveAutosave, loadAutosave, exportStateAsFile, importStateFromFile,
} from './presets.js';

const $ = (id) => document.getElementById(id);

const enableAudioBtn = $('enableAudioBtn');
const inputDeviceSelect = $('inputDeviceSelect');
const latencyReadout = $('latencyReadout');
const inputMeterBar = $('inputMeterBar');
const scopeCanvas = $('scopeCanvas');
const waveCanvas = $('waveCanvas');

const inputGainRange = $('inputGainRange');
const muteInputBtn = $('muteInputBtn');
const masterVolRange = $('masterVolRange');
const noiseGateEnabled = $('noiseGateEnabled');
const gateThreshold = $('gateThreshold');
const denoiseEnabled = $('denoiseEnabled');
const denoiseStrength = $('denoiseStrength');
const denoiseInfoBtn = $('denoiseInfoBtn');
const acousticSimEnabled = $('acousticSimEnabled');
const addPedalBtn = $('addPedalBtn');
const testChordBtn = $('testChordBtn');
const demoSetupsBtn = $('demoSetupsBtn');
const pedalChain = $('pedalChain');
const pedalCardTemplate = $('pedalCardTemplate');

const tunerNote = $('tunerNote');
const tunerNeedle = $('tunerNeedle');
const tunerCents = $('tunerCents');
const tunerFreq = $('tunerFreq');

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
// Enable audio
// ---------------------------------------------------------------------------

enableAudioBtn.addEventListener('click', async () => {
  enableAudioBtn.disabled = true;
  enableAudioBtn.textContent = 'Requesting microphone…';
  try {
    const devices = await engine.enableAudio();
    populateDeviceSelect(devices, engine.currentDeviceId);
    enableAudioBtn.textContent = 'Audio Enabled';
    enableAudioBtn.classList.add('enabled');
    inputDeviceSelect.disabled = false;
    const latencyMs = engine.getMeasuredLatencyMs();
    if (latencyMs != null) latencyReadout.innerHTML = `Latency: <span class="latency-value">${latencyMs.toFixed(0)}ms</span>`;
    addPedalBtn.disabled = false;
    testChordBtn.disabled = false;
    demoSetupsBtn.disabled = false;
    muteInputBtn.disabled = false;
    acousticSimEnabled.disabled = false;

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

function populateDeviceSelect(devices, currentId) {
  inputDeviceSelect.innerHTML = '';
  devices.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Input ${i + 1}`;
    if (d.deviceId === currentId) opt.selected = true;
    inputDeviceSelect.appendChild(opt);
  });
}

inputDeviceSelect.addEventListener('change', async () => {
  await engine.switchInputDevice(inputDeviceSelect.value);
});

// ---------------------------------------------------------------------------
// Toolbar controls
// ---------------------------------------------------------------------------

inputGainRange.addEventListener('input', () => { engine.setInputGainPct(parseFloat(inputGainRange.value)); autosave(); });
muteInputBtn.addEventListener('click', () => {
  const muted = !engine.inputMuted;
  engine.setInputMuted(muted);
  muteInputBtn.classList.toggle('active', muted);
  muteInputBtn.textContent = muted ? 'Muted' : 'Mute';
  autosave();
});
masterVolRange.addEventListener('input', () => { engine.setMasterVolumePct(parseFloat(masterVolRange.value)); autosave(); });
noiseGateEnabled.addEventListener('change', () => { engine.setNoiseGateEnabled(noiseGateEnabled.checked); autosave(); });
gateThreshold.addEventListener('input', () => { engine.setNoiseGateParam('threshold', parseFloat(gateThreshold.value)); autosave(); });
denoiseEnabled.addEventListener('change', () => { engine.setDenoiseEnabled(denoiseEnabled.checked); autosave(); });
denoiseInfoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showInfoPopover(denoiseInfoBtn, 'Denoise', 'Adaptive spectral noise reduction that continuously learns your hiss/hum profile in real time with no manual setup step. It\'s automatic/adaptive DSP, not a literal neural network. Adds roughly 16-17ms of latency on top of your measured round-trip, which is why it\'s off by default — the Strength slider trades more reduction for more tonal thinning if pushed too far.');
});
denoiseStrength.addEventListener('input', () => { engine.setDenoiseStrength(parseFloat(denoiseStrength.value)); autosave(); });
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

testChordBtn.addEventListener('click', async () => {
  if (!engine.isReady) return;
  testChordBtn.disabled = true;
  testChordBtn.textContent = '♪ Playing…';
  await playTestSequence(engine);
  testChordBtn.disabled = false;
  testChordBtn.textContent = '▶ Play Test Chords';
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

function startTuner() {
  if (!engine.isReady) return;
  if (!tuner) tuner = new Tuner(engine.tunerAnalyser, engine.ctx.sampleRate);
  tuner.start((note) => {
    if (!note) {
      tunerNote.textContent = '—'; tunerNote.style.color = 'var(--text)';
      tunerCents.textContent = '0 cents'; tunerFreq.textContent = '0.0 Hz';
      tunerNeedle.style.transform = 'translateX(-50%) rotate(0deg)';
      return;
    }
    tunerNote.textContent = note.name + note.octave;
    tunerCents.textContent = `${note.cents > 0 ? '+' : ''}${note.cents} cents`;
    tunerFreq.textContent = `${note.frequency.toFixed(1)} Hz`;
    const clamped = Math.max(-50, Math.min(50, note.cents));
    tunerNeedle.style.transform = `translateX(-50%) rotate(${clamped * 0.8}deg)`;
    tunerNote.style.color = Math.abs(note.cents) < 5 ? 'var(--ok)' : 'var(--text)';
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
