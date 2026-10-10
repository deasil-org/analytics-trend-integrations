import { LIMITS } from "@analyticstrend/event-schema";

// What the SDK observes about a visit, and nothing more. Deliberately
// observations rather than conclusions: the mapping from a hostname to
// "Google, Organic Search" lives on the collector, in one place, where it can
// be tested against the referrer datasets and where a browser never pays for
// it. This file decides what is worth looking at; it decides nothing about
// what any of it means.

/**
 * A document's world. Supplied as a function rather than read from globals so
 * that this module has no DOM dependency and its rules can be tested without a
 * browser environment.
 */
export type Environment = {
  referrer: string;
  href: string;
  origin: string;
};

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const CLICK_IDS = ["gclid", "msclkid", "fbclid"] as const;
const PAGE_VIEW = "page_view";

function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    // An unparseable referrer or href is not an error worth surfacing. It
    // means no source, and the host page carries on — this code runs inside
    // init, on somebody else's page load.
    return undefined;
  }
}

function clip(value: string): string {
  return value.slice(0, LIMITS.MAX_CAPTURED_VALUE_LENGTH);
}

// Resolved once per document. document.referrer is fixed when the document is
// created and does not change on history.pushState, so reading it per event
// would attribute every route change in a single-page app to the visit's
// original referrer all over again.
function captureVisit(environment: Environment): Record<string, string> {
  const props: Record<string, string> = {};
  const landing = parse(environment.href);

  if (landing) {
    for (const param of UTM_PARAMS) {
      const value = landing.searchParams.get(param);
      if (value) props[`$${param}`] = clip(value);
    }

    const ref = landing.searchParams.get("ref") ?? landing.searchParams.get("source");
    if (ref) props.$ref = clip(ref);

    // The name only. The value is a per-click advertising identifier: it
    // says nothing about where the visitor came from that the name does not
    // already say, and it is precisely the kind of opaque per-person token
    // this product exists not to collect.
    const clickId = CLICK_IDS.find((id) => landing.searchParams.has(id));
    if (clickId) props.$click_id = clickId;
  }

  const referrer = parse(environment.referrer);
  if (referrer && referrer.origin !== environment.origin) {
    props.$referrer = clip(referrer.hostname);
  }

  return props;
}

/**
 * Builds the per-event capture function for one document.
 *
 * `read` is called afresh on every event, because the path changes as the
 * visitor navigates. The visit-level props are computed once, from the first
 * read, for the reason given on captureVisit above.
 */
export function createCapture(read: () => Environment): (name: string) => Record<string, string> {
  const visit = captureVisit(read());
  let lastPath: string | undefined;

  return (name) => {
    const environment = read();
    const current = parse(environment.href);
    const props: Record<string, string> = { ...visit };

    if (!current) return props;

    // Paths get their own, longer bound. Truncating a path corrupts the data
    // rather than merely shortening it: two different pages sharing a long
    // prefix would collapse into one row in every report.
    const path = current.pathname.slice(0, LIMITS.MAX_CAPTURED_PATH_LENGTH);
    props.$path = path;

    // Only a page view is a navigation. An affiliate click happens *on* a
    // page, and chaining through it would put a move in the flow report that
    // nobody made.
    if (name !== PAGE_VIEW) return props;

    // The previous page this document reported, else — on the document's
    // first page view — a same-origin referrer, which keeps its path where a
    // cross-origin one would have been reduced to an origin by the browser.
    // That one rule covers single-page and multi-page sites alike.
    const referrer = parse(environment.referrer);
    const from =
      lastPath ??
      (referrer && referrer.origin === environment.origin
        ? referrer.pathname.slice(0, LIMITS.MAX_CAPTURED_PATH_LENGTH)
        : undefined);
    if (from !== undefined) props.$from_path = from;

    lastPath = path;
    return props;
  };
}
