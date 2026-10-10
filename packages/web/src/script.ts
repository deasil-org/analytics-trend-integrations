import { init, type WebClient } from "./index.ts";

declare global {
  interface Window {
    // The client, for a page to track its own events with:
    // window.analyticstrend.track("signup").
    analyticstrend?: WebClient;
  }
}

type Start = (options: Parameters<typeof init>[0]) => WebClient;

/**
 * The script-tag install. Everything comes from the tag's own data attributes,
 * so a site without a build step writes one tag and nothing else. Returns the client, or undefined when there is
 * nothing to start.
 */
export function startFromScript(
  script: HTMLOrSVGScriptElement | null,
  win: Window = window,
  start: Start = init,
): WebClient | undefined {
  // Null for a module script, or one run after the page finished parsing.
  // There is nothing to read, and throwing on someone's page would be worse
  // than doing nothing.
  if (!script) return undefined;

  const data = (script as HTMLElement).dataset;
  if (!data.writeKey) {
    // The one message this package ever writes to a console on its own: the
    // site's owner left out the one thing it needs, and silence would leave
    // them wondering why no data arrives.
    console.warn("AnalyticsTrend: data-write-key is missing");
    return undefined;
  }

  // Every page by default, in-app navigation included: a site with only a
  // script tag has no other way to count it. "load" keeps 0.4's one page
  // view per load, and "false" sends none.
  const pageViews = data.pageViews ?? "history";
  const client = start({
    writeKey: data.writeKey,
    ...(pageViews === "false" || pageViews === "load" ? {} : { pageViews: "history" as const }),
    // Link events, each only when its attribute is exactly "true".
    ...(data.outboundLinks === "true" ? { outboundLinks: true } : {}),
    ...(data.fileDownloads === "true" ? { fileDownloads: true } : {}),
    ...(data.contactLinks === "true" ? { contactLinks: true } : {}),
    ...(data.endpoint ? { endpoint: data.endpoint } : {}),
    ...(data.autoCapture === "false" ? { autoCapture: false } : {}),
    ...(data.respectGpc === "false" ? { respectGlobalPrivacyControl: false } : {}),
    ...(data.clearOnGpc === "true" ? { clearDataOnGlobalPrivacyControl: true } : {}),
  });
  win.analyticstrend = client;
  if (pageViews === "load") void client.track("page_view");
  return client;
}

// Runs when the built file loads in a page. Under the tests there is no
// document, so importing this module starts nothing.
if (typeof document !== "undefined") startFromScript(document.currentScript);
