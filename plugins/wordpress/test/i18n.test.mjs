import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { LOCALES, msgids } from "../scripts/build-l10n.mjs";
import { bootWordPress } from "./playground.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const catalog = (locale) => JSON.parse(readFileSync(path.join(ROOT, "i18n", `${locale}.json`), "utf8"));

test("every string the PHP translates has a translation in each locale", () => {
  const ids = msgids();
  assert.ok(ids.length >= 10, `found only ${ids.length} strings`);
  for (const locale of LOCALES) {
    const messages = catalog(locale);
    const missing = ids.filter((id) => !messages[id]);
    assert.deepEqual(missing, [], `${locale} lacks these`);
    const stale = Object.keys(messages).filter((id) => !ids.includes(id));
    assert.deepEqual(stale, [], `${locale} has strings the PHP no longer uses`);
  }
});

test("the locales are WordPress's French, Spanish, Brazilian Portuguese and German", () => {
  assert.deepEqual(LOCALES, ["fr_FR", "es_ES", "pt_BR", "de_DE"]);
  assert.deepEqual(readdirSync(path.join(ROOT, "i18n")).sort(), LOCALES.map((l) => `${l}.json`).sort());
});

let wp;
before(async () => {
  wp = await bootWordPress();
});
after(() => wp?.stop());

test("shows the French settings page in French", async () => {
  const html = await wp.php(`
    require_once ABSPATH . "wp-admin/includes/admin.php";
    wp_set_current_user(get_user_by("login", "admin")->ID);
    add_filter("determine_locale", fn() => "fr_FR");
    analyticstrend_load_textdomain();
    analyticstrend_settings_page();
  `);
  const fr = catalog("fr_FR");
  assert.ok(html.includes(fr["Write key"]), html);
  assert.ok(!html.includes(">Write key<"));
});
