import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Transformed rather than loaded as-is: WXT's analytics module reads
    // import.meta.env, which only exists once Vite has processed it, and
    // @wxt-dev/browser captures the browser global when first imported, which
    // vi.resetModules can only undo for modules Vitest itself loaded.
    server: { deps: { inline: ["@wxt-dev/analytics", "@wxt-dev/browser", "@wxt-dev/is-background"] } },
  },
});
