import { getPedalType } from './pedal-registry.js';
import { getAmpType, createAcousticSimNodes } from './amp-registry.js';

let idCounter = 0;
function nextId() { return `inst-${++idCounter}-${Date.now().toString(36)}`; }

// A memoryless soft-knee limiter curve for WaveShaperNode: linear (untouched) below
// the threshold, compressed by `ratio` above it, hard-clamped to +/-1. Used in place
// of DynamicsCompressorNode for the always-on output safety limiter — see the call
// site in _buildStaticGraph for why.
function buildLimiterCurve(thresholdDb, ratio, samples = 1024) {
  const thresholdLin = Math.pow(10, thresholdDb / 20);
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    const absX = Math.abs(x);
    const y = absX <= thresholdLin ? x : Math.sign(x) * (thresholdLin + (absX - thresholdLin) / ratio);
    curve[i] = Math.max(-1, Math.min(1, y));
  }
  return curve;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.sourceNode = null;
    this.currentDeviceId = null;
    this.chain = []; // [{ instanceId, kind, typeId, enabled, params, nodes, typeDef }]
    this.acousticSim = { enabled: false, instance: null };
    this.masterVolumePct = 100;
    this.inputGainPct = 100;
    this.inputMuted = false;
    this.noiseGateEnabled = true;
    this.denoiseEnabled = false; // opt-in: adds ~16-17ms latency, so off until asked for
    this.denoiseStrength = 50;
    this.onMeter = null; // optional callback(rms) set by UI
  }

  get isReady() { return !!this.ctx; }

  async enableAudio(deviceId) {
    if (!this.ctx) {
      // 0 explicitly asks the browser for the smallest buffer it can run without
      // dropouts, rather than relying on 'interactive' choosing conservatively.
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 0 });
      await this._loadWorklets();
      this._buildStaticGraph();
    }
    await this._openInput(deviceId);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.listInputDevices();
  }

  async _loadWorklets() {
    // Cache-busted: these are fetched by the browser like any other resource, and this
    // dev server sends no cache-control headers, so an edited worklet can otherwise keep
    // being served stale from HTTP cache across reloads within the same session.
    await this.ctx.audioWorklet.addModule('js/noise-gate-worklet.js?v=2');
    await this.ctx.audioWorklet.addModule('js/bitcrusher-worklet.js?v=2');
    await this.ctx.audioWorklet.addModule('js/pitch-worklet.js?v=2');
    await this.ctx.audioWorklet.addModule('js/spectral-denoise-worklet.js?v=2');
    await this.ctx.audioWorklet.addModule('js/latency-probe-worklet.js?v=1');
  }

  _buildStaticGraph() {
    const ctx = this.ctx;
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = this.inputGainPct / 100;

    this.inputMeterAnalyser = ctx.createAnalyser();
    this.inputMeterAnalyser.fftSize = 1024;
    this.scopeAnalyser = ctx.createAnalyser();
    this.scopeAnalyser.fftSize = 2048;
    this.tunerAnalyser = ctx.createAnalyser();
    this.tunerAnalyser.fftSize = 2048;

    this.spectralDenoiseNode = new AudioWorkletNode(ctx, 'spectral-denoise-processor');
    this.noiseGateNode = new AudioWorkletNode(ctx, 'noise-gate-processor');
    this.preChainTap = ctx.createGain(); // stable tap point for side-chain (envelope filter etc.)

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolumePct / 100;

    // Always-on safety limiter: pedals/amps vary hugely in loudness (a saturated Fuzz or
    // high-gain amp can be many times louder than a filter-heavy pedal like Wah), so this
    // catches surprise peaks instead of letting them hit the speakers or clip the output.
    // A WaveShaperNode, not createDynamicsCompressor(): every implementation of
    // DynamicsCompressorNode carries a fixed ~6ms internal look-ahead (not exposed as a
    // parameter, so it can't be dialed down) — and because this node sits unconditionally
    // in every user's signal path, that's 6ms nobody could opt out of. A waveshaper is a
    // memoryless per-sample transfer function, so it adds zero latency: linear (untouched)
    // below -6dBFS, soft-knee compressed at a 20:1 ratio above it (matching the old
    // settings), hard-clamped at full scale. The trade-off is character, not safety — a
    // rare loud peak gets instant soft saturation instead of a real compressor's smooth,
    // time-based gain reduction — but normal playing levels pass through exactly as before.
    this.outputLimiter = ctx.createWaveShaper();
    this.outputLimiter.curve = buildLimiterCurve(-6, 20);
    this.outputLimiter.oversample = '2x'; // reduces aliasing from the nonlinearity

    this.outputAnalyser = ctx.createAnalyser();
    this.outputAnalyser.fftSize = 1024;

    this.mediaStreamDest = ctx.createMediaStreamDestination();

    this.inputGain.connect(this.inputMeterAnalyser);
    this.inputGain.connect(this.scopeAnalyser);
    this.inputGain.connect(this.tunerAnalyser);
    this.inputGain.connect(this.spectralDenoiseNode);
    this.spectralDenoiseNode.connect(this.noiseGateNode);
    this.noiseGateNode.connect(this.preChainTap);

    this.masterGain.connect(this.outputLimiter);
    this.outputLimiter.connect(ctx.destination);
    this.outputLimiter.connect(this.outputAnalyser);
    this.outputLimiter.connect(this.mediaStreamDest);

    this._rebuildChain();
  }

  async _openInput(deviceId) {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.sourceNode.disconnect();
    }
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Requesting mono here (channelCount: 1) makes some browser/driver combos
        // just grab channel 1 of a 2-channel interface instead of mixing both —
        // silently dropping anything plugged into channel 2. Ask for stereo and
        // downmix explicitly in the graph below instead, so either channel reaches
        // the pedal chain regardless of which physical input it's plugged into.
        channelCount: { ideal: 2 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.currentDeviceId = deviceId || this.stream.getAudioTracks()[0]?.getSettings().deviceId || null;
    this.sourceNode = this.ctx.createMediaStreamSource(this.stream);

    const trackSettings = this.stream.getAudioTracks()[0]?.getSettings() || {};
    const channels = trackSettings.channelCount || this.sourceNode.channelCount || 1;
    // eslint-disable-next-line no-console
    console.log('[GuitarFX] input track settings:', trackSettings, '| sourceNode.channelCount:', this.sourceNode.channelCount);

    if (channels > 1) {
      // Explicit per-channel sum via a splitter, rather than relying on
      // channelInterpretation's automatic downmix — that path is inconsistent
      // for live MediaStream sources across browsers, and silently drops a
      // channel on some driver/browser combos instead of mixing it in.
      const splitter = this.ctx.createChannelSplitter(channels);
      this.sourceNode.connect(splitter);
      for (let i = 0; i < channels; i++) splitter.connect(this.inputGain, i, 0);
    } else {
      this.sourceNode.connect(this.inputGain);
    }
  }

  getMeasuredLatencyMs() {
    if (!this.ctx) return null;
    const base = this.ctx.baseLatency || 0;
    const out = this.ctx.outputLatency || 0; // not supported in every browser; falls back to 0
    return (base + out) * 1000;
  }

  // Real round-trip latency, not just the output-side estimate above: plays a short
  // click through the current output device and times its arrival back at the input
  // via a sample-accurate AudioWorklet probe (tapped pre-noise-gate, so the gate's
  // own attack time can't bias the reading). Requires a loopback — either a physical
  // cable from an output jack back into an input (most accurate: also captures real
  // interface I/O buffering), or close mic/speaker placement for an acoustic path.
  async measureRoundTripLatency({ timeoutMs = 3000 } = {}) {
    if (!this.ctx) throw new Error('Audio not enabled yet.');
    const ctx = this.ctx;

    const probe = new AudioWorkletNode(ctx, 'latency-probe-processor');
    this.inputGain.connect(probe); // a side-tap, like the meter/scope analysers — no output needed to keep running

    const waitFor = (predicate) => new Promise((resolve) => {
      probe.port.onmessage = (e) => { if (predicate(e.data)) { probe.port.onmessage = null; resolve(e.data); } };
    });

    try {
      probe.port.postMessage('calibrate');
      await waitFor((d) => d.type === 'calibrated');

      // A short, loud broadband noise burst — sharper and easier to time precisely
      // than a tone, which ramps up smoothly from whatever phase it starts at.
      const burstSeconds = 0.01;
      const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * burstSeconds), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.9;
      const click = ctx.createBufferSource();
      click.buffer = buffer;
      click.connect(ctx.destination); // bypasses the pedal chain/master entirely — a controlled, consistent test level

      probe.port.postMessage('arm');
      const playAt = ctx.currentTime + 0.15; // gives the worklet time to actually be armed before it plays
      click.start(playAt);

      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('No signal detected at the input. Connect a loopback cable from an output jack back into an input (or place a mic close to a speaker), and make sure input gain is turned up.')), timeoutMs);
      });
      const detected = await Promise.race([waitFor((d) => d.type === 'detected'), timeout]);
      return (detected.time - playAt) * 1000;
    } finally {
      probe.disconnect();
    }
  }

  async listInputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  async switchInputDevice(deviceId) {
    await this._openInput(deviceId);
  }

  // ---- output device (setSinkId) ----
  // Chrome 110+ only (feature-detected below); routes the context's output to a
  // chosen device instead of the OS default. Picking the *same* interface used for
  // input keeps the whole round-trip on one audio driver's buffering, rather than a
  // pro interface for input handing off to generic laptop speakers on a separate,
  // often higher-latency driver stack for output.
  get supportsOutputDeviceSelection() {
    return !!this.ctx && typeof this.ctx.setSinkId === 'function';
  }

  async listOutputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audiooutput');
  }

  async setOutputDevice(deviceId) {
    if (!this.supportsOutputDeviceSelection) return;
    await this.ctx.setSinkId(deviceId || ''); // '' resets to the system default sink
  }

  // ---- global controls ----

  setInputGainPct(pct) {
    this.inputGainPct = pct;
    if (this.inputGain && !this.inputMuted) this.inputGain.gain.setTargetAtTime(pct / 100, this.ctx.currentTime, 0.02);
  }

  setInputMuted(muted) {
    this.inputMuted = muted;
    if (!this.inputGain) return;
    const target = muted ? 0 : this.inputGainPct / 100;
    this.inputGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
  }

  setMasterVolumePct(pct) {
    this.masterVolumePct = pct;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(pct / 100, this.ctx.currentTime, 0.02);
  }

  setNoiseGateEnabled(enabled) {
    this.noiseGateEnabled = enabled;
    this.noiseGateNode?.port.postMessage({ enabled });
  }

  setNoiseGateParam(key, value) {
    const param = this.noiseGateNode?.parameters.get(key);
    if (param) param.value = value;
  }

  setDenoiseEnabled(enabled) {
    this.denoiseEnabled = enabled;
    this.spectralDenoiseNode?.port.postMessage({ enabled });
  }

  setDenoiseStrength(value) {
    this.denoiseStrength = value;
    const param = this.spectralDenoiseNode?.parameters.get('strength');
    if (param) param.value = value;
  }

  // ---- chain management ----

  _getTypeDef(kind, typeId) {
    return kind === 'amp' ? getAmpType(typeId) : getPedalType(typeId);
  }

  async addToChain(kind, typeId, presetParams) {
    const typeDef = this._getTypeDef(kind, typeId);
    if (!typeDef) throw new Error(`Unknown ${kind} type: ${typeId}`);
    const built = await Promise.resolve(typeDef.createNodes(this.ctx));
    const params = {};
    typeDef.params.forEach((p) => { params[p.key] = presetParams && presetParams[p.key] !== undefined ? presetParams[p.key] : p.default; });

    const instance = {
      instanceId: nextId(), kind, typeId, enabled: true, params,
      nodes: built.nodes, input: built.input, output: built.output, sideChainInput: built.sideChainInput,
      typeDef,
    };
    for (const p of typeDef.params) await Promise.resolve(p.apply(instance.nodes, instance.params[p.key], this.ctx));
    this.chain.push(instance);
    this._rebuildChain();
    return instance.instanceId;
  }

  removeFromChain(instanceId) {
    const inst = this.chain.find((i) => i.instanceId === instanceId);
    if (inst) { try { inst.output.disconnect(); } catch (e) { /* noop */ } }
    this.chain = this.chain.filter((i) => i.instanceId !== instanceId);
    this._rebuildChain();
  }

  clearChain() {
    this.chain.forEach((inst) => { try { inst.output.disconnect(); } catch (e) { /* noop */ } });
    this.chain = [];
    this._rebuildChain();
  }

  toggleEnabled(instanceId) {
    const inst = this.chain.find((i) => i.instanceId === instanceId);
    if (!inst) return;
    inst.enabled = !inst.enabled;
    this._rebuildChain();
    return inst.enabled;
  }

  async setParam(instanceId, key, value) {
    const inst = this.chain.find((i) => i.instanceId === instanceId) || (this.acousticSim.instance?.instanceId === instanceId ? this.acousticSim.instance : null);
    if (!inst) return;
    inst.params[key] = value;
    const paramDef = inst.typeDef.params.find((p) => p.key === key);
    if (paramDef) await Promise.resolve(paramDef.apply(inst.nodes, value, this.ctx));
  }

  reorderChain(newInstanceIdOrder) {
    const byId = new Map(this.chain.map((i) => [i.instanceId, i]));
    this.chain = newInstanceIdOrder.map((id) => byId.get(id)).filter(Boolean);
    this._rebuildChain();
  }

  async setAcousticSimEnabled(enabled) {
    this.acousticSim.enabled = enabled;
    if (enabled && !this.acousticSim.instance) {
      const built = await createAcousticSimNodes(this.ctx);
      this.acousticSim.instance = {
        instanceId: 'acoustic-sim', kind: 'acoustic', typeId: 'acoustic', enabled: true, params: {},
        nodes: built.nodes, input: built.input, output: built.output, typeDef: { params: [] },
      };
    }
    this._rebuildChain();
  }

  _rebuildChain() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(0, now, 0.003);

    // disconnect everything downstream of the stable tap point
    this.preChainTap.disconnect();
    this.chain.forEach((inst) => { try { inst.output.disconnect(); } catch (e) { /* already disconnected */ } });
    if (this.acousticSim.instance) { try { this.acousticSim.instance.output.disconnect(); } catch (e) { /* noop */ } }

    const active = this.chain.filter((i) => i.enabled);
    let node = this.preChainTap;
    for (const inst of active) {
      node.connect(inst.input);
      node = inst.output;
      if (inst.sideChainInput) this.preChainTap.connect(inst.sideChainInput);
    }

    if (this.acousticSim.enabled && this.acousticSim.instance) {
      node.connect(this.acousticSim.instance.input);
      node = this.acousticSim.instance.output;
    }

    node.connect(this.masterGain);

    this.masterGain.gain.setTargetAtTime(this.masterVolumePct / 100, now + 0.01, 0.015);
  }

  getChainSnapshot() {
    return this.chain.map((i) => ({ instanceId: i.instanceId, kind: i.kind, typeId: i.typeId, enabled: i.enabled, params: { ...i.params } }));
  }
}
