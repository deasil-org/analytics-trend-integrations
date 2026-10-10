import type { IncomingEvent } from "@analyticstrend/event-schema";
import {
  createClient,
  isRetryableStatus,
  ANONYMOUS_ID_STORAGE_KEY,
  DEFAULT_ENDPOINT,
  DEFAULT_FLUSH_AT,
  type AnalyticsError,
  type StorageAdapter,
  type TransportAdapter,
} from "@analyticstrend/sdk-core";
import { createCapture } from "./capture.ts";
import { watchLinks } from "./links.ts";
import { watchNavigation } from "./navigation.ts";
import { WEB_SDK_VERSION } from "./version.ts";

const QUEUE_KEY_PREFIX = "analyticstrend.queue";
const ANON_KEY = ANONYMOUS_ID_STORAGE_KEY;
// DEFAULT_FLUSH_AT matters less here than in an extension — a web page has
// frequent flush triggers in pagehide and visibilitychange — but a long
// single-page-app session that never hides a tab has no trigger at all, and
// without a watermark that queue grows unbounded until it evicts.
// Browsers cap the *total* body size of in-flight keepalive requests at
// 64 KiB and reject anything over it before a byte leaves the machine. A full
// 100-event batch crosses that at roughly 600 bytes of props per event, which
// an ordinary page_view carrying a UTM-laden URL reaches without trying. The
// margin below the real cap covers header overhead and the chance that the
// host page has keepalive requests of its own sharing the same budget.
const KEEPALIVE_MAX_BODY_BYTES = 60 * 1024;

// The queue key is namespaced by write key because two kits can share a page —
// a tag manager alongside a hardcoded snippet, or two of our own products on
// one site. Each init() builds its own client, and a client's serialization
// orders only its own operations, so a shared key means one client reads the
// other's queued events out of storage and ships them under its own write key.
// The anonymous id key is deliberately NOT namespaced: it identifies the
// visitor, not the product, and two kits on one page see the same person.
function queueKey(writeKey: string): string {
  return `${QUEUE_KEY_PREFIX}.${writeKey}`;
}

// Every read and write goes through localStorage rather than memory: a page
// can be closed, reloaded or navigated away from at any moment, and an
// in-memory queue goes with it. JSON.parse always yields a fresh array, so
// read() never hands the client a live reference into the adapter's own state.
export function createLocalStorageAdapter(storage: Storage, writeKey: string): StorageAdapter {
  const key = queueKey(writeKey);
  return {
    async read() {
      try {
        const raw = storage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as IncomingEvent[]) : [];
      } catch {
        // Corrupt or unreadable storage must never break the host page —
        // losing a few queued events is strictly better than throwing.
        return [];
      }
    },
    async write(events) {
      try {
        storage.setItem(key, JSON.stringify(events));
      } catch {
        // Quota exceeded or storage disabled (private mode): drop silently.
      }
    },
  };
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

// Reading the `localStorage` property itself throws — before getItem or
// setItem is ever reached — in Chrome inside a third-party-blocked iframe and
// in Firefox with site data blocked. Both are at least as common as Safari
// private browsing, and this runs during init: the one path where a throw
// lands in the customer's page load. The in-memory fallback keeps the whole
// SDK working for the life of the page; only persistence across reloads is
// lost, and in those environments it was never available anyway.
//
// The per-call guards inside the adapter stay. They cover a different failure
// — a Storage object that exists and then throws from a method, which is what
// quota exhaustion looks like — and neither guard subsumes the other.
export function safeLocalStorage(): Storage {
  try {
    // The property read is the throwing operation, so it must happen inside
    // the try. Touching a key as well proves the object is actually usable
    // rather than merely present.
    const candidate = localStorage;
    candidate.getItem(ANON_KEY);
    return candidate;
  } catch {
    return createMemoryStorage();
  }
}

function generateAnonymousId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // randomUUID exists only in a secure context. On a plain http:// page — a
  // customer's staging server, an intranet app, a developer's local page —
  // `crypto.randomUUID` is undefined and calling it throws a TypeError
  // straight out of init, taking the host page's script down with it.
  //
  // Math.random is not cryptographically strong and does not need to be. An
  // anonymous analytics id is not a secret and guards nothing: it is never
  // used for authentication or authorisation, and an attacker who guesses one
  // gains nothing they could not get by sending events of their own. Its only
  // requirement is collision resistance across a single customer's users, and
  // a millisecond timestamp plus two independent Math.random draws provides
  // far more separation than that needs.
  const chunk = () => Math.random().toString(36).slice(2, 12);
  return `anon-${Date.now().toString(36)}-${chunk()}-${chunk()}`;
}

