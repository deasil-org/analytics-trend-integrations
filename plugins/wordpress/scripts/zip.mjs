// Writes dist/analyticstrend-<version>.zip: the file to upload to
// WordPress.org for review, and to attach to a GitHub release for anyone
// installing by hand (Plugins → Add New Plugin → Upload Plugin).
//
//   node scripts/copy-script.mjs && node scripts/zip.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import { PLUGIN, ROOT, pluginFiles, pluginVersion } from "./files.mjs";

const version = pluginVersion(readFileSync(path.join(PLUGIN, "analyticstrend.php"), "utf8"));
const entries = Object.fromEntries(
  pluginFiles().map((file) => [`analyticstrend/${file}`, new Uint8Array(readFileSync(path.join(PLUGIN, file)))]),
);
const out = path.join(ROOT, "dist", `analyticstrend-${version}.zip`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, zipSync(entries, { level: 9 }));
console.log(out);
