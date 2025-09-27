import { createBlurProcessor } from './blurProcessor';

export interface BlurEngineConfig {
  strength?: number;
  fallbackStrength?: number;
  sourceTrack?: MediaStreamTrack;
}

interface BlurEngineInstance {
  track: MediaStreamTrack;
  source: MediaStreamTrack;
  stop: () => void;
}

const engines = new Map<string, BlurEngineInstance>();

export async function ensureBlurEngine(config: BlurEngineConfig = {}) {
  const sourceTrack = config.sourceTrack;
  if (!sourceTrack) {
    throw new Error('Blur engine requires a sourceTrack');
  }

  let engine = engines.get(sourceTrack.id);
  if (engine) {
    return engine;
  }

  const processor = await createBlurProcessor(sourceTrack, config);
  engine = {
    track: processor.track,
    source: sourceTrack,
    stop: processor.stop
  };

  engines.set(sourceTrack.id, engine);

  const cleanup = () => {
    engine?.stop();
    engines.delete(sourceTrack.id);
  };

  sourceTrack.addEventListener('ended', cleanup, { once: true });

  return engine;
}
