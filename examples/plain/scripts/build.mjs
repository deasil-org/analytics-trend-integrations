// Bundles the extension into dist/, ready to load unpacked in Chrome or as a
// temporary add-on in Firefox.
//
// Bundled rather than imported at runtime because Manifest V3 forbids remote
// code, and Mozilla's reviewers reject it: every line the extension runs has to
// be inside the package the store reviews. That is the whole reason the SDK is
// an npm package and not a script tag.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist`;

// The write key is public by design — it ships inside the extension — so a
// build-time constant is the right home for it. AT_ENDPOINT points the same
// build at a collector other than AnalyticsTrend's own.
const writeKey = process.env.AT_WRITE_KEY ?? "wk_replace_with_your_write_key";
const endpoint = process.env.AT_ENDPOINT ?? "https://analyticstrend.com";

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: {
    background: `${root}src/background.ts`,
    content: `${root}src/content.ts`,
    popup: `${root}src/popup.ts`,
  },
  outdir: dist,
  bundle: true,
  format: "esm",
  target: ["chrome121", "firefox121"],
  define: {
    __WRITE_KEY__: JSON.stringify(writeKey),
    __ENDPOINT__: JSON.stringify(endpoint),
  },
  logLevel: "warning",
});

await cp(`${root}static`, dist, { recursive: true });
console.log(`Built to ${dist} (endpoint ${endpoint})`);
