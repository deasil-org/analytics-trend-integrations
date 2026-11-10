import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebClient } from "./index.ts";
import { startFromScript, type ScriptConfig } from "./script.ts";

// The script tag reads everything from its own data attributes and hands it
// to init. init itself is covered by index.test.ts; what needs pinning here is
// how each attribute reaches it, and what the tag does on its own.

function tag(data: Record<string, string>): HTMLScriptElement {
  return { dataset: data } as unknown as HTMLScriptElement;
}

function fakeStart() {
  const track = vi.fn().mockResolvedValue(undefined);
  const client = { track } as unknown as WebClient;
  const start = vi.fn().mockReturnValue(client);
  return { start, track, client };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startFromScript", () => {
  it("starts with the write key, exposes the client, and counts every page by default", () => {
    // Page views on in-app navigation: init sends the
    // first one and one per new path, so the tag sends none of its own.
    const { start, track, client } = fakeStart();
    const win = {} as Window;

    const started = startFromScript(tag({ writeKey: "wk_123" }), win, start);

    expect(start).toHaveBeenCalledWith({ writeKey: "wk_123", pageViews: "history" });
    expect(started).toBe(client);
    expect(win.analyticstrend).toBe(client);
    expect(track).not.toHaveBeenCalled();
  });

  it("counts one page view per load when asked to, as 0.4 did", () => {
    const { start, track } = fakeStart();
    startFromScript(tag({ writeKey: "wk_123", pageViews: "load" }), {} as Window, start);
    expect(start).toHaveBeenCalledWith({ writeKey: "wk_123" });
    expect(track).toHaveBeenCalledExactlyOnceWith("page_view");
  });

  it("turns on each link option with its own attribute, and none otherwise", () => {
    const { start } = fakeStart();
    startFromScript(
      tag({ writeKey: "wk_123", outboundLinks: "true", fileDownloads: "true", contactLinks: "true" }),
      {} as Window,
      start,
    );
    expect(start).toHaveBeenLastCalledWith({
      writeKey: "wk_123",
      pageViews: "history",
      outboundLinks: true,
      fileDownloads: true,
      contactLinks: true,
    });

    startFromScript(tag({ writeKey: "wk_123", outboundLinks: "yes" }), {} as Window, start);
    expect(start).toHaveBeenLastCalledWith({ writeKey: "wk_123", pageViews: "history" });
  });

  it("turns on form submissions with their own attribute, and only with \"true\"", () => {
    const { start } = fakeStart();
    startFromScript(tag({ writeKey: "wk_123", formSubmissions: "true" }), {} as Window, start);
    expect(start).toHaveBeenLastCalledWith({ writeKey: "wk_123", pageViews: "history", formSubmissions: true });

    startFromScript(tag({ writeKey: "wk_123", formSubmissions: "1" }), {} as Window, start);
    expect(start).toHaveBeenLastCalledWith({ writeKey: "wk_123", pageViews: "history" });
  });

  it("sends no page view when told not to", () => {
    const { start, track } = fakeStart();
    startFromScript(tag({ writeKey: "wk_123", pageViews: "false" }), {} as Window, start);
    expect(start).toHaveBeenCalledWith({ writeKey: "wk_123" });
    expect(track).not.toHaveBeenCalled();
  });

  it("passes every option attribute through to init", () => {
    const { start } = fakeStart();

    startFromScript(
      tag({
        writeKey: "wk_123",
        endpoint: "https://stats.example/v1/collect",
        autoCapture: "false",
        respectGpc: "false",
        clearOnGpc: "true",
        countAutomated: "true",
      }),
      {} as Window,
      start,
    );

    expect(start).toHaveBeenCalledWith({
      writeKey: "wk_123",
      pageViews: "history",
      endpoint: "https://stats.example/v1/collect",
      autoCapture: false,
      respectGlobalPrivacyControl: false,
      clearDataOnGlobalPrivacyControl: true,
      countAutomatedBrowsers: true,
    });
  });

  it("counts automated browsers only with data-count-automated=\"true\"", () => {
    const { start } = fakeStart();
    startFromScript(tag({ writeKey: "wk_123", countAutomated: "1" }), {} as Window, start);
    expect(start).toHaveBeenLastCalledWith({ writeKey: "wk_123", pageViews: "history" });
  });

  it("turns the engagement signal off with data-engagement=\"false\", and leaves it on otherwise", () => {
    const off = fakeStart();
    startFromScript(tag({ writeKey: "wk_123", engagement: "false" }), {} as Window, off.start);
    expect(off.start.mock.calls[0]?.[0]).toMatchObject({ engagement: false });

    const on = fakeStart();
    startFromScript(tag({ writeKey: "wk_123" }), {} as Window, on.start);
    expect(on.start.mock.calls[0]?.[0]).not.toHaveProperty("engagement");
  });

  it("warns once and starts nothing without a write key", () => {
    const { start } = fakeStart();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const win = {} as Window;

    expect(startFromScript(tag({}), win, start)).toBeUndefined();

    expect(start).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("AnalyticsTrend: data-write-key is missing");
    expect(win.analyticstrend).toBeUndefined();
  });

  // document.currentScript is null for a module script, or one run after the
  // page has parsed. There is nothing to read, and throwing on someone's page
  // would be worse than doing nothing.
  it("does nothing, and does not throw, without a script element", () => {
    const { start } = fakeStart();
    expect(startFromScript(null, {} as Window, start)).toBeUndefined();
    expect(start).not.toHaveBeenCalled();
  });

  // The GTM template can't set data attributes on the tag it injects, so it
  // sets a page global first. Anyone else may do the same.
  it("takes its options from analyticstrendConfig when the tag has none", () => {
    const { start } = fakeStart();
    const win = { analyticstrendConfig: { writeKey: "wk_1", outboundLinks: "true" } } as unknown as Window;
    startFromScript(tag({}), win, start);
    expect(start).toHaveBeenCalledWith({ writeKey: "wk_1", pageViews: "history", outboundLinks: true });
  });

  // Typed rather than cast, so a key the type does not list fails to compile.
  it("counts automated browsers from the config's countAutomated", () => {
    const { start } = fakeStart();
    const analyticstrendConfig: ScriptConfig = { writeKey: "wk_1", countAutomated: "true" };
    startFromScript(tag({}), { analyticstrendConfig } as Window, start);
    expect(start).toHaveBeenCalledWith({ writeKey: "wk_1", pageViews: "history", countAutomatedBrowsers: true });
  });

  it("lets the tag's attributes win over the config, key by key", () => {
    const { start } = fakeStart();
    const win = { analyticstrendConfig: { writeKey: "wk_1", fileDownloads: "true" } } as unknown as Window;
    startFromScript(tag({ writeKey: "wk_2" }), win, start);
    expect(start).toHaveBeenCalledWith({ writeKey: "wk_2", pageViews: "history", fileDownloads: true });
  });

  it("starts from the config when there is no current script", () => {
    const { start, client } = fakeStart();
    const win = { analyticstrendConfig: { writeKey: "wk_1" } } as unknown as Window;
    expect(startFromScript(null, win, start)).toBe(client);
    expect(start).toHaveBeenCalledWith({ writeKey: "wk_1", pageViews: "history" });

    const none = fakeStart();
    expect(startFromScript(null, {} as Window, none.start)).toBeUndefined();
  });

  it("sends what was queued before it loaded, once each", () => {
    const { start, track } = fakeStart();
    const win = {
      analyticstrendQueue: [["signup", { plan: "pro" }], ["download"]],
    } as unknown as Window;
    startFromScript(tag({ writeKey: "wk_1" }), win, start);
    expect(track.mock.calls).toEqual([
      ["signup", { plan: "pro" }],
      ["download", undefined],
    ]);
  });

  it("sends a push after start at once, and keeps the queue an array", () => {
    const { start, track } = fakeStart();
    const win = { analyticstrendQueue: [] } as unknown as Window;
    startFromScript(tag({ writeKey: "wk_1" }), win, start);
    win.analyticstrendQueue!.push(["later"]);
    expect(track).toHaveBeenCalledExactlyOnceWith("later", undefined);
    expect(Array.isArray(win.analyticstrendQueue)).toBe(true);
  });

  it("creates the queue when none was there, so a later push is sent", () => {
    const { start, track } = fakeStart();
    const win = {} as Window;
    startFromScript(tag({ writeKey: "wk_1" }), win, start);
    win.analyticstrendQueue!.push(["later", { a: 1 }]);
    expect(track).toHaveBeenCalledExactlyOnceWith("later", { a: 1 });
  });

  // A site with the tag by hand that then installs a plugin has two copies on
  // the page. Two clients with one key would count every page twice.
  it("starts nothing when the page already has a client with the same key", () => {
    const first = fakeStart();
    const win = {} as Window;
    startFromScript(tag({ writeKey: "wk_1" }), win, first.start);

    const second = fakeStart();
    win.analyticstrendConfig = { writeKey: "wk_1" };
    expect(startFromScript(tag({}), win, second.start)).toBe(first.client);
    expect(second.start).not.toHaveBeenCalled();
    expect(win.analyticstrend).toBe(first.client);
  });

  it("does not send a queued event twice when a second copy loads", () => {
    const first = fakeStart();
    const win = { analyticstrendQueue: [["signup"]] } as unknown as Window;
    startFromScript(tag({ writeKey: "wk_1" }), win, first.start);
    const second = fakeStart();
    startFromScript(tag({ writeKey: "wk_1" }), win, second.start);
    expect(first.track).toHaveBeenCalledOnce();
    expect(second.track).not.toHaveBeenCalled();
  });
});
