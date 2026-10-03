import { initBackground } from "@analyticstrend/extension";

// At the top level, so it runs on every background start, and not awaited:
// Chrome will not run a service worker that uses top-level await.
const analytics = initBackground({
  writeKey: process.env.PLASMO_PUBLIC_ANALYTICSTREND_WRITE_KEY ?? "",
  uninstallTracking: true,
});

analytics.track("background_started");
