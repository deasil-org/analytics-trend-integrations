import { init, type WebClient } from "./index.ts";

/**
 * The tag's options as a page global, for an install that can't set data
 * attributes on the tag it adds (Google Tag Manager's injectScript can't).
 * The keys are the tag's own attributes, camel-cased, with the same string
 * values. An attribute on the tag wins over the same key here.
 */
export type ScriptConfig = Partial<
  Record<
    | "writeKey"
    | "pageViews"
    | "outboundLinks"
    | "fileDownloads"
    | "contactLinks"
    | "formSubmissions"
    | "endpoint"
    | "autoCapture"
    | "engagement"
    | "respectGpc"
    | "clearOnGpc"
    | "countAutomated",
    string
  >
>;

/** One event, as a page pushes it before or after the script has loaded. */
export type QueuedEvent = [name: string, props?: Record<string, unknown>];

declare global {
  interface Window {
    // The client, for a page to track its own events with:
    // window.analyticsTrend.track("signup").
    analyticsTrend?: WebClient;
    analyticsTrendConfig?: ScriptConfig;
    // Events pushed before the script loaded are sent when it starts; a push
    // after that is sent at once. It stays an array, because Tag Manager's
    // createQueue pushes onto an array that is already there.
    analyticsTrendQueue?: QueuedEvent[];
    // The write key the page's client started with. Two copies of the script
    // (a tag by hand and a plugin's) share no module state, only the window.
    analyticsTrendStartedKey?: string;
  }
}

type Start = (options: Parameters<typeof init>[0]) => WebClient;

/**
 * The script-tag install. Everything comes from the tag's own data
 * attributes, or from window.analyticsTrendConfig, so a site without a build
 * step writes one tag and nothing else. Returns the client, or undefined when
 * there is nothing to start.
 */
export function startFromScript(
  script: HTMLOrSVGScriptElement | null,
  win: Window = window,
  start: Start = init,
): WebClient | undefined {
  // The script is null for a module script, or one run after the page
  // finished parsing, as an injected one is. Without a config either, there
  // is nothing to read, and throwing on someone's page would be worse than
  // doing nothing.
  const config = win.analyticsTrendConfig;
  if (!script && !config) return undefined;

  const data: ScriptConfig = { ...config, ...(script as HTMLElement | null)?.dataset };
  if (!data.writeKey) {
    // The one message this package ever writes to a console on its own: the
    // site's owner left out the one thing it needs, and silence would leave
    // them wondering why no data arrives.
    console.warn("AnalyticsTrend: data-write-key is missing");
    return undefined;
  }

  // A second copy with the same key would count every page twice.
  if (win.analyticsTrend && win.analyticsTrendStartedKey === data.writeKey) return win.analyticsTrend;

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
    ...(data.formSubmissions === "true" ? { formSubmissions: true } : {}),
    ...(data.endpoint ? { endpoint: data.endpoint } : {}),
    ...(data.autoCapture === "false" ? { autoCapture: false } : {}),
    ...(data.engagement === "false" ? { engagement: false } : {}),
    ...(data.respectGpc === "false" ? { respectGlobalPrivacyControl: false } : {}),
    ...(data.clearOnGpc === "true" ? { clearDataOnGlobalPrivacyControl: true } : {}),
    ...(data.countAutomated === "true" ? { countAutomatedBrowsers: true } : {}),
  });
  win.analyticsTrend = client;
  win.analyticsTrendStartedKey = data.writeKey;
  if (pageViews === "load") void client.track("page_view");
  drainQueue(win, client);
  return client;
}

/** Sends what was queued, once each, and sends every later push at once. */
function drainQueue(win: Window, client: WebClient): void {
  const queue: QueuedEvent[] = Array.isArray(win.analyticsTrendQueue) ? win.analyticsTrendQueue : [];
  const send = (item: unknown) => {
    if (Array.isArray(item) && typeof item[0] === "string") {
      void client.track(item[0], item[1] as Record<string, unknown> | undefined);
    }
  };
  const waiting = queue.splice(0, queue.length);
  queue.push = (...items: QueuedEvent[]) => {
    items.forEach(send);
    return queue.length;
  };
  win.analyticsTrendQueue = queue;
  waiting.forEach(send);
}

// Runs when the built file loads in a page. Under the tests there is no
// document, so importing this module starts nothing.
if (typeof document !== "undefined") startFromScript(document.currentScript);
