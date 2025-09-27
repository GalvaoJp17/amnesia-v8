import { PlaceholderStore } from '../../common/placeholders';
import { maskText, PlaceholderMatch } from './piiGuard';
import { showPreview, hidePreview } from './previewOverlay';

const CHANNEL = 'amnesia::shim';
const placeholderStore = new PlaceholderStore();

let installed = false;
const pendingRestorations = new WeakMap<HTMLElement, number>();

interface SanitizedResult {
  sanitized: string;
  matches: PlaceholderMatch[];
  mapping: Map<string, string>;
}

function readValue(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }
  if (element.isContentEditable) {
    return element.textContent ?? '';
  }
  return '';
}

function writeValue(element: HTMLElement, value: string) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.value = value;
  } else if (element.isContentEditable) {
    element.textContent = value;
  }
}

function flashEditor(element: HTMLElement) {
  element.dataset.amnesiaMasked = 'true';
  element.style.transition = element.style.transition || 'background-color 180ms ease-out';
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = 'rgba(34, 211, 238, 0.12)';
  window.setTimeout(() => {
    element.style.backgroundColor = originalBg;
    delete element.dataset.amnesiaMasked;
  }, 140);
}

function broadcastMapping(entries: Array<[string, string]>) {
  if (!entries.length) {
    return;
  }
  window.postMessage(
    {
      channel: CHANNEL,
      type: 'register-mapping',
      payload: entries
    },
    '*'
  );
}

function recordMapping(mapping: Map<string, string>) {
  const fresh: Array<[string, string]> = [];
  for (const [token, value] of mapping.entries()) {
    if (!placeholderStore.has(token)) {
      placeholderStore.set(token, value);
      fresh.push([token, value]);
    }
  }
  broadcastMapping(fresh);
}

function sanitizeElement(element: HTMLElement, showOverlay = false): SanitizedResult | null {
  const original = readValue(element);
  if (!original) {
    return null;
  }

  const result = maskText(original);
  if (!result.matches.length) {
    if (showOverlay) {
      hidePreview();
    }
    return null;
  }

  recordMapping(result.mapping);

  writeValue(element, result.sanitized);

  if (showOverlay) {
    showPreview(result.matches.map((match) => ({ placeholder: match.token, original: match.value })));
    flashEditor(element);
  }

  const restoreDelay = Math.floor(Math.random() * 100) + 50;
  const existingTimer = pendingRestorations.get(element);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  const timerId = window.setTimeout(() => {
    writeValue(element, original);
    pendingRestorations.delete(element);
  }, restoreDelay);

  pendingRestorations.set(element, timerId);

  return {
    sanitized: result.sanitized,
    matches: result.matches,
    mapping: result.mapping
  };
}

function handleSubmit(event: Event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const elements = Array.from(form.elements) as HTMLElement[];
  let activeSanitized = false;
  for (const element of elements) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    const result = sanitizeElement(element, element === document.activeElement);
    if (result) {
      activeSanitized = true;
    }
  }

  if (!activeSanitized) {
    hidePreview();
  }
}

function isSendKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') {
    return false;
  }
  if (event.isComposing) {
    return false;
  }
  if (event.shiftKey) {
    return false;
  }
  return event.metaKey || event.ctrlKey || (!event.altKey && !event.metaKey && !event.ctrlKey);
}

function handleKeydown(event: KeyboardEvent) {
  if (!isSendKey(event)) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const result = sanitizeElement(target, true);
  if (!result) {
    hidePreview();
  }
}

function handleFocusOut() {
  hidePreview();
}

function injectShim() {
  if (document.documentElement.dataset.amnesiaShimReady === 'true') {
    return;
  }

  const shim = document.createElement('script');
  shim.dataset.amnesiaShim = 'true';
  shim.type = 'module';
  shim.textContent = buildShimSource();
  document.documentElement.appendChild(shim);
  shim.remove();
  document.documentElement.dataset.amnesiaShimReady = 'true';
}

