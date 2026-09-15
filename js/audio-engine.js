import { getPedalType } from './pedal-registry.js';
import { getAmpType, createAcousticSimNodes } from './amp-registry.js';

let idCounter = 0;
function nextId() { return `inst-${++idCounter}-${Date.now().toString(36)}`; }

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
    await this.ctx.audioWorklet.addModule('js/noise-gate-worklet.js');
    await this.ctx.audioWorklet.addModule('js/bitcrusher-worklet.js');
    await this.ctx.audioWorklet.addModule('js/pitch-worklet.js');
    await this.ctx.audioWorklet.addModule('js/spectral-denoise-worklet.js');
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
    this.outputLimiter = ctx.createDynamicsCompressor();
    this.outputLimiter.threshold.value = -6;
    this.outputLimiter.knee.value = 0;
    this.outputLimiter.ratio.value = 20;
    this.outputLimiter.attack.value = 0.003;
    this.outputLimiter.release.value = 0.1;

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
        channelCount: 1,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.currentDeviceId = deviceId || this.stream.getAudioTracks()[0]?.getSettings().deviceId || null;
    this.sourceNode = this.ctx.createMediaStreamSource(this.stream);
    this.sourceNode.connect(this.inputGain);
  }

  getMeasuredLatencyMs() {
    if (!this.ctx) return null;
    const base = this.ctx.baseLatency || 0;
    const out = this.ctx.outputLatency || 0; // not supported in every browser; falls back to 0
    return (base + out) * 1000;
  }

  async listInputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  async switchInputDevice(deviceId) {
    await this._openInput(deviceId);
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
