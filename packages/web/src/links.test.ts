import { describe, expect, it, vi } from "vitest";
import { classifyLink, watchLinks, type LinkDocument, type LinkEvent } from "./links.ts";

// Link events: where a click leads, reduced to a hostname
// or a file name, and nothing that could identify a person.

const PAGE = "shop.example";

describe("classifyLink", () => {
  it("records only the hostname of a link to another site", () => {
    const event = classifyLink("https://partner.example/p?id=1&ref=me#top", PAGE, false);
    expect(event).toEqual({ name: "outbound_click", props: { $host: "partner.example" } });
    expect(JSON.stringify(event)).not.toMatch(/id=1|\/p|#top/);
  });

  it("treats the same site with or without www as the same site", () => {
    expect(classifyLink("https://www.shop.example/about", PAGE, false)).toBeNull();
    expect(classifyLink("https://shop.example/about", `www.${PAGE}`, false)).toBeNull();
    expect(classifyLink("/about", PAGE, false)).toBeNull();
  });

  it("records a download by its file name, and its host only when elsewhere", () => {
    expect(classifyLink("https://shop.example/files/Guide%20Book.PDF", PAGE, false)).toEqual({
      name: "file_download",
      props: { $file: "Guide Book.PDF" },
    });
    expect(classifyLink("https://cdn.example/a/report.xlsx?sig=abc", PAGE, false)).toEqual({
      name: "file_download",
      props: { $file: "report.xlsx", $host: "cdn.example" },
    });
  });

  it("counts a link with a download attribute as a download, whatever its extension", () => {
    expect(classifyLink("https://shop.example/export/data", PAGE, true)).toEqual({
      name: "file_download",
      props: { $file: "data" },
    });
  });

  it("clips a long file name", () => {
    const event = classifyLink(`https://shop.example/${"a".repeat(100)}.pdf`, PAGE, false);
    expect(event?.name).toBe("file_download");
    expect((event as Extract<LinkEvent, { name: "file_download" }>).props.$file).toHaveLength(64);
  });

  it("sends an email or phone link with no address or number", () => {
    expect(classifyLink("mailto:jane.doe@example.com?subject=Hi", PAGE, false)).toEqual({ name: "email_click" });
    expect(classifyLink("tel:+1-555-0100", PAGE, false)).toEqual({ name: "phone_click" });
  });

  it("ignores links that go nowhere a person leaves for", () => {
    expect(classifyLink("javascript:void(0)", PAGE, false)).toBeNull();
    expect(classifyLink("#section", PAGE, false)).toBeNull();
    expect(classifyLink("ftp://files.example/x", PAGE, false)).toBeNull();
    expect(classifyLink("http://[bad", PAGE, false)).toBeNull();
  });
});

function fakeDocument() {
  const listeners = new Map<string, (event: unknown) => void>();
  const capture = new Map<string, boolean>();
  const doc: LinkDocument = {
    location: { hostname: PAGE, href: `https://${PAGE}/` },
    addEventListener: (type: string, listener: (event: never) => void, useCapture?: boolean) => {
      listeners.set(type, listener as (event: unknown) => void);
      capture.set(type, useCapture === true);
    },
    removeEventListener: (type: string) => void listeners.delete(type),
  };
  return { doc, listeners, capture };
}

function anchor(href: string, attributes: Record<string, string> = {}) {
  return { getAttribute: (name: string) => (name === "href" ? href : (attributes[name] ?? null)), hasAttribute: (name: string) => name in attributes };
}

// What a click lands on: often a child of the link, an icon\x27s <svg> path
// among them, which closest() walks up from.
function target(link: ReturnType<typeof anchor> | null) {
  return { closest: (selector: string) => (selector === "a[href]" ? link : null) };
}

const ALL = { outbound: true, downloads: true, contact: true };

describe("watchLinks", () => {
  it("listens once for clicks and once for middle clicks, before the page\x27s own handlers", () => {
    const { doc, listeners, capture } = fakeDocument();
    watchLinks(ALL, vi.fn(), doc);
    expect([...listeners.keys()].sort()).toEqual(["auxclick", "click"]);
    expect(capture.get("click")).toBe(true);
  });

  it("finds the link from a child it was clicked on, and never stops the click", () => {
    const { doc, listeners } = fakeDocument();
    const send = vi.fn();
    watchLinks(ALL, send, doc);
    const preventDefault = vi.fn();

    listeners.get("click")!({ type: "click", button: 0, target: target(anchor("https://partner.example/x")), preventDefault });

    expect(send).toHaveBeenCalledExactlyOnceWith({ name: "outbound_click", props: { $host: "partner.example" } });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("counts a middle click once, and ignores a right click", () => {
    const { doc, listeners } = fakeDocument();
    const send = vi.fn();
    watchLinks(ALL, send, doc);
    const link = target(anchor("https://partner.example/x"));

    listeners.get("auxclick")!({ type: "auxclick", button: 1, target: link });
    listeners.get("auxclick")!({ type: "auxclick", button: 2, target: link });

    expect(send).toHaveBeenCalledOnce();
  });

  it("sends only the kinds turned on", () => {
    const { doc, listeners } = fakeDocument();
    const send = vi.fn();
    watchLinks({ outbound: false, downloads: true, contact: false }, send, doc);

    for (const href of ["https://partner.example/x", "mailto:a@b.example", "/guide.pdf"]) {
      listeners.get("click")!({ type: "click", button: 0, target: target(anchor(href)) });
    }

    expect(send).toHaveBeenCalledExactlyOnceWith({ name: "file_download", props: { $file: "guide.pdf" } });
  });

  it("does nothing for a click outside any link, or on a node without closest", () => {
    const { doc, listeners } = fakeDocument();
    const send = vi.fn();
    watchLinks(ALL, send, doc);
    listeners.get("click")!({ type: "click", button: 0, target: target(null) });
    listeners.get("click")!({ type: "click", button: 0, target: {} });
    listeners.get("click")!({ type: "click", button: 0, target: null });
    expect(send).not.toHaveBeenCalled();
  });

  it("never throws on the page for a link whose address cannot be read", () => {
    const { doc, listeners } = fakeDocument();
    const send = vi.fn();
    watchLinks(ALL, send, doc);
    expect(() => listeners.get("click")!({ type: "click", button: 0, target: target(anchor("http://[bad")) })).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("reads a download attribute from the link", () => {
    const { doc, listeners } = fakeDocument();
    const send = vi.fn();
    watchLinks(ALL, send, doc);
    listeners.get("click")!({ type: "click", button: 0, target: target(anchor("/export", { download: "" })) });
    expect(send).toHaveBeenCalledExactlyOnceWith({ name: "file_download", props: { $file: "export" } });
  });
});
