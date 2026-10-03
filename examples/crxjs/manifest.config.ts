import { defineManifest } from "@crxjs/vite-plugin";

// CRXJS builds one browser at a time and takes the background as that browser
// declares it: a service worker for Chrome, background scripts for Firefox.
export default defineManifest(({ mode }) => {
  const firefox = mode === "firefox";
  return {
    manifest_version: 3,
    name: "AnalyticsTrend with CRXJS",
    version: "0.1.0",
    permissions: ["storage"],
    action: { default_popup: "index.html" },
    background: firefox
      ? { scripts: ["src/background.ts"], type: "module" }
      : { service_worker: "src/background.ts", type: "module" },
    ...(firefox && {
      browser_specific_settings: {
        gecko: {
          id: "crxjs-example@analyticstrend.com",
          strict_min_version: "140.0",
          data_collection_permissions: {
            required: ["none"],
            optional: ["technicalAndInteraction", "locationInfo"],
          },
        },
      },
    }),
  };
});
