const PRESETS_KEY = 'guitarfx.presets.v1';
const AUTOSAVE_KEY = 'guitarfx.autosave.v1';
const AMP_LOGOS_KEY = 'guitarfx.ampLogos.v1';

export function buildStateObject(engine) {
  return {
    version: 1,
    inputGainPct: engine.inputGainPct,
    inputMuted: engine.inputMuted,
    masterVolumePct: engine.masterVolumePct,
    noiseGate: {
      enabled: engine.noiseGateEnabled,
      threshold: engine.noiseGateNode?.parameters.get('threshold').value ?? -50,
      holdMs: engine.noiseGateNode?.parameters.get('holdMs').value ?? 60,
      release: engine.noiseGateNode?.parameters.get('release').value ?? 150,
    },
    denoise: {
      enabled: engine.denoiseEnabled,
      strength: engine.spectralDenoiseNode?.parameters.get('strength').value ?? 50,
    },
    tunerVolumePct: engine.tunerVolumePct,
    chain: engine.getChainSnapshot(),
  };
}

export function loadPresetList() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY)) || []; }
  catch (e) { return []; }
}

function savePresetList(list) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
}

export function savePreset(name, state) {
  const list = loadPresetList().filter((p) => p.name !== name);
  list.push({ name, state, savedAt: Date.now() });
  savePresetList(list);
  return list;
}

export function deletePreset(name) {
  const list = loadPresetList().filter((p) => p.name !== name);
  savePresetList(list);
  return list;
}

export function saveAutosave(state) {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/unavailable */ }
}

export function loadAutosave() {
  try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); }
  catch (e) { return null; }
}

// Custom amp logo badges (signature amps only, see renderAmp in ui.js) — keyed by amp
// typeId, not by chain instance, and kept separate from the main preset/autosave blob
// since a PNG data URL is far bigger than the rest of that state combined.
export function loadAmpLogos() {
  try { return JSON.parse(localStorage.getItem(AMP_LOGOS_KEY)) || {}; }
  catch (e) { return {}; }
}

export function saveAmpLogos(logos) {
  try { localStorage.setItem(AMP_LOGOS_KEY, JSON.stringify(logos)); }
  catch (e) { alert('Could not save that image — your browser storage may be full.'); }
}

export function exportStateAsFile(state, filename = 'guitar-fx-preset.json') {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function importStateFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
