import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventBatch, IncomingEvent } from "@analyticstrend/event-schema";
import { createClient } from "./client.ts";
import type {
  AnalyticsError,
  SendContext,
  SendResult,
  StorageAdapter,
  TransportAdapter,
} from "./types.ts";

function fakeStorage(): StorageAdapter & { contents: IncomingEvent[] } {
  const state = { contents: [] as IncomingEvent[] };
  return {
    contents: state.contents,
    async read() {
      // Return a copy, not the live internal array. Real storage backends
      // (chrome.storage.local, browser.storage.local, localStorage) always
      // hand back freshly deserialized objects, never a live reference into
      // their own state — a fake that returned its internal array would let
      // an implementation "pass" by mutating storage in place, which would
      // then silently fail against production storage. It also avoids a
      // subtle self-destruction: write()'s `state.contents.length = 0`
      // would otherwise truncate the very array `events` points to before
      // the following push could read it.
      return [...state.contents];
    },
    async write(events) {
      state.contents.length = 0;
      state.contents.push(...events);
    },
  };
}

function fakeTransport(behaviour: SendResult = { ok: true, retryable: false }) {
  const sent: EventBatch[] = [];
  const contexts: (SendContext | undefined)[] = [];
  const transport: TransportAdapter = {
    async send(batch, context) {
      sent.push(batch);
      contexts.push(context);
      return behaviour;
    },
  };
  return { transport, sent, contexts };
}

const BASE = {
  writeKey: "wk_test",
  client: "extension" as const,
  clientVersion: "0.1.0",
  anonymousId: "anon-1",
  now: () => Date.parse("2026-09-09T12:00:00.000Z"),
};

