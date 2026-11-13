import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { unzipSync } from "fflate";

const ROOT = path.join(import.meta.dirname, "..");
const header = readFileSync(path.join(ROOT, "analyticstrend", "analyticstrend.php"), "utf8");
const version = header.match(/^ \* Version:\s+(\S+)/m)[1];

test("zips a plugin WordPress.org accepts", () => {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "zip.mjs")], { cwd: ROOT });
  const zip = path.join(ROOT, "dist", `analyticstrend-${version}.zip`);
  const files = unzipSync(readFileSync(zip));
  const names = Object.keys(files);

  for (const name of [
    "analyticstrend/analyticstrend.php",
    "analyticstrend/readme.txt",
    "analyticstrend/LICENSE",
    "analyticstrend/uninstall.php",
    "analyticstrend/assets/script.js",
    "analyticstrend/includes/tag.php",
    "analyticstrend/includes/settings.php",
    ...["fr_FR", "es_ES", "pt_BR", "de_DE"].map((l) => `analyticstrend/languages/analyticstrend-${l}.l10n.php`),
  ]) {
    assert.ok(names.includes(name), `missing ${name}`);
  }
  assert.deepEqual(
    names.filter((n) => /node_modules|\/test\/|\.mjs$|package\.json/.test(n)),
    [],
  );
  assert.ok(names.every((n) => n.startsWith("analyticstrend/")));

  const readme = new TextDecoder().decode(files["analyticstrend/readme.txt"]);
  assert.equal(readme.match(/^Stable tag:\s*(\S+)/m)?.[1], version);
  assert.equal(readme.match(/^Requires at least:\s*(\S+)/m)?.[1], header.match(/Requires at least:\s+(\S+)/)[1]);
  assert.equal(readme.match(/^Requires PHP:\s*(\S+)/m)?.[1], header.match(/Requires PHP:\s+(\S+)/)[1]);
  assert.match(readme, /^License: GPLv2 or later$/m);
  const short = readme.split("\n== Description ==")[0].trim().split("\n").at(-1);
  assert.ok(short.length <= 150, `short description is ${short.length} characters`);
});

test("the readme says what is sent and where, and claims no compliance", () => {
  const readme = readFileSync(path.join(ROOT, "analyticstrend", "readme.txt"), "utf8");
  assert.match(readme, /== External services ==/);
  assert.ok(readme.includes("https://analyticstrend.com/terms"));
  assert.ok(readme.includes("https://analyticstrend.com/privacy"));
  assert.ok(readme.includes("https://analyticstrend.com/docs/guide/install-wordpress"));
  assert.doesNotMatch(readme, /compliant|compliance/i);
});

test("syncs trunk and the version's tag into an svn checkout", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "analyticstrend-svn-"));
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", "svn-sync.mjs"), dir], { cwd: ROOT, encoding: "utf8" });
    for (const where of ["trunk", path.join("tags", version)]) {
      assert.ok(existsSync(path.join(dir, where, "analyticstrend.php")), where);
      assert.ok(existsSync(path.join(dir, where, "readme.txt")), where);
      assert.ok(existsSync(path.join(dir, where, "languages", "analyticstrend-fr_FR.l10n.php")), where);
    }
    assert.match(out, /svn add/);
    assert.match(out, /svn ci/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The directory's icon, banners and screenshots live in the repository's
// top-level assets/ folder, beside trunk, never inside the plugin.
test("syncs the directory's icon, banners and screenshots into assets", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "analyticstrend-svn-"));
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", "svn-sync.mjs"), dir], { cwd: ROOT, encoding: "utf8" });
    for (const name of ["icon.svg", "icon-128x128.png", "icon-256x256.png", "banner-772x250.png", "banner-1544x500.png", "screenshot-1.png", "screenshot-2.png"]) {
      assert.ok(existsSync(path.join(dir, "assets", name)), `assets/${name}`);
    }
    assert.match(out, /svn add --force trunk tags\/\S+ assets/);
    const readme = readFileSync(path.join(ROOT, "analyticstrend", "readme.txt"), "utf8");
    const captions = readme.split("== Screenshots ==")[1]?.split("\n== ")[0].match(/^\d+\. /gm) ?? [];
    assert.equal(captions.length, 2, "one caption per screenshot");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
