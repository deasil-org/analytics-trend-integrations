import { getBrowserApi, initBackground } from "@analyticstrend/extension";
import { defineAnalyticsProvider } from "@wxt-dev/analytics";
import type { AnalyticsStorageItem, AnalyticsTrackEvent } from "@wxt-dev/analytics/types";

export type AnalyticsTrendOptions = {
  /** From your dashboard's Settings screen. Public by design: it can only write events. */
  writeKey: string;
  /** A collector other than AnalyticsTrend's own. */
  endpoint?: string;
  /** Records an uninstall when the extension is removed. */
  uninstallTracking?: boolean;
  /** On by default: nothing is sent while the browser sends Global Privacy Control. */
  respectGlobalPrivacyControl?: boolean;
  /** Also delete the stored identifier and queue when that signal appears. */
  clearDataOnGlobalPrivacyControl?: boolean;
};

// Where WXT's analytics module keeps its switch when app.config.ts names none:
// the literal key, prefix included, in storage.local. The module's fallback
// item does not parse the prefix. A test against the real module holds this.
export const DEFAULT_ENABLED_KEY = "local:wxt-analytics:enabled";

const EXTENSION_PROTOCOLS = new Set(["chrome-extension:", "moz-extension:"]);

/**
 * The properties to send for a tracked event: the extension's own, without
 * the undefined ones. An auto-tracked click loses the clicked element's text
 * and link, because on a website those are that site's content and a full
 * address.
 */
export function trackProperties(event: AnalyticsTrackEvent["event"]): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (value !== undefined) props[key] = value;
  }
  // The shape WXT's autoTrack produces: a click carrying the element's tag.
  if (event.name === "click" && "tagName" in props) {
    delete props.textContent;
    delete props.href;
  }
  return props;
}

/** The path of one of the extension's own pages, and nothing for any other address. */
export function extensionPagePath(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return EXTENSION_PROTOCOLS.has(parsed.protocol) ? parsed.pathname : undefined;
  } catch {
    return undefined;
  }
}

/**
 * AnalyticsTrend as a provider for WXT's analytics module. Events go through
 * the AnalyticsTrend extension SDK, which keeps a durable queue, honours
 * Firefox's data-collection consent and Global Privacy Control, and tracks
 * uninstalls. WXT's own switch governs all of it.
 */
export const analyticsTrend = defineAnalyticsProvider<AnalyticsTrendOptions>((_analytics, config, options) => {
  const api = getBrowserApi();
  const enabled: AnalyticsStorageItem<boolean> = config.enabled ?? {
    getValue: async () => (await api.storage.local.get(DEFAULT_ENABLED_KEY))[DEFAULT_ENABLED_KEY] === true,
  };

  async function switchedOn(): Promise<boolean> {
    try {
      return (await enabled.getValue()) === true;
    } catch {
      return false;
    }
  }

  const manifest = api.runtime.getManifest?.() as { version?: string; version_name?: string } | undefined;

  const client = initBackground({
    writeKey: options.writeKey,
    endpoint: options.endpoint,
    appVersion: config.version ?? manifest?.version_name ?? manifest?.version,
    uninstallTracking: options.uninstallTracking,
    respectGlobalPrivacyControl: options.respectGlobalPrivacyControl,
    clearDataOnGlobalPrivacyControl: options.clearDataOnGlobalPrivacyControl,
    consent: switchedOn,
    // Only in the developer's own console, only when they asked for WXT's
    // debug output, and only the error, never the event.
    onError: config.debug ? (error) => console.debug("[@analyticstrend/wxt-analytics]", error) : undefined,
  });

  // setEnabled writes to storage, so a flip shows up here. The SDK's queue
  // writes land here too, so only a change in the switch's value is passed on.
  let last = switchedOn();
  const storageEvents = api.storage as { onChanged?: { addListener(listener: () => void): void } };
  storageEvents.onChanged?.addListener(() => {
    const previous = last;
    last = switchedOn();
    void Promise.all([previous, last]).then(([before, now]) => {
      if (before !== now) client.consentChanged();
    });
  });

  return {
    identify: async () => {},
    page: async (event) => {
      const path = extensionPagePath(event.page.url);
      await client.track("page_viewed", path ? { path } : undefined);
    },
    track: async (event) => {
      await client.track(event.event.name, trackProperties(event.event));
    },
  };
});
