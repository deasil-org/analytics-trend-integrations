import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebClient } from "./index.ts";
import { startFromScript } from "./script.ts";

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
    });
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
});
