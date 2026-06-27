import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * Global AuthKit client-subpath mock.
 *
 * `@workos-inc/authkit-nextjs/components` (useAuth, AuthKitProvider) is a
 * client-only entry whose real module transitively imports `next/cache`, which
 * only resolves inside the Next runtime. Many server-component pages import
 * `PembatasanAkses`, which now renders the client `TombolMasuk` (login needs
 * the client `refreshAuth` hook). Rather than mock the subpath in every
 * affected page test, stub it once here. Per-file `vi.mock` of the same
 * specifier still takes precedence where a test needs richer behaviour.
 */
vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ user: null, loading: false, refreshAuth: () => {} }),
  AuthKitProvider: ({ children }: { children: unknown }) => children,
}));

/**
 * jsdom 29 + vitest 4 does not always wire `window.localStorage`. Provide a
 * minimal in-memory polyfill so client components using localStorage (e.g.
 * Tur Awal) remain testable. Shape matches the Web Storage spec surface that
 * our code touches.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof window !== "undefined" && !window.localStorage) {
  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
if (typeof window !== "undefined" && !window.sessionStorage) {
  Object.defineProperty(window, "sessionStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