describe("createClient", () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it("persists a tracked event without sending it immediately", async () => {
    const { transport, sent } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport });

    await client.track("popup_opened");

    expect(storage.contents).toHaveLength(1);
    expect(storage.contents[0]?.name).toBe("popup_opened");
    expect(sent).toHaveLength(0);
  });

  it("sends queued events on flush and clears the queue", async () => {
    const { transport, sent } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport });

    await client.track("popup_opened", { source: "toolbar" });
    await client.flush();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.events[0]?.props).toEqual({ source: "toolbar" });
    expect(storage.contents).toHaveLength(0);
  });

  it("keeps events queued when the send is retryable", async () => {
    const { transport } = fakeTransport({ ok: false, retryable: true });
    const client = createClient({ ...BASE, storage, transport });

    await client.track("popup_opened");
    await client.flush();

    expect(storage.contents).toHaveLength(1);
  });

  it("discards events when the server rejects them permanently", async () => {
    const { transport } = fakeTransport({ ok: false, retryable: false });
    const client = createClient({ ...BASE, storage, transport });

    await client.track("popup_opened");
    await client.flush();

    expect(storage.contents).toHaveLength(0);
  });

  it("drops the oldest events once the queue is full", async () => {
    const { transport } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport, maxQueue: 2 });

    await client.track("first_event");
    await client.track("second_event");
    await client.track("third_event");

    expect(storage.contents.map((event) => event.name)).toEqual([
      "second_event",
      "third_event",
    ]);
  });

  it("splits a queue larger than the batch limit across multiple sends", async () => {
    const { transport, sent } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport, maxQueue: 250 });

    for (let index = 0; index < 150; index += 1) {
      await client.track("popup_opened");
    }
    await client.flush();

    expect(sent).toHaveLength(2);
    expect(sent[0]?.events).toHaveLength(100);
    expect(sent[1]?.events).toHaveLength(50);
  });

  it("keeps both events when two tracks overlap", async () => {
    const { transport } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport });

    await Promise.all([client.track("first_event"), client.track("second_event")]);

    expect(storage.contents.map((event) => event.name).sort()).toEqual([
      "first_event",
      "second_event",
    ]);
  });

  it("does not discard an event tracked while a flush is in flight", async () => {
    let releaseSend: () => void = () => {};
    let resolveSendStarted: () => void = () => {};
    const sendStarted = new Promise<void>((resolve) => {
      resolveSendStarted = resolve;
    });

    const transport: TransportAdapter = {
      async send() {
        resolveSendStarted();
        await new Promise<void>((release) => {
          releaseSend = release;
        });
        return { ok: true, retryable: false };
      },
    };

    const client = createClient({ ...BASE, storage, transport });
    await client.track("first_event");

    // Start the flush without awaiting it: its send() call blocks on the
    // deferred above until we release it below.
    const flushPromise = client.flush();

    // Wait until the send has actually begun (i.e. flush has already read
    // the queue and is mid-send) before issuing the overlapping track.
    await sendStarted;

    const trackPromise = client.track("second_event");

    releaseSend();
    await Promise.all([flushPromise, trackPromise]);

    expect(storage.contents.map((event) => event.name)).toEqual(["second_event"]);
  });

  it("leaves the queue intact and resolves flush when transport.send throws", async () => {
    const transport: TransportAdapter = {
      async send() {
        throw new Error("network down");
      },
    };
    const client = createClient({ ...BASE, storage, transport });
    await client.track("popup_opened");

    await expect(client.flush()).resolves.toBeUndefined();
    expect(storage.contents).toHaveLength(1);
  });

  it("keeps only the unsent events when a later chunk's send throws", async () => {
    let calls = 0;
    const transport: TransportAdapter = {
      async send() {
        calls += 1;
        if (calls === 1) return { ok: true, retryable: false };
        throw new Error("network down");
      },
    };
    const client = createClient({ ...BASE, storage, transport, maxQueue: 250 });

    for (let index = 0; index < 150; index += 1) {
      await client.track("popup_opened");
    }
    await client.flush();

    // The first chunk of 100 was accepted and persisted before the second
    // chunk's send threw; only the 50 events that were never sent should
    // remain.
    expect(storage.contents).toHaveLength(50);
  });

  it("reports a thrown send through onError", async () => {
    const thrown = new Error("network down");
    const transport: TransportAdapter = {
      async send() {
        throw thrown;
      },
    };
    const onError = vi.fn();
    const client = createClient({ ...BASE, storage, transport, onError });
    await client.track("popup_opened");
    await client.flush();

    expect(onError).toHaveBeenCalledWith({ kind: "send-threw", error: thrown });
  });

  it("reports a retryable delivery failure through onError with its status", async () => {
    const { transport } = fakeTransport({ ok: false, retryable: true, status: 503 });
    const onError = vi.fn();
    const client = createClient({ ...BASE, storage, transport, onError });
    await client.track("popup_opened");
    await client.flush();

    expect(onError).toHaveBeenCalledWith({ kind: "send-failed", status: 503, retryable: true });
  });

  // The permanent rejection is the one an integrator most needs to hear about:
  // it is the failure that will never fix itself.
  it("reports a permanent delivery failure through onError", async () => {
    const { transport } = fakeTransport({ ok: false, retryable: false, status: 401 });
    const onError = vi.fn();
    const client = createClient({ ...BASE, storage, transport, onError });
    await client.track("popup_opened");
    await client.flush();

    expect(onError).toHaveBeenCalledWith({ kind: "send-failed", status: 401, retryable: false });
  });

  it("does not report anything when delivery succeeds", async () => {
    const { transport } = fakeTransport();
    const onError = vi.fn();
    const client = createClient({ ...BASE, storage, transport, onError });
    await client.track("popup_opened");
    await client.flush();

    expect(onError).not.toHaveBeenCalled();
  });

  it("survives an onError hook that throws on a returned failure", async () => {
    const { transport } = fakeTransport({ ok: false, retryable: true, status: 503 });
    const client = createClient({
      ...BASE,
      storage,
      transport,
      onError() {
        throw new Error("the hook itself is broken");
      },
    });
    await client.track("popup_opened");

    await expect(client.flush()).resolves.toBeUndefined();
    expect(storage.contents).toHaveLength(1);
  });

  // flush() resolving rather than rejecting is what lets the platform SDKs
  // call it from a timer without a catch. A diagnostic hook supplied by
  // whoever embeds the SDK must not be able to take that away.
  it("survives an onError hook that throws", async () => {
    const transport: TransportAdapter = {
      async send() {
        throw new Error("network down");
      },
    };
    const client = createClient({
      ...BASE,
      storage,
      transport,
      onError() {
        throw new Error("the hook itself is broken");
      },
    });

    await client.track("popup_opened");

    await expect(client.flush()).resolves.toBeUndefined();
    expect(storage.contents).toHaveLength(1);
  });

  it("flushes automatically once the queue reaches the flushAt watermark", async () => {
    const { transport, sent } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport, flushAt: 2 });

    await client.track("first_event");
    await client.track("second_event");

    expect(sent).toHaveLength(1);
    expect(sent[0]?.events.map((event) => event.name)).toEqual([
      "first_event",
      "second_event",
    ]);
    expect(storage.contents).toHaveLength(0);
  });

  it("does not flush while the queue stays under the flushAt watermark", async () => {
    const { transport, sent } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport, flushAt: 2 });

    await client.track("first_event");

    expect(sent).toHaveLength(0);
    expect(storage.contents).toHaveLength(1);
  });

  describe("event name validation", () => {
    // EVENT_NAME_PATTERN was exported from event-schema and imported by
    // nothing: the wire contract was enforced only on the server, where a bad
    // name costs a round trip and lands in a response body nobody reads.
    it("does not queue an event whose name the wire contract rejects", async () => {
      const { transport, sent } = fakeTransport();
      const client = createClient({ ...BASE, storage, transport });

      await client.track("Page View");

      expect(storage.contents).toHaveLength(0);
      expect(sent).toHaveLength(0);
    });

    it("reports the rejected name through onError instead of throwing", async () => {
      const { transport } = fakeTransport();
      const errors: AnalyticsError[] = [];
      const client = createClient({
        ...BASE,
        storage,
        transport,
        onError: (error) => errors.push(error),
      });

      await expect(client.track("Page View")).resolves.toBeUndefined();

      expect(errors).toEqual([{ kind: "invalid-event-name", name: "Page View" }]);
    });

    it("keeps accepting valid names after rejecting an invalid one", async () => {
      const { transport, sent } = fakeTransport();
      const client = createClient({ ...BASE, storage, transport });

      await client.track("Page View");
      await client.track("page_view");
      await client.flush();

      expect(sent).toHaveLength(1);
      expect(sent[0]?.events.map((event) => event.name)).toEqual(["page_view"]);
    });

    it("does not break the host when onError itself throws on a bad name", async () => {
      const { transport } = fakeTransport();
      const client = createClient({
        ...BASE,
        storage,
        transport,
        onError: () => {
          throw new Error("integrator hook blew up");
        },
      });

      await expect(client.track("Page View")).resolves.toBeUndefined();
    });
  });

  it("throws at construction when maxQueue is not a positive integer", () => {
    const { transport } = fakeTransport();

    expect(() => createClient({ ...BASE, storage, transport, maxQueue: 0 })).toThrow(
      "maxQueue must be a positive integer, received 0",
    );
    expect(() => createClient({ ...BASE, storage, transport, maxQueue: 1.5 })).toThrow(
      "maxQueue must be a positive integer, received 1.5",
    );
    expect(() => createClient({ ...BASE, storage, transport, maxQueue: -3 })).toThrow(
      "maxQueue must be a positive integer, received -3",
    );
  });

  it("throws at construction when flushAt is not a positive integer", () => {
    const { transport } = fakeTransport();

    expect(() => createClient({ ...BASE, storage, transport, flushAt: 0 })).toThrow(
      "flushAt must be a positive integer, received 0",
    );
    expect(() => createClient({ ...BASE, storage, transport, flushAt: -1 })).toThrow(
      "flushAt must be a positive integer, received -1",
    );
  });

  it("throws at construction when flushAt exceeds maxQueue", () => {
    const { transport } = fakeTransport();

    expect(() =>
      createClient({ ...BASE, storage, transport, maxQueue: 10, flushAt: 11 }),
    ).toThrow("flushAt must not be greater than maxQueue, received flushAt: 11, maxQueue: 10");
  });

  describe("watermark retry cooldown", () => {
    // A controllable clock: the cooldown compares timestamps, so these tests
    // need to move time forward deliberately rather than relying on
    // wall-clock Date.now().
    let currentTime: number;
    const clock = () => currentTime;

    beforeEach(() => {
      currentTime = Date.parse("2026-09-09T12:00:00.000Z");
    });

    it("suppresses the next watermark flush after a retryable failure", async () => {
      const { transport, sent } = fakeTransport({ ok: false, retryable: true });
      const client = createClient({ ...BASE, storage, transport, flushAt: 2, now: clock });

      await client.track("first_event");
      await client.track("second_event"); // reaches the watermark: one attempt, fails retryable

      expect(sent).toHaveLength(1);

      // The queue is still at/above the watermark (the failed send changed
      // nothing), so without a cooldown this would fire another attempt.
      await client.track("third_event");

      expect(sent).toHaveLength(1);
    });

    it("still attempts on an explicit flush() call during the cooldown", async () => {
      const { transport, sent } = fakeTransport({ ok: false, retryable: true });
      const client = createClient({ ...BASE, storage, transport, flushAt: 2, now: clock });

      await client.track("first_event");
      await client.track("second_event"); // watermark attempt, fails, cooldown starts

      expect(sent).toHaveLength(1);

      await client.flush();

      expect(sent).toHaveLength(2);
    });

    it("clears the cooldown as soon as a flush drains the queue", async () => {
      let behaviour: { ok: boolean; retryable: boolean } = { ok: false, retryable: true };
      const sent: EventBatch[] = [];
      const transport: TransportAdapter = {
        async send(batch) {
          sent.push(batch);
          return behaviour;
        },
      };
      const client = createClient({ ...BASE, storage, transport, flushAt: 2, now: clock });

      await client.track("first_event");
      await client.track("second_event"); // watermark attempt, fails, cooldown starts

      expect(sent).toHaveLength(1);

      behaviour = { ok: true, retryable: false };
      await client.flush(); // explicit flush succeeds and drains the queue

      expect(sent).toHaveLength(2);
      expect(storage.contents).toHaveLength(0);

      // Time has NOT advanced past the cooldown window. If the cooldown were
      // still standing, this next watermark hit would be suppressed just
      // like in the first test above. It fires immediately instead, which
      // is only possible if the successful drain cleared it back to 0.
      await client.track("third_event");
      await client.track("fourth_event");

      expect(sent).toHaveLength(3);
    });

    // Without this, a cooldown that never expires — set to Infinity, say —
    // would satisfy every other test here, and an extension that went offline
    // once would stop flushing on the watermark for the rest of its life.
    it("resumes watermark flushes once the cooldown window has passed", async () => {
      const { transport, sent } = fakeTransport({ ok: false, retryable: true });
      const client = createClient({ ...BASE, storage, transport, flushAt: 2, now: clock });

      await client.track("first_event");
      await client.track("second_event"); // watermark attempt, fails, cooldown starts

      expect(sent).toHaveLength(1);

      currentTime += 30_000;

      await client.track("third_event");

      expect(sent).toHaveLength(2);
    });
  });

  describe("send context", () => {
    it("forwards an unloading flush to the transport", async () => {
      const { transport, contexts } = fakeTransport();
      const client = createClient({ ...BASE, storage, transport });

      await client.track("popup_opened");
      await client.flush({ unloading: true });

      expect(contexts).toEqual([{ unloading: true }]);
    });

    it("sends no context for an ordinary flush", async () => {
      const { transport, contexts } = fakeTransport();
      const client = createClient({ ...BASE, storage, transport });

      await client.track("popup_opened");
      await client.flush();

      expect(contexts).toEqual([undefined]);
    });

    // The reason this is a parameter and not a module-level flag: each flush
    // captures its own context at the call site, so one that only gets to run
    // later — because the serialization tail was busy when pagehide fired —
    // cannot leak "unloading" onto an unrelated flush that follows it.
    //
    // Both flushes must be *issued* before either one *runs*, or this test
    // proves nothing: awaiting between them lets the first settle completely,
    // and a shared mutable slot written at call time and read at run time
    // would then be written, read and overwritten in strict sequence —
    // passing exactly as the parameter does. The gated write below is what
    // keeps the tail genuinely busy across both calls.
    it("keeps each flush's context to itself when they queue up", async () => {
      const { transport, contexts } = fakeTransport();
      let releaseFirstWrite = () => {};
      const firstWriteHeld = new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });
      let writes = 0;
      const gatedStorage: StorageAdapter = {
        read: () => storage.read(),
        async write(events) {
          writes += 1;
          if (writes === 1) await firstWriteHeld;
          await storage.write(events);
        },
      };
      const client = createClient({ ...BASE, storage: gatedStorage, transport });

      // Deliberately not awaited: this occupies the tail, parked inside
      // write(), while everything below queues up behind it.
      const tracked = client.track("first_event");
      const unloading = client.flush({ unloading: true });
      const trackedAgain = client.track("second_event");
      const ordinary = client.flush();

      // Nothing has run yet, which is the whole point of the exercise.
      expect(contexts).toEqual([]);

      releaseFirstWrite();
      await Promise.all([tracked, unloading, trackedAgain, ordinary]);

      expect(contexts).toEqual([{ unloading: true }, undefined]);
    });

    it("leaves the context undefined for an automatic watermark flush", async () => {
      const { transport, contexts } = fakeTransport();
      const client = createClient({ ...BASE, storage, transport, flushAt: 2 });

      await client.track("first_event");
      await client.track("second_event");

      expect(contexts).toEqual([undefined]);
    });
  });
});

