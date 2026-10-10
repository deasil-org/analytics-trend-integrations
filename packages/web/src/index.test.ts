import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventBatch } from "@analyticstrend/event-schema";
import { WEB_SDK_VERSION } from "./version.ts";
import {
  createLocalStorageAdapter,
  createTransport,
  getOrCreateWebAnonymousId,
  init,
  safeLocalStorage,
} from "./index.ts";

type StorageFaults = {
  getItem?: () => never;
  setItem?: () => never;
};

// A minimal in-memory stand-in for Window.localStorage. `faults` lets a test
// reproduce the ways a real browser's Storage misbehaves without being absent:
// Safari private browsing throws from setItem once its tiny quota is gone, and
// a browser with site data blocked throws from getItem as well.
function fakeStorage(faults: StorageFaults = {}): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (faults.getItem ? faults.getItem() : (map.get(key) ?? null)),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) =>
      faults.setItem ? faults.setItem() : void map.set(key, value),
  } as Storage;
}

function quotaExceeded(): never {
  throw new Error("QuotaExceededError: the quota has been exceeded");
}

function storageDisabled(): never {
  throw new Error("SecurityError: the operation is insecure");
}

// Chrome inside a third-party-blocked iframe, and Firefox with site data
// blocked, throw from the *property access* itself — no method on the Storage
// object is ever reached. vi.stubGlobal can only install a value, so this
// installs a throwing getter directly; afterEach removes it.
// The returned counter reports how many times the property was read, which is
// the only way to observe how often the SDK resolved the page's storage: on
// the memory-fallback path two resolutions produce two stores that cannot see
// each other's writes, and nothing else about that is visible from outside.
function stubThrowingLocalStorageProperty(): { reads: () => number } {
  let reads = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      reads += 1;
      return storageDisabled();
    },
  });
  return { reads: () => reads };
}

function bodyBytes(batch: EventBatch): number {
  return new TextEncoder().encode(JSON.stringify(batch)).length;
}

// Lets a fire-and-forget promise — init's startup flush, a listener's flush —
// settle before a test looks at what it did.
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).localStorage;
});

const WRITE_KEY = "wk_test";

describe("createLocalStorageAdapter", () => {
  it("round-trips the queue", async () => {
    const adapter = createLocalStorageAdapter(fakeStorage(), WRITE_KEY);

    expect(await adapter.read()).toEqual([]);

    await adapter.write([{ name: "page_view", ts: "2026-09-09T12:00:00.000Z" }]);
    expect(await adapter.read()).toEqual([{ name: "page_view", ts: "2026-09-09T12:00:00.000Z" }]);
  });

  it("returns an empty queue when the stored value is corrupt", async () => {
    const storage = fakeStorage();
    storage.setItem(`analyticstrend.queue.${WRITE_KEY}`, "{not json");

    expect(await createLocalStorageAdapter(storage, WRITE_KEY).read()).toEqual([]);
  });

  it("returns an empty queue when reading throws", async () => {
    const adapter = createLocalStorageAdapter(fakeStorage({ getItem: storageDisabled }), WRITE_KEY);

    await expect(adapter.read()).resolves.toEqual([]);
  });

  it("swallows a quota-exceeded write rather than rejecting", async () => {
    const adapter = createLocalStorageAdapter(fakeStorage({ setItem: quotaExceeded }), WRITE_KEY);

    await expect(
      adapter.write([{ name: "page_view", ts: "2026-09-09T12:00:00.000Z" }]),
    ).resolves.toBeUndefined();
  });

  // Two kits on one page — a tag manager plus a hardcoded snippet, or two of
  // our own products — share one localStorage. An unnamespaced key means one
  // client reads the other's queue and ships it under its own write key.
  it("keeps two write keys' queues apart in one storage", async () => {
    const storage = fakeStorage();
    const first = createLocalStorageAdapter(storage, "wk_first");
    const second = createLocalStorageAdapter(storage, "wk_second");

    await first.write([{ name: "first_event", ts: "2026-09-09T12:00:00.000Z" }]);

    expect(await second.read()).toEqual([]);
    expect(await first.read()).toEqual([{ name: "first_event", ts: "2026-09-09T12:00:00.000Z" }]);
  });
});

