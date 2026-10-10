import { LIMITS, RESERVED_PROPS } from "@analyticstrend/event-schema";
import { describe, expect, it } from "vitest";
import { createCapture, type Environment } from "./capture.ts";

// A document's world, as three strings. Passing it in rather than reaching for
// a DOM is what lets this file test the capture rules without a browser
// environment, in a package that deliberately carries no test-DOM dependency.
function env(overrides: Partial<Environment> = {}): Environment {
  return {
    referrer: "",
    href: "https://shop.example/a",
    origin: "https://shop.example",
    ...overrides,
  };
}

describe("createCapture, the visit", () => {
  it("captures a cross-origin referrer as a hostname, never a URL", () => {
    // Browsers send only the origin cross-origin anyway. Reducing to the
    // hostname is what makes reddit.com one row rather than several.
    const capture = createCapture(() => env({ referrer: "https://www.reddit.com/r/x/" }));
    expect(capture("page_view").$referrer).toBe("www.reddit.com");
  });

  it("never treats a same-origin referrer as a source", () => {
    const capture = createCapture(() => env({ referrer: "https://shop.example/b" }));
    expect(capture("page_view").$referrer).toBeUndefined();
  });

  it("captures whitelisted params and ignores everything else", () => {
    // The raw query string is never read. Arbitrary params routinely carry
    // email addresses and reset tokens, and collecting those would falsify
    // the claim this product is sold on.
    const capture = createCapture(() =>
      env({ href: "https://shop.example/a?utm_source=Reddit&utm_campaign=spring&email=me@x.com" }),
    );
    const props = capture("page_view");

    expect(props.$utm_source).toBe("Reddit");
    expect(props.$utm_campaign).toBe("spring");
    expect(JSON.stringify(props)).not.toContain("me@x.com");
  });

  it("prefers ref over source when both are present", () => {
    const capture = createCapture(() =>
      env({ href: "https://shop.example/a?ref=news&source=other" }),
    );
    expect(capture("page_view").$ref).toBe("news");
  });

  it("records a click identifier by name and never by value", () => {
    // The value is a per-click advertising token. It says nothing about the
    // source, and it is exactly the sort of opaque identifier this product
    // does not collect.
    const capture = createCapture(() => env({ href: "https://shop.example/a?gclid=SECRET" }));
    const props = capture("page_view");

    expect(props.$click_id).toBe("gclid");
    expect(JSON.stringify(props)).not.toContain("SECRET");
  });

  it("resolves the visit once rather than per event", () => {
    // document.referrer is fixed when a document is created and does not
    // change on history.pushState, so a single-page app's route change must
    // not be read as the start of a new visit.
    let referrer = "https://www.reddit.com/";
    const capture = createCapture(() => env({ referrer }));

    capture("page_view");
    referrer = "https://elsewhere.example/";

    expect(capture("page_view").$referrer).toBe("www.reddit.com");
  });

  it("yields no source when the URLs are unparseable", () => {
    // Must never throw out of init and take the host page down with it.
    const capture = createCapture(() => env({ referrer: "not a url", href: "also not a url" }));

    expect(() => capture("page_view")).not.toThrow();
    expect(capture("page_view").$referrer).toBeUndefined();
  });
});

describe("createCapture, the path", () => {
  it("sends the path on every event, not only page views", () => {
    const capture = createCapture(() => env({ href: "https://shop.example/kettles?x=1" }));
    expect(capture("affiliate_click").$path).toBe("/kettles");
  });

  it("chains from_path across client-side route changes", () => {
    let href = "https://shop.example/a";
    const capture = createCapture(() => env({ href }));

    expect(capture("page_view").$from_path).toBeUndefined();
    href = "https://shop.example/b";
    expect(capture("page_view").$from_path).toBe("/a");
    href = "https://shop.example/c";
    expect(capture("page_view").$from_path).toBe("/b");
  });

  it("falls back to a same-origin referrer path on a document's first page view", () => {
    // The multi-page case: a full page load from another page of this site.
    // Same-origin referrers keep their path, where a cross-origin one would
    // have been reduced to an origin by the browser.
    const capture = createCapture(() =>
      env({ referrer: "https://shop.example/previous", href: "https://shop.example/a" }),
    );
    expect(capture("page_view").$from_path).toBe("/previous");
  });

  it("does not chain from_path through events that are not page views", () => {
    // An affiliate click is not a navigation. Treating it as one would put a
    // page in the flow report that nobody moved between.
    let href = "https://shop.example/a";
    const capture = createCapture(() => env({ href }));

    capture("page_view");
    href = "https://shop.example/b";
    capture("affiliate_click");
    href = "https://shop.example/c";

    expect(capture("page_view").$from_path).toBe("/a");
  });
});

describe("createCapture, limits", () => {
  it("bounds a captured value so the SDK cannot overflow the props budget", () => {
    const long = "x".repeat(5000);
    const capture = createCapture(() =>
      env({ href: `https://shop.example/a?utm_campaign=${long}` }),
    );
    expect(capture("page_view").$utm_campaign).toHaveLength(LIMITS.MAX_CAPTURED_VALUE_LENGTH);
  });

  it("allows a path more room than a label, because truncating one merges pages", () => {
    const path = `/${"p".repeat(5000)}`;
    const capture = createCapture(() => env({ href: `https://shop.example${path}` }));
    expect(capture("page_view").$path).toHaveLength(LIMITS.MAX_CAPTURED_PATH_LENGTH);
  });

  it("emits only keys the wire contract reserves", () => {
    const capture = createCapture(() =>
      env({
        referrer: "https://www.reddit.com/",
        href: "https://shop.example/a?utm_source=r&utm_medium=social&utm_campaign=c&utm_content=d&utm_term=e&ref=f&gclid=g",
      }),
    );

    for (const key of Object.keys(capture("page_view"))) {
      expect(RESERVED_PROPS).toContain(key);
    }
  });
});
