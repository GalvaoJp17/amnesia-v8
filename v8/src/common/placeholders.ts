// Placeholder map utilities for placeholder tokens.
export class PlaceholderStore {
  private store = new Map<string, string>();

  set(token: string, value: string) {
    this.store.set(token, value);
  }

  get(token: string) {
    return this.store.get(token);
  }

  clear() {
    this.store.clear();
  }
}
