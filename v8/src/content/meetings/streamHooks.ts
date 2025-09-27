import { ensureBlurEngine } from '../../engines/videoBlurEngine/api.js';
import { ensureVoiceMask } from '../../engines/voiceMaskEngine/api.js';

const processedSymbol = Symbol('amnesia-processed-track');

let patched = false;

function markTrack(track: MediaStreamTrack) {
  Reflect.set(track, processedSymbol, true);
}

function isProcessed(track: MediaStreamTrack | null) {
  return Boolean(track && Reflect.get(track, processedSymbol));
}

const blurEngineFactory: typeof ensureBlurEngine =
  (globalThis as unknown as { __amnesiaEnsureBlurEngine?: typeof ensureBlurEngine }).__amnesiaEnsureBlurEngine ?? ensureBlurEngine;

const voiceMaskFactory: typeof ensureVoiceMask =
  (globalThis as unknown as { __amnesiaEnsureVoiceMask?: typeof ensureVoiceMask }).__amnesiaEnsureVoiceMask ?? ensureVoiceMask;

async function getBlurredTrack(track: MediaStreamTrack) {
  if (isProcessed(track)) {
    return track;
  }
  const engine = await blurEngineFactory({ sourceTrack: track, strength: 20, fallbackStrength: 12 });
  const processed = engine.track.clone();
  markTrack(processed);
  return processed;
}

async function getMaskedTrack(track: MediaStreamTrack) {
  if (isProcessed(track)) {
    return track;
  }
  const engine = await voiceMaskFactory({ sourceTrack: track, shift: 1.08, formantMix: 0.2 });
  const processed = engine.track.clone();
  markTrack(processed);
  return processed;
}

function primeStream(stream: MediaStream) {
  stream.getVideoTracks().forEach((track) => {
    getBlurredTrack(track).catch((error) => console.warn('Video blur failed', error));
  });
  stream.getAudioTracks().forEach((track) => {
    getMaskedTrack(track).catch((error) => console.warn('Voice mask failed', error));
  });
}

function patchAddTrack() {
  const originalAddTrack = RTCPeerConnection.prototype.addTrack;
  RTCPeerConnection.prototype.addTrack = function patchedAddTrack(track: MediaStreamTrack, ...streams: MediaStream[]) {
    streams.forEach((stream) => primeStream(stream));
    const sender = originalAddTrack.call(this, track, ...streams);
    if (track.kind === 'video') {
      getBlurredTrack(track)
        .then((processed) => {
          if (processed !== track) {
            sender.replaceTrack(processed).catch((error) => console.warn('replaceTrack video failed', error));
          }
        })
        .catch((error) => console.warn('Video blur install failed', error));
    } else if (track.kind === 'audio') {
      getMaskedTrack(track)
        .then((processed) => {
          if (processed !== track) {
            sender.replaceTrack(processed).catch((error) => console.warn('replaceTrack audio failed', error));
          }
        })
        .catch((error) => console.warn('Voice mask install failed', error));
    }
    return sender;
  };
}

function patchAddStream() {
  const originalAddStream = RTCPeerConnection.prototype.addStream;
  if (!originalAddStream) {
    return;
  }

  RTCPeerConnection.prototype.addStream = function patchedAddStream(stream: MediaStream) {
    primeStream(stream);
    return originalAddStream.call(this, stream);
  };
}

function patchReplaceTrack() {
  const originalReplaceTrack = RTCRtpSender.prototype.replaceTrack;
  RTCRtpSender.prototype.replaceTrack = async function patchedReplaceTrack(track: MediaStreamTrack | null) {
    if (!track || isProcessed(track)) {
      return originalReplaceTrack.call(this, track);
    }

    try {
      const processed = track.kind === 'video' ? await getBlurredTrack(track) : await getMaskedTrack(track);
      return originalReplaceTrack.call(this, processed);
    } catch (error) {
      console.warn('replaceTrack protection error', error);
      return originalReplaceTrack.call(this, track);
    }
  };
}

function patchGetUserMedia() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints: MediaStreamConstraints) => {
    const stream = await originalGetUserMedia(constraints);
    primeStream(stream);
    const processed = new MediaStream();
    await Promise.all(
      stream.getTracks().map(async (track) => {
        const processedTrack = track.kind === 'video' ? await getBlurredTrack(track) : await getMaskedTrack(track);
        if (processedTrack && processedTrack !== track) {
          processedTrack.addEventListener('ended', () => track.stop(), { once: true });
        }
        processed.addTrack(processedTrack);
      })
    );
    return processed;
  };
}

function patchGetDisplayMedia() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return;
  }

  const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async (constraints?: DisplayMediaStreamConstraints) => {
    const stream = await original(constraints);
    primeStream(stream);
    return stream;
  };
}

export async function applyProtection() {
  if (patched) {
    return;
  }
  patched = true;

  patchAddTrack();
  patchAddStream();
  patchReplaceTrack();
  patchGetUserMedia();
  patchGetDisplayMedia();
}
