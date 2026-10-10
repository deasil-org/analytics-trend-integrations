import { describe, expect, it, vi } from "vitest";
import { watchNavigation, type NavigationWindow } from "./navigation.ts";

// Page views on in-app navigation: a single-page app
// changes the address with the History API, and only a new path is a new page.

function fakeWindow(start = "/") {
  const listeners = new Map<string, () => void>();
  const location = { pathname: start, href: `https://shop.example${start}` };
  const go = (url: string | URL | null | undefined) => {
    if (url === null || url === undefined) return;
    const next = new URL(String(url), location.href);
    location.pathname = next.pathname;
    location.href = next.href;
  };
  const pushState = vi.fn((_state: unknown, _title: string, url?: string | URL | null) => go(url));
  const replaceState = vi.fn((_state: unknown, _title: string, url?: string | URL | null) => go(url));
  const win = {
    location,
    history: { pushState, replaceState },
    addEventListener: (type: string, listener: () => void) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
  } as unknown as NavigationWindow;
  return { win, listeners, go, pushState, replaceState };
}

describe("watchNavigation", () => {
  it("reports a push to a new path, and still performs the push", () => {
    const { win, pushState } = fakeWindow();
    const onPath = vi.fn();
    watchNavigation(onPath, win);

    win.history.pushState({}, "", "/pricing");

    expect(pushState).toHaveBeenCalledOnce();
    expect(win.location.pathname).toBe("/pricing");
    expect(onPath).toHaveBeenCalledExactlyOnceWith("/pricing");
  });

  it("ignores the same path again, and a change to the query or hash alone", () => {
    const { win } = fakeWindow("/search");
    const onPath = vi.fn();
    watchNavigation(onPath, win);

    win.history.pushState({}, "", "/search");
    win.history.pushState({}, "", "/search?q=soup");
    win.history.replaceState({}, "", "/search?q=soup#results");

    expect(onPath).not.toHaveBeenCalled();
  });

  it("stays quiet when a router replaces the starting address with itself", () => {
    const { win } = fakeWindow("/");
    const onPath = vi.fn();
    watchNavigation(onPath, win);

    win.history.replaceState({ key: "x" }, "");
    win.history.replaceState({ key: "y" }, "", "/");

    expect(onPath).not.toHaveBeenCalled();
  });

  it("reports a replace to a new path", () => {
    const { win } = fakeWindow("/");
    const onPath = vi.fn();
    watchNavigation(onPath, win);
    win.history.replaceState({}, "", "/welcome");
    expect(onPath).toHaveBeenCalledExactlyOnceWith("/welcome");
  });

  it("reports going back with the browser's buttons", () => {
    const { win, listeners, go } = fakeWindow("/");
    const onPath = vi.fn();
    watchNavigation(onPath, win);
    win.history.pushState({}, "", "/a");

    go("/");
    listeners.get("popstate")?.();

    expect(onPath.mock.calls).toEqual([["/a"], ["/"]]);
  });

  it("puts everything back when stopped", () => {
    const { win, listeners, pushState, replaceState } = fakeWindow();
    const onPath = vi.fn();
    const stop = watchNavigation(onPath, win);

    stop();
    win.history.pushState({}, "", "/after");

    expect(win.history.pushState).toBe(pushState);
    expect(win.history.replaceState).toBe(replaceState);
    expect(listeners.has("popstate")).toBe(false);
    expect(onPath).not.toHaveBeenCalled();
  });
});
