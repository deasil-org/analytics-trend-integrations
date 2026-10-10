import {
  createClient,
  isRetryableStatus,
  DEFAULT_ENDPOINT,
  DEFAULT_FLUSH_AT,
  type AnalyticsError,
  type TransportAdapter,
} from "@analyticstrend/sdk-core";
import { getBrowserApi, type BrowserApi } from "./browser.ts";
import { hasDataConsent, hasLocationConsent, onDataConsentChanged } from "./consent.ts";
import { clearStoredData, createExtensionStorage, getOrCreateAnonymousId } from "./storage.ts";
import { EXTENSION_SDK_VERSION } from "./version.ts";

export { getBrowserApi, type BrowserApi } from "./browser.ts";
export {
  hasDataConsent,
  hasLocationConsent,
  onDataConsentChanged,
  ANALYTICS_DATA_PERMISSION,
  LOCATION_DATA_PERMISSION,
} from "./consent.ts";
export { createExtensionStorage, getOrCreateAnonymousId } from "./storage.ts";

const MESSAGE_TYPE = "analyticstrend:track";

export function createTransport(endpoint: string): TransportAdapter {
  return {
    async send(batch, context) {
      try {
        const response = await fetch(`${endpoint}/v1/collect`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batch),
          // Driven by the caller rather than hardcoded, identically to the web
          // SDK's transport, so the two stay the same shape. No extension
          // trigger sets `unloading` today — a background context is torn down
          // with no chance to run anything, which is why the queue is durable
          // instead — but the contract is shared, and a transport that quietly
          // ignored the context is exactly how the two would drift apart.
          keepalive: context?.unloading === true,
        });
        // Shared with the web SDK rather than reimplemented: one copy of the
        // rule, with its reasoning attached, in @analyticstrend/sdk-core.
        const retryable = isRetryableStatus(response.status);
        // The status rides along so sdk-core's onError can tell an integrator
        // *which* failure this was. Reporting itself stays in sdk-core: see
        // the onError doc comment on ClientOptions for why a transport that
        // called the hook from inside this catch would be a bug.
        return { ok: response.ok, retryable, status: response.status };
      } catch {
        return { ok: false, retryable: true };
      }
    },
  };
}

// setUninstallURL fires a plain navigation as the browser removes the
// extension, which is why the collector exposes a GET route for it — there is
// no opportunity to run code, let alone send a POST, at that point.
//
// Shared by initBackground's uninstallTracking flag and the standalone
// enableUninstallTracking export below, so both build the same URL from
// values the caller already has rather than duplicating the encoding logic.
//
// l=0 carries a declined location (Firefox's locationInfo) into the link, the
// same choice a batch's location: false carries, because the browser opens it
// long after any code could ask.
function registerUninstallUrl(
  api: BrowserApi,
  writeKey: string,
  anonymousId: string,
  endpoint: string,
  locationDeclined = false,
): void {
  const url = `${endpoint}/v1/uninstall?k=${encodeURIComponent(writeKey)}&u=${encodeURIComponent(
    anonymousId,
  )}${locationDeclined ? "&l=0" : ""}`;

  void api.runtime.setUninstallURL?.(url);
}

// How long after a track the background sends, when nothing else has. An idle
// MV3 service worker is suspended about 30 seconds after its last event, and a
// Firefox event page on a similar clock, so this has to land well inside that
// window or the send never happens in this lifetime. Short enough that a
// developer who installs the SDK sees their first event in the dashboard's next
// rollup rather than whenever the background happens to restart.
export const DELIVERY_DELAY_MS = 5_000;

// Ceiling for the delay while sends are failing. flush() is exempt from
// sdk-core's watermark cooldown, so the backoff for these scheduled sends has
// to live here: without it a failing collector would be retried every
// DELIVERY_DELAY_MS for as long as the extension is busy.
export const MAX_DELIVERY_DELAY_MS = 5 * 60_000;

