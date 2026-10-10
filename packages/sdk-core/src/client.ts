import { EVENT_NAME_PATTERN, LIMITS } from "@analyticstrend/event-schema";
import type { AnalyticsError, ClientOptions, SendContext, SendResult } from "./types.ts";

const DEFAULT_MAX_QUEUE = 500;

// The watermark exists to stop the queue reaching maxQueue and evicting
// events. When the transport can't deliver, though, the queue fills and
// starts evicting regardless of how hard we retry — nothing is saved by
// re-attempting on every single track while offline. Backing off for this
// long between automatic watermark-triggered attempts therefore forfeits no
// data that a tighter retry loop would have preserved; it just stops paying
// a network round trip per tracked event on a laptop that's offline or on a
// service with a persistent problem.
const WATERMARK_RETRY_COOLDOWN_MS = 30_000;

// Identifies one tracked event across every attempt to deliver it, so the
// collector can store it once however many times it arrives. randomUUID is
// missing outside secure contexts (a plain http:// page) and in some older
// runtimes; the fallback only needs to be unique within one visitor's queue,
// which a timestamp plus two random draws is by a wide margin.
function createEventId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const chunk = () => Math.random().toString(36).slice(2, 12);
  return `evt-${Date.now().toString(36)}-${chunk()}-${chunk()}`;
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, received ${value}`);
  }
}

// All queueing, batching and retry behaviour lives here so the two platform
// SDKs stay thin adapters. Every persistence call goes through the injected
// storage adapter because the environments that matter most — MV3 service
// workers and Firefox event pages — are torn down without warning, and an
// in-memory queue would simply vanish with them.
export function createClient(options: ClientOptions) {
  const maxQueue = options.maxQueue ?? DEFAULT_MAX_QUEUE;
  requirePositiveInteger("maxQueue", maxQueue);

  if (options.flushAt !== undefined) {
    requirePositiveInteger("flushAt", options.flushAt);
    if (options.flushAt > maxQueue) {
      throw new Error(
        `flushAt must not be greater than maxQueue, received flushAt: ${options.flushAt}, maxQueue: ${maxQueue}`,
      );
    }
  }

  const now = options.now ?? Date.now;

  // In-memory only, deliberately not persisted alongside the queue: thrash
  // only happens through repeated `track` calls within a single background
  // lifetime, and a teardown ends it on its own — the next background start
  // gets exactly one attempt from its startup flush regardless of this
  // value. Persisting it would mean extending StorageAdapter beyond
  // read/write for no benefit, and that extension would ripple into every
  // platform SDK's storage adapter, including the web SDK's.
  let nextWatermarkFlushAt = 0;

  async function trackImpl(name: string, props?: Record<string, unknown>): Promise<void> {
    // Enforced here, at the call site, rather than left to the collector.
    // EVENT_NAME_PATTERN is the same regex validateEvent applies on the
    // server, so a name that fails here would be filtered there — after a
    // network round trip, attributed to an event index in a response body
    // nobody reads. Catching it at track() puts the report in front of the
    // integrator at development time, with the offending name in hand.
    //
    // Reported and dropped, never thrown: track() is called from a customer's
    // page or extension, often unawaited, and an analytics SDK that can throw
    // into its host's call stack is a liability. Dropping rather than queueing
    // is deliberate too — the event can never be accepted, so queueing it
    // would spend queue space, and a slot under maxQueue, on something
    // guaranteed to be discarded.
    if (!EVENT_NAME_PATTERN.test(name)) {
      report({ kind: "invalid-event-name", name });
      return;
    }

    const queued = await options.storage.read();
    queued.push({ id: createEventId(), name, ts: new Date(now()).toISOString(), props });

    // Oldest first: a client that has been offline for a long time should
    // keep its most recent behaviour rather than a stale prefix.
    const trimmed = queued.length > maxQueue ? queued.slice(queued.length - maxQueue) : queued;
    await options.storage.write(trimmed);

    // This must be `await flushImpl()`, never a fire-and-forget call, and
    // never the public `flush()` wrapper. trackImpl only ever runs as the
    // operation `serialize()` is currently chaining onto `tail`, and by the
    // time control reaches here `tail` already points to a new promise that
    // resolves only once *this* trackImpl call settles. Calling the public
    // `flush()` here would call `serialize()` again, chaining onto that same
    // not-yet-resolved `tail` — a deadlock, since tail can't resolve until
    // this call returns, and this call is now waiting on tail. Calling
    // `flushImpl()` unawaited would let this trackImpl's returned promise
    // (and therefore `tail`) resolve before the flush's own storage read and
    // write complete, so the very next track or flush would chain onto an
    // already-resolved tail and run concurrently with this in-flight flush —
    // reintroducing the interleaved read-modify-write race the serialization
    // exists to prevent. Awaiting flushImpl() directly avoids both: it is a
    // plain nested async call inside the operation already occupying the
    // tail, with no re-entry into serialize() and nothing left running after
    // trackImpl's promise settles.
    //
    // The cooldown check applies only here, to the automatic
    // watermark-triggered flush — never to the exported `flush()`. The
    // platform SDKs call `flush()` deliberately (startup, a content-script
    // message, unload) and those callers know something worth trying has
    // changed; suppressing them would cost real deliveries. Suppressing an
    // automatic retry that fires purely because the queue is still sitting
    // at the watermark costs nothing, per the comment on
    // WATERMARK_RETRY_COOLDOWN_MS above.
    if (
      options.flushAt !== undefined &&
      trimmed.length >= options.flushAt &&
      now() >= nextWatermarkFlushAt
    ) {
      await flushImpl();
    }
  }

  // The single place that reports a delivery failure, and the only place that
  // needs a guard against a hook that throws. See onError's doc comment on
  // ClientOptions for why this does not live in the transports.
  function report(error: AnalyticsError): void {
    try {
      options.onError?.(error);
    } catch {
      // Ignored on purpose: there is nowhere to report a failure of the
      // failure reporter, and flush must still resolve.
    }
  }

  // Asked once per flush, at send time, because the collector reads the
  // address when the batch arrives, not when the event was tracked. A check
  // that throws counts as declined: a missing country costs less than a
  // choice ignored.
  async function locationWithheld(): Promise<boolean> {
    if (!options.locationAllowed) return false;
    try {
      return !(await options.locationAllowed());
    } catch {
      return true;
    }
  }

  async function flushImpl(context?: SendContext): Promise<void> {
    const queued = await options.storage.read();
    if (queued.length === 0) {
      nextWatermarkFlushAt = 0;
      return;
    }

    let remaining = [...queued];
    const withholdLocation = await locationWithheld();

    while (remaining.length > 0) {
      const chunk = remaining.slice(0, LIMITS.MAX_EVENTS_PER_BATCH);

      let result: SendResult;
      try {
        result = await options.transport.send(
          {
            writeKey: options.writeKey,
            client: options.client,
            clientVersion: options.clientVersion,
            appVersion: options.appVersion,
            anonymousId: options.anonymousId,
            ...(withholdLocation ? { location: false as const } : {}),
            events: chunk,
          },
          // Forwarded rather than interpreted: the client has no opinion on
          // what unloading means for a given platform's transport.
          context,
        );
      } catch (error) {
        // A thrown send is the same situation as a returned retryable
        // failure — fetch rejects on ordinary network failure — so it gets
        // the same handling rather than a different promise contract.
        // Storage already holds exactly `remaining`, so there is nothing to
        // write before giving up.
        report({ kind: "send-threw", error });
        // The queue still holds exactly `remaining`, at or above the
        // watermark: back off the next automatic watermark-triggered flush
        // rather than letting every subsequent track re-fire a doomed send.
        nextWatermarkFlushAt = now() + WATERMARK_RETRY_COOLDOWN_MS;
        return;
      }

      if (!result.ok) {
        // Reported whether or not it is retryable. A permanent rejection — a
        // rotated write key, a payload the collector refuses — is the failure
        // most worth telling an integrator about, because it is the one that
        // will never fix itself; and a run of retryable 503s is exactly the
        // "this SDK has gone quiet" signal the hook exists for.
        report({ kind: "send-failed", status: result.status, retryable: result.retryable });
      }

      if (!result.ok && result.retryable) {
        // Same reasoning as the thrown-send case above: nothing drained,
        // back off the automatic retry path.
        nextWatermarkFlushAt = now() + WATERMARK_RETRY_COOLDOWN_MS;
        return;
      }

      // Persist after every chunk, not once at the end: an MV3 service
      // worker can be suspended mid-flush, and anything the server already
      // accepted must not be sent again. The collector inserts events
      // without deduplicating, so a resend inflates the customer's counts.
      remaining = remaining.slice(chunk.length);
      await options.storage.write(remaining);
    }

    // Every chunk was either accepted or permanently rejected — either way
    // the loop reached the end with nothing left to retry. Clear any
    // standing cooldown so recovery is immediate rather than waiting out a
    // now-stale backoff window.
    nextWatermarkFlushAt = 0;
  }

  // track and flush are both read-modify-write against storage with awaits in
  // between, so overlapping calls would interleave and lose events: two tracks
  // racing drop one of the two, and a track landing mid-flush is erased by the
  // write([]) that ends the flush. Chaining every queue operation onto a single
  // tail keeps them ordered. Failures are swallowed from the chain itself (the
  // caller still sees them) so one rejected call cannot wedge the queue.
  let tail: Promise<unknown> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function track(name: string, props?: Record<string, unknown>): Promise<void> {
    return serialize(() => trackImpl(name, props));
  }

  // `options` describes this one call and is captured when it is made, so a
  // flush that ends up running much later — the tail was busy — still carries
  // the context of the trigger that asked for it, and no other flush can pick
  // it up by accident.
  function flush(options?: SendContext): Promise<void> {
    return serialize(() => flushImpl(options));
  }

  return { track, flush };
}
