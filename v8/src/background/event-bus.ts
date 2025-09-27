// Placeholder event bus to be fleshed out in follow-up commits.
export type EventPayload = Record<string, unknown>;

export type EventListener = (payload: EventPayload) => void;

const listeners = new Map<string, Set<EventListener>>();

export function subscribe(event: string, listener: EventListener) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(listener);
}

export function publish(event: string, payload: EventPayload) {
  const target = listeners.get(event);
  target?.forEach((listener) => listener(payload));
}
