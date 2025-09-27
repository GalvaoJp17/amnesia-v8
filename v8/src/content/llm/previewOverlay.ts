export interface PreviewItem {
  placeholder: string;
  original: string;
}

const MIN_DELAY_MS = 300;
const MAX_DELAY_MS = 600;
const MARGIN = 12;

let overlayEl: HTMLDivElement | null = null;
let pendingTimer: number | null = null;
let activeAnchor: HTMLElement | null = null;
let activeItems: PreviewItem[] = [];
let boundPositionHandler: (() => void) | null = null;

function ensureOverlay() {
  if (overlayEl) {
    return overlayEl;
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'amnesia-preview-overlay';
  overlayEl.style.position = 'fixed';
  overlayEl.style.zIndex = '2147483646';
  overlayEl.style.boxShadow = '0 4px 18px rgba(0, 0, 0, 0.18)';
  overlayEl.style.borderRadius = '10px';
  overlayEl.style.background = 'rgba(24, 24, 24, 0.92)';
  overlayEl.style.color = '#f3f4f6';
  overlayEl.style.padding = '12px 14px';
  overlayEl.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  overlayEl.style.fontSize = '13px';
  overlayEl.style.lineHeight = '1.4';
  overlayEl.style.maxWidth = '320px';
  overlayEl.style.pointerEvents = 'none';
  overlayEl.style.opacity = '0';
  overlayEl.style.transition = 'opacity 120ms ease-out';

  document.body.appendChild(overlayEl);
  return overlayEl;
}

function truncate(value: string, max = 120) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function renderOverlay(items: PreviewItem[]) {
  const overlay = ensureOverlay();
  overlay.textContent = '';

  const heading = document.createElement('div');
  heading.textContent = 'Amnesia placeholders';
  heading.style.fontWeight = '600';
  heading.style.marginBottom = '8px';
  heading.style.letterSpacing = '0.01em';

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '6px';

  for (const item of items) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';

    const placeholder = document.createElement('span');
    placeholder.textContent = item.placeholder;
    placeholder.style.fontWeight = '600';
    placeholder.style.color = '#22d3ee';

    const original = document.createElement('span');
    original.textContent = truncate(item.original);
    original.style.opacity = '0.85';
    original.style.wordBreak = 'break-word';

    row.appendChild(placeholder);
    row.appendChild(original);
    list.appendChild(row);
  }

  overlay.appendChild(heading);
  overlay.appendChild(list);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    positionOverlay();
  });
}

function positionOverlay() {
  if (!overlayEl || !activeAnchor) {
    return;
  }

  const rect = activeAnchor.getBoundingClientRect();
  const overlayRect = overlayEl.getBoundingClientRect();

  let top = rect.bottom + MARGIN;
  let left = rect.right - overlayRect.width;

  if (top + overlayRect.height > window.innerHeight - MARGIN) {
    top = Math.max(MARGIN, rect.top - overlayRect.height - MARGIN);
  }

  if (top < MARGIN) {
    top = Math.min(window.innerHeight - overlayRect.height - MARGIN, rect.bottom + MARGIN);
  }

  if (left + overlayRect.width > window.innerWidth - MARGIN) {
    left = window.innerWidth - overlayRect.width - MARGIN;
  }

  if (left < MARGIN) {
    left = Math.min(rect.left, window.innerWidth - overlayRect.width - MARGIN);
    if (left < MARGIN) {
      left = MARGIN;
    }
  }

  overlayEl.style.top = `${Math.max(MARGIN, Math.round(top))}px`;
  overlayEl.style.left = `${Math.max(MARGIN, Math.round(left))}px`;
}

function clearTimer() {
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

function detachListeners() {
  if (boundPositionHandler) {
    window.removeEventListener('scroll', boundPositionHandler, true);
    window.removeEventListener('resize', boundPositionHandler, true);
    boundPositionHandler = null;
  }
}

function attachListeners() {
  if (boundPositionHandler) {
    return;
  }
  boundPositionHandler = () => positionOverlay();
  window.addEventListener('scroll', boundPositionHandler, true);
  window.addEventListener('resize', boundPositionHandler, true);
}

export function showPreview(items: PreviewItem[]) {
  activeItems = items.filter((item) => item.placeholder && item.original);
  if (!activeItems.length) {
    hidePreview();
    return;
  }

  clearTimer();
  activeAnchor = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!activeAnchor) {
    return;
  }

  const delay = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
  pendingTimer = window.setTimeout(() => {
    renderOverlay(activeItems);
    attachListeners();
  }, delay);
}

export function hidePreview() {
  clearTimer();
  detachListeners();
  activeItems = [];
  activeAnchor = null;
  if (overlayEl?.parentElement) {
    overlayEl.parentElement.removeChild(overlayEl);
  }
  overlayEl = null;
}