describe("safeLocalStorage", () => {
  it("returns the real storage when it is usable", () => {
    const real = fakeStorage();
    vi.stubGlobal("localStorage", real);

    expect(safeLocalStorage()).toBe(real);
  });

  it("falls back to memory when the localStorage property itself throws", async () => {
    stubThrowingLocalStorageProperty();

    const adapter = createLocalStorageAdapter(safeLocalStorage(), WRITE_KEY);

    await adapter.write([{ name: "page_view", ts: "2026-09-09T12:00:00.000Z" }]);
    expect(await adapter.read()).toHaveLength(1);
  });

  it("falls back to memory when the storage object exists but cannot be used", async () => {
    vi.stubGlobal("localStorage", fakeStorage({ getItem: storageDisabled }));

    const adapter = createLocalStorageAdapter(safeLocalStorage(), WRITE_KEY);

    await adapter.write([{ name: "page_view", ts: "2026-09-09T12:00:00.000Z" }]);
    expect(await adapter.read()).toHaveLength(1);
  });
});

describe("getOrCreateWebAnonymousId", () => {
  it("generates once and reuses afterwards", () => {
    const storage = fakeStorage();

    const first = getOrCreateWebAnonymousId(storage);
    expect(getOrCreateWebAnonymousId(storage)).toBe(first);
  });

  it("still returns an id when persisting it throws", () => {
    const storage = fakeStorage({ setItem: quotaExceeded });

    expect(() => getOrCreateWebAnonymousId(storage)).not.toThrow();
    expect(getOrCreateWebAnonymousId(storage)).toMatch(/\S/);
  });

  it("still returns an id when reading throws", () => {
    const storage = fakeStorage({ getItem: storageDisabled });

    expect(() => getOrCreateWebAnonymousId(storage)).not.toThrow();
    expect(getOrCreateWebAnonymousId(storage)).toMatch(/\S/);
  });

  it("falls back to a non-crypto id when randomUUID is unavailable", () => {
    // An insecure context — a plain http:// staging server or intranet app —
    // exposes `crypto` without `randomUUID`.
    vi.stubGlobal("crypto", {});
    const storage = fakeStorage();

    const first = getOrCreateWebAnonymousId(storage);
    expect(first).toMatch(/\S/);
    expect(getOrCreateWebAnonymousId(storage)).toBe(first);
  });

  it("does not collide across many fallback generations", () => {
    vi.stubGlobal("crypto", {});

    const ids = new Set(
      Array.from({ length: 1000 }, () => getOrCreateWebAnonymousId(fakeStorage())),
    );

    expect(ids.size).toBe(1000);
  });
});

