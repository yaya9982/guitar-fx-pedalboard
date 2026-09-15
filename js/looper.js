export class Looper {
  constructor(ctx, mediaStreamDest) {
    this.ctx = ctx;
    this.stream = mediaStreamDest.stream;
    this.recorder = null;
    this.chunks = [];
    this.buffer = null;
    this.sourceNode = null;
    this.monitorGain = ctx.createGain();
    this.monitorGain.connect(ctx.destination);
    this.loop = false;
    this.isRecording = false;
    this.isPlaying = false;
    this.onEnded = null;
  }

  static pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    return candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  startRecording() {
    const mimeType = Looper.pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.start();
    this.isRecording = true;
  }

  stopRecording() {
    return new Promise((resolve, reject) => {
      // Guards a double-click/double-invocation from calling stop() on an
      // already-inactive recorder, which throws synchronously and would otherwise
      // leave the caller's state stuck mid-recording with no resolved/rejected promise.
      if (!this.recorder || this.recorder.state === 'inactive') {
        return reject(new Error('Not currently recording'));
      }
      this.recorder.onstop = async () => {
        this.isRecording = false;
        try {
          if (this.chunks.length === 0) throw new Error('No audio was captured — try recording for at least a second.');
          const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
          const arrayBuffer = await blob.arrayBuffer();
          this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
          resolve(this.buffer);
        } catch (err) {
          reject(err);
        }
      };
      this.recorder.stop();
    });
  }

  play() {
    if (!this.buffer) return;
    this.stopPlayback();
    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.loop = this.loop;
    this.sourceNode.connect(this.monitorGain);
    this.sourceNode.onended = () => {
      this.isPlaying = false;
      if (this.onEnded) this.onEnded();
    };
    this.sourceNode.start();
    this.isPlaying = true;
  }

  stopPlayback() {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch (e) { /* already stopped */ }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
  }

  setLoop(loop) {
    this.loop = loop;
    if (this.sourceNode) this.sourceNode.loop = loop;
  }

  clear() {
    this.stopPlayback();
    this.buffer = null;
    this.chunks = [];
  }
}
