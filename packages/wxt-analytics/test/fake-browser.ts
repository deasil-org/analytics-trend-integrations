import { vi } from "vitest";

// Just enough of an extension's browser object for the SDK and for WXT's
// analytics module: storage that reports its changes, a manifest, and the
// runtime calls both make at start-up.
export function createFakeBrowser(manifest: Record<string, unknown> = { version: "1.2.3" }) {
  const store: Record<string, unknown> = {};
  const changeListeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];
  return {
    store,
    runtime: {
      id: "test-extension",
      getManifest: () => manifest,
      getPlatformInfo: async () => ({ os: "linux", arch: "x86-64" }),
      setUninstallURL: vi.fn(),
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onConnect: { addListener: vi.fn() },
    },
    storage: {
      local: {
        async get(key: string) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
          for (const listener of changeListeners) listener(items, "local");
        },
        async remove(keys: string | string[]) {
          for (const key of [keys].flat()) delete store[key];
        },
      },
      onChanged: {
        addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => {
          changeListeners.push(listener);
        },
      },
    },
  };
}

export type FakeBrowser = ReturnType<typeof createFakeBrowser>;
