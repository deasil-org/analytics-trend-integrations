// The background context: the one place that owns the durable queue. Content
// scripts and the popup never send anything themselves — they message this.
import { initBackground } from "@analyticstrend/extension";

// Replaced at build time. See scripts/build.mjs.
declare const __WRITE_KEY__: string;
declare const __ENDPOINT__: string;

// At the top level, so it runs on every background start, and deliberately not
// awaited. Chrome will not run a service worker that uses top-level await: the
// extension installs, the background never executes, and nothing is sent.
const analytics = initBackground({
  writeKey: __WRITE_KEY__,
  endpoint: __ENDPOINT__,
  uninstallTracking: true,
});

analytics.track("background_started");
