import test from 'node:test';
import assert from 'node:assert/strict';

class FakeEvent {
  constructor(type) {
    this.type = type;
  }
}

class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this.id = `${kind}-${Math.random().toString(36).slice(2)}`;
    this.enabled = true;
    this.muted = false;
    this.contentHint = '';
    this.label = '';
    this.readyState = 'live';
    this._listeners = new Map();
    this.tag = undefined;
  }

  clone() {
    const next = new FakeTrack(this.kind);
    next.tag = this.tag;
    return next;
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this._listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    this._listeners.get(type)?.forEach((listener) => listener(new FakeEvent(type)));
  }

  stop() {
    this.readyState = 'ended';
    this.dispatch('ended');
  }

  applyConstraints() {
    return Promise.resolve();
  }

  getCapabilities() {
    return {};
  }

  getConstraints() {
    return {};
  }

  getSettings() {
    return {};
  }
}

class FakeStream {
  constructor(tracks = []) {
    this.id = `stream-${Math.random().toString(36).slice(2)}`;
    this.active = true;
    this._tracks = tracks;
  }

  getTracks() {
    return [...this._tracks];
  }

  getVideoTracks() {
    return this._tracks.filter((track) => track.kind === 'video');
  }

  getAudioTracks() {
    return this._tracks.filter((track) => track.kind === 'audio');
  }

  addTrack(track) {
    this._tracks.push(track);
  }

  removeTrack(track) {
    this._tracks = this._tracks.filter((candidate) => candidate !== track);
  }
}

class FakeSender {
  constructor(track) {
    this.track = track;
    this.replacedWith = null;
  }

  async replaceTrack(track) {
    this.replacedWith = track;
    this.track = track;
  }
}

class FakePeerConnection {
  addTrack(track, ..._streams) {
    return new FakeSender(track);
  }

  addStream() {}
}

const blurCalls = [];
const maskCalls = [];

globalThis.MediaStream = FakeStream;
globalThis.MediaStreamTrack = FakeTrack;

Object.defineProperty(globalThis, 'navigator', {
  value: {
    mediaDevices: {
      async getUserMedia() {
        return new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]);
      },
      async getDisplayMedia() {
        return new FakeStream([new FakeTrack('video')]);
      }
    }
  },
  configurable: true
});

globalThis.__amnesiaEnsureBlurEngine = async (config) => {
  blurCalls.push(config);
  const track = new FakeTrack('video');
  track.tag = 'processed-video';
  return {
    track,
    source: config.sourceTrack,
    stop() {}
  };
};

globalThis.__amnesiaEnsureVoiceMask = async (config) => {
  maskCalls.push(config);
  const track = new FakeTrack('audio');
  track.tag = 'processed-audio';
  return {
    track,
    source: config.sourceTrack,
    stop() {}
  };
};

globalThis.RTCPeerConnection = FakePeerConnection;
globalThis.RTCRtpSender = FakeSender;

const { applyProtection } = await import('../dist/content/meetings/streamHooks.js');

await applyProtection();

test('applyProtection replaces tracks on peer connection senders', async () => {
  const pc = new FakePeerConnection();
  const stream = new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]);
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];

  const videoSender = pc.addTrack(videoTrack, stream);
  const audioSender = pc.addTrack(audioTrack, stream);

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(videoSender.replacedWith, 'video track replaced');
  assert.notEqual(videoSender.replacedWith, videoTrack);
  assert.equal(videoSender.replacedWith.kind, 'video');

  assert.ok(audioSender.replacedWith, 'audio track replaced');
  assert.notEqual(audioSender.replacedWith, audioTrack);
  assert.equal(audioSender.replacedWith.kind, 'audio');
});

test('getUserMedia returns processed tracks and retains fallback config', async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];

  assert.equal(videoTrack.tag, 'processed-video');
  assert.equal(audioTrack.tag, 'processed-audio');
  assert.ok(blurCalls.some((call) => call.fallbackStrength === 12));
  assert.ok(maskCalls.length > 0);
});
