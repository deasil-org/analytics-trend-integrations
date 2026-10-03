import { DELIVERY_DELAY_MS } from "@analyticstrend/extension";
import type { AnalyticsConfig, AnalyticsTrackEvent } from "@wxt-dev/analytics/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsTrend, extensionPagePath, trackProperties } from "../src/index.ts";
import { createFakeBrowser } from "./fake-browser.ts";

const META = {
  sessionId: 1,
  timestamp: 0,
  screen: "1920x1080",
  referrer: "https://referrer.example/",
  language: "en-CA",
  url: "https://example.com/private?q=secret",
  title: "A private page",
};
const USER = {
  id: "wxt-user-id",
  properties: { email: "person@example.com", os: "mac", browserVersion: "141.0.1" },
};

const trackEvent = (name: string, properties?: Record<string, string | undefined>): AnalyticsTrackEvent => ({
  meta: META,
  user: USER,
  event: { name, properties },
});
const pageEvent = (url: string) => ({ meta: META, user: USER, page: { url, title: "Title", location: undefined } });

function provider() {
  const config: AnalyticsConfig = { providers: [], enabled: { getValue: () => true } };
  return analyticsTrend({ writeKey: "wk_test" })({} as never, config);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as Record<string, unknown>).chrome = createFakeBrowser();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).chrome;
});

async function sent() {
  await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS + 1);
  return fetchMock.mock.calls.flatMap(
    ([, init]) =>
      (JSON.parse((init as { body: string }).body) as { events: { name: string; props?: Record<string, unknown> }[] })
        .events,
  );
}

describe("what reaches AnalyticsTrend", () => {
  it("sends a tracked event's name and properties", async () => {
    await provider().track(trackEvent("popup_opened", { source: "toolbar" }));
    expect((await sent()).map(({ name, props }) => ({ name, props }))).toEqual([
      { name: "popup_opened", props: { source: "toolbar" } },
    ]);
  });

  it("never sends WXT's metadata or its user", async () => {
    const p = provider();
    await p.track(trackEvent("popup_opened"));
    await p.page(pageEvent("https://example.com/private?q=secret"));
    await sent();
    const bodies = JSON.stringify(fetchMock.mock.calls);
    for (const value of [
      "en-CA",
      "1920x1080",
      "referrer.example",
      "A private page",
      "q=secret",
      "wxt-user-id",
      "person@example.com",
      "141.0.1",
    ]) {
      expect(bodies).not.toContain(value);
    }
  });

  it("keeps an auto-tracked click's tag, id and class, and drops its text and link", async () => {
    await provider().track(
      trackEvent("click", {
        tagName: "a",
        id: "buy",
        className: "btn",
        textContent: "Buy now",
        href: "https://shop.example/item?id=1",
      }),
    );
    expect((await sent())[0]?.props).toEqual({ tagName: "a", id: "buy", className: "btn" });
  });

  // Review Focus 3.
  it("keeps text and link properties on the extension's own events", () => {
    expect(trackProperties({ name: "link_copied", properties: { href: "kept", textContent: "kept" } })).toEqual({
      href: "kept",
      textContent: "kept",
    });
  });

  it("leaves out undefined properties", () => {
    expect(trackProperties({ name: "x", properties: { a: undefined, b: "1" } })).toEqual({ b: "1" });
  });

  it("sends page_viewed with the path of the extension's own page", async () => {
    const p = provider();
    await p.page(pageEvent("chrome-extension://abcdef/popup.html?tab=2#settings"));
    await p.page(pageEvent("moz-extension://1234-5678/options.html"));
    expect((await sent()).map(({ name, props }) => ({ name, props }))).toEqual([
      { name: "page_viewed", props: { path: "/popup.html" } },
      { name: "page_viewed", props: { path: "/options.html" } },
    ]);
  });

  it("sends page_viewed with no path for a website page", async () => {
    await provider().page(pageEvent("https://example.com/a?b=c"));
    const [event] = await sent();
    expect(event?.name).toBe("page_viewed");
    expect(event?.props ?? {}).toEqual({});
  });

  // Review Focus 2.
  it.each(["", "popup.html", "not a url"])("gives no path for %j, and does not throw", (url) => {
    expect(extensionPagePath(url)).toBeUndefined();
  });

  it("does nothing with identify", async () => {
    await provider().identify({ meta: META, user: USER });
    expect(await sent()).toEqual([]);
  });
});
