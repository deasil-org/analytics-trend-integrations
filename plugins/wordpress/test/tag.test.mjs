import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { KEY, bootWordPress, headAs } from "./playground.mjs";

let wp;
before(async () => {
  wp = await bootWordPress();
});
after(() => wp?.stop());

const setOption = (name, value) => wp.php(`update_option(${JSON.stringify(name)}, ${JSON.stringify(value)});`);
const scripts = (html) => html.match(/<script\b[^>]*>/g)?.filter((tag) => tag.includes("analyticstrend")) ?? [];

test("prints nothing without a key", async () => {
  await setOption("analyticstrend_write_key", "");
  assert.deepEqual(scripts(await wp.page("/")), []);
});

test("prints one deferred tag with the key on a public page", async () => {
  await setOption("analyticstrend_write_key", KEY);
  const tags = scripts(await wp.page("/"));
  assert.equal(tags.length, 1, tags.join("\n"));
  assert.match(tags[0], /src="[^"]*\/wp-content\/plugins\/analyticstrend\/assets\/script\.js\?ver=[^"]+"/);
  assert.match(tags[0], new RegExp(`data-write-key="${KEY}"`));
  assert.match(tags[0], /\sdefer[\s=>]/);
});

test("trims a pasted key and refuses one that is not a write key", async () => {
  const hex = "0123456789abcdef0123456789abcdef";
  assert.equal(await wp.php(`echo analyticstrend_sanitize_key("  wk_${hex}\n");`), `wk_${hex}`);
  assert.equal(await wp.php(`echo analyticstrend_sanitize_key("pk_123");`), "");
  assert.equal(await wp.php(`echo analyticstrend_sanitize_key("wk_${hex.toUpperCase()}");`), "");
  assert.equal(await wp.php(`echo analyticstrend_sanitize_key("wk_${hex}0");`), "");
});

test("a refused key keeps the one already saved, and says why", async () => {
  await setOption("analyticstrend_write_key", KEY);
  const out = await wp.php(`
    require_once ABSPATH . "wp-admin/includes/template.php";
    update_option("analyticstrend_write_key", "not a key");
    echo get_option("analyticstrend_write_key"), "|";
    foreach (get_settings_errors("analyticstrend_write_key") as $e) echo $e["code"];
  `);
  assert.equal(out, `${KEY}|invalid_key`);
});

test("leaves out an administrator, and counts a subscriber", async () => {
  await setOption("analyticstrend_write_key", KEY);
  await setOption("analyticstrend_skip_editors", "1");
  assert.equal(scripts(await headAs(wp, "administrator")).length, 0);
  assert.equal(scripts(await headAs(wp, "editor")).length, 0);
  assert.equal(scripts(await headAs(wp, "subscriber")).length, 1);
  assert.equal(scripts(await headAs(wp, "author")).length, 1);

  await setOption("analyticstrend_skip_editors", "0");
  assert.equal(scripts(await headAs(wp, "administrator")).length, 1);
});

test("leaves out administrators and editors by default", async () => {
  await wp.php(`delete_option("analyticstrend_skip_editors");`);
  await setOption("analyticstrend_write_key", KEY);
  assert.equal(scripts(await headAs(wp, "administrator")).length, 0);
});

test("adds the link attributes only when asked", async () => {
  await setOption("analyticstrend_write_key", KEY);
  await setOption("analyticstrend_link_events", "0");
  let [tag] = scripts(await headAs(wp, null));
  assert.doesNotMatch(tag, /data-outbound-links|data-file-downloads/);

  await setOption("analyticstrend_link_events", "1");
  [tag] = scripts(await headAs(wp, null));
  assert.match(tag, /data-outbound-links="true"/);
  assert.match(tag, /data-file-downloads="true"/);
});

test("serves the bundled script, not a CDN", async () => {
  await setOption("analyticstrend_write_key", KEY);
  const html = await wp.page("/");
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net|unpkg\.com/);
  const src = scripts(html)[0].match(/src="([^"]+)"/)[1].replace(/&#038;|&amp;/g, "&");
  const body = await (await fetch(new URL(src, wp.url))).text();
  assert.match(body, /analyticstrend/i);
  assert.ok(body.length > 1000);
});
