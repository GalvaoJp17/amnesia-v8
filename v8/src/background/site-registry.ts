// Site registry scaffolding for host classification.
// TODO: implement hostname allowlist logic for LLM vs meeting platforms.
export type SiteType = 'llm' | 'meeting' | 'unknown';

const LLM_HOSTS = [
  'chat.openai.com',
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'www.perplexity.ai',
  'poe.com',
  'grok.com'
];

const MEETING_PATTERNS = [
  'meet.google.com',
  '*.zoom.us',
  'teams.microsoft.com',
  '*.webex.com',
  '*.slack.com'
];

function normalizeHost(hostname: string) {
  return hostname.trim().toLowerCase();
}

function patternMatches(hostname: string, pattern: string) {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // retains leading dot
    return hostname === pattern.slice(2) || hostname.endsWith(suffix);
  }
  return hostname === pattern;
}

export function classifyHost(hostname: string): SiteType {
  const normalized = normalizeHost(hostname);

  if (LLM_HOSTS.some((host) => host === normalized)) {
    return 'llm';
  }

  if (MEETING_PATTERNS.some((pattern) => patternMatches(normalized, pattern))) {
    return 'meeting';
  }

  return 'unknown';
}
