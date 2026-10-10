import { describe, expect, it } from "vitest";
import {
  LIMITS,
  RESERVED_PROPS,
  validateBatch,
  validateEnvelope,
  validateEvent,
} from "./index.ts";

const NOW = Date.parse("2026-09-09T12:00:00.000Z");

function validBatch(overrides: Record<string, unknown> = {}) {
  return {
    writeKey: "wk_test",
    client: "extension",
    clientVersion: "0.1.0",
    anonymousId: "11111111-2222-3333-4444-555555555555",
    events: [{ name: "popup_opened", ts: "2026-09-09T11:59:00.000Z" }],
    ...overrides,
  };
}

describe("validateBatch", () => {
  it("accepts a well-formed batch", () => {
    const result = validateBatch(validBatch(), NOW);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object payload", () => {
    expect(validateBatch(null, NOW)).toEqual({ ok: false, error: "Body must be an object" });
  });

  it("rejects a missing write key", () => {
    const result = validateBatch(validBatch({ writeKey: "" }), NOW);
    expect(result).toEqual({ ok: false, error: "writeKey is required" });
  });

  it("rejects an unknown client kind", () => {
    const result = validateBatch(validBatch({ client: "mobile" }), NOW);
    expect(result).toEqual({ ok: false, error: "client must be 'extension' or 'web'" });
  });

  it("rejects an empty event list", () => {
    const result = validateBatch(validBatch({ events: [] }), NOW);
    expect(result).toEqual({ ok: false, error: "events must contain 1 to 100 items" });
  });

  it("rejects more events than the batch limit", () => {
    const events = Array.from({ length: LIMITS.MAX_EVENTS_PER_BATCH + 1 }, () => ({
      name: "popup_opened",
      ts: "2026-09-09T11:59:00.000Z",
    }));
    const result = validateBatch(validBatch({ events }), NOW);
    expect(result).toEqual({ ok: false, error: "events must contain 1 to 100 items" });
  });

  it("rejects an event name that is not snake_case", () => {
    const result = validateBatch(
      validBatch({ events: [{ name: "Popup Opened", ts: "2026-09-09T11:59:00.000Z" }] }),
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      error: "event name must match ^[a-z0-9_]{1,64}$: Popup Opened",
    });
  });

  it("rejects a timestamp outside the clock-skew window", () => {
    const result = validateBatch(
      validBatch({ events: [{ name: "popup_opened", ts: "2026-10-30T00:00:00.000Z" }] }),
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects props larger than the byte limit", () => {
    const props = { blob: "x".repeat(LIMITS.MAX_PROPS_BYTES + 1) };
    const result = validateBatch(
      validBatch({ events: [{ name: "popup_opened", ts: "2026-09-09T11:59:00.000Z", props }] }),
      NOW,
    );
    expect(result).toEqual({ ok: false, error: "props exceed 2048 bytes for event popup_opened" });
  });
});

describe("validateEnvelope", () => {
  // The split exists so the collector can answer 400 for an unusable request
  // and 202-with-a-report for an unusable event. These pin which side of that
  // line each check falls on, so a later refactor cannot quietly move one.
  it("accepts a well-formed envelope and hands back the raw events untouched", () => {
    const result = validateEnvelope(validBatch());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope).toEqual({
      writeKey: "wk_test",
      client: "extension",
      clientVersion: "0.1.0",
      appVersion: undefined,
      anonymousId: "11111111-2222-3333-4444-555555555555",
    });
    expect(result.events).toHaveLength(1);
  });

  it("does not look at the events themselves", () => {
    const result = validateEnvelope(validBatch({ events: ["not an event", { name: "Bad Name" }] }));
    expect(result.ok).toBe(true);
  });

  it("still rejects a batch size outside the wire limits", () => {
    expect(validateEnvelope(validBatch({ events: [] }))).toEqual({
      ok: false,
      error: "events must contain 1 to 100 items",
    });
  });

  it("carries location: false, the sender's word that no location may be worked out", () => {
    const result = validateEnvelope(validBatch({ location: false }));
    expect(result.ok && result.envelope.location).toBe(false);
  });

  it("drops any other location value rather than guessing what it meant", () => {
    // Only false withholds. Anything else is not a choice the SDK makes, so
    // the batch is treated as saying nothing, as every batch before this did.
    for (const location of [true, "false", 0, null]) {
      const result = validateEnvelope(validBatch({ location }));
      expect(result.ok && "location" in result.envelope).toBe(false);
    }
  });
});

