import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { KEY, bootWordPress } from "./playground.mjs";

let wp;
before(async () => {
  wp = await bootWordPress();
});
after(() => wp?.stop());

const GUIDE = "https://analyticstrend.com/docs/guide/install-wordpress";
const GUIDE_FR = "https://analyticstrend.com/docs/fr/guide/install-wordpress";

/** Loads the admin's functions and signs in as an administrator, in `locale` if given. */
const asAdmin = (locale) => `
  require_once ABSPATH . "wp-admin/includes/admin.php";
  $u = get_user_by("login", "admin"); wp_set_current_user($u->ID);
  ${locale ? `add_filter("determine_locale", fn() => "${locale}"); analyticstrend_load_textdomain();` : ""}
`;

const settingsPage = (locale) => wp.php(`${asAdmin(locale)} analyticstrend_settings_page();`);
const pluginRow = (locale) =>
  wp.php(`${asAdmin(locale)} echo implode("\\n", apply_filters("plugin_action_links_analyticstrend/analyticstrend.php", []));`);

test("links the docs from the settings page and the Plugins list", async () => {
  assert.ok((await settingsPage()).includes(GUIDE));
  const row = await pluginRow();
  assert.ok(row.includes(GUIDE), row);
  assert.match(row, /options-general\.php\?page=analyticstrend/);

  assert.ok((await settingsPage("fr_FR")).includes(GUIDE_FR));
  assert.ok((await pluginRow("fr_FR")).includes(GUIDE_FR));
});

test("suggests privacy-page text that links our privacy policy", async () => {
  const text = await wp.php(`${asAdmin()}
    require_once ABSPATH . "wp-admin/includes/class-wp-privacy-policy-content.php";
    // WordPress takes suggested text only in the admin, during admin_init.
    set_current_screen("options-privacy");
    do_action("admin_init");
    foreach (WP_Privacy_Policy_Content::get_suggested_policy_text() as $p) if ($p["plugin_name"] === "AnalyticsTrend") echo $p["policy_text"];
  `);
  assert.ok(text.includes("https://analyticstrend.com/privacy"), text);
  assert.match(text, /cookie/i);
  assert.match(text, /IP address/);
  assert.doesNotMatch(text, /compliant/i);
});

test("has no Powered-by link on the public site", async () => {
  await wp.php(`update_option("analyticstrend_write_key", "${KEY}");`);
  const html = await wp.page("/");
  assert.doesNotMatch(html, /<a\b[^>]*analyticstrend\.com/i);
});
