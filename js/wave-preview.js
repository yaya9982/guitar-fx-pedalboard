// Renders a plain test sine through the current pedal/amp chain offline (an
// OfflineAudioContext, not the live audio graph) so the toolbar preview can show
// what a clean waveform would hypothetically become — reusing each pedal's real
// typeDef.createNodes/params.apply DSP rather than faking the shape, consistent
// with the "never claim more than the DSP actually does" product rule.

// Same URLs as WORKLET_URLS in audio-engine.js. dynamics-worklet must be here: the Compressor,
// Limiter and Dire Straits amp construct 'dynamics-processor', which throws if unregistered.
const WORKLET_MODULES = ['js/noise-gate-worklet.js?v=2', 'js/bitcrusher-worklet.js?v=2', 'js/pitch-worklet.js?v=2', 'js/dynamics-worklet.js?v=1'];

const TEST_TONE_HZ = 220;
const BASE_SECONDS = 0.12;
const TAIL_SECONDS = 0.05; // how much of the end of the render we actually draw
const MAX_SECONDS = 2.3; // covers the Delay pedal's full 2000ms range plus a tail

export async function renderPreviewWaveform(chain, sampleRate) {
  const active = chain.filter((i) => i.enabled);
  // A pedal like Delay only starts producing output once its delay time has
  // elapsed (at 100% wet mix the dry path is silent until the first echo
  // arrives) — render long enough that the drawn tail lands after that, or a
  // long delay time would just show as a flat, seemingly-unreacting line.
  let longestDelaySeconds = 0;
  for (const inst of active) {
    const timeParam = inst.typeDef.params.find((p) => p.key === 'time' && p.unit === 'ms');
    if (timeParam) longestDelaySeconds = Math.max(longestDelaySeconds, (inst.params.time ?? timeParam.default) / 1000);
  }
  const renderSeconds = Math.min(MAX_SECONDS, BASE_SECONDS + longestDelaySeconds);

  const frames = Math.ceil(renderSeconds * sampleRate);
  const offline = new OfflineAudioContext(1, frames, sampleRate);
  try {
    await Promise.all(WORKLET_MODULES.map((url) => offline.audioWorklet.addModule(url)));
  } catch (e) {
    // A worklet-based pedal (bitcrusher, octaver, pitch shifter, auto-wah) will
    // simply pass the signal through unprocessed rather than break the preview.
  }

  const osc = offline.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = TEST_TONE_HZ;

  let node = osc;
  for (const inst of active) {
    const built = await Promise.resolve(inst.typeDef.createNodes(offline));
    for (const p of inst.typeDef.params) {
      await Promise.resolve(p.apply(built.nodes, inst.params[p.key], offline));
    }
    node.connect(built.input);
    if (built.sideChainInput) osc.connect(built.sideChainInput);
    node = built.output;
  }
  node.connect(offline.destination);

  osc.start(0);
  osc.stop(renderSeconds);
  const rendered = await offline.startRendering();
  const data = rendered.getChannelData(0);
  return data.subarray(Math.max(0, data.length - Math.floor(TAIL_SECONDS * sampleRate)));
}
