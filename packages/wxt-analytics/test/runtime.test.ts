import { DELIVERY_DELAY_MS } from "@analyticstrend/extension";
import type { AnalyticsConfig } from "@wxt-dev/analytics/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsTrend } from "../src/index.ts";
import { createFakeBrowser, type FakeBrowser } from "./fake-browser.ts";

const SWITCH = "local:analytics-enabled";
const event = (name: string) => ({
  meta: {
    sessionId: undefined,
    timestamp: 0,
    screen: undefined,
    referrer: undefined,
    language: undefined,
    url: undefined,
    title: undefined,
  },
  user: { id: "u", properties: {} },
  event: { name },
});

let browser: FakeBrowser;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  browser = createFakeBrowser({ version: "1.2.3", version_name: "1.2.3 beta" });
  (globalThis as Record<string, unknown>).chrome = browser;
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).chrome;
});

const switchItem = { getValue: async () => browser.store[SWITCH] === true };
const settle = () => vi.advanceTimersByTimeAsync(0);
const uninstallCalls = () => browser.runtime.setUninstallURL.mock.calls.map(([url]) => url as string);

function start(
  config: Partial<AnalyticsConfig> = {},
  options: Partial<Parameters<typeof analyticsTrend>[0]> = {},
) {
  return analyticsTrend({ writeKey: "wk_test", uninstallTracking: true, ...options })({} as never, {
    providers: [],
    enabled: switchItem,
    ...config,
  });
}

describe("WXT's switch", () => {
  it("sends nothing and sets no uninstall link while it is off", async () => {
    const p = start();
    await p.track(event("popup_opened"));
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(uninstallCalls().some((url) => url.includes("/v1/uninstall"))).toBe(false);
  });

  it("brings collection and the uninstall link back when turned on, and clears the link when turned off", async () => {
    const p = start();
    await settle();

    await browser.storage.local.set({ [SWITCH]: true });
    await settle();
    await p.track(event("popup_opened"));
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);
    expect(fetchMock).toHaveBeenCalled();
    expect(uninstallCalls().at(-1)).toContain("/v1/uninstall");

    await browser.storage.local.set({ [SWITCH]: false });
    await settle();
    expect(uninstallCalls().at(-1)).toBe("");
  });

  it("re-checks only when the switch's value changes", async () => {
    browser.store[SWITCH] = true;
    const p = start();
    await p.track(event("first"));
    await settle();
    const before = uninstallCalls().length;

    // The SDK's own queue writes reach storage.onChanged too.
    await p.track(event("second"));
    await p.track(event("third"));
    await browser.storage.local.set({ unrelated: 1 });
    await settle();

    expect(uninstallCalls().length).toBe(before);
  });

  // Review Focus 1.
  it.each([
    [
      "throws",
      {
        getValue: () => {
          throw new Error("storage unavailable");
        },
      },
    ],
    ["has no value", { getValue: () => null as unknown as boolean }],
  ])("counts a switch that %s as off", async (_, enabled) => {
    const p = start({ enabled });
    await p.track(event("popup_opened"));
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("settings passed through", () => {
  const batches = () =>
    fetchMock.mock.calls.map(([url, init]) => ({
      url: url as string,
      body: JSON.parse((init as { body: string }).body) as { appVersion?: string },
    }));

  it("uses WXT's version setting", async () => {
    browser.store[SWITCH] = true;
    await start({ version: "9.9.9" }).track(event("a"));
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);
    expect(batches()[0]?.body.appVersion).toBe("9.9.9");
  });

  it("falls back to the manifest's version_name", async () => {
    browser.store[SWITCH] = true;
    await start().track(event("a"));
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);
    expect(batches()[0]?.body.appVersion).toBe("1.2.3 beta");
  });

  it("sends to the endpoint it is given", async () => {
    browser.store[SWITCH] = true;
    await start({}, { endpoint: "https://collect.example.test" }).track(event("a"));
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);
    expect(batches()[0]?.url).toBe("https://collect.example.test/v1/collect");
  });

  it("logs delivery problems to the console only with WXT's debug on", async () => {
    browser.store[SWITCH] = true;
    fetchMock.mockRejectedValue(new Error("offline"));
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    await start().track(event("quiet"));
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);
    expect(debug).not.toHaveBeenCalled();

    await start({ debug: true }).track(event("loud"));
    await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS * 4);
    expect(debug).toHaveBeenCalled();
    debug.mockRestore();
  });
});
