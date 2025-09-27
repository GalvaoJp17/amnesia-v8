// Meeting platform detection using host heuristics and DOM hints.
const PLATFORM_PATTERNS: Array<{ platform: string; test: (hostname: string) => boolean }> = [
  { platform: 'google-meet', test: (host) => host === 'meet.google.com' },
  { platform: 'zoom', test: (host) => host === 'zoom.us' || host.endsWith('.zoom.us') },
  { platform: 'microsoft-teams', test: (host) => host === 'teams.microsoft.com' },
  { platform: 'webex', test: (host) => host === 'webex.com' || host.endsWith('.webex.com') },
  { platform: 'slack-huddle', test: (host) => host === 'slack.com' || host.endsWith('.slack.com') }
];

function detectFromHostname() {
  const hostname = window.location.hostname.toLowerCase();
  for (const candidate of PLATFORM_PATTERNS) {
    if (candidate.test(hostname)) {
      return candidate.platform;
    }
  }
  return null;
}

function detectFromDom() {
  const body = document.body;
  if (!body) {
    return null;
  }

  if (body.querySelector('[data-meeting-platform="google-meet"]')) {
    return 'google-meet';
  }
  if (body.querySelector('[data-meeting-platform="zoom"]')) {
    return 'zoom';
  }
  if (body.querySelector('[data-meeting-platform="teams"]')) {
    return 'microsoft-teams';
  }

  return null;
}

export function detectMeetingPlatform(): string | null {
  return detectFromDom() ?? detectFromHostname();
}