describe("createTransport", () => {
  const BATCH: EventBatch = {
    writeKey: WRITE_KEY,
    client: "web",
    clientVersion: "0.1.1",
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

    const result = await createTransport("https://collect.example.test").send(BATCH);

    expect(result).toEqual({ ok, retryable, status });
  });

  it("treats a rejected fetch as retryable and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(createTransport("https://collect.example.test").send(BATCH)).resolves.toEqual({
      ok: false,
      retryable: true,
    });
  });

  it("posts to the collector with the wire fields intact", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await createTransport("https://collect.example.test").send(BATCH);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://collect.example.test/v1/collect");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(BATCH);
  });

  // The body must be built once and both measured and transmitted, not built
  // twice. The wasted work is the least of it: two serializations can diverge,
  // leaving the size gate deciding about a string the request never sends.
  // The call count is what actually pins this — two JSON.stringify calls on
  // the same batch produce equal strings, so comparing them proves nothing.
  it("serializes the body exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const stringify = vi.spyOn(JSON, "stringify");

    try {
      await createTransport("https://collect.example.test").send(BATCH, { unloading: true });

      expect(stringify).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(stringify.mock.results[0]?.value);
    } finally {
      stringify.mockRestore();
    }
  });

  describe("keepalive", () => {
    function batchOfSize(eventCount: number, propBytes: number): EventBatch {
      return {
        ...BATCH,
        events: Array.from({ length: eventCount }, (_, index) => ({
          name: "page_view",
          ts: "2026-09-09T12:00:00.000Z",
          props: { index, blob: "x".repeat(propBytes) },
        })),
      };
    }

    // ASCII, so one character is one byte and the total lands exactly on the
    // requested size.
    function batchOfBodyBytes(bytes: number): EventBatch {
      const withBlob = (blob: string): EventBatch => ({
        ...BATCH,
        events: [{ name: "page_view", ts: "2026-09-09T12:00:00.000Z", props: { blob } }],
      });
      return withBlob("x".repeat(bytes - bodyBytes(withBlob(""))));
    }

    it("is off for an ordinary flush", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      await createTransport("https://collect.example.test").send(BATCH);

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: false });
    });

    it("is on for an unloading flush that fits under the cap", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      await createTransport("https://collect.example.test").send(batchOfSize(100, 150), {
        unloading: true,
      });

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
    });

    // The browser rejects an oversized keepalive request deterministically and
    // before sending, so asking for it would fail on every retry with the same
    // body — wedging the queue. Dropping it risks cancellation by the unload,
    // which fails retryably and keeps the events for the next startup flush.
    it("is dropped when an unloading batch would exceed the cap", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const batch = batchOfSize(100, 700);
      expect(new TextEncoder().encode(JSON.stringify(batch)).length).toBeGreaterThan(60 * 1024);

      await createTransport("https://collect.example.test").send(batch, { unloading: true });

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: false });
    });

    // Straddles the threshold by a single byte, in both directions. Every
    // other fixture here sits far enough from the boundary that the
    // comparison could flip to `<`, or the limit widen to the browsers' full
    // 64 KiB, and nothing would notice.
    it.each([
      [60 * 1024, true],
      [60 * 1024 + 1, false],
    ])("at exactly %i bytes an unloading send sets keepalive=%s", async (bytes, expected) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);
      const batch = batchOfBodyBytes(bytes);
      // Guards the fixture itself: an off-by-one here would quietly move the
      // boundary this test claims to be standing on.
      expect(bodyBytes(batch)).toBe(bytes);

      await createTransport("https://collect.example.test").send(batch, { unloading: true });

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: expected });
    });

    // The browser's cap is on encoded bytes. A body measured in characters
    // reads up to three times under its true size, so a non-Latin payload
    // would be handed to keepalive while over the cap — the exact wedge the
    // gate exists to prevent, hitting only customers with non-ASCII content.
    it("measures encoded bytes rather than characters", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);
      const batch: EventBatch = {
        ...BATCH,
        events: [
          {
            name: "page_view",
            ts: "2026-09-09T12:00:00.000Z",
            // Three UTF-8 bytes per character.
            props: { title: "漢".repeat(25_000) },
          },
        ],
      };
      // A character count says this comfortably fits; the truth is that it
      // does not.
      expect(JSON.stringify(batch).length).toBeLessThan(60 * 1024);
      expect(bodyBytes(batch)).toBeGreaterThan(60 * 1024);

      await createTransport("https://collect.example.test").send(batch, { unloading: true });

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: false });
    });

    // The oversized batch must still be *sent*, and a failure must still be
    // retryable: classifying it as permanent would discard events an ordinary
    // flush could deliver without trouble.
    it("still sends an oversized batch, and a failure stays retryable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

      const result = await createTransport("https://collect.example.test").send(
        batchOfSize(100, 700),
        { unloading: true },
      );

      expect(result).toEqual({ ok: false, retryable: true, status: 503 });
    });
  });
});