describe("validateEvent", () => {
  it("accepts a well-formed event", () => {
    const result = validateEvent({ name: "popup_opened", ts: "2026-09-09T11:59:00.000Z" }, NOW);
    expect(result).toEqual({
      ok: true,
      event: { name: "popup_opened", ts: "2026-09-09T11:59:00.000Z" },
    });
  });

  it("rejects a name that is not snake_case", () => {
    expect(validateEvent({ name: "Popup Opened", ts: "2026-09-09T11:59:00.000Z" }, NOW)).toEqual({
      ok: false,
      error: "event name must match ^[a-z0-9_]{1,64}$: Popup Opened",
    });
  });

  it("rejects a non-object event", () => {
    expect(validateEvent("nope", NOW)).toEqual({
      ok: false,
      error: "each event must be an object",
    });
  });
});

describe("validateEvent, event id", () => {
  const event = { name: "page_view", ts: "2026-09-09T11:59:00.000Z" };

  it("accepts an event with an id", () => {
    expect(validateEvent({ ...event, id: "3f1c9a52-7b1e-4c0a-9d2f-0b6f5e2a8c11" }, NOW).ok).toBe(true);
  });

  it("accepts an event without one, as every 0.1 SDK sends", () => {
    // Optional so that SDKs already installed in customers' pages and
    // extensions keep being accepted; their events are simply not deduplicated.
    expect(validateEvent(event, NOW).ok).toBe(true);
  });

  it("rejects an id that is empty, too long or not a string", () => {
    for (const id of ["", "x".repeat(LIMITS.MAX_ID_LENGTH + 1), 42]) {
      expect(validateEvent({ ...event, id }, NOW)).toEqual({
        ok: false,
        error: `event id must be a string of 1 to ${LIMITS.MAX_ID_LENGTH} characters for event page_view`,
      });
    }
  });
});

describe("validateEvent, reserved props", () => {
  const ts = "2026-09-09T11:59:00.000Z";

  it("accepts a reserved prop the SDK sends", () => {
    expect(validateEvent({ name: "page_view", ts, props: { $referrer: "reddit.com" } }, NOW).ok).toBe(
      true,
    );
  });

  it("accepts the link props the web SDK sends", () => {
    // Link events (web SDK 0.5.0): a hostname and a file name, never a URL.
    expect(validateEvent({ name: "outbound_click", ts, props: { $host: "shop.example" } }, NOW).ok).toBe(true);
    expect(validateEvent({ name: "file_download", ts, props: { $file: "guide.pdf", $host: "cdn.example" } }, NOW).ok).toBe(true);
  });

  it("rejects a $-prefixed prop that is not reserved", () => {
    // The namespace is ours. A customer prop here would be indistinguishable
    // from captured data by the time it reached the collector.
    expect(validateEvent({ name: "page_view", ts, props: { $custom: "x" } }, NOW)).toEqual({
      ok: false,
      error: "props key $custom is reserved for event page_view",
    });
  });

  it("still accepts an event with no props at all", () => {
    // 0.1.x clients are live in customers' sites and send none of this.
    expect(validateEvent({ name: "page_view", ts }, NOW).ok).toBe(true);
  });

  it("leaves ordinary customer props alone", () => {
    expect(validateEvent({ name: "page_view", ts, props: { path: "/a", n: 1 } }, NOW).ok).toBe(true);
  });

  it("keeps the whole reserved set inside half the props budget", () => {
    // The reserved props are spent from the same allowance as the customer's
    // own, so this pins the deal: at the two capture limits, everything the
    // SDKs attach fits in under half, and the customer keeps the rest. A
    // future addition to RESERVED_PROPS that breaks that has to be a
    // deliberate decision, not a surprise in production.
    //
    // No event carries every reserved prop: $from_path goes on page views
    // only, and $host and $file on link events only (web SDK 0.5.0), so the
    // worst case is checked per kind of event.
    const worstCase = (keys: readonly string[]) =>
      Object.fromEntries(
        keys.map((key) => [
          key,
          "x".repeat(
            key.endsWith("path") ? LIMITS.MAX_CAPTURED_PATH_LENGTH : LIMITS.MAX_CAPTURED_VALUE_LENGTH,
          ),
        ]),
      );
    const LINK_ONLY = new Set(["$host", "$file"]);
    const pageView = RESERVED_PROPS.filter((key) => !LINK_ONLY.has(key));
    const linkEvent = RESERVED_PROPS.filter((key) => key !== "$from_path");
    for (const keys of [pageView, linkEvent]) {
      const bytes = new TextEncoder().encode(JSON.stringify(worstCase(keys))).length;
      expect(bytes).toBeLessThan(LIMITS.MAX_PROPS_BYTES / 2);
    }
  });
});