describe("event ids", () => {
  it("gives every tracked event its own id", async () => {
    const storage = fakeStorage();
    const client = createClient({ ...BASE, storage, transport: fakeTransport().transport });

    await client.track("popup_opened");
    await client.track("popup_opened");

    const [first, second] = storage.contents;
    expect(first?.id).toMatch(/\S/);
    expect(second?.id).toMatch(/\S/);
    expect(first?.id).not.toBe(second?.id);
  });

  it("resends the same ids when a batch is retried", async () => {
    // The whole point of the id. A page that unloads before the collector
    // answers keeps its queue and sends it again on the next load, and the
    // collector can only recognise the repeat if the ids are unchanged.
    const storage = fakeStorage();
    let attempt = 0;
    const sent: EventBatch[] = [];
    const transport: TransportAdapter = {
      async send(batch) {
        sent.push(batch);
        attempt += 1;
        return attempt === 1 ? { ok: false, retryable: true } : { ok: true, retryable: false };
      },
    };
    const client = createClient({ ...BASE, storage, transport });

    await client.track("popup_opened");
    await client.flush();
    await client.flush();

    expect(sent).toHaveLength(2);
    expect(sent[1]?.events.map((event) => event.id)).toEqual(sent[0]?.events.map((event) => event.id));
  });
});