describe("init", () => {
  function stubPage(storage: Storage, page: { href?: string; referrer?: string } = {}) {
    const listeners = new Map<string, () => void>();
    const href = page.href ?? "https://shop.example/";
    // referrer and location are read by auto-capture, which runs inside init.
    // The node test environment supplies neither, so they are stubbed here
    // rather than in each test.
    const doc = { visibilityState: "hidden", referrer: page.referrer ?? "" };
    vi.stubGlobal("location", { href, origin: new URL(href).origin });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("addEventListener", (type: string, listener: () => void) => {
      listeners.set(type, listener);
    });
    vi.stubGlobal("fetch", fetchMock);
    return { listeners, doc, fetchMock };
  }

  it("returns a working client and registers both unload flush triggers", async () => {
    const { listeners } = stubPage(fakeStorage());

    const client = init({ writeKey: WRITE_KEY });

    expect([...listeners.keys()].sort()).toEqual(["pagehide", "visibilitychange"]);
    await expect(client.track("page_view")).resolves.toBeUndefined();
    await expect(client.flush()).resolves.toBeUndefined();
  });

  // Asserting only the set of registered names would let both handler bodies
  // be gutted to no-ops. Invoking them and watching fetch is what pins them.
  it("flushes when pagehide fires, as an unloading send", async () => {
    const { listeners, fetchMock } = stubPage(fakeStorage());

    const client = init({ writeKey: WRITE_KEY });
    await settle();
    await client.track("page_view");
    fetchMock.mockClear();

    listeners.get("pagehide")?.();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
  });

  it("flushes when the tab becomes hidden, as an unloading send", async () => {
    const { listeners, fetchMock } = stubPage(fakeStorage());

    const client = init({ writeKey: WRITE_KEY });
    await settle();
    await client.track("page_view");
    fetchMock.mockClear();

    listeners.get("visibilitychange")?.();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
  });

  // visibilitychange fires on the way back to visible too. Without the guard
  // every tab return would flush — wasteful rather than wrong, and exactly the
  // kind of thing that silently stops being true.
  it("does not flush when the tab becomes visible", async () => {
    const { listeners, doc, fetchMock } = stubPage(fakeStorage());

    const client = init({ writeKey: WRITE_KEY });
    await settle();
    await client.track("page_view");
    fetchMock.mockClear();
    doc.visibilityState = "visible";

    listeners.get("visibilitychange")?.();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Without a startup flush, a queue left behind by an unload flush that could
  // not use keepalive waits for the next tab hide — which takes the same
  // unloading path and fails the same way. This is the recovery trigger.
  it("flushes a queue left over from a previous page load", async () => {
    const storage = fakeStorage();
    storage.setItem(
      `analyticstrend.queue.${WRITE_KEY}`,
      JSON.stringify([{ name: "page_view", ts: "2026-09-09T12:00:00.000Z" }]),
    );
    const { fetchMock } = stubPage(storage);

    init({ writeKey: WRITE_KEY });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Ordinary conditions: no time pressure, so no keepalive and no size cap.
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: false });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).events).toHaveLength(1);
  });

  // Page views on in-app navigation. The History API is
  // stubbed as navigation.test.ts stubs it: a push moves the address.
  function stubHistory() {
    const go = (url?: string | URL | null) => {
      if (url === null || url === undefined) return;
      const next = new URL(String(url), location.href);
      vi.stubGlobal("location", { href: next.href, origin: next.origin, pathname: next.pathname });
    };
    const history = {
      pushState: (_state: unknown, _title: string, url?: string | URL | null) => go(url),
      replaceState: (_state: unknown, _title: string, url?: string | URL | null) => go(url),
    };
    vi.stubGlobal("history", history);
    return history;
  }

  async function sentNames(listeners: Map<string, () => void>, fetchMock: ReturnType<typeof vi.fn>) {
    fetchMock.mockClear();
    listeners.get("pagehide")?.();
    await settle();
    return fetchMock.mock.calls.flatMap((call) =>
      (JSON.parse(String(call[1]?.body)).events as { name: string; props?: Record<string, unknown> }[]).map(
        (event) => `${event.name} ${String(event.props?.$path)}`,
      ),
    );
  }

  it("counts the first page and each new path when asked to", async () => {
    const { listeners, fetchMock } = stubPage(fakeStorage());
    vi.stubGlobal("location", { href: "https://shop.example/", origin: "https://shop.example", pathname: "/" });
    const history = stubHistory();

    init({ writeKey: WRITE_KEY, pageViews: "history" });
    await settle();
    history.pushState({}, "", "/pricing");
    history.pushState({}, "", "/pricing?plan=pro");

    expect(await sentNames(listeners, fetchMock)).toEqual(["page_view /", "page_view /pricing"]);
  });

  it("sends a page once when the site also counts it itself, as 0.4's guide told it to", async () => {
    const { listeners, fetchMock } = stubPage(fakeStorage());
    vi.stubGlobal("location", { href: "https://shop.example/", origin: "https://shop.example", pathname: "/" });
    const history = stubHistory();

    const client = init({ writeKey: WRITE_KEY, pageViews: "history" });
    await settle();
    void client.track("page_view");
    history.pushState({}, "", "/pricing");
    void client.track("page_view");
    void client.track("signup");

    expect(await sentNames(listeners, fetchMock)).toEqual(["page_view /", "page_view /pricing", "signup /pricing"]);
  });

  it("counts navigation even with auto-capture off", async () => {
    const { listeners, fetchMock } = stubPage(fakeStorage());
    vi.stubGlobal("location", { href: "https://shop.example/", origin: "https://shop.example", pathname: "/" });
    const history = stubHistory();

    init({ writeKey: WRITE_KEY, pageViews: "history", autoCapture: false });
    await settle();
    history.pushState({}, "", "/pricing");

    expect(await sentNames(listeners, fetchMock)).toEqual(["page_view undefined", "page_view undefined"]);
  });

  it("sends no page view on navigation unless asked to", async () => {
    const { listeners, fetchMock } = stubPage(fakeStorage());
    vi.stubGlobal("location", { href: "https://shop.example/", origin: "https://shop.example", pathname: "/" });
    const history = stubHistory();

    init({ writeKey: WRITE_KEY });
    await settle();
    history.pushState({}, "", "/pricing");

    expect(await sentNames(listeners, fetchMock)).toEqual([]);
  });

  // Link events, off unless asked for.
  function stubDocumentClicks(doc: object) {
    const clicks = new Map<string, (event: unknown) => void>();
    vi.stubGlobal("document", {
      ...doc,
      location: { hostname: "shop.example", href: "https://shop.example/" },
      addEventListener: (type: string, listener: (event: unknown) => void) => void clicks.set(type, listener),
    });
    const outbound = {
      closest: () => ({ getAttribute: () => "https://partner.example/deal?id=7", hasAttribute: () => false }),
    };
    return () => clicks.get("click")?.({ type: "click", button: 0, target: outbound });
  }

  it("sends an outbound click, with auto-capture's props, when asked to", async () => {
    const { listeners, fetchMock, doc } = stubPage(fakeStorage());
    const click = stubDocumentClicks(doc);

    init({ writeKey: WRITE_KEY, outboundLinks: true });
    await settle();
    click();

    expect(await sentNames(listeners, fetchMock)).toEqual(["outbound_click /"]);
  });

  it("listens for no clicks unless a link option is on", async () => {
    const { listeners, fetchMock, doc } = stubPage(fakeStorage());
    const click = stubDocumentClicks(doc);

    init({ writeKey: WRITE_KEY });
    await settle();
    click();

    expect(await sentNames(listeners, fetchMock)).toEqual([]);
  });

  it("ships events under the web client kind and the caller's write key", async () => {
    const { listeners, fetchMock } = stubPage(fakeStorage());

    const client = init({ writeKey: WRITE_KEY, appVersion: "1.2.3" });
    await settle();
    await client.track("page_view", { path: "/pricing" });
    fetchMock.mockClear();
    listeners.get("pagehide")?.();
    await settle();

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      writeKey: WRITE_KEY,
      client: "web",
      clientVersion: WEB_SDK_VERSION,
      appVersion: "1.2.3",
    });
    expect(body.anonymousId).toMatch(/\S/);
    expect(body.events).toEqual([
      {
        id: expect.any(String),
        name: "page_view",
        ts: expect.any(String),
        // $path rides along because auto-capture is on unless a caller turns
        // it off. The caller's own path prop is untouched beside it.
        props: { path: "/pricing", $path: "/" },
      },
    ]);
  });

  // Pins flushAt. Without it the queue grows toward maxQueue on a single-page
  // -app session that never hides a tab, then starts evicting.
  it("flushes on its own once the queue reaches the watermark", async () => {
    const { fetchMock } = stubPage(fakeStorage());

    const client = init({ writeKey: WRITE_KEY });
    await settle();
    fetchMock.mockClear();

    for (let index = 0; index < 49; index += 1) {
      await client.track("page_view");
    }
    expect(fetchMock).not.toHaveBeenCalled();

    await client.track("page_view");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a delivery failure through the supplied onError hook", async () => {
    const { fetchMock } = stubPage(fakeStorage());
    const onError = vi.fn();

    const client = init({ writeKey: WRITE_KEY, onError });
    await settle();
    await client.track("page_view");
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await client.flush();

    expect(onError).toHaveBeenCalledWith({ kind: "send-failed", status: 503, retryable: true });
  });

  it("does not let a failing network escape into the page", async () => {
    const { fetchMock } = stubPage(fakeStorage());

    const client = init({ writeKey: WRITE_KEY });
    await settle();
    await client.track("page_view");
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(client.flush()).resolves.toBeUndefined();
  });

  // The namespacing fix at the level a customer actually sees it: two kits on
  // one page must not ship each other's events under their own write key.
  it("keeps two clients on one page from shipping each other's events", async () => {
    const { fetchMock } = stubPage(fakeStorage());

    const first = init({ writeKey: "wk_first" });
    const second = init({ writeKey: "wk_second" });
    await settle();

    await first.track("first_event");
    await second.track("second_event");
    fetchMock.mockClear();

    await first.flush();
    await second.flush();

    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies).toHaveLength(2);
    expect(bodies[0].writeKey).toBe("wk_first");
    expect(bodies[0].events.map((event: { name: string }) => event.name)).toEqual(["first_event"]);
    expect(bodies[1].writeKey).toBe("wk_second");
    expect(bodies[1].events.map((event: { name: string }) => event.name)).toEqual(["second_event"]);
  });

  // Two kits are two products looking at one visitor, so the id is shared on
  // purpose — the opposite call from the queue key.
  it("shares one anonymous id across two clients on a page", async () => {
    const { fetchMock } = stubPage(fakeStorage());

    const first = init({ writeKey: "wk_first" });
    const second = init({ writeKey: "wk_second" });
    await settle();
    await first.track("first_event");
    await second.track("second_event");
    fetchMock.mockClear();

    await first.flush();
    await second.flush();

    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies[0].anonymousId).toBe(bodies[1].anonymousId);
  });

  // The guards exist so init never throws into a customer's page load.
  it("does not throw when the anonymous id cannot be persisted", () => {
    stubPage(fakeStorage({ setItem: quotaExceeded }));

    expect(() => init({ writeKey: WRITE_KEY })).not.toThrow();
  });

  it("does not throw when storage cannot be read at all", () => {
    stubPage(fakeStorage({ getItem: storageDisabled }));

    expect(() => init({ writeKey: WRITE_KEY })).not.toThrow();
  });

  it("does not throw when the localStorage property access itself throws", async () => {
    stubPage(fakeStorage());
    stubThrowingLocalStorageProperty();

    expect(() => init({ writeKey: WRITE_KEY })).not.toThrow();
    // And the client is not merely alive but usable.
    await expect(init({ writeKey: WRITE_KEY }).track("page_view")).resolves.toBeUndefined();
  });

  // Resolving the storage twice is invisible in behaviour but not benign: on
  // the memory-fallback path it hands the anonymous id one store and the
  // queue adapter another, so the queue written is not the queue read.
  it("resolves the page's storage exactly once", () => {
    stubPage(fakeStorage());
    const property = stubThrowingLocalStorageProperty();

    init({ writeKey: WRITE_KEY });

    expect(property.reads()).toBe(1);
  });

  it("does not throw in an insecure context where randomUUID is missing", () => {
    stubPage(fakeStorage());
    vi.stubGlobal("crypto", {});

    expect(() => init({ writeKey: WRITE_KEY })).not.toThrow();
  });
});

