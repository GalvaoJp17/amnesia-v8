// Placeholder API for video blur engine integration.
export interface BlurEngineConfig {
  strength?: number;
}

export async function ensureBlurEngine(_config: BlurEngineConfig = {}) {
  // TODO: instantiate blur engine once.
}
