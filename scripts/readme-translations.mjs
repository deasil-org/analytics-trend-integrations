import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Every published package's README in English, the one npm shows, and beside
// it a French, Spanish, Portuguese and German one. Each README starts with a
// line naming all five, linking to the others on GitHub: absolute addresses,
// because relative ones break on npmjs.com.
//
// translated.lock.json records a hash of each English README as it was when
// its four translations were last brought up to date with it. The test fails
// when an English README no longer matches, so changing the English without
// revisiting its translations fails, and refreshing the lock
// (pnpm i18n:lock) is a deliberate step taken with them.

export const ROOT = path.join(import.meta.dirname, "..");
export const LOCK_FILE = path.join(ROOT, "translated.lock.json");

export const LANGUAGES = [
  { code: "en", name: "English", file: "README.md" },
  { code: "fr", name: "Français", file: "README.fr.md" },
  { code: "es", name: "Español", file: "README.es.md" },
  { code: "pt-BR", name: "Português", file: "README.pt-BR.md" },
  { code: "de", name: "Deutsch", file: "README.de.md" },
];

export const TRANSLATIONS = LANGUAGES.filter(({ code }) => code !== "en");

export function publishedPackages() {
  return readdirSync(path.join(ROOT, "packages"))
    .filter((dir) => existsSync(path.join(ROOT, "packages", dir, "package.json")))
    .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(path.join(ROOT, "packages", dir, "package.json"), "utf8")) }))
    .filter(({ manifest }) => !manifest.private);
}

/** The README's path from the repository root, with forward slashes: the lock's key. */
export function readmePath(dir, file = "README.md") {
  return `packages/${dir}/${file}`;
}

/** The package's folder on GitHub, from its repository field. */
function githubFolder(manifest) {
  const repository = manifest.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  return `${repository}/blob/main/${manifest.repository.directory}`;
}

/** The first line of the README in `code`: that language in bold, the other four linked. */
export function languageLine(manifest, code) {
  const folder = githubFolder(manifest);
  return LANGUAGES.map((language) =>
    language.code === code ? `**${language.name}**` : `[${language.name}](${folder}/${language.file})`,
  ).join(" · ");
}

export function readText(relative) {
  return readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");
}

/** A hash of a README's text, the same whichever line endings the checkout uses. */
export function textHash(relative) {
  return createHash("sha256").update(readText(relative)).digest("hex").slice(0, 16);
}

export function readLock() {
  return existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, "utf8")) : {};
}
