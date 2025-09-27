// Placeholder API for voice masking.
export interface VoiceMaskConfig {
  shift?: number;
}

export async function ensureVoiceMask(_config: VoiceMaskConfig = {}) {
  // TODO: initialize AudioWorklet graph.
}
