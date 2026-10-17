import { describe, expect, it } from "vitest";
import {
  APP_OS,
  ENGAGEMENT_EVENT,
  DEVICE_TYPES,
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
    expect(result).toEqual({ ok: false, error: "client must be 'extension', 'web' or 'app'" });
  });

  // A mobile, desktop, server or game app sending over HTTP.
  it("accepts an app as the client", () => {
    const result = validateBatch(validBatch({ client: "app" }), NOW);
    expect(result.ok).toBe(true);
    expect(result.ok && result.batch.client).toBe("app");
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

// An app says what it runs on, since a native app's User-Agent names no
// browser or system the collector can read. Families from fixed lists only,
// the same the collector works out for a browser.
describe("an app's declared system and device type", () => {
  it("are kept when they are on the list", () => {
    const result = validateBatch(validBatch({ client: "app", os: "Android", deviceType: "mobile" }), NOW);
    expect(result.ok && [result.batch.os, result.batch.deviceType]).toEqual(["Android", "mobile"]);
    const envelope = validateEnvelope(validBatch({ client: "app", os: "macOS", deviceType: "desktop" }));
    expect(envelope.ok && [envelope.envelope.os, envelope.envelope.deviceType]).toEqual(["macOS", "desktop"]);
  });

  it("are dropped, not refused, when they are not", () => {
    const result = validateBatch(validBatch({ client: "app", os: "Android 14 (Pixel 8)", deviceType: "phone" }), NOW);
    expect(result.ok).toBe(true);
    expect(result.ok && "os" in result.batch).toBe(false);
    expect(result.ok && "deviceType" in result.batch).toBe(false);
  });

  it("lists every system and device type the collector knows", () => {
    expect(APP_OS).toEqual(["iOS", "Android", "macOS", "Windows", "Linux", "ChromeOS"]);
    expect(DEVICE_TYPES).toEqual(["mobile", "tablet", "desktop"]);
  });
});

describe("$engaged_ms", () => {
  const ts = new Date().toISOString();
  const props = (event: unknown) => (event as { props?: Record<string, unknown> }).props;

  it("is kept on a page_engagement within 1 second and 30 minutes", () => {
    for (const ms of [LIMITS.MIN_ENGAGED_MS, 61_234, LIMITS.MAX_ENGAGED_MS]) {
      const result = validateEvent({ name: ENGAGEMENT_EVENT, ts, props: { $engaged_ms: ms, $path: "/" } });
      expect(result.ok && props(result.event)).toEqual({ $engaged_ms: ms, $path: "/" });
    }
  });

  it("is dropped, not refused, when out of range, not a whole number, or on another event", () => {
    const cases = [
      { name: ENGAGEMENT_EVENT, props: { $engaged_ms: 999, $path: "/" } },
      { name: ENGAGEMENT_EVENT, props: { $engaged_ms: 1_800_001, $path: "/" } },
      { name: ENGAGEMENT_EVENT, props: { $engaged_ms: 1500.5, $path: "/" } },
      { name: ENGAGEMENT_EVENT, props: { $engaged_ms: "2000", $path: "/" } },
      { name: "page_view", props: { $engaged_ms: 5000, $path: "/" } },
    ];
    for (const input of cases) {
      const result = validateEvent({ ...input, ts });
      expect(result.ok).toBe(true);
      expect(result.ok && props(result.event)).toEqual({ $path: "/" });
    }
  });

  it("names the signal and its limits", () => {
    expect(ENGAGEMENT_EVENT).toBe("page_engagement");
    expect(LIMITS.MIN_ENGAGED_MS).toBe(1000);
    expect(LIMITS.MAX_ENGAGED_MS).toBe(1_800_000);
  });
});
