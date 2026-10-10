import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// npm shows each package's repository link and issue tracker. Every published
// package lives here, so both point here, and the repository link names the
// package's own folder.
const ROOT = path.join(import.meta.dirname, "..");
const REPOSITORY = "git+https://github.com/deasil-org/analytics-trend-integrations.git";
const ISSUES = "https://github.com/deasil-org/analytics-trend-integrations/issues";

const published = readdirSync(path.join(ROOT, "packages"))
  .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(path.join(ROOT, "packages", dir, "package.json"), "utf8")) }))
  .filter(({ manifest }) => !manifest.private);

test("finds the published packages", () => {
  assert.deepEqual(published.map(({ manifest }) => manifest.name).sort(), [
    "@analyticstrend/event-schema",
    "@analyticstrend/extension",
    "@analyticstrend/sdk-core",
    "@analyticstrend/web",
    "@analyticstrend/wxt-analytics",
  ]);
});

for (const { dir, manifest } of published) {
  test(`${manifest.name} points npm at this repository`, () => {
    assert.equal(manifest.bugs, ISSUES);
    assert.deepEqual(manifest.repository, { type: "git", url: REPOSITORY, directory: `packages/${dir}` });
  });

  test(`${manifest.name} ships its MIT licence`, () => {
    assert.equal(manifest.license, "MIT");
    assert.ok(manifest.files.includes("LICENSE"));
    assert.match(readFileSync(path.join(ROOT, "packages", dir, "LICENSE"), "utf8"), /^MIT License/);
  });
}
