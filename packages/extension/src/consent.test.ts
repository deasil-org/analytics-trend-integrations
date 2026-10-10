import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserApi } from "./browser.ts";
import { hasDataConsent, hasLocationConsent } from "./consent.ts";
import { initBackground } from "./index.ts";

// Firefox 140 and later let someone decline analytics during installation and
// change their mind afterwards, and Mozilla's framework is consent and
// disclosure only: the browser records the choice and leaves honouring it to
// the extension. Every test here is about honouring it.

// `location` is Firefox's separate locationInfo toggle: not offered unless a
// test says so, which is every extension built before it existed.
type ConsentOptions = {
  declares?: boolean;
  granted?: boolean;
  model?: boolean;
  location?: "undeclared" | "granted" | "declined";
};

function fakeApi({ declares = true, granted = true, model = true, location = "undeclared" }: ConsentOptions = {}) {
  const store: Record<string, unknown> = {};
  const listeners: (() => void)[] = [];
  let currentlyGranted = granted;
  let locationGranted = location === "granted";
  const optional = [
    ...(declares ? ["technicalAndInteraction"] : []),
    ...(location === "undeclared" ? [] : ["locationInfo"]),
  ];

  const api = {
    store,
    grant(value: boolean) {
      currentlyGranted = value;
      for (const listener of listeners) listener();
    },
    grantLocation(value: boolean) {
      locationGranted = value;
      for (const listener of listeners) listener();
    },
    runtime: {
      setUninstallURL: vi.fn(),
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
      getManifest: () =>
        optional.length > 0
          ? { browser_specific_settings: { gecko: { data_collection_permissions: { optional } } } }
          : { browser_specific_settings: { gecko: {} } },
    },
    permissions: model
      ? {
          getAll: async () => ({
            permissions: ["storage"],
            data_collection: [
              ...(currentlyGranted ? ["technicalAndInteraction"] : []),
              ...(locationGranted ? ["locationInfo"] : []),
            ],
          }),
          onAdded: { addListener: (listener: () => void) => void listeners.push(listener) },
          onRemoved: { addListener: (listener: () => void) => void listeners.push(listener) },
        }
      : undefined,
    storage: {
      local: {
        async get(key: string) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
      },
    },
  };

  return api;
}

function install(options?: ConsentOptions) {
  const api = fakeApi(options);
  (globalThis as Record<string, unknown>).browser = api;
  return api;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).browser;
  vi.unstubAllGlobals();
});

describe("hasDataConsent", () => {
  it("is granted when the person left the toggle on", async () => {
    expect(await hasDataConsent(install() as unknown as BrowserApi)).toBe(true);
  });

  it("is refused when the person turned the toggle off", async () => {
    expect(await hasDataConsent(install({ granted: false }) as unknown as BrowserApi)).toBe(false);
  });

  it("is granted when the extension never asked for the permission", async () => {
    // Every Chrome extension, and any Firefox extension not using Mozilla's
    // framework. Gating on a toggle nobody was offered would stop those
    // extensions sending anything at all.
    const api = install({ declares: false, granted: false });

    expect(await hasDataConsent(api as unknown as BrowserApi)).toBe(true);
  });

  it("is granted where the browser has no data-collection permissions", async () => {
    // Chrome, and Firefox before 140. The manifest key is inert there, so a
    // declared permission can never be answered.
    const api = install({ model: false });

    expect(await hasDataConsent(api as unknown as BrowserApi)).toBe(true);
  });
});

describe("initBackground with data-collection consent", () => {
  it("sends nothing when consent was refused", async () => {
    install({ granted: false });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = initBackground({ writeKey: "wk_test" });
    await client.track("popup_opened");
    await client.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores nothing when consent was refused, rather than queueing for later", async () => {
    // Queueing would write the events of someone who said no into extension
    // storage and send them the moment they changed their mind.
    const api = install({ granted: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const client = initBackground({ writeKey: "wk_test" });
    await client.track("popup_opened");

    expect(api.store["analyticstrend.queue"]).toBeUndefined();
  });

  it("sends normally when consent was given", async () => {
    install();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = initBackground({ writeKey: "wk_test" });
    await client.track("popup_opened");
    await client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts sending when consent is granted later, without a restart", async () => {
    // The toggle lives in the add-on's settings, so it can be turned back on
    // hours into a background's life.
    const api = install({ granted: false });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = initBackground({ writeKey: "wk_test" });
    await client.track("popup_opened");
    expect(fetchMock).not.toHaveBeenCalled();

    api.grant(true);
    await client.track("popup_opened");
    await client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops sending when consent is withdrawn", async () => {
    const api = install();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = initBackground({ writeKey: "wk_test" });
    await client.track("popup_opened");
    await client.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    api.grant(false);
    await client.track("session_saved");
    await client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("hasLocationConsent", () => {
  // Firefox's locationInfo toggle, separate from analytics: someone can allow
  // their product use to be counted without a country or region.
  it("is granted when the person left location on", async () => {
    expect(await hasLocationConsent(install({ location: "granted" }) as unknown as BrowserApi)).toBe(true);
  });

  it("is refused when the person turned location off", async () => {
    expect(await hasLocationConsent(install({ location: "declined" }) as unknown as BrowserApi)).toBe(false);
  });

  it("is granted when the extension never offered the toggle", async () => {
    expect(await hasLocationConsent(install() as unknown as BrowserApi)).toBe(true);
  });

  it("is granted where the browser has no data-collection permissions", async () => {
    expect(await hasLocationConsent(install({ location: "declined", model: false }) as unknown as BrowserApi)).toBe(true);
  });
});

describe("initBackground with location declined", () => {
  function sentBodies(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
    return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
  }

  it("still sends, with every batch saying location: false", async () => {
    install({ location: "declined" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = initBackground({ writeKey: "wk_test" });
    await client.track("popup_opened");
    await client.flush();

    expect(sentBodies(fetchMock).map((body) => body.location)).toEqual([false]);
  });

  it("adds no location field when location is allowed", async () => {
    install({ location: "granted" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = initBackground({ writeKey: "wk_test" });
    await client.track("popup_opened");
    await client.flush();

    expect("location" in sentBodies(fetchMock)[0]!).toBe(false);
  });

  it("follows a change of mind at the next send, without a restart", async () => {
    const api = install({ location: "declined" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = initBackground({ writeKey: "wk_test" });
    await client.track("popup_opened");
    await client.flush();
    api.grantLocation(true);
    await client.track("popup_opened");
    await client.flush();

    const [first, second] = sentBodies(fetchMock);
    expect(first?.location).toBe(false);
    expect("location" in second!).toBe(false);
  });

  it("writes l=0 into the uninstall link while location is declined, and takes it out when allowed", async () => {
    const api = install({ location: "declined" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const client = initBackground({ writeKey: "wk_test", uninstallTracking: true });
    await client.flush();
    await vi.waitFor(() => expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("&l=0")));

    api.grantLocation(true);
    await vi.waitFor(() =>
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.not.stringContaining("l=0")),
    );
    expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));
  });
});
