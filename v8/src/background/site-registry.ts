// Site registry scaffolding for host classification.
// TODO: implement hostname allowlist logic for LLM vs meeting platforms.
export type SiteType = 'llm' | 'meeting' | 'unknown';

export function classifyHost(_hostname: string): SiteType {
  return 'unknown';
}
