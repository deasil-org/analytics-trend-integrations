import { LIMITS } from "@analyticstrend/event-schema";

// Link events, each off unless the site turns it on: a
// click to another site, a file download, and an email or phone link. What
// is sent is reduced as the referrer is: a hostname, never a path or query;
// a file's name; and nothing at all for an email address or phone number,
// which can be a person's own.

export type LinkEvent =
  | { name: "outbound_click"; props: { $host: string } }
  | { name: "file_download"; props: { $file: string; $host?: string } }
  | { name: "email_click" | "phone_click" };

export type LinkKinds = { outbound: boolean; downloads: boolean; contact: boolean };

const DOWNLOADS = new Set([
  "pdf", "zip", "rar", "7z", "gz", "dmg", "exe", "msi", "pkg", "apk",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "epub",
  "mp3", "wav", "mp4", "mov", "webm",
]);

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

function fileName(pathname: string): string {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    // A malformed escape: the name as written is still a name.
    return last;
  }
}

/** What a link leads to, or null when following it is not an event. */
export function classifyLink(
  href: string,
  pageHost: string,
  hasDownloadAttribute: boolean,
  // What a relative href is read against: the page's own address.
  base = `https://${pageHost}/`,
): LinkEvent | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol === "mailto:") return { name: "email_click" };
  if (url.protocol === "tel:") return { name: "phone_click" };
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const elsewhere = bare(url.hostname) !== bare(pageHost);
  const name = fileName(url.pathname);
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (name && (hasDownloadAttribute || DOWNLOADS.has(extension))) {
    const $file = name.slice(0, LIMITS.MAX_CAPTURED_VALUE_LENGTH);
    return { name: "file_download", props: elsewhere ? { $file, $host: url.hostname } : { $file } };
  }
  return elsewhere ? { name: "outbound_click", props: { $host: url.hostname } } : null;
}

type LinkElement = { getAttribute(name: string): string | null; hasAttribute(name: string): boolean };
type ClickEvent = { type: string; button: number; target: unknown };

export type LinkDocument = {
  location: { hostname: string; href: string };
  addEventListener(type: "click" | "auxclick", listener: (event: never) => void, capture?: boolean): void;
  removeEventListener(type: "click" | "auxclick", listener: (event: never) => void, capture?: boolean): void;
};

function enabled(event: LinkEvent, kinds: LinkKinds): boolean {
  if (event.name === "outbound_click") return kinds.outbound;
  if (event.name === "file_download") return kinds.downloads;
  return kinds.contact;
}

/**
 * Watches clicks on links, in the capture phase so a page that stops a
 * click\x27s propagation still has it counted. Never prevents or delays the
 * navigation: a click that leaves the page is delivered by the page-hide
 * flush. Returns a function that stops watching.
 */
export function watchLinks(
  kinds: LinkKinds,
  send: (event: LinkEvent) => void,
  doc: LinkDocument = globalThis.document as unknown as LinkDocument,
): () => void {
  const onClick = (event: ClickEvent) => {
    // A middle click opens the link; a right click opens a menu.
    if (event.type === "auxclick" && event.button !== 1) return;
    const target = event.target as { closest?: (selector: string) => LinkElement | null } | null;
    // closest() walks up from what was clicked, an icon\x27s <svg> path
    // included, to the link around it. A text node has no closest().
    const link = typeof target?.closest === "function" ? target.closest("a[href]") : null;
    const href = link?.getAttribute("href");
    if (!link || !href) return;
    // Read inside classifyLink's try: an address the page got wrong is no
    // reason to throw on someone else's page.
    const found = classifyLink(href, doc.location.hostname, link.hasAttribute("download"), doc.location.href);
    if (found && enabled(found, kinds)) send(found);
  };
  doc.addEventListener("click", onClick as (event: never) => void, true);
  doc.addEventListener("auxclick", onClick as (event: never) => void, true);
  return () => {
    doc.removeEventListener("click", onClick as (event: never) => void, true);
    doc.removeEventListener("auxclick", onClick as (event: never) => void, true);
  };
}