export type ExtensionClient = {
  track(name: string, props?: Record<string, unknown>): Promise<void>;
  flush(): Promise<void>;
  // Whether anything is being counted right now: consent given, and Global
  // Privacy Control either absent or not respected.
  enabled(): Promise<boolean>;
  // Re-asks the extension's own switch and makes the uninstall link follow
  // it. Sends nothing.
  consentChanged(): void;
};

// The browser's Global Privacy Control signal, where the background context
// can see it. Absent means no signal: GPC is a signal to websites, and not
// every browser exposes it to an extension, so this is best effort.
function globalPrivacyControl(): boolean {
  return (
    (globalThis as { navigator?: { globalPrivacyControl?: unknown } }).navigator
      ?.globalPrivacyControl === true
  );
}

/**
 * Starts analytics in the background context. Call it at the top level of the
 * background script, on every start, and do not `await` it there.
 *
 * It returns the client synchronously for two reasons that only show up in a
 * real browser. Chrome refuses to run a service worker that uses top-level
 * `await` — the extension loads and sends nothing, with no error on the page —
 * so a promise here invites exactly that mistake. And the message listener has
 * to be attached before the script's first turn ends: when a content script's
 * message is what wakes a suspended worker, the browser dispatches it as soon
 * as the script has run, and a listener attached after an `await` misses it.
 *
 * Events tracked before storage is ready wait for it inside the client, in
 * order. `await initBackground(...)` still works where top-level await is
 * allowed, because awaiting a non-promise returns it unchanged.
 */
