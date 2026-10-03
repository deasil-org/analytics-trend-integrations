import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkBuild } from "./check-manifest.mjs";

const GECKO = {
  id: "x@example.com",
  strict_min_version: "140.0",
  data_collection_permissions: { required: ["none"], optional: ["technicalAndInteraction", "locationInfo"] },
};
const CHROME = { manifest_version: 3, permissions: ["storage"], background: { service_worker: "background.js" } };
const FIREFOX = {
  manifest_version: 3,
  permissions: ["storage"],
  background: { scripts: ["background.js"] },
  browser_specific_settings: { gecko: GECKO },
};

async function build(manifest, files = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "check-manifest-"));
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), text);
  }
  return dir;
}

test("passes a correct Chrome build", async () => {
  assert.deepEqual(await checkBuild("chrome", await build(CHROME)), []);
});

test("passes a correct Firefox build", async () => {
  assert.deepEqual(await checkBuild("firefox", await build(FIREFOX)), []);
});

test("passes one manifest that carries both background forms, for both browsers", async () => {
  const dir = await build({ ...FIREFOX, background: { service_worker: "background.js", scripts: ["background.js"] } });
  assert.deepEqual(await checkBuild("chrome", dir), []);
  assert.deepEqual(await checkBuild("firefox", dir), []);
});

test("needs the storage permission", async () => {
  const problems = await checkBuild("chrome", await build({ ...CHROME, permissions: [] }));
  assert.match(problems.join("\n"), /storage/);
});

test("needs a service worker on Chrome and background scripts on Firefox", async () => {
  assert.match(
    (await checkBuild("chrome", await build({ ...CHROME, background: { scripts: ["b.js"] } }))).join("\n"),
    /service_worker/,
  );
  assert.match(
    (await checkBuild("firefox", await build({ ...FIREFOX, background: { service_worker: "b.js" } }))).join("\n"),
    /scripts/,
  );
});

test("needs the add-on id, Firefox 140 and the data-collection block on Firefox", async () => {
  const without = (patch) => build({ ...FIREFOX, browser_specific_settings: { gecko: { ...GECKO, ...patch } } });
  assert.match((await checkBuild("firefox", await without({ id: undefined }))).join("\n"), /gecko\.id/);
  assert.match((await checkBuild("firefox", await without({ strict_min_version: "121.0" }))).join("\n"), /140/);
  assert.match(
    (
      await checkBuild(
        "firefox",
        await without({ data_collection_permissions: { required: ["none"], optional: ["technicalAndInteraction"] } }),
      )
    ).join("\n"),
    /optional/,
  );
});

test("refuses an extension page that loads a remote script", async () => {
  const dir = await build(CHROME, { "pages/popup.html": '<script src="https://cdn.example.com/a.js"></script>' });
  assert.match((await checkBuild("chrome", dir)).join("\n"), /remote script/);
});

test("refuses a content security policy that allows a remote address", async () => {
  const dir = await build({
    ...CHROME,
    content_security_policy: { extension_pages: "script-src 'self' https://cdn.example.com" },
  });
  assert.match((await checkBuild("chrome", dir)).join("\n"), /security policy/);
});