describe("init, auto-capture", () => {
  function stubPage(storage: Storage, page: { href?: string; referrer?: string } = {}) {
    const href = page.href ?? "https://shop.example/";
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("document", { visibilityState: "hidden", referrer: page.referrer ?? "" });
    vi.stubGlobal("addEventListener", () => {});
    vi.stubGlobal("location", { href, origin: new URL(href).origin });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function propsSent(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const batch = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as EventBatch;
    return (batch.events[0]?.props ?? {}) as Record<string, unknown>;
  }

  it("attaches the captured visit and path to a tracked event", async () => {
    const fetchMock = stubPage(fakeStorage(), {
      href: "https://shop.example/kettles",
      referrer: "https://www.reddit.com/r/x/",
    });

    const client = init({ writeKey: WRITE_KEY });
    await client.track("page_view");
    await client.flush();

    expect(propsSent(fetchMock)).toMatchObject({ $path: "/kettles", $referrer: "www.reddit.com" });
  });

  it("sends no reserved props at all when autoCapture is false", async () => {
    // The escape hatch for a customer whose compliance review objects to
    // implicit collection. It has to be all of it, not most of it.
    const fetchMock = stubPage(fakeStorage(), { referrer: "https://www.reddit.com/" });

    const client = init({ writeKey: WRITE_KEY, autoCapture: false });
    await client.track("page_view", { path: "/a" });
    await client.flush();

    const props = propsSent(fetchMock);
    expect(Object.keys(props).filter((key) => key.startsWith("$"))).toEqual([]);
    expect(props.path).toBe("/a");
  });

  it("lets a caller's own props win over the captured ones", async () => {
    // An explicit instruction beats an inference. The reserved namespace means
    // an overlap here can only ever be deliberate.
    const fetchMock = stubPage(fakeStorage(), { href: "https://shop.example/kettles" });

    const client = init({ writeKey: WRITE_KEY });
    await client.track("page_view", { $path: "/explicit" });
    await client.flush();

    expect(propsSent(fetchMock).$path).toBe("/explicit");
  });
});

describe("init and Global Privacy Control", () => {
  const ANON = "analyticstrend.anonymousId";
  const QUEUE = `analyticstrend.queue.${WRITE_KEY}`;

  function stubPage(storage: Storage, navigatorValue: object | undefined) {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("location", { href: "https://shop.example/", origin: "https://shop.example" });
    vi.stubGlobal("document", { visibilityState: "hidden", referrer: "" });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", navigatorValue);
    vi.stubGlobal("addEventListener", (type: string, listener: () => void) => {
      listeners.set(type, listener);
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    return { listeners, fetchMock };
  }

  function withEarlierVisit(): Storage {
    const storage = fakeStorage();
    storage.setItem(ANON, "earlier-id");
    storage.setItem(QUEUE, JSON.stringify([{ name: "page_view", ts: new Date().toISOString() }]));
    return storage;
  }

  it("sends nothing, stores nothing and listens for nothing when the browser sends it", async () => {
    const storage = fakeStorage();
    const { listeners, fetchMock } = stubPage(storage, { globalPrivacyControl: true });

    const client = init({ writeKey: WRITE_KEY });
    await client.track("page_view");
    await client.flush();
    await settle();

    expect(client.enabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.length).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it("leaves an earlier identifier and queue on the device, unsent, by default", async () => {
    const storage = withEarlierVisit();
    const { fetchMock } = stubPage(storage, { globalPrivacyControl: true });

    init({ writeKey: WRITE_KEY });
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.getItem(ANON)).toBe("earlier-id");
    expect(storage.getItem(QUEUE)).not.toBeNull();
  });

  it("deletes them when asked to", async () => {
    const storage = withEarlierVisit();
    stubPage(storage, { globalPrivacyControl: true });

    init({ writeKey: WRITE_KEY, clearDataOnGlobalPrivacyControl: true });

    expect(storage.getItem(ANON)).toBeNull();
    expect(storage.getItem(QUEUE)).toBeNull();
  });

  it("counts the browser anyway, and clears nothing, when told not to respect it", async () => {
    const storage = withEarlierVisit();
    const { fetchMock } = stubPage(storage, { globalPrivacyControl: true });

    const client = init({
      writeKey: WRITE_KEY,
      respectGlobalPrivacyControl: false,
      clearDataOnGlobalPrivacyControl: true,
    });
    await client.track("page_view");
    await client.flush();

    expect(client.enabled).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    expect(storage.getItem(ANON)).toBe("earlier-id");
  });

  it("is enabled without the signal, and without a navigator at all", async () => {
    stubPage(fakeStorage(), { globalPrivacyControl: false });
    expect(init({ writeKey: WRITE_KEY }).enabled).toBe(true);

    stubPage(fakeStorage(), undefined);
    expect(init({ writeKey: WRITE_KEY }).enabled).toBe(true);
  });
});
