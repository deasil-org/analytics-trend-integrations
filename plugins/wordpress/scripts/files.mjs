// The plugin's files as WordPress.org gets them: the analyticstrend folder,
// with the built script and translations, and nothing else.
import { readdirSync } from "node:fs";
import path from "node:path";
import { buildL10n } from "./build-l10n.mjs";

export const ROOT = path.join(import.meta.dirname, "..");
export const PLUGIN = path.join(ROOT, "analyticstrend");

export function pluginVersion(php) {
  return php.match(/^ \* Version:\s+(\S+)/m)[1];
}

/** Builds the translations, then lists every file under the plugin folder, relative to it, with forward slashes. */
export function pluginFiles() {
  buildL10n();
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [path.relative(PLUGIN, full).split(path.sep).join("/")];
    });
  const files = walk(PLUGIN).sort();
  if (!files.includes("assets/script.js")) {
    throw new Error("No assets/script.js: run node scripts/copy-script.mjs first.");
  }
  return files;
}
