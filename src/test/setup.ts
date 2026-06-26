import "@testing-library/jest-dom/vitest";

/**
 * Fake localStorage polyfill for the jsdom unit project. jsdom 29 only exposes
 * `window.localStorage` when a per-origin URL is configured; vitest's default
 * jsdom env has none, so `window.localStorage` is undefined. The Mode Offline
 * (#21) store + sync + page tests need a working `Storage`, so we install a
 * deterministic Map-backed implementation before any test module loads.
 *
 * Reset between tests is the caller's responsibility (the offline tests clear
 * it in their beforeEach). The polyfill itself is installed once here.
 */
if (typeof window !== "undefined" && window.localStorage == null) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}
