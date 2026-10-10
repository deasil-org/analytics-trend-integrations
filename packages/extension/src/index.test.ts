import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventBatch } from "@analyticstrend/event-schema";
import { EXTENSION_SDK_VERSION } from "./version.ts";
import {
  DELIVERY_DELAY_MS,
  MAX_DELIVERY_DELAY_MS,
  createExtensionStorage,
  createTransport,
  enableUninstallTracking,
  getBrowserApi,
  getOrCreateAnonymousId,
  initBackground,
  trackFromContentScript,
} from "./index.ts";

// This package has no @types/node dependency (it ships inside customers'
// extensions and stays dependency-light), so the one Node global this test
// file needs is typed narrowly here rather than by pulling in full Node
// typings just for a test.
type NodeProcessLike = {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};
const nodeProcess = (globalThis as Record<string, unknown>).process as unknown as NodeProcessLike;

type FakeApi = ReturnType<typeof fakeBrowserApi>;

function fakeBrowserApi() {
  const store: Record<string, unknown> = {};
  return {
    store,
    runtime: { setUninstallURL: vi.fn(), sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
    storage: {
      local: {
        async get(key: string) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
        async remove(keys: string | string[]) {
          for (const key of [keys].flat()) delete store[key];
        },
      },
    },
  };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).browser;
  delete (globalThis as Record<string, unknown>).chrome;
  vi.unstubAllGlobals();
});

describe("getBrowserApi", () => {
  it("prefers Firefox's browser namespace", () => {
    const firefox = fakeBrowserApi();
    (globalThis as Record<string, unknown>).browser = firefox;
    (globalThis as Record<string, unknown>).chrome = fakeBrowserApi();

    expect(getBrowserApi()).toBe(firefox);
  });

  it("falls back to Chromium's chrome namespace", () => {
    const chromium = fakeBrowserApi();
    (globalThis as Record<string, unknown>).chrome = chromium;

    expect(getBrowserApi()).toBe(chromium);
  });

  it("throws a clear error when neither namespace exists", () => {
    expect(() => getBrowserApi()).toThrow(/extension context/i);
  });
});

describe("createExtensionStorage", () => {
  it("round-trips the queue through storage.local", async () => {
    const api = fakeBrowserApi() as unknown as FakeApi;
    const storage = createExtensionStorage(api as never);

    expect(await storage.read()).toEqual([]);

    await storage.write([{ name: "popup_opened", ts: "2026-09-09T12:00:00.000Z" }]);
    expect(await storage.read()).toEqual([
      { name: "popup_opened", ts: "2026-09-09T12:00:00.000Z" },
    ]);
  });

  it("survives a background teardown — a fresh adapter reads the persisted queue", async () => {
    const api = fakeBrowserApi() as unknown as FakeApi;
    await createExtensionStorage(api as never).write([
      { name: "session_saved", ts: "2026-09-09T12:00:00.000Z" },
    ]);

    // Simulates the service worker (or Firefox event page) being torn down and
    // restarted: brand new adapter instance, same underlying storage.
    const revived = createExtensionStorage(api as never);
    expect(await revived.read()).toHaveLength(1);
  });
});

describe("getOrCreateAnonymousId", () => {
  it("generates an id once and reuses it afterwards", async () => {
    const api = fakeBrowserApi() as unknown as FakeApi;

    const first = await getOrCreateAnonymousId(api as never);
    const second = await getOrCreateAnonymousId(api as never);

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });
});

// --- Additions beyond the plan's six tests (ordered deviation 4) ---

