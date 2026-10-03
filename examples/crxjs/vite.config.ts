import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

// One manifest, two builds. CRXJS rewrites the background for Firefox.
export default defineConfig(({ mode }) => {
  const firefox = mode === "firefox";
  return {
    plugins: [crx({ manifest, browser: firefox ? "firefox" : "chrome" })],
    build: { outDir: firefox ? "dist/firefox" : "dist/chrome" },
  };
});