function buildShimSource() {
  return `(() => {
    if (window.__amnesiaShimInstalled) return;
    window.__amnesiaShimInstalled = true;
    const CHANNEL = '${CHANNEL}';
    const TOKEN_PATTERN = /\\[\\[PII-[A-Z]+-\\d+\\]\\]/g;

    const mappingStore = new Map();

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.channel !== CHANNEL) return;
      if (data.type === 'register-mapping' && Array.isArray(data.payload)) {
        for (const [token, value] of data.payload) {
          mappingStore.set(token, value);
        }
      }
    });

    function luhnCheck(digits) {
      let sum = 0;
      let shouldDouble = false;
      for (let i = digits.length - 1; i >= 0; i -= 1) {
        let digit = parseInt(digits.charAt(i), 10);
        if (Number.isNaN(digit)) {
          return false;
        }
        if (shouldDouble) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
      }
      return sum % 10 === 0;
    }

    const HEURISTICS = [
      { type: 'EMAIL', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi },
      { type: 'PHONE', pattern: /(?:\\+\\d{1,3}[\\s-]?)?(?:\\(\\d{2,4}\\)|\\d{2,4})[\\s.-]?\\d{3,4}[\\s.-]?\\d{3,4}/g, filter: (match) => match[0].replace(/\\D/g, '').length >= 7 },
      { type: 'CARD', pattern: /(?:\\d[ -]?){13,19}/g, filter: (match) => { const digits = match[0].replace(/\\D/g, ''); return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits); } },
      { type: 'SSN', pattern: /\\b\\d{3}-\\d{2}-\\d{4}\\b/g },
      { type: 'IP', pattern: /\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b/g },
      { type: 'UUID', pattern: /\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b/gi },
      { type: 'GEO', pattern: /\\b\\d{1,4}\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,3}(?:\\s+(?:Street|St\\.|Avenue|Ave\\.|Road|Rd\\.|Boulevard|Blvd\\.|Lane|Ln\\.|Drive|Dr\\.))\\b/g }
    ];

    function collectMatches(text) {
      const matches = [];
      for (const heuristic of HEURISTICS) {
        heuristic.pattern.lastIndex = 0;
        let result;
        while ((result = heuristic.pattern.exec(text)) !== null) {
          const value = result[0];
          if (!value) continue;
          if (heuristic.filter && !heuristic.filter(result)) continue;
          matches.push({ index: result.index, length: value.length, value, type: heuristic.type });
        }
      }
      matches.sort((a, b) => a.index - b.index);
      const filtered = [];
      for (const match of matches) {
        const end = match.index + match.length;
        if (filtered.some((existing) => match.index < existing.index + existing.length && end > existing.index)) {
          continue;
        }
        filtered.push(match);
      }
      return filtered;
    }

    function maskText(text) {
      const matches = collectMatches(text);
      if (!matches.length) {
        return { sanitized: text, mapping: new Map(), matches: [] };
      }
      const buckets = new Map();
      const pieces = [];
      const mapping = new Map();
      let cursor = 0;
      for (const match of matches) {
        const count = (buckets.get(match.type) || 0) + 1;
        buckets.set(match.type, count);
        const token = '[[PII-' + match.type + '-' + count + ']]';
        pieces.push(text.slice(cursor, match.index));
        pieces.push(token);
        cursor = match.index + match.length;
        mapping.set(token, match.value);
      }
      pieces.push(text.slice(cursor));
      return { sanitized: pieces.join(''), mapping };
    }

    function rehydrateString(value) {
      if (!value) return value;
      return value.replace(TOKEN_PATTERN, (token) => mappingStore.get(token) || token);
    }

    function rehydrateStream(stream) {
      if (!stream || !(stream.getReader)) {
        return null;
      }
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let carry = '';

      return new ReadableStream({
        async pull(controller) {
          const { value, done } = await reader.read();
          if (done) {
            if (carry) {
              const flushed = rehydrateString(carry);
              if (flushed) {
                controller.enqueue(encoder.encode(flushed));
              }
            }
            controller.close();
            return;
          }
          try {
            const chunk = typeof value === 'string' ? value : decoder.decode(value, { stream: true });
            carry += chunk;
            let processed = '';
            let match;
            TOKEN_PATTERN.lastIndex = 0;
            while ((match = TOKEN_PATTERN.exec(carry)) !== null) {
              const index = match.index;
              processed += carry.slice(0, index);
              const token = match[0];
              processed += mappingStore.get(token) || token;
              carry = carry.slice(index + token.length);
              TOKEN_PATTERN.lastIndex = 0;
            }
            if (processed) {
              controller.enqueue(encoder.encode(processed));
            }
            if (carry.length > 512) {
              const safe = carry.slice(0, carry.length - 64);
              carry = carry.slice(carry.length - 64);
              if (safe) {
                controller.enqueue(encoder.encode(rehydrateString(safe)));
              }
            }
          } catch (error) {
            console.error('Amnesia rehydrate error', error);
            controller.enqueue(value);
          }
        }
      });
    }

    async function sanitizeRequest(input, init) {
      let request = input instanceof Request ? input : new Request(input, init);
      const cloned = request.clone();
      if (cloned.method === 'GET' || cloned.method === 'HEAD') {
        return { request, mapping: null };
      }
      let body;
      try {
        body = await cloned.text();
      } catch (error) {
        return { request, mapping: null };
      }
      if (!body) {
        return { request, mapping: null };
      }
      const { sanitized, mapping } = maskText(body);
      if (!mapping.size) {
        return { request, mapping: null };
      }
      const headers = new Headers(request.headers);
      headers.delete('Content-Length');
      request = new Request(request, { body: sanitized, headers });
      return { request, mapping };
    }

    function wrapResponse(response, mapping) {
      if (!mapping || !mapping.size) {
        return response;
      }
      const newStream = rehydrateStream(response.body);
      if (!newStream) {
        return response;
      }
      const wrapped = new Response(newStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      Object.defineProperty(wrapped, 'url', { value: response.url });
      return wrapped;
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      const { request, mapping } = await sanitizeRequest(input, init);
      const response = await originalFetch(request);
      return wrapResponse(response, mapping);
    };

    const xhrSend = XMLHttpRequest.prototype.send;
    const xhrOpen = XMLHttpRequest.prototype.open;
    const xhrMappings = new WeakMap();

    XMLHttpRequest.prototype.open = function(...args) {
      xhrOpen.apply(this, args);
      xhrMappings.set(this, { carry: '' });
    };

    XMLHttpRequest.prototype.send = function(body) {
      if (typeof body === 'string') {
        const { sanitized, mapping } = maskText(body);
        if (mapping.size) {
          const info = xhrMappings.get(this) || { carry: '' };
          info.mapping = mapping;
          xhrMappings.set(this, info);
          body = sanitized;
        }
      }
      return xhrSend.call(this, body);
    };

    const originalGet = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    if (originalGet && originalGet.get) {
      Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
        get() {
          const value = originalGet.get.call(this);
          const info = xhrMappings.get(this);
          if (!info || !info.mapping || !value) {
            return value;
          }
          if (info.lastLength === value.length) {
            return info.lastValue;
          }
          info.lastLength = value.length;
          info.lastValue = value.replace(TOKEN_PATTERN, (token) => info.mapping.get(token) || mappingStore.get(token) || token);
          return info.lastValue;
        }
      });
    }

    const originalAddEventListener = WebSocket.prototype.addEventListener;
    const originalSend = WebSocket.prototype.send;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    WebSocket.prototype.send = function(data) {
      if (typeof data === 'string') {
        const { sanitized, mapping } = maskText(data);
        if (mapping.size) {
          mapping.forEach((value, token) => mappingStore.set(token, value));
          data = sanitized;
        }
      }
      return originalSend.call(this, data);
    };

    WebSocket.prototype.addEventListener = function(type, listener, options) {
      if (type === 'message' && typeof listener === 'function') {
        const wrapped = function(event) {
          const data = event.data;
          if (typeof data === 'string') {
            const next = data.replace(TOKEN_PATTERN, (token) => mappingStore.get(token) || token);
            const cloned = new MessageEvent('message', {
              data: next,
              origin: event.origin,
              lastEventId: event.lastEventId,
              source: event.source,
              ports: event.ports
            });
            listener.call(this, cloned);
            return;
          }
          if (data instanceof ArrayBuffer) {
            const text = decoder.decode(new Uint8Array(data));
            const next = text.replace(TOKEN_PATTERN, (token) => mappingStore.get(token) || token);
            listener.call(this, new MessageEvent('message', { data: encoder.encode(next), origin: event.origin }));
            return;
          }
          listener.call(this, event);
        };
        return originalAddEventListener.call(this, type, wrapped, options);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
  })();`;
}

export function installSubmitInterceptor() {
  if (installed) {
    return;
  }
  installed = true;

  injectShim();

  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('focusout', handleFocusOut, true);
}
