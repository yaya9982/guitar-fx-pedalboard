export class Looper {
  constructor(ctx, mediaStreamDest) {
    this.ctx = ctx;
    this.guitarStream = mediaStreamDest.stream;
    this.guitarRecorder = null;
    this.guitarChunks = [];
    this.guitarBuffer = null;

    // Screen/tab audio is a second, independent MediaRecorder captured from
    // getDisplayMedia's audio track — opt-in per recording (see startRecording),
    // since the browser's screen-share picker can't be triggered silently.
    this.screenRecorder = null;
    this.screenChunks = [];
    this.screenBuffer = null;
    this.screenMediaStream = null; // kept only to stop its tracks afterward

    this.source = 'guitar'; // 'guitar' | 'both' -- which track(s) play back
    this.guitarSourceNode = null;
    this.screenSourceNode = null;
    this.monitorGain = ctx.createGain();
    this.monitorGain.connect(ctx.destination);

    this.loop = false;
    this.isRecording = false;
    this.isPlaying = false;
    this.onEnded = null;

    // AudioBufferSourceNode has no native seek/currentTime, so position is tracked
    // manually: _playStartCtxTime is the AudioContext clock time playback last
    // (re)started at, _playOffset is the position (seconds into the buffer) it
    // started from. Seeking just stops and restarts the source node(s) at a new offset.
    this._playStartCtxTime = 0;
    this._playOffset = 0;
  }

  static pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    return candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  get duration() {
    return Math.max(this.guitarBuffer?.duration || 0, this.screenBuffer?.duration || 0);
  }

  get hasScreenAudio() {
    return !!this.screenBuffer;
  }

  getCurrentTime() {
    if (!this.isPlaying) return this._playOffset;
    let t = this._playOffset + (this.ctx.currentTime - this._playStartCtxTime);
    if (this.loop && this.duration > 0) t %= this.duration;
    return t;
  }

  // captureScreenAudio: when true, prompts the browser's screen/tab-share picker and
  // records its audio track alongside the guitar signal. If the user cancels, or their
  // browser/OS doesn't provide a shareable audio track, this falls back to a normal
  // guitar-only recording instead of failing outright.
  async startRecording(captureScreenAudio) {
    this.screenMediaStream = null;
    this._displayStream = null;
    if (captureScreenAudio) {
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const audioTracks = display.getAudioTracks();
        if (audioTracks.length > 0) {
          // Keep the raw display stream (including its video track) alive for the
          // whole recording instead of stopping the video track immediately — on
          // some Chrome versions the audio and video tracks share one underlying
          // capture session, and stopping video right away silently kills audio
          // delivery too, even though the two tracks are nominally independent.
          // The video track is never read/rendered anywhere; it's just parked.
          this._displayStream = display;
          this.screenMediaStream = new MediaStream(audioTracks);
        } else {
          // No audio track came back at all — most commonly because the picker was
          // used to share a specific Window (Chrome only supports capturing system
          // audio from "Entire Screen" or a browser Tab, never an individual
          // window), or because "Share audio"/"Share tab audio" wasn't checked.
          display.getTracks().forEach((t) => t.stop());
        }
      } catch (err) {
        this.screenMediaStream = null; // cancelled picker, or permission denied
      }
    }

    this._mimeType = Looper.pickMimeType();
    const opts = this._mimeType ? { mimeType: this._mimeType } : undefined;

    this.guitarChunks = [];
    this.guitarRecorder = new MediaRecorder(this.guitarStream, opts);
    this.guitarRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.guitarChunks.push(e.data); };

    if (this.screenMediaStream) {
      this.screenChunks = [];
      this.screenRecorder = new MediaRecorder(this.screenMediaStream, opts);
      this.screenRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.screenChunks.push(e.data); };
    } else {
      this.screenRecorder = null;
    }

    // Started back to back (not before the picker resolves) so the two tracks stay
    // as time-aligned as two independent MediaRecorder instances reasonably can.
    this.guitarRecorder.start();
    if (this.screenRecorder) this.screenRecorder.start();
    this.isRecording = true;
  }

  async _decode(chunks) {
    if (chunks.length === 0) return null;
    const blob = new Blob(chunks, { type: this._mimeType || 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    return this.ctx.decodeAudioData(arrayBuffer);
  }

  stopRecording() {
    return new Promise((resolve, reject) => {
      // Guards a double-click/double-invocation from calling stop() on an
      // already-inactive recorder, which throws synchronously and would otherwise
      // leave the caller's state stuck mid-recording with no resolved/rejected promise.
      if (!this.guitarRecorder || this.guitarRecorder.state === 'inactive') {
        return reject(new Error('Not currently recording'));
      }
      const guitarStopped = new Promise((res) => { this.guitarRecorder.onstop = res; });
      const screenStopped = this.screenRecorder
        ? new Promise((res) => { this.screenRecorder.onstop = res; })
        : Promise.resolve();

      this.guitarRecorder.stop();
      if (this.screenRecorder) this.screenRecorder.stop();

      Promise.all([guitarStopped, screenStopped]).then(async () => {
        this.isRecording = false;
        // Releases the browser's "you are sharing your screen" indicator/border. Stops
        // the raw display stream's tracks (video included), not just the audio-only
        // copy used for recording.
        if (this._displayStream) this._displayStream.getTracks().forEach((t) => t.stop());
        this._displayStream = null;
        try {
          if (this.guitarChunks.length === 0) throw new Error('No audio was captured — try recording for at least a second.');
          this.guitarBuffer = await this._decode(this.guitarChunks);
          this.screenBuffer = this.screenRecorder ? await this._decode(this.screenChunks) : null;
          this.source = 'guitar';
          resolve({ guitarBuffer: this.guitarBuffer, screenBuffer: this.screenBuffer });
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  // 'guitar' plays only the guitar take; 'both' mixes it with the screen-audio take.
  // Restarts playback at the same position under the new mix if already playing.
  setSource(source) {
    this.source = source;
    if (this.isPlaying) this.play(this.getCurrentTime());
  }

  play(fromSeconds = null) {
    if (!this.guitarBuffer) return;
    const offset = fromSeconds != null ? fromSeconds : this._playOffset;
    this._stopSourceNodes();

    this.guitarSourceNode = this.ctx.createBufferSource();
    this.guitarSourceNode.buffer = this.guitarBuffer;
    this.guitarSourceNode.loop = this.loop;
    this.guitarSourceNode.connect(this.monitorGain);
    this.guitarSourceNode.onended = () => this._handleEnded();
    this.guitarSourceNode.start(0, Math.min(offset, this.guitarBuffer.duration));

    if (this.source === 'both' && this.screenBuffer) {
      this.screenSourceNode = this.ctx.createBufferSource();
      this.screenSourceNode.buffer = this.screenBuffer;
      this.screenSourceNode.loop = this.loop;
      this.screenSourceNode.connect(this.monitorGain);
      this.screenSourceNode.start(0, Math.min(offset, this.screenBuffer.duration));
    }

    this._playOffset = offset;
    this._playStartCtxTime = this.ctx.currentTime;
    this.isPlaying = true;
  }

  _handleEnded() {
    // Driven by the guitar node alone (always present); the screen node loops/ends
    // independently via its own .loop flag, close enough given the two tracks start
    // within the same tick of each other.
    if (!this.loop) {
      this.isPlaying = false;
      this._playOffset = 0;
      if (this.onEnded) this.onEnded();
    }
  }

  _stopSourceNodes() {
    [this.guitarSourceNode, this.screenSourceNode].forEach((node) => {
      if (!node) return;
      node.onended = null;
      try { node.stop(); } catch (e) { /* already stopped */ }
      node.disconnect();
    });
    this.guitarSourceNode = null;
    this.screenSourceNode = null;
  }

  // Halts playback but remembers the position, so the next play() resumes instead of
  // restarting from 0. This is what the UI's Play/Pause toggle button calls.
  pause() {
    if (!this.isPlaying) return;
    this._playOffset = this.getCurrentTime();
    this._stopSourceNodes();
    this.isPlaying = false;
  }

  // A hard stop: halts playback and resets position to the beginning. Used by clear()
  // rather than the transport's Play/Pause button, which should never lose your place.
  stopPlayback() {
    this._stopSourceNodes();
    this.isPlaying = false;
    this._playOffset = 0;
  }

  // Jumps to a position without necessarily stopping — if currently playing, the
  // source node(s) restart from the new offset; if idle, it's just remembered as
  // where the next Play will begin.
  seekTo(seconds) {
    const clamped = Math.max(0, Math.min(seconds, this.duration));
    if (this.isPlaying) this.play(clamped);
    else this._playOffset = clamped;
  }

  setLoop(loop) {
    this.loop = loop;
    if (this.guitarSourceNode) this.guitarSourceNode.loop = loop;
    if (this.screenSourceNode) this.screenSourceNode.loop = loop;
  }

  clear() {
    this.stopPlayback();
    this.guitarBuffer = null;
    this.screenBuffer = null;
    this.guitarChunks = [];
    this.screenChunks = [];
    this.source = 'guitar';
  }
}
