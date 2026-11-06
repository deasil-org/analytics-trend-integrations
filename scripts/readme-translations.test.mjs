import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  LANGUAGES,
  ROOT,
  TRANSLATIONS,
  languageLine,
  publishedPackages,
  readLock,
  readmePath,
  readText,
  textHash,
} from "./readme-translations.mjs";

// Each package's README in French, Spanish, Portuguese and German, shipped in
// the tarball beside the English one and kept up to date with it.

// The words someone searching npm in each language types, at least one of
// which every package lists among its keywords.
const SEARCH_TERMS = {
  fr: ["analytique", "mesure d'audience", "analyse produit"],
  es: ["analítica", "analítica web", "analítica de producto"],
  "pt-BR": ["análise", "análise web", "análise de produto"],
  de: ["Webanalyse", "Produktanalyse"],
};

const packages = publishedPackages();

test("finds the packages whose READMEs are translated", () => {
  assert.ok(packages.length >= 5);
});

for (const { dir, manifest } of packages) {
  for (const { code, file } of TRANSLATIONS) {
    const relative = readmePath(dir, file);

    test(`${manifest.name} has ${file}`, () => {
      assert.ok(existsSync(path.join(ROOT, relative)), `${relative} is missing: translate README.md into ${code}`);
    });

    test(`${manifest.name}'s ${file} is a translation, not the English`, { skip: !existsSync(path.join(ROOT, relative)) }, () => {
      assert.notEqual(readText(relative), readText(readmePath(dir)), `${relative} is the English README`);
    });

    test(`${manifest.name} ships ${file}`, () => {
      assert.ok(manifest.files.includes(file), `${file} is not in ${manifest.name}'s files, so npm would leave it out`);
    });
  }

  for (const { code, file } of LANGUAGES) {
    const relative = readmePath(dir, file);
    test(`${relative} starts with the line naming every language`, { skip: !existsSync(path.join(ROOT, relative)) }, () => {
      assert.equal(readText(relative).split("\n")[0], languageLine(manifest, code));
    });
  }

  test(`${manifest.name}'s keywords include the words people search npm with in each language`, () => {
    const keywords = manifest.keywords ?? [];
    for (const [code, terms] of Object.entries(SEARCH_TERMS)) {
      assert.ok(
        terms.some((term) => keywords.includes(term)),
        `${manifest.name} has no ${code} keyword: add one of ${terms.join(", ")}`,
      );
    }
  });

  test(`${manifest.name}'s translations are up to date with its English README`, () => {
    const relative = readmePath(dir);
    const locked = readLock()[relative];
    assert.ok(locked, `${relative} is not in translated.lock.json: translate it, then run pnpm i18n:lock`);
    assert.equal(
      textHash(relative),
      locked,
      `${relative} changed since its translations were last updated: bring ${TRANSLATIONS.map(({ file }) => file).join(", ")} up to date with it, then run pnpm i18n:lock`,
    );
  });
}

test("translated.lock.json names only READMEs that exist", () => {
  const known = new Set(packages.map(({ dir }) => readmePath(dir)));
  assert.deepEqual(
    Object.keys(readLock()).filter((key) => !known.has(key)),
    [],
  );
});
