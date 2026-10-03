import { DELIVERY_DELAY_MS } from "@analyticstrend/extension";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBrowser, type FakeBrowser } from "./fake-browser.ts";

let browser: FakeBrowser;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  browser = createFakeBrowser();
  // WXT's module decides it is in the background by finding a service worker,
  // or a window that is the extension's background page. This is the second.
  vi.stubGlobal("window", globalThis);
  Object.assign(browser, { extension: { getBackgroundPage: () => globalThis } });
  // @wxt-dev/browser reads the global once, when it is first imported.
  (globalThis as Record<string, unknown>).chrome = browser;
  vi.stubGlobal("location", { href: "chrome-extension://test-extension/background.js" });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).chrome;
});

async function startWithRealModule() {
  const { createAnalytics } = await import("@wxt-dev/analytics");
  const { analyticsTrend } = await import("../src/index.ts");
  return createAnalytics({ providers: [analyticsTrend({ writeKey: "wk_test", uninstallTracking: true })] });
}

describe("with WXT's real analytics module", () => {
  it("follows the module's own switch when the config names none", async () => {
    const analytics = await startWithRealModule();

    await analytics.track("before_enabled");
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);
    expect(fetchMock).not.toHaveBeenCalled();

    await analytics.setEnabled(true);
    await analytics.track("after_enabled");
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);

    const sent = JSON.stringify(fetchMock.mock.calls);
    expect(sent).toContain("after_enabled");
    expect(sent).not.toContain("before_enabled");
    expect(browser.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));
  });

  it("drops what the module adds to every event", async () => {
    const analytics = await startWithRealModule();
    await analytics.setEnabled(true);
    await analytics.identify("person@example.com", { plan: "premium-plan" });
    await analytics.track("popup_opened", { source: "toolbar" });
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);

    const sent = JSON.stringify(fetchMock.mock.calls);
    expect(sent).toContain("popup_opened");
    expect(sent).toContain("toolbar");
    for (const value of ["person@example.com", "premium-plan", "linux", "x86-64", "background.js", "wxtBrowser"]) {
      expect(sent).not.toContain(value);
    }
  });
});
