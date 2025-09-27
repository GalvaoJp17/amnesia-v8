// Placeholder map utilities for placeholder tokens.
export class PlaceholderStore {
  private store = new Map<string, string>();

  set(token: string, value: string) {
    this.store.set(token, value);
  }

  get(token: string) {
    return this.store.get(token);
  }

  has(token: string) {
    return this.store.has(token);
  }

  setMany(entries: Iterable<[string, string]>) {
    for (const [token, value] of entries) {
      this.store.set(token, value);
    }
  }

  entries() {
    return Array.from(this.store.entries());
  }

  clear() {
    this.store.clear();
  }
}