// Both storage calls are guarded because both throw in real deployments.
// Safari private browsing throws from setItem once its tiny quota is gone, and
// a browser configured to block site data throws from getItem as well. When
// persistence fails the generated id is still returned: the session then
// reports its events under one stable id held in memory, which is worth
// strictly more than either throwing or reporting nothing. It simply will not
// survive a reload.
export function getOrCreateWebAnonymousId(storage: Storage): string {
  let existing: string | null = null;
  try {
    existing = storage.getItem(ANON_KEY);
  } catch {
    // Storage disabled entirely — fall through and generate a per-load id.
  }
  if (existing) return existing;

  const generated = generateAnonymousId();
  try {
    storage.setItem(ANON_KEY, generated);
  } catch {
    // Over quota or storage disabled: keep the id for this page's lifetime.
  }
  return generated;
}

export function createTransport(endpoint: string): TransportAdapter {
  return {
    async send(batch, context) {
      try {
        const body = JSON.stringify(batch);

        // keepalive lets an in-flight flush survive the page unloading, which
        // is exactly when the last and most interesting events fire. It is
        // asked for only when it is needed, and only when it can actually
        // work.
        //
        // Browsers reject a keepalive request whose body pushes the total
        // in-flight keepalive size past 64 KiB, deterministically and before
        // sending. The body is a pure function of the batch, so a retry would
        // build the identical body and fail identically: asking for keepalive
        // on an oversized batch would wedge the queue behind a chunk that can
        // never drain, until it filled to maxQueue and started evicting.
        //
        // Dropping keepalive instead means the request may be cancelled by the
        // unload, which fails retryably and keeps the queue — recoverable on
        // the next load's startup flush. Classifying it as permanent would be
        // worse still: it would discard events we can send perfectly well on
        // an ordinary flush.
        const keepalive =
          context?.unloading === true &&
          new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BODY_BYTES;

        const response = await fetch(`${endpoint}/v1/collect`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive,
        });
        // Shared with the extension SDK rather than reimplemented: one copy
        // of the rule, with its reasoning attached, in @analyticstrend/sdk-core.
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

// The browser's Global Privacy Control signal. Read through globalThis so a
// runtime without navigator reads as no signal rather than throwing.
function globalPrivacyControl(): boolean {
  return (
    (globalThis as { navigator?: { globalPrivacyControl?: unknown } }).navigator
      ?.globalPrivacyControl === true
  );
}

export type WebClient = ReturnType<typeof createClient> & {
  // False when the browser sent Global Privacy Control and it is respected:
  // nothing is being counted. A site can use it to adjust its own notice.
  enabled: boolean;
};

// What init returns for a browser that asked not to be tracked: the same
// shape, doing nothing. No identifier, no listeners, no startup flush.
function inertClient(): WebClient {
  return { enabled: false, track: async () => {}, flush: async () => {} };
}

// Removes what an earlier visit stored. Only on request: no privacy law
// requires erasure on the signal, which asks for no further processing, and
// some customers will want the default to leave the device as it was.
function clearStoredData(writeKey: string): void {
  const storage = safeLocalStorage();
  for (const key of [ANON_KEY, queueKey(writeKey)]) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage refusing is the same as there being nothing to remove.
    }
  }
}

export function init(options: {
  writeKey: string;
  endpoint?: string;
  appVersion?: string;
  // Diagnostic only, and deliberately without a default: this code runs in a
  // customer's page, and we do not get to decide what lands in their console.
  onError?: (error: AnalyticsError) => void;
  // Auto-capture is on by default, because a Sources report that depends on
  // every customer wiring up props correctly is a Sources report that is empty
  // for most of them. The escape hatch is here for the compliance review that
  // objects to implicit collection at all.
  autoCapture?: boolean;
  // On by default: a browser sending Global Privacy Control sends nothing and
  // stores nothing. Turn it off only on a considered legal position.
  respectGlobalPrivacyControl?: boolean;
  // Off by default: also delete an identifier and queue stored before the
  // signal appeared. Ignored when the signal is not respected.
  clearDataOnGlobalPrivacyControl?: boolean;
  // Off by default: "history" sends a page view now and one each time the
  // path changes (in-app navigation included). A site that sends its own on
  // route change would count every page twice with it on.
  pageViews?: "history";
  // Each off by default: a site turning one on starts a
  // new kind of collection, which its own privacy wording must cover first.
  // A link to another site, by hostname only.
  outboundLinks?: boolean;
  // A file download, by file name.
  fileDownloads?: boolean;
  // An email or phone link, with no address or number.
  contactLinks?: boolean;
}): WebClient {
  // Read once per page load: a changed setting reaches a site on its next
  // load anyway. Checked before anything else, so the inert path never
  // touches storage, registers a listener, or creates an identifier.
  if ((options.respectGlobalPrivacyControl ?? true) && globalPrivacyControl()) {
    if (options.clearDataOnGlobalPrivacyControl) clearStoredData(options.writeKey);
    return inertClient();
  }

  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  // Resolved once and shared by both call sites below, so a page where the
  // property access throws gets one memory store rather than two that cannot
  // see each other's writes.
  const storage = safeLocalStorage();

  const client = createClient({
    writeKey: options.writeKey,
    client: "web",
    clientVersion: WEB_SDK_VERSION,
    appVersion: options.appVersion,
    anonymousId: getOrCreateWebAnonymousId(storage),
    storage: createLocalStorageAdapter(storage, options.writeKey),
    transport: createTransport(endpoint),
    onError: options.onError,
    flushAt: DEFAULT_FLUSH_AT,
  });

  // pagehide is the reliable "the page is going away" signal across browsers;
  // visibilitychange catches tab switches on mobile, where pagehide may not fire.
  addEventListener("pagehide", () => void client.flush({ unloading: true }));
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void client.flush({ unloading: true });
  });

  // The startup flush, and it is load-bearing rather than an optimisation.
  // Anything left queued by an unload flush that was cancelled mid-request —
  // including the oversized batch that deliberately went without keepalive
  // above — would otherwise wait for the next tab hide, which would take the
  // same unloading path and fail the same way. This is the one trigger that
  // retries under ordinary conditions, with no time pressure and no size cap,
  // so it is what actually drains a queue the unload path could not.
  //
  // Fire-and-forget, and without the unloading flag: init must not become
  // async or block the page, and flush resolves rather than rejects by
  // contract, so there is nothing here to catch.
  void client.flush();

  if (options.autoCapture === false) return watchPage({ ...client, enabled: true }, options);

  // Read through a function rather than captured up front, so the path stays
  // current as the visitor navigates, and so capture.ts needs no reference to
  // the DOM and can be tested without one.
  const capture = createCapture(() => ({
    referrer: document.referrer,
    href: location.href,
    origin: location.origin,
  }));

  return watchPage(
    {
      ...client,
      enabled: true,
      // The caller's props go last. Theirs is the explicit instruction, and the
      // reserved namespace means an overlap can only ever be deliberate.
      track: (name: string, props?: Record<string, unknown>) =>
        client.track(name, { ...capture(name), ...props }),
    },
    options,
  );
}

// Page views on navigation, and link events, when asked for. Both go through
// the client init returns, so each carries what auto-capture adds.
function watchPage(
  client: WebClient,
  options: { pageViews?: "history"; outboundLinks?: boolean; fileDownloads?: boolean; contactLinks?: boolean },
): WebClient {
  if (options.pageViews === "history") {
    // A site may also count its own page views, as 0.4's guide told single-
    // page apps to: a page view for the page just counted is not sent again,
    // whichever of the two comes first.
    const track = client.track;
    let counted: string | undefined;
    client = {
      ...client,
      track: (name: string, props?: Record<string, unknown>) => {
        if (name === "page_view") {
          const path = globalThis.location?.pathname;
          if (path !== undefined && path === counted) return Promise.resolve();
          counted = path;
        }
        return track(name, props);
      },
    };
    const counting = client;
    void counting.track("page_view");
    watchNavigation(() => void counting.track("page_view"));
  }
  const kinds = {
    outbound: options.outboundLinks === true,
    downloads: options.fileDownloads === true,
    contact: options.contactLinks === true,
  };
  if (kinds.outbound || kinds.downloads || kinds.contact) {
    watchLinks(kinds, (event) => void client.track(event.name, "props" in event ? event.props : undefined));
  }
  return client;
}
