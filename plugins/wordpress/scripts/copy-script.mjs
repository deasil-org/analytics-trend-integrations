// Copies the web SDK's built script into the plugin. WordPress.org's
// guidelines ask a plugin to ship its JavaScript rather than load it from
// another server, so the plugin serves the script from the site itself.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const from = path.join(root, "..", "..", "packages", "web", "dist", "script.js");
const to = path.join(root, "analyticstrend", "assets", "script.js");

if (!existsSync(from)) {
  console.error(`No ${from}. Build the web SDK first: pnpm --filter @analyticstrend/web build`);
  process.exit(1);
}
mkdirSync(path.dirname(to), { recursive: true });
copyFileSync(from, to);
