export type RecorderCallback = () => void;

const RECORDER_KEYWORDS = [
  'otter',
  'fireflies',
  'fathom',
  'read.ai',
  'tl;dv',
  'tldv',
  'sembly',
  'avoma',
  'grain'
];

const BANNER_KEYWORDS = ['recording', 'recorder', 'notetaker', 'transcribing'];

const detectedListeners = new Set<RecorderCallback>();
const stoppedListeners = new Set<RecorderCallback>();

let observer: MutationObserver | null = null;
let detectionState = false;

function toLower(value: string) {
  return value.toLowerCase();
}

function matchesRecorderKeyword(value: string) {
  const lower = toLower(value);
  return RECORDER_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function matchesBannerKeyword(value: string) {
  const lower = toLower(value);
  return BANNER_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function hasRecorderAttributes(element: Element) {
  const datasetValues = Object.values((element as HTMLElement).dataset ?? {});
  if (datasetValues.some((value) => matchesRecorderKeyword(value))) {
    return true;
  }

  const attributes = Array.from(element.attributes ?? []);
  return attributes.some((attr) => matchesRecorderKeyword(attr.value) || matchesBannerKeyword(attr.value));
}

function nodeMatches(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (matchesRecorderKeyword(text) && matchesBannerKeyword(text)) {
      return true;
    }
    if (matchesRecorderKeyword(text) && text.toLowerCase().includes('joined')) {
      return true;
    }
  }

  if (!(node instanceof Element)) {
    return false;
  }

  const element = node as Element;

  if (hasRecorderAttributes(element)) {
    return true;
  }

  const className = element.className?.toString() ?? '';
  if (matchesRecorderKeyword(className)) {
    return true;
  }

  const ariaLabel = element.getAttribute?.('aria-label') ?? '';
  if (ariaLabel && (matchesRecorderKeyword(ariaLabel) || matchesBannerKeyword(ariaLabel))) {
    return true;
  }

  const role = element.getAttribute('role');
  if (role && role.toLowerCase() === 'alert') {
    const text = element.textContent || '';
    if (matchesRecorderKeyword(text) || matchesBannerKeyword(text)) {
      return true;
    }
  }

  const textContent = element.textContent || '';
  if (matchesRecorderKeyword(textContent) && matchesBannerKeyword(textContent)) {
    return true;
  }

  return false;
}

function hasScriptHints() {
  const scripts = Array.from(document.scripts);
  return scripts.some((script) => {
    const src = script.src || '';
    return matchesRecorderKeyword(src);
  });
}

function hasSdkHints() {
  return Boolean(
    document.querySelector('[data-sdk*="otter"],[data-sdk*="fireflies"],[data-sdk*="fathom"],[data-sdk*="read"],[data-sdk*="tldv"],[data-sdk*="sembly"],[data-sdk*="avoma"],[data-sdk*="grain"]')
  );
}

function scanDom(): boolean {
  const body = document.body;
  if (!body) {
    return false;
  }

  if (hasScriptHints() || hasSdkHints()) {
    return true;
  }

  const nodes = body.querySelectorAll('*');
  for (const node of nodes) {
    if (nodeMatches(node)) {
      return true;
    }
  }

  return false;
}

function updateState() {
  const detected = scanDom();
  if (detected === detectionState) {
    return;
  }
  detectionState = detected;
  const listeners = detected ? detectedListeners : stoppedListeners;
  listeners.forEach((listener) => listener());
}

function ensureObserver() {
  if (observer) {
    return;
  }

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (!detectionState && nodeMatches(node)) {
            detectionState = true;
            detectedListeners.forEach((listener) => listener());
          }
        });
      }
      if (!detectionState && mutation.type === 'attributes' && nodeMatches(mutation.target)) {
        detectionState = true;
        detectedListeners.forEach((listener) => listener());
      }
    }
    if (!detectionState) {
      updateState();
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
  } else {
    const readyObserver = new MutationObserver(() => {
      if (document.body) {
        readyObserver.disconnect();
        observer?.observe(document.body, { childList: true, subtree: true, attributes: true });
        updateState();
      }
    });
    readyObserver.observe(document.documentElement, { childList: true });
  }

  updateState();
}

export function onRecordingDetected(callback: RecorderCallback) {
  detectedListeners.add(callback);
  ensureObserver();
  if (detectionState) {
    callback();
  }
}

export function onRecordingStopped(callback: RecorderCallback) {
  stoppedListeners.add(callback);
  ensureObserver();
}
