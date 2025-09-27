export type EditorType = 'textarea' | 'contenteditable' | 'textbox';

export interface EditorSurface {
  element: HTMLElement;
  type: EditorType;
}

export type EditorListener = (surface: EditorSurface) => void;

export interface EditorObserver {
  subscribe(listener: EditorListener): () => void;
  disconnect(): void;
}

const listeners = new Set<EditorListener>();
const knownEditors = new WeakSet<HTMLElement>();
const observedShadows = new WeakSet<ShadowRoot>();

const EDITABLE_SELECTOR = [
  'textarea',
  'input[type="text"]',
  'input[type=""]',
  'input:not([type])',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="url"]',
  'input[type="tel"]',
  '[contenteditable]',
  '[role="textbox"]'
].join(', ');

let initialized = false;
let mutationObserver: MutationObserver | null = null;

function isRoleTextbox(element: Element) {
  return element.getAttribute('role')?.toLowerCase() === 'textbox';
}

function isTextInput(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel'].includes(type);
  }

  if (element.isContentEditable) {
    return true;
  }

  return isRoleTextbox(element);
}

function deriveType(element: HTMLElement): EditorType {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return 'textarea';
  }
  if (element.isContentEditable) {
    return 'contenteditable';
  }
  return 'textbox';
}

function notify(surface: EditorSurface) {
  listeners.forEach((listener) => listener(surface));
}

function handleFocus(event: FocusEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!isTextInput(target)) {
    return;
  }

  const type = deriveType(target);
  knownEditors.add(target);
  notify({ element: target, type });
}

function crawlNode(node: Node) {
  if (!(node instanceof Element || node instanceof ShadowRoot || node instanceof Document)) {
    return;
  }

  if (node instanceof Element && isTextInput(node)) {
    const element = node as HTMLElement;
    if (!knownEditors.has(element)) {
      knownEditors.add(element);
      // Trigger detection if already focused when discovered.
      if (element === document.activeElement) {
        notify({ element, type: deriveType(element) });
      }
    }
  }

  const queryRoot = node instanceof ShadowRoot ? node : (node as Element | Document);

  queryRoot.querySelectorAll?.(EDITABLE_SELECTOR).forEach((child) => {
    if (child instanceof HTMLElement && isTextInput(child)) {
      if (!knownEditors.has(child)) {
        knownEditors.add(child);
        if (child === document.activeElement) {
          notify({ element: child, type: deriveType(child) });
        }
      }
    }
  });

  if (node instanceof Element && node.shadowRoot && !observedShadows.has(node.shadowRoot)) {
    observedShadows.add(node.shadowRoot);
    crawlNode(node.shadowRoot);
    mutationObserver?.observe(node.shadowRoot, { childList: true, subtree: true });
    node.shadowRoot.addEventListener('focusin', handleFocus, true);
  }
}

function scanExistingEditors() {
  crawlNode(document.documentElement);
}

function ensureObserver() {
  if (mutationObserver) {
    return;
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(crawlNode);
    }
  });

  if (document.body) {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    const readyStateObserver = new MutationObserver(() => {
      if (document.body) {
        readyStateObserver.disconnect();
        mutationObserver?.observe(document.body, { childList: true, subtree: true });
      }
    });
    readyStateObserver.observe(document.documentElement, { childList: true });
  }
}

function init() {
  if (initialized) {
    return;
  }
  initialized = true;

  document.addEventListener('focusin', handleFocus, true);
  ensureObserver();
  scanExistingEditors();
}

export function observeEditors(): EditorObserver {
  init();

  return {
    subscribe(listener: EditorListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    disconnect() {
      document.removeEventListener('focusin', handleFocus, true);
      mutationObserver?.disconnect();
      mutationObserver = null;
      listeners.clear();
      initialized = false;
    }
  };
}
