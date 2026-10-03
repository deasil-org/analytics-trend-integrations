import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/analytics/module"],
  manifest: ({ browser }) => ({
    name: "My extension",
    description: "A browser extension measured with AnalyticsTrend.",
    permissions: ["storage"],
    // Firefox only. This is the block the store disclosure helper gives for an
    // extension using AnalyticsTrend: usage and location, both optional, so
    // each shows as a toggle at install.
    // https://analyticstrend.com/tools/store-disclosure
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "my-extension@example.com",
          strict_min_version: "140.0",
          data_collection_permissions: {
            required: ["none"],
            optional: ["technicalAndInteraction", "locationInfo"],
          },
        },
      },
    }),
  }),
});