describe("createTransport", () => {
  const BATCH: EventBatch = {
    writeKey: "wk_test",
    client: "extension",
    clientVersion: "0.2.0",
    anonymousId: "11111111-2222-3333-4444-555555555555",
    events: [],
  };

  // Literal expectations, not expressions recomputed from `status`: a table
  // that derived `ok` from the same condition the stub used would pin only
  // `retryable`, and an implementation that always returned ok: true would
  // sail through it.
  it.each([
    [200, true, false],
    [400, false, false],
    [429, false, true],
    [500, false, true],
    [408, false, true],
  ])("classifies HTTP %i as ok=%s retryable=%s", async (status, ok, retryable) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status }));

    const transport = createTransport("https://collect.example.test");
    const result = await transport.send(BATCH);

    expect(result).toEqual({ ok, retryable, status });
  });

  it("treats a rejected fetch as retryable and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const transport = createTransport("https://collect.example.test");

    await expect(transport.send(BATCH)).resolves.toEqual({ ok: false, retryable: true });
  });

  it("asks for keepalive only when the caller says it is unloading", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTransport("https://collect.example.test");

    await transport.send(BATCH);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: false });

    await transport.send(BATCH, { unloading: true });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ keepalive: true });
  });

  it("posts to the collector with the wire fields intact", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await createTransport("https://collect.example.test").send(BATCH);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://collect.example.test/v1/collect");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(BATCH);
  });
});

describe("enableUninstallTracking", () => {
  it("percent-encodes the write key and anonymous id into the uninstall URL", () => {
    const api = fakeBrowserApi();
    (globalThis as Record<string, unknown>).chrome = api;

    enableUninstallTracking({
      writeKey: "wk test/needs+encoding",
      anonymousId: "anon id&value=1",
      endpoint: "https://collect.example.test",
    });

    expect(api.runtime.setUninstallURL).toHaveBeenCalledWith(
      "https://collect.example.test/v1/uninstall?k=wk%20test%2Fneeds%2Bencoding&u=anon%20id%26value%3D1",
    );
  });
});

describe("trackFromContentScript", () => {
  it("does not throw or leave an unhandled rejection when the background isn't listening", async () => {
    // Deliberately NOT a vi.fn(): vitest's own mock instrumentation tracks a
    // mock's settled result by attaching its own .then/.catch to whatever
    // promise it returns, which would quietly "handle" the rejection before
    // our implementation ever gets a chance to — defeating the very thing
    // this test needs to observe. A plain function with a hand-rolled call
    // log gives an honest, uninstrumented rejected promise.
    const calls: unknown[] = [];
    function sendMessage(message: unknown) {
      calls.push(message);
      return Promise.reject(new Error("Could not establish connection"));
    }
    const api = {
      ...fakeBrowserApi(),
      runtime: { setUninstallURL: vi.fn(), sendMessage, onMessage: { addListener: vi.fn() } },
    };
    (globalThis as Record<string, unknown>).chrome = api;

    const onUnhandledRejection = vi.fn();
    nodeProcess.on("unhandledRejection", onUnhandledRejection);

    try {
      expect(() => trackFromContentScript("popup_opened", { foo: "bar" })).not.toThrow();

      // Let the rejected promise's microtask queue drain so a swallowed
      // rejection has had its chance to surface as unhandled.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onUnhandledRejection).not.toHaveBeenCalled();
      expect(calls).toEqual([{ type: "analyticstrend:track", name: "popup_opened", props: { foo: "bar" } }]);
    } finally {
      nodeProcess.off("unhandledRejection", onUnhandledRejection);
    }
  });
});

// The two extension lifecycles are similar enough to invite a single lazy test
// and different enough that one passing says little about the other. So every
// initBackground test below runs twice, once against each namespace, and only
// ever with that namespace installed. Installing both would let getBrowserApi's
// `browser ?? chrome` fallback carry the test and say nothing about the branch
// it never took — which is exactly that lazy test.
const NAMESPACES = ["browser", "chrome"] as const;

function installApi(namespace: (typeof NAMESPACES)[number]) {
  const api = fakeBrowserApi();
  (globalThis as Record<string, unknown>)[namespace] = api;
  return api;
}