describe("createClient, a declined location", () => {
  // Firefox's locationInfo permission, declined: every batch must say
  // location: false so the collector works nothing out of the address.
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it("marks each batch location: false while location is not allowed", async () => {
    const { transport, sent } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport, locationAllowed: async () => false });

    await client.track("popup_opened");
    await client.flush();

    expect(sent[0]?.location).toBe(false);
  });

  it("adds no location field when it is allowed, or when nothing asks", async () => {
    const allowed = fakeTransport();
    const client = createClient({ ...BASE, storage, transport: allowed.transport, locationAllowed: () => true });
    await client.track("popup_opened");
    await client.flush();

    const plain = fakeTransport();
    const other = createClient({ ...BASE, storage: fakeStorage(), transport: plain.transport });
    await other.track("popup_opened");
    await other.flush();

    expect("location" in allowed.sent[0]!).toBe(false);
    expect("location" in plain.sent[0]!).toBe(false);
  });

  it("asks at send time, because that is when the address is read", async () => {
    let allowed = true;
    const { transport, sent } = fakeTransport();
    const client = createClient({ ...BASE, storage, transport, locationAllowed: () => allowed });

    await client.track("popup_opened");
    allowed = false;
    await client.flush();

    expect(sent[0]?.location).toBe(false);
  });

  it("withholds location when the check throws", async () => {
    // Unknown is treated as declined: the cost is a missing country, where
    // the other way round it is a choice ignored.
    const { transport, sent } = fakeTransport();
    const client = createClient({
      ...BASE,
      storage,
      transport,
      locationAllowed: () => {
        throw new Error("permissions unavailable");
      },
    });

    await client.track("popup_opened");
    await client.flush();

    expect(sent[0]?.location).toBe(false);
  });
});
