import { createVoiceMaskNode } from './node';

export interface VoiceMaskConfig {
  shift?: number;
  formantMix?: number;
  sourceTrack?: MediaStreamTrack;
}

interface VoiceMaskInstance {
  track: MediaStreamTrack;
  source: MediaStreamTrack;
  stop: () => void;
}

let currentInstance: VoiceMaskInstance | null = null;

export async function ensureVoiceMask(config: VoiceMaskConfig = {}) {
  const sourceTrack = config.sourceTrack;
  if (!sourceTrack) {
    throw new Error('Voice mask requires a sourceTrack');
  }

  if (currentInstance && currentInstance.source.id === sourceTrack.id) {
    return currentInstance;
  }

  currentInstance?.stop();

  const context = new AudioContext({ latencyHint: 'interactive' });
  const sourceStream = new MediaStream([sourceTrack]);
  const sourceNode = context.createMediaStreamSource(sourceStream);

  const maskNode = await createVoiceMaskNode(context, config);
  const presenceFilter = context.createBiquadFilter();
  presenceFilter.type = 'peaking';
  presenceFilter.frequency.value = 1800;
  presenceFilter.gain.value = 3;
  presenceFilter.Q.value = 1.1;

  const warmthFilter = context.createBiquadFilter();
  warmthFilter.type = 'lowshelf';
  warmthFilter.frequency.value = 280;
  warmthFilter.gain.value = -3;

  const destination = context.createMediaStreamDestination();

  sourceNode.connect(maskNode).connect(presenceFilter).connect(warmthFilter).connect(destination);

  const processedTrack = destination.stream.getAudioTracks()[0];

  currentInstance = {
    track: processedTrack,
    source: sourceTrack,
    stop: () => {
      try {
        sourceNode.disconnect();
        maskNode.disconnect();
        presenceFilter.disconnect();
        warmthFilter.disconnect();
      } catch (error) {
        console.warn('Voice mask cleanup error', error);
      }
      processedTrack.stop();
      context.close();
    }
  };

  sourceTrack.addEventListener(
    'ended',
    () => {
      currentInstance?.stop();
      currentInstance = null;
    },
    { once: true }
  );

  return currentInstance;
}
