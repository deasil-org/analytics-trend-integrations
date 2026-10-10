import type { ClientKind, EventBatch, IncomingEvent } from "@analyticstrend/event-schema";

export type StorageAdapter = {
  read(): Promise<IncomingEvent[]>;
  write(events: IncomingEvent[]): Promise<void>;
};

// Passed to every send so a transport can adapt to *why* it is being called.
// This is a parameter rather than a flag the platform SDK sets on itself
// deliberately. A flag would have to be raised before flush() and lowered
// after, and flush chains onto the serialization tail: a page that fires
// pagehide while the tail is busy and then survives — back-forward cache, a
// cancelled navigation — would leave the flag raised for a later ordinary
// flush to read. A parameter travels with the one call it describes and has
// no such window.
export type SendContext = {
  // True only for a flush triggered by the page going away. Web transports
  // use it to decide whether the request needs `keepalive`, which is not free:
  // browsers cap the total body size of in-flight keepalive requests, so it
  // must be asked for only when it is actually needed.
  unloading?: boolean;
};

export type SendResult = {
  ok: boolean;
  retryable: boolean;
  // The HTTP status, when there was one. Optional because a transport that
  // never reached a server has none to report. Carried so onError can say
  // *why* delivery failed — {ok, retryable} cannot tell a 401 from a 503.
  status?: number;
};

export type TransportAdapter = {
  // `context` is optional so a transport that ignores it keeps compiling.
  send(batch: EventBatch, context?: SendContext): Promise<SendResult>;
};

// What onError receives. A discriminated union rather than a bare `unknown`
// so a hook can branch on the failure without guessing at what it was handed.
export type AnalyticsError =
  // transport.send threw instead of returning a result.
  | { kind: "send-threw"; error: unknown }
  // transport.send returned a failure. `retryable` says whether the queue kept
  // the batch; `status` is present when the transport reached a server.
  | { kind: "send-failed"; status?: number; retryable: boolean }
  // track() was called with a name the collector's wire contract will not
  // accept. The event is not queued — queueing it would only move the failure
  // to delivery time, where it is far harder to trace back to the call site.
  // This is the one failure an integrator can actually fix, and it is
  // reported rather than thrown: an analytics SDK must not break its host.
  | { kind: "invalid-event-name"; name: string };

export type ClientOptions = {
  writeKey: string;
  client: ClientKind;
  clientVersion: string;
  // Whether the collector may work a location out of the request's address.
  // When it answers false, each batch says location: false and the collector
  // looks nothing up. Asked at every flush; omitted, location is allowed. The
  // extension SDK answers it from Firefox's locationInfo permission.
  locationAllowed?: () => boolean | Promise<boolean>;
  appVersion?: string;
  anonymousId: string;
  storage: StorageAdapter;
  transport: TransportAdapter;
  maxQueue?: number;
  now?: () => number;
  // When set, trackImpl flushes as soon as the persisted queue reaches this
  // many events, instead of waiting for whatever external trigger (a startup
  // flush, a content-script message, a timer a platform SDK supplies) calls
  // flush next. This bounds *loss* for a producer that tracks regularly — the
  // queue never gets the chance to grow toward maxQueue and start evicting
  // its oldest events. It does not bound *delivery delay*: a background kept
  // alive with only sparse tracking can sit under the watermark indefinitely
  // and still wait for whatever flushes it next. This is not a scheduler.
  flushAt?: number;
  // Called on every delivery failure: a send that threw, and a send that
  // returned ok: false whether or not it was retryable. A run of 503s, or a
  // 401 from a rotated write key, is exactly the "this SDK has gone quiet"
  // signal the hook exists to surface, and it never throws.
  //
  // This is diagnostic only: the client's own handling of a failure does not
  // depend on the hook, and a missing hook changes nothing. It should not
  // throw, but flush guards the call anyway and ignores anything it raises:
  // "flush always resolves" is the contract the platform SDKs rely on to call
  // it fire-and-forget from an unload handler, and a hook supplied by whoever
  // embeds this SDK must not be able to take that away. There is nowhere to
  // report a failure of the failure reporter.
  //
  // Reporting lives here, in the one place that sees every failure, rather
  // than in each transport's catch block. A transport that called the hook
  // itself would duplicate plumbing nothing enforces across every platform
  // SDK, split the hook's meaning across two call sites, and — worse — a
  // throwing hook invoked from inside a transport's catch would propagate out
  // of send(), landing in this file's catch and reporting a second, different
  // error while losing the original.
  onError?: (error: AnalyticsError) => void;
};
