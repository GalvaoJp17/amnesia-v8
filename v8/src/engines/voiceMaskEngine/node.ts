import type { VoiceMaskConfig } from './api';

let moduleLoaded = false;

async function ensureModule(context: AudioContext) {
  if (moduleLoaded) {
    return;
  }

  const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('engines/voiceMaskEngine/worklet.js')
    : new URL('./worklet.js', import.meta.url).href;

  await context.audioWorklet.addModule(url);
  moduleLoaded = true;
}

export async function createVoiceMaskNode(context: AudioContext, config: VoiceMaskConfig = {}) {
  await ensureModule(context);

  const node = new AudioWorkletNode(context, 'voice-mask-worklet', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    outputChannelCount: [1]
  });

  node.port.postMessage({
    pitch: config.shift ?? 1.08,
    formantMix: config.formantMix ?? 0.18
  });

  return node;
}
