// The wire contract between the SDKs and the collector. Deliberately
// dependency-free: this package is imported by code that ships inside
// customers' extensions, where every byte and every transitive dependency is
// a liability.

export const LIMITS = {
  MAX_EVENTS_PER_BATCH: 100,
  MAX_EVENT_NAME_LENGTH: 64,
  MAX_PROPS_BYTES: 2048,
  MAX_DISTINCT_EVENT_NAMES: 200,
  MAX_ID_LENGTH: 64,
  // How far an SDK may let one captured value run. The reserved props are
  // taken out of the same MAX_PROPS_BYTES budget the customer's own props come
  // from, so an unbounded capture would quietly spend a customer's allowance
  // on a link somebody put five kilobytes of UTM on. At these two lengths the
  // whole reserved set fits in under half the budget, which validate.test.ts
  // pins.
  //
  // Paths get the longer allowance because truncating one corrupts the data
  // rather than merely shortening it: two different pages sharing a long
  // prefix would collapse into one row. A campaign name is a label, and a
  // truncated label is still recognisably itself.
  MAX_CAPTURED_VALUE_LENGTH: 64,
  MAX_CAPTURED_PATH_LENGTH: 128,
  // Seven days. Guards the rollups against a client with a badly wrong
  // clock (or a replayed queue) writing events into a far-off day.
  MAX_CLOCK_SKEW_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

export const EVENT_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;

export const RESERVED_PROP_PREFIX = "$";

// Props the SDKs attach themselves, rather than the customer passing them.
// The namespace is reserved so that a customer prop can never be mistaken for
// captured data, and so that adding a capture later cannot collide with a prop
// a customer already sends.
//
// A whitelist rather than a blanket ban on the prefix, because the collector
// cannot tell an SDK's props from a customer's: both arrive in the same object
// on the same event, with nothing to distinguish them. Banning the prefix
// outright would reject the SDK's own events.
export const RESERVED_PROPS = [
  "$referrer",
  "$utm_source",
  "$utm_medium",
  "$utm_campaign",
  "$utm_content",
  "$utm_term",
  "$ref",
  "$click_id",
  "$path",
  "$from_path",
  // Link events (web SDK 0.5.0): a hostname only, and a file name only.
  "$host",
  "$file",
] as const;

const RESERVED = new Set<string>(RESERVED_PROPS);

export type ClientKind = "extension" | "web";

export type IncomingEvent = {
  // Assigned once, when the event is tracked, and sent unchanged on every
  // retry. Delivery is at-least-once — a page that unloads before the
  // collector's answer arrives keeps its queue and sends it again — so this is
  // what lets the collector store each event once. Optional because SDKs
  // older than 0.1.2 never sent one.
  id?: string;
  name: string;
  ts: string;
  props?: Record<string, unknown>;
};

export type EventBatch = {
  writeKey: string;
  client: ClientKind;
  clientVersion: string;
  appVersion?: string;
  anonymousId: string;
  // false when the person has declined location — Firefox's locationInfo
  // permission — so the collector must not work a country or region out of
  // the request's address. Absent means no such choice was offered.
  location?: false;
  events: IncomingEvent[];
};

export type ValidationResult =
  | { ok: true; batch: EventBatch }
  | { ok: false; error: string };

// The batch minus its events: everything that describes the *sender*.
export type EventEnvelope = Omit<EventBatch, "events">;

// Envelope and events are validated separately, and the split is the whole
// point rather than a tidy-up. A bad envelope — unparseable body, missing
// write key, wrong client kind, an events field that is not a usable array —
// makes the entire request unusable, and the only honest answer is 400. A bad
// *event* makes one event unusable. Failing the whole batch on it means a
// customer who names one event with a space loses the ninety-nine batched
// alongside it, permanently: both transports classify 400 as non-retryable,
// so the client drops the chunk, and with no onError hook supplied the
// customer never learns it happened. The collector already gets this right
// for the adjacent problem — a cardinality rejection filters per event and
// answers 202 — and two error semantics on one endpoint for the same class of
// problem is exactly the kind of drift that produces silent data loss.
export type EnvelopeValidationResult =
  | { ok: true; envelope: EventEnvelope; events: unknown[] }
  | { ok: false; error: string };

export type EventValidationResult =
  | { ok: true; event: IncomingEvent }
  | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

// The batch-size bound stays here, not in validateEvent: an oversized or empty
// events array is a property of the request, not of any one event, and there
// is no per-event filtering that could rescue it.
export function validateEnvelope(input: unknown): EnvelopeValidationResult {
  if (!isObject(input)) return { ok: false, error: "Body must be an object" };

  if (!isNonEmptyString(input.writeKey, LIMITS.MAX_ID_LENGTH)) {
    return { ok: false, error: "writeKey is required" };
  }
  if (input.client !== "extension" && input.client !== "web") {
    return { ok: false, error: "client must be 'extension' or 'web'" };
  }
  if (!isNonEmptyString(input.clientVersion, LIMITS.MAX_ID_LENGTH)) {
    return { ok: false, error: "clientVersion is required" };
  }
  if (input.appVersion !== undefined && !isNonEmptyString(input.appVersion, LIMITS.MAX_ID_LENGTH)) {
    return { ok: false, error: "appVersion must be a non-empty string when present" };
  }
  if (!isNonEmptyString(input.anonymousId, LIMITS.MAX_ID_LENGTH)) {
    // Separated from the generic "required" message because an over-long id is
    // a real and confusable case: an integrator who substitutes their own user
    // identifier for the generated one sends something past 64 characters, and
    // "anonymousId is required" sends them hunting for a field they can plainly
    // see themselves sending.
    const tooLong =
      typeof input.anonymousId === "string" && input.anonymousId.length > LIMITS.MAX_ID_LENGTH;
    return {
      ok: false,
      error: tooLong
        ? `anonymousId must be at most ${LIMITS.MAX_ID_LENGTH} characters`
        : "anonymousId is required",
    };
  }

  const { events } = input;
  if (!Array.isArray(events) || events.length === 0 || events.length > LIMITS.MAX_EVENTS_PER_BATCH) {
    return { ok: false, error: `events must contain 1 to ${LIMITS.MAX_EVENTS_PER_BATCH} items` };
  }

  return {
    ok: true,
    envelope: {
      writeKey: input.writeKey,
      client: input.client,
      clientVersion: input.clientVersion,
      appVersion: input.appVersion as string | undefined,
      anonymousId: input.anonymousId,
      // Only false withholds; any other value is dropped rather than read as
      // a choice the SDK never makes.
      ...(input.location === false ? { location: false as const } : {}),
    },
    events,
  };
}

export function validateEvent(input: unknown, now: number = Date.now()): EventValidationResult {
  if (!isObject(input)) return { ok: false, error: "each event must be an object" };

  if (typeof input.name !== "string" || !EVENT_NAME_PATTERN.test(input.name)) {
    return { ok: false, error: `event name must match ^[a-z0-9_]{1,64}$: ${String(input.name)}` };
  }

  if (input.id !== undefined && !isNonEmptyString(input.id, LIMITS.MAX_ID_LENGTH)) {
    return {
      ok: false,
      error: `event id must be a string of 1 to ${LIMITS.MAX_ID_LENGTH} characters for event ${input.name}`,
    };
  }

  const ts = typeof input.ts === "string" ? Date.parse(input.ts) : Number.NaN;
  if (Number.isNaN(ts)) {
    return { ok: false, error: `event ts must be an ISO timestamp for event ${input.name}` };
  }
  if (Math.abs(ts - now) > LIMITS.MAX_CLOCK_SKEW_MS) {
    return { ok: false, error: `event ts is too far from now for event ${input.name}` };
  }

  if (input.props !== undefined) {
    if (!isObject(input.props)) {
      return { ok: false, error: `props must be an object for event ${input.name}` };
    }
    for (const key of Object.keys(input.props)) {
      if (key.startsWith(RESERVED_PROP_PREFIX) && !RESERVED.has(key)) {
        return { ok: false, error: `props key ${key} is reserved for event ${input.name}` };
      }
    }

    const bytes = new TextEncoder().encode(JSON.stringify(input.props)).length;
    if (bytes > LIMITS.MAX_PROPS_BYTES) {
      return {
        ok: false,
        error: `props exceed ${LIMITS.MAX_PROPS_BYTES} bytes for event ${input.name}`,
      };
    }
  }

  return { ok: true, event: input as IncomingEvent };
}

// All-or-nothing validation of a whole batch, kept for callers that genuinely
// want that — a test asserting the wire contract, a tool checking a payload
// before sending it. The collector deliberately does NOT use this: see the
// comment on EnvelopeValidationResult for why it validates the envelope and
// each event separately instead.
export function validateBatch(input: unknown, now: number = Date.now()): ValidationResult {
  const envelope = validateEnvelope(input);
  if (!envelope.ok) return { ok: false, error: envelope.error };

  for (const event of envelope.events) {
    const result = validateEvent(event, now);
    if (!result.ok) return { ok: false, error: result.error };
  }

  return { ok: true, batch: input as EventBatch };
}
