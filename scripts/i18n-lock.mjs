// Records the English READMEs the translations were made from, once each
// package's README.fr.md, README.es.md, README.pt-BR.md and README.de.md have
// been brought up to date with its README.md:
//
//   pnpm i18n:lock
//
// Run it only after updating the four translations. readme-translations.test.mjs
// fails on every English README that changed since the lock was written, and
// this is what tells it those READMEs have been translated again.
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCK_FILE, ROOT, TRANSLATIONS, publishedPackages, readmePath, textHash } from "./readme-translations.mjs";

const entries = {};
const missing = [];
for (const { dir } of publishedPackages()) {
  for (const { file } of TRANSLATIONS) {
    if (!existsSync(path.join(ROOT, readmePath(dir, file)))) missing.push(readmePath(dir, file));
  }
  entries[readmePath(dir)] = textHash(readmePath(dir));
}

if (missing.length > 0) {
  console.error(`Not locked: translate these first.\n${missing.map((file) => `  ${file}`).join("\n")}`);
  process.exit(1);
}

const sorted = Object.fromEntries(Object.keys(entries).sort().map((key) => [key, entries[key]]));
await writeFile(LOCK_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Locked ${Object.keys(sorted).length} READMEs.`);
