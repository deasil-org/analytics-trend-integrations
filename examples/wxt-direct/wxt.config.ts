import { defineConfig } from "wxt";

export default defineConfig({
  manifest: ({ browser }) => ({
    name: "AnalyticsTrend with WXT",
    permissions: ["storage"],
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "wxt-example@analyticstrend.com",
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