export function initBackground(options: {
  writeKey: string;
  endpoint?: string;
  appVersion?: string;
  onError?: (error: AnalyticsError) => void;
  // Chrome persists a previously-set uninstall URL across service-worker
  // restarts, but Firefox does not — its event page must call
  // setUninstallURL again on every run of the background script, or
  // uninstall tracking silently stops working the first time the event page
  // unloads. initBackground already runs on every background start on both
  // browsers, so registering here (rather than leaving it to an integrator's
  // own onInstalled handler, which only fires once) makes the Firefox
  // difference stop mattering: registration happens every start, on both
  // browsers, by construction.
  uninstallTracking?: boolean;
  // On by default: while the browser sends Global Privacy Control, nothing is
  // sent or stored. Turn it off only on a considered legal position.
  respectGlobalPrivacyControl?: boolean;
  // Off by default: also delete the stored identifier and queue when the
  // signal appears. Ignored when the signal is not respected.
  clearDataOnGlobalPrivacyControl?: boolean;
  // The extension's own on/off switch, for an extension that asks the person
  // itself. Asked before every event and every send, alongside Firefox's
  // consent and Global Privacy Control; all of them have to allow it. Anything
  // but true, an error or a rejected promise counts as off.
  consent?: () => boolean | Promise<boolean>;
}): ExtensionClient {
  const api = getBrowserApi();
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;

  // An answer that cannot be had counts as off, as with Firefox's location
  // toggle: a missed event costs less than a choice ignored.
  async function switchAllows(): Promise<boolean> {
    if (!options.consent) return true;
    try {
      return (await options.consent()) === true;
    } catch {
      return false;
    }
  }

  let failedSince = false;
  let consecutiveFailures = 0;

  // Firefox lets someone decline analytics at install and change their mind
  // afterwards, and leaves honouring that to the extension. Re-read rather
  // than cached for the life of the background, because that life can be
  // hours and the answer can change inside it.
  let consent = hasDataConsent(api);
  onDataConsentChanged(api, () => {
    consent = hasDataConsent(api);
    // The extension's own switch is asked too: granting Firefox's permission
    // while that switch is off must not put the identifier back.
    consent
      .then(async (ok) => uninstallUrlFollows(ok && !signalled && (await switchAllows())))
      .catch(() => {});
  });

  // Firefox's separate location toggle, read fresh each time. An answer that
  // cannot be had counts as declined: a missing country costs less than a
  // choice ignored.
  function locationConsent(): Promise<boolean> {
    return hasLocationConsent(api).catch(() => false);
  }

  // Bumped by every decision about the uninstall URL, so an asynchronous
  // registration can tell whether it has been overtaken.
  let uninstallGeneration = 0;

  // Created only once collection is allowed, so a browser that never allows
  // it never gets an identifier, and neither does its uninstall URL.
  let ready: Promise<ReturnType<typeof createClient>> | undefined;
  let knownId: string | undefined;
  function client() {
    const generation = uninstallGeneration;
    ready ??= Promise.all([getOrCreateAnonymousId(api), locationConsent()]).then(([anonymousId, locationOk]) => {
      knownId = anonymousId;
      // Skipped when the uninstall URL has been decided since this started,
      // so a slow first read cannot re-set a URL that consent just cleared.
      if (options.uninstallTracking && generation === uninstallGeneration) {
        registerUninstallUrl(api, options.writeKey, anonymousId, endpoint, !locationOk);
      }

      return createClient({
        writeKey: options.writeKey,
        client: "extension",
        clientVersion: EXTENSION_SDK_VERSION,
        appVersion: options.appVersion,
        anonymousId,
        storage: createExtensionStorage(api),
        transport: createTransport(endpoint),
        // Asked at every send, since that is when the collector reads the
        // address, and a toggle can change between track and send.
        locationAllowed: locationConsent,
        onError(error) {
          // Only delivery failures count towards the backoff. An invalid event
          // name is reported through the same hook but says nothing about
          // whether the collector is reachable.
          if (error.kind === "send-failed" || error.kind === "send-threw") failedSince = true;
          options.onError?.(error);
        },
        flushAt: DEFAULT_FLUSH_AT,
      });
    });
    return ready;
  }

  // The uninstall URL carries the identifier, so it follows whether collection
  // is allowed the moment that changes, not only at the next background start:
  // uninstalling right after withdrawing consent must not still send it.
  //
  // It also carries l=0 while location is declined, which is read without
  // blocking the clear: an answer that arrives after a later decision is
  // dropped, so a stale "allowed" never re-sets a URL just cleared.
  function uninstallUrlFollows(allowedNow: boolean): void {
    if (!options.uninstallTracking) return;
    const generation = ++uninstallGeneration;
    if (!allowedNow) {
      void api.runtime.setUninstallURL?.("");
      return;
    }
    const anonymousId = knownId;
    if (!anonymousId) return;
    void locationConsent().then((locationOk) => {
      if (generation !== uninstallGeneration) return;
      registerUninstallUrl(api, options.writeKey, anonymousId, endpoint, !locationOk);
    });
  }

  const respectGpc = options.respectGlobalPrivacyControl ?? true;
  // Whether the last check found the signal present and respected, so each
  // change is acted on once, in either direction.
  let signalled = false;

  // Checked before every track and flush: a background can run for hours, and
  // the signal can change inside that time.
  async function gpcBlocks(): Promise<boolean> {
    const blocked = respectGpc && globalPrivacyControl();
    if (blocked !== signalled) {
      signalled = blocked;
      if (blocked && options.clearDataOnGlobalPrivacyControl) {
        await clearStoredData(api);
        // The client in memory still holds the deleted identifier.
        ready = undefined;
        knownId = undefined;
      }
      uninstallUrlFollows(!blocked);
    }
    return blocked;
  }

  // In this order: Global Privacy Control's check acts on a change it sees, so
  // it runs only once the other two have allowed collection.
  async function allowed(): Promise<boolean> {
    return (await consent) && (await switchAllows()) && !(await gpcBlocks());
  }

  function consentChanged(): void {
    allowed()
      .then((ok) => uninstallUrlFollows(ok))
      .catch(() => {});
  }

  async function flush(): Promise<void> {
    if (!(await allowed())) return;

    const active = await client();
    failedSince = false;
    await active.flush();
    consecutiveFailures = failedSince ? consecutiveFailures + 1 : 0;
  }

  let pending: ReturnType<typeof setTimeout> | undefined;

  // One timer at a time, and it is not pushed back by later tracks: a busy
  // extension still sends every few seconds instead of never, because every
  // track would otherwise restart the wait.
  function scheduleDelivery(): void {
    if (pending !== undefined) return;

    const delay = Math.min(
      DELIVERY_DELAY_MS * 2 ** consecutiveFailures,
      MAX_DELIVERY_DELAY_MS,
    );
    pending = setTimeout(() => {
      pending = undefined;
      flush().catch(() => {});
    }, delay);
  }

  async function track(name: string, props?: Record<string, unknown>): Promise<void> {
    // Dropped rather than queued. Queueing would write the event to extension
    // storage and send it the moment consent arrived, which is collecting the
    // data of someone who said no and hoping they change their mind. The same
    // holds for a browser sending Global Privacy Control.
    if (!(await allowed())) return;

    const active = await client();
    await active.track(name, props);
    scheduleDelivery();
  }

  // Content scripts cannot own a durable queue, so they post to the background
  // context and everything funnels through this one client. Attached here,
  // before anything is awaited — see the doc comment above for why that
  // placement is the difference between receiving a waking message and not.
  //
  // track only, with no flush of its own. A flush per message reinstated the
  // retry storm sdk-core's watermark cooldown exists to prevent: while the
  // collector was failing, a busy page produced one request per event. The
  // scheduled delivery in track() is bounded and backs off instead.
  api.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: string }).type === MESSAGE_TYPE
    ) {
      const { name, props } = message as { name: string; props?: Record<string, unknown> };
      // Caught here because nothing awaits a listener: if extension storage
      // is unavailable, every track rejects, and an unhandled rejection in
      // the background is noise in a console the integrator reads.
      track(name, props).catch(() => {});
    }
  });

  // Ship whatever the previous lifetime left queued. Every background start
  // runs this, which is what makes a suspension mid-flush cost nothing, and
  // when collection is allowed it is also what registers the uninstall URL.
  // Called directly, not behind an await of its own: it must stay ahead of
  // messages arriving in the same turn, or it flushes their events instead of
  // the empty queue it found and defeats the watermark's cooldown.
  flush().catch(() => {});

  // When collection is not allowed, make sure no uninstall URL is left over
  // from an earlier session: Chrome keeps it across restarts, and it carries
  // the identifier.
  if (options.uninstallTracking) {
    allowed()
      .then((ok) => {
        if (!ok) void api.runtime.setUninstallURL?.("");
      })
      .catch(() => {});
  }

  return {
    track,
    flush,
    enabled: async () =>
      (await consent) && (await switchAllows()) && !(respectGpc && globalPrivacyControl()),
    consentChanged,
  };
}

export function trackFromContentScript(name: string, props?: Record<string, unknown>): void {
  // sendMessage rejects when no background listener is live — the service
  // worker is still starting, or the extension is reloading. That is normal
  // and unactionable from a content script, and an unhandled rejection here
  // lands in the console of a page the customer does not own.
  void Promise.resolve(
    getBrowserApi().runtime.sendMessage({ type: MESSAGE_TYPE, name, props }),
  ).catch(() => {});
}

// Exported for integrators who want to drive uninstall tracking themselves
// instead of using initBackground's `uninstallTracking` flag. If you call
// this directly: it must run on every execution of the background script,
// never only from an onInstalled or onUpdateAvailable handler. Chrome
// persists the URL across service-worker restarts, so a once-per-install
// call happens to work there, but Firefox does not persist it across event
// page unloads — gating this behind an install/update event silently breaks
// uninstall tracking on Firefox the first time the event page unloads.
export function enableUninstallTracking(options: {
  writeKey: string;
  anonymousId: string;
  endpoint?: string;
}): void {
  const api = getBrowserApi();
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  registerUninstallUrl(api, options.writeKey, options.anonymousId, endpoint);
}
