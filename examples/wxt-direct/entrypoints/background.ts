import { initBackground } from "@analyticstrend/extension";

// WXT imports this file in Node during the build to read its options, so
// nothing may run at its top level: it would run then, not in the browser.
// main() runs on every background start and cannot be async, which suits
// initBackground: it must not be awaited anyway.
export default defineBackground(() => {
  const analytics = initBackground({
    writeKey: import.meta.env.WXT_ANALYTICSTREND_WRITE_KEY ?? "",
    uninstallTracking: true,
  });
  analytics.track("background_started");
});
