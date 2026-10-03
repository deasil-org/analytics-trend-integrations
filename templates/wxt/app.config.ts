import { defineAppConfig } from "#imports";
import { analyticsTrend } from "@analyticstrend/wxt-analytics";
import { analyticsEnabled } from "./utils/analytics-enabled";

export default defineAppConfig({
  analytics: {
    enabled: analyticsEnabled,
    providers: [
      analyticsTrend({
        // From your dashboard's Settings screen, in .env. Public by design: it
        // can write events and read nothing.
        writeKey: import.meta.env.WXT_ANALYTICSTREND_WRITE_KEY ?? "",
        uninstallTracking: true,
      }),
    ],
  },
});