describe.each(NAMESPACES)("initBackground on the %s namespace", (namespace) => {
  // Reaches the listener the way a content script does, through the
  // addListener callback initBackground registered.
  function messageListener(api: ReturnType<typeof fakeBrowserApi>) {
    const listener = api.runtime.onMessage.addListener.mock.calls[0]?.[0] as (
      message: unknown,
    ) => void;
    if (!listener) throw new Error("initBackground registered no message listener");
    return listener;
  }

  // Everything the listener starts is fire-and-forget through promises that
  // settle as microtasks, so one macrotask boundary drains the whole cascade.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  describe("content-script messages", () => {
    it("queues a content-script message through the background client", async () => {
      const api = installApi(namespace);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const client = await initBackground({ writeKey: "wk_test" });
      messageListener(api)({ type: "analyticstrend:track", name: "popup_opened", props: { a: 1 } });
      await settle();
      await client.flush();

      const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
      expect(body.events).toEqual([
        { id: expect.any(String), name: "popup_opened", ts: expect.any(String), props: { a: 1 } },
      ]);
    });

    // The listener used to call flush() after every single track. flush() is
    // deliberately exempt from the watermark cooldown — platform SDKs call it
    // when they know something worth trying has changed — so that turned a
    // busy page into one request per event with no backoff while the collector
    // was down. The watermark is what this caller wants: it fires once, fails,
    // and then holds off.
    it("does not send one request per message while the collector is failing", async () => {
      const api = installApi(namespace);
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal("fetch", fetchMock);

      await initBackground({ writeKey: "wk_test" });
      const listener = messageListener(api);

      const BURST = 120;
      for (let index = 0; index < BURST; index += 1) {
        listener({ type: "analyticstrend:track", name: "popup_opened" });
      }
      await settle();

      expect(fetchMock.mock.calls.length).toBeLessThan(BURST);
      // One attempt: the watermark fires at 50 queued events, the 500 is
      // retryable, and the cooldown suppresses every later automatic retry.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("background teardown", () => {
    // Goes through initBackground itself rather than the storage adapter. The
    // adapter round-tripping a queue proves storage works; it proves nothing
    // about whether a fresh background start actually rehydrates that queue
    // and ships it, which is the behaviour an MV3 service worker suspension
    // and a Firefox event page unload both depend on.
    it("a second instance flushes what the first one left queued", async () => {
      const api = installApi(namespace);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const first = await initBackground({ writeKey: "wk_test" });
      await first.track("session_saved");

      // Nothing sent yet: one event is far below the flush watermark, and the
      // startup flush already ran against an empty queue.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(api.store["analyticstrend.queue"]).toHaveLength(1);

      // The background context is torn down without warning — no unload hook,
      // no chance to drain. A brand new instance comes up against the same
      // underlying storage, exactly as the browser would restart it. Its
      // startup flush is not awaited by initBackground, so the explicit flush
      // here is what waits for it: the two are serialized, and the second
      // finds the queue already empty.
      await initBackground({ writeKey: "wk_test" }).flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(body.events.map((event: { name: string }) => event.name)).toEqual(["session_saved"]);
      expect(api.store["analyticstrend.queue"]).toEqual([]);
    });

    // The same rehydration has to cover identity, or every teardown would
    // silently fork the user into a new anonymous id and destroy retention.
    it("a second instance keeps the first one's anonymous id", async () => {
      const api = installApi(namespace);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const first = await initBackground({ writeKey: "wk_test" });
      await first.track("popup_opened");
      await first.flush();

      const second = await initBackground({ writeKey: "wk_test" });
      await second.track("popup_opened");
      await second.flush();

      const ids = fetchMock.mock.calls.map(
        (call) => JSON.parse(String(call[1]?.body)).anonymousId as string,
      );
      expect(ids).toHaveLength(2);
      expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
      expect(ids[1]).toBe(ids[0]);
      expect(api.store["analyticstrend.anonymousId"]).toBe(ids[0]);
    });
  });

  describe("Global Privacy Control", () => {
    const ANON = "analyticstrend.anonymousId";
    const QUEUE = "analyticstrend.queue";

    function sending() {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("drops events, creates no identifier and clears the uninstall URL", async () => {
      const api = installApi(namespace);
      vi.stubGlobal("navigator", { globalPrivacyControl: true });
      const fetchMock = sending();

      const client = initBackground({ writeKey: "wk_test", uninstallTracking: true });
      await client.track("popup_opened");
      await client.flush();
      await settle();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(api.store[ANON]).toBeUndefined();
      expect(api.runtime.setUninstallURL).toHaveBeenCalledWith("");
      expect(api.runtime.setUninstallURL).not.toHaveBeenCalledWith(expect.stringContaining("/v1/uninstall"));
      expect(await client.enabled()).toBe(false);
    });

    it("stops at the next event when the signal appears mid-session", async () => {
      const api = installApi(namespace);
      const browserNavigator = { globalPrivacyControl: false };
      vi.stubGlobal("navigator", browserNavigator);
      const fetchMock = sending();

      const client = initBackground({ writeKey: "wk_test" });
      await client.track("before_signal");
      await client.flush();
      const sent = fetchMock.mock.calls.length;
      expect(sent).toBeGreaterThan(0);

      browserNavigator.globalPrivacyControl = true;
      await client.track("after_signal");
      await client.flush();

      expect(fetchMock.mock.calls.length).toBe(sent);
      expect(JSON.stringify(api.store[QUEUE] ?? [])).not.toContain("after_signal");
    });

    it("keeps an earlier identifier and queue, unsent, by default", async () => {
      const api = installApi(namespace);
      api.store[ANON] = "earlier-id";
      api.store[QUEUE] = [{ name: "popup_opened", ts: new Date().toISOString() }];
      vi.stubGlobal("navigator", { globalPrivacyControl: true });
      const fetchMock = sending();

      await initBackground({ writeKey: "wk_test" }).flush();
      await settle();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(api.store[ANON]).toBe("earlier-id");
      expect(api.store[QUEUE]).toHaveLength(1);
    });

    it("deletes them when asked to", async () => {
      const api = installApi(namespace);
      api.store[ANON] = "earlier-id";
      api.store[QUEUE] = [{ name: "popup_opened", ts: new Date().toISOString() }];
      vi.stubGlobal("navigator", { globalPrivacyControl: true });
      sending();

      await initBackground({ writeKey: "wk_test", clearDataOnGlobalPrivacyControl: true }).flush();
      await settle();

      expect(api.store).not.toHaveProperty(ANON);
      expect(api.store).not.toHaveProperty(QUEUE);
    });

    it("clears the uninstall URL the moment the signal appears, and restores it when it goes", async () => {
      // The URL carries the identifier. Left registered, uninstalling after
      // the signal appeared would still send it.
      const api = installApi(namespace);
      const browserNavigator = { globalPrivacyControl: false };
      vi.stubGlobal("navigator", browserNavigator);
      sending();

      const client = initBackground({ writeKey: "wk_test", uninstallTracking: true });
      await client.flush();
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));

      browserNavigator.globalPrivacyControl = true;
      await client.track("while_signalled");
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith("");

      browserNavigator.globalPrivacyControl = false;
      await client.track("after_signal");
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));
    });

    it("clears the uninstall URL the moment Firefox's consent is withdrawn", async () => {
      const api = installApi(namespace);
      let granted = ["technicalAndInteraction"];
      let consentChanged: (() => void) | undefined;
      Object.assign(api.runtime, {
        getManifest: () => ({
          browser_specific_settings: {
            gecko: { data_collection_permissions: { optional: ["technicalAndInteraction"] } },
          },
        }),
      });
      Object.assign(api, {
        permissions: {
          getAll: async () => ({ data_collection: granted }),
          onAdded: { addListener: () => {} },
          onRemoved: {
            addListener: (listener: () => void) => {
              consentChanged = listener;
            },
          },
        },
      });
      vi.stubGlobal("navigator", {});
      sending();

      const client = initBackground({ writeKey: "wk_test", uninstallTracking: true });
      await client.flush();
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));

      granted = [];
      consentChanged?.();
      await settle();

      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith("");
    });

    it("counts the browser anyway, and clears nothing, when told not to respect it", async () => {
      const api = installApi(namespace);
      api.store[ANON] = "earlier-id";
      vi.stubGlobal("navigator", { globalPrivacyControl: true });
      const fetchMock = sending();

      const client = initBackground({
        writeKey: "wk_test",
        respectGlobalPrivacyControl: false,
        clearDataOnGlobalPrivacyControl: true,
      });
      await client.track("popup_opened");
      await client.flush();

      expect(fetchMock).toHaveBeenCalled();
      expect(api.store[ANON]).toBe("earlier-id");
      expect(await client.enabled()).toBe(true);
    });
  });

  describe("the extension's own consent switch", () => {
    const ANON = "analyticstrend.anonymousId";
    const QUEUE = "analyticstrend.queue";

    function sending() {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("sends and stores nothing, and creates no identifier, while the switch is off", async () => {
      const api = installApi(namespace);
      const fetchMock = sending();

      const client = initBackground({ writeKey: "wk_test", uninstallTracking: true, consent: () => false });
      await client.track("popup_opened");
      await client.flush();
      await settle();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(api.store[ANON]).toBeUndefined();
      expect(api.store[QUEUE]).toBeUndefined();
      expect(api.runtime.setUninstallURL).toHaveBeenCalledWith("");
      expect(api.runtime.setUninstallURL).not.toHaveBeenCalledWith(expect.stringContaining("/v1/uninstall"));
      expect(await client.enabled()).toBe(false);
    });

    it("counts a switch that throws or rejects as off", async () => {
      installApi(namespace);
      const fetchMock = sending();

      const throwing = initBackground({
        writeKey: "wk_test",
        consent: () => {
          throw new Error("storage unavailable");
        },
      });
      const rejecting = initBackground({
        writeKey: "wk_test",
        consent: () => Promise.reject(new Error("storage unavailable")),
      });
      await throwing.track("popup_opened");
      await rejecting.track("popup_opened");
      await throwing.flush();
      await rejecting.flush();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(await throwing.enabled()).toBe(false);
      expect(await rejecting.enabled()).toBe(false);
    });

    // Review Focus 4: a hook that forgot its return statement.
    it("counts any answer other than true as off", async () => {
      installApi(namespace);
      const fetchMock = sending();

      const client = initBackground({ writeKey: "wk_test", consent: () => undefined as unknown as boolean });
      await client.track("popup_opened");
      await client.flush();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("asks again at every event, so turning it on needs no restart", async () => {
      installApi(namespace);
      const fetchMock = sending();
      let on = false;

      const client = initBackground({ writeKey: "wk_test", consent: async () => on });
      await client.track("while_off");
      on = true;
      await client.track("while_on");
      await client.flush();

      const sent = JSON.stringify(fetchMock.mock.calls);
      expect(sent).toContain("while_on");
      expect(sent).not.toContain("while_off");
    });

    it("clears the uninstall link when the switch turns off, and restores it when it turns on", async () => {
      const api = installApi(namespace);
      sending();
      let on = true;

      const client = initBackground({ writeKey: "wk_test", uninstallTracking: true, consent: () => on });
      await client.flush();
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));

      on = false;
      client.consentChanged();
      await settle();
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith("");

      on = true;
      client.consentChanged();
      await settle();
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));
    });

    it("registers the uninstall link only once an identifier exists", async () => {
      const api = installApi(namespace);
      sending();
      let on = false;

      const client = initBackground({ writeKey: "wk_test", uninstallTracking: true, consent: () => on });
      await client.flush();
      await settle();

      on = true;
      client.consentChanged();
      await settle();
      expect(api.runtime.setUninstallURL).not.toHaveBeenCalledWith(expect.stringContaining("/v1/uninstall"));

      await client.track("popup_opened");
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));
    });

    it("sends nothing when it re-checks the switch", async () => {
      installApi(namespace);
      const fetchMock = sending();

      const client = initBackground({ writeKey: "wk_test", uninstallTracking: true, consent: () => true });
      await client.flush();
      const before = fetchMock.mock.calls.length;
      client.consentChanged();
      await settle();

      expect(fetchMock.mock.calls.length).toBe(before);
    });

    // Review Focus 5: Firefox's permission listener must not undo the switch.
    it("keeps the uninstall link cleared when Firefox's consent is granted while the switch is off", async () => {
      const api = installApi(namespace);
      let granted = ["technicalAndInteraction"];
      let permissionAdded: (() => void) | undefined;
      Object.assign(api.runtime, {
        getManifest: () => ({
          browser_specific_settings: {
            gecko: { data_collection_permissions: { optional: ["technicalAndInteraction"] } },
          },
        }),
      });
      Object.assign(api, {
        permissions: {
          getAll: async () => ({ data_collection: granted }),
          onAdded: {
            addListener: (listener: () => void) => {
              permissionAdded = listener;
            },
          },
          onRemoved: { addListener: () => {} },
        },
      });
      vi.stubGlobal("navigator", {});
      sending();
      let on = true;

      const client = initBackground({ writeKey: "wk_test", uninstallTracking: true, consent: () => on });
      await client.flush();
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith(expect.stringContaining("/v1/uninstall"));

      on = false;
      client.consentChanged();
      await settle();
      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith("");

      granted = ["technicalAndInteraction"];
      permissionAdded?.();
      await settle();

      expect(api.runtime.setUninstallURL).toHaveBeenLastCalledWith("");
    });
  });

  describe("uninstall tracking", () => {
    it("registers an uninstall URL on every start when uninstallTracking is enabled", async () => {
      const api = installApi(namespace);

      // Registration waits on the anonymous id, which is read from storage;
      // flush resolves after that read, so it is the point to assert at.
      await initBackground({ writeKey: "wk_test", uninstallTracking: true }).flush();

      expect(api.runtime.setUninstallURL).toHaveBeenCalledTimes(1);
    });

    it("does not register an uninstall URL when uninstallTracking is left unset", async () => {
      const api = installApi(namespace);

      await initBackground({ writeKey: "wk_test" }).flush();

      expect(api.runtime.setUninstallURL).not.toHaveBeenCalled();
    });
  });

  // The three behaviours below were found by loading the example extension into
  // real Chromium, not by reasoning about it. Each test names what the browser
  // did when the behaviour was wrong.
  describe("what real browsers require", () => {
    // Chrome will not run a service worker that uses top-level await: the
    // extension installed, and its background never executed. A client that
    // arrives synchronously is what lets integrators write the start-up call
    // without one.
    it("returns the client synchronously, not a promise", () => {
      installApi(namespace);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

      const client = initBackground({ writeKey: "wk_test" });

      expect(client).not.toBeInstanceOf(Promise);
      expect(typeof client.track).toBe("function");
    });

    // When a content script's message wakes a suspended worker, the browser
    // dispatches it as soon as the script's first turn ends. The listener used
    // to be attached after awaiting storage, and in Chromium two of three page
    // visits never arrived.
    it("attaches the message listener before anything is awaited", () => {
      const api = installApi(namespace);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

      initBackground({ writeKey: "wk_test" });

      expect(api.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    });

    it("keeps a message that arrives before storage is ready", async () => {
      const api = installApi(namespace);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const client = initBackground({ writeKey: "wk_test" });
      // Synchronously, in the same turn: before the anonymous id read resolves.
      messageListener(api)({ type: "analyticstrend:track", name: "page_visited" });
      await settle();
      await client.flush();

      const sent = fetchMock.mock.calls.flatMap(
        (call) => JSON.parse(String(call[1]?.body)).events as { name: string }[],
      );
      expect(sent.map((event) => event.name)).toEqual(["page_visited"]);
    });

    // Below the 50-event watermark the only send used to be the next background
    // start. The first event from a fresh install reached the collector 46
    // seconds later, and only because the test page happened to reload.
    describe("scheduled delivery", () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it("sends a lone event shortly after it is tracked", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        installApi(namespace);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal("fetch", fetchMock);

        const client = initBackground({ writeKey: "wk_test" });
        await client.track("popup_opened");
        expect(fetchMock).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS);

        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it("lands inside the window before an idle worker is suspended", () => {
        // Chrome suspends an idle extension service worker after about 30
        // seconds. A delay past that would schedule a send that never runs.
        expect(DELIVERY_DELAY_MS).toBeLessThan(30_000);
      });

      it("does not let a steady stream of events postpone the send forever", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        installApi(namespace);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal("fetch", fetchMock);

        const client = initBackground({ writeKey: "wk_test" });
        await client.track("tick");
        for (let second = 1; second < DELIVERY_DELAY_MS / 1000; second += 1) {
          await vi.advanceTimersByTimeAsync(1000);
          await client.track("tick");
        }
        await vi.advanceTimersByTimeAsync(1000);

        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it("backs off while the collector is failing, up to a ceiling", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        installApi(namespace);
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
        vi.stubGlobal("fetch", fetchMock);

        const client = initBackground({ writeKey: "wk_test" });

        // Each attempt fails, so each wait before the next should double. A
        // track after every attempt keeps a send scheduled, the way a busy
        // extension would.
        const gaps: number[] = [];
        let elapsed = 0;
        let attempts = fetchMock.mock.calls.length;
        await client.track("tick");

        while (gaps.length < 8) {
          await vi.advanceTimersByTimeAsync(1000);
          elapsed += 1000;
          if (fetchMock.mock.calls.length > attempts) {
            attempts = fetchMock.mock.calls.length;
            gaps.push(elapsed);
            elapsed = 0;
            await client.track("tick");
          }
        }

        expect(gaps.slice(0, 4)).toEqual([
          DELIVERY_DELAY_MS,
          DELIVERY_DELAY_MS * 2,
          DELIVERY_DELAY_MS * 4,
          DELIVERY_DELAY_MS * 8,
        ]);
        expect(Math.max(...gaps)).toBeLessThanOrEqual(MAX_DELIVERY_DELAY_MS);
      });

      it("returns to the short delay once a send succeeds", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        installApi(namespace);
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
        vi.stubGlobal("fetch", fetchMock);

        const client = initBackground({ writeKey: "wk_test" });
        await client.track("tick");
        await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS); // fails
        fetchMock.mockResolvedValue({ ok: true, status: 200 });
        await client.track("tick");
        await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS * 2); // succeeds

        const callsAfterRecovery = fetchMock.mock.calls.length;
        await client.track("tick");
        await vi.advanceTimersByTimeAsync(DELIVERY_DELAY_MS);

        expect(fetchMock.mock.calls.length).toBe(callsAfterRecovery + 1);
      });
    });
  });

  // Pins the wire fields the collector keys on. Without this, `client` could
  // be changed to any other ClientKind and every other test here would stay
  // green while every event landed under the wrong platform.
  it("ships events under the extension client kind", async () => {
    installApi(namespace);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = await initBackground({ writeKey: "wk_test", appVersion: "1.2.3" });
    await client.track("popup_opened");
    await client.flush();

    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(body).toMatchObject({
      writeKey: "wk_test",
      client: "extension",
      clientVersion: EXTENSION_SDK_VERSION,
      appVersion: "1.2.3",
    });
    expect(body.anonymousId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
