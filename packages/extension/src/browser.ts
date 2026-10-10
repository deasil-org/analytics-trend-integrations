// Firefox exposes the promise-based `browser` namespace; Chromium exposes
// `chrome`. The shapes and promise behaviour this type declares — storage.local
// get/set, runtime.sendMessage, runtime.onMessage — are the same on both in
// MV3, so a namespace shim is enough here; no polyfill dependency is imposed
// on the customer's extension. This does NOT mean every method on this type
// behaves identically across browsers: setUninstallURL in particular does
// not — Chrome persists a previously-set uninstall URL across service-worker
// restarts, Firefox does not, and callers must account for that (see
// initBackground's `uninstallTracking` option and enableUninstallTracking's
// doc comment in index.ts).
export type BrowserApi = {
  runtime: {
    setUninstallURL?: (url: string) => void | Promise<void>;
    // Firefox 140+ and Chrome both provide this. Read for one thing only:
    // whether this extension declares Mozilla's optional data-collection
    // permission, which decides whether consent has to be checked at all.
    getManifest?: () => unknown;
    sendMessage: (message: unknown) => void | Promise<unknown>;
    onMessage: { addListener: (listener: (message: unknown) => void) => void };
  };
  // Firefox's data-collection consent, absent on Chrome and on Firefox before
  // 140. Optional throughout, because an SDK that required it would fail to
  // start on every browser that does not have it.
  permissions?: {
    getAll?: () => Promise<{ data_collection?: string[] }>;
    onAdded?: { addListener: (listener: () => void) => void };
    onRemoved?: { addListener: (listener: () => void) => void };
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      // Both browsers have it; optional here only so older test doubles and
      // polyfills without it still satisfy the type.
      remove?(keys: string | string[]): Promise<void>;
    };
  };
};

export function getBrowserApi(): BrowserApi {
  const candidate =
    (globalThis as Record<string, unknown>).browser ??
    (globalThis as Record<string, unknown>).chrome;

  if (!candidate) {
    throw new Error(
      "AnalyticsTrend: no extension context found. " +
        "getBrowserApi() must run inside a browser extension (background, popup, or content script).",
    );
  }

  return candidate as BrowserApi;
}
