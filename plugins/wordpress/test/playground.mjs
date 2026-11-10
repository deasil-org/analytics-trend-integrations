// Boots WordPress in Playground, under Node, with this plugin mounted and
// active. There is no PHP on the machines this repository is built on, and
// Playground is WordPress's own way to run it without one.
import { runCLI } from "@wp-playground/cli";
import path from "node:path";

const PLUGIN_DIR = path.join(import.meta.dirname, "..", "analyticstrend");
let nextPort = 9420;

/**
 * @returns {Promise<{ url: string, php: (code: string) => Promise<string>, page: (path?: string) => Promise<string>, stop: () => Promise<void> }>}
 */
export async function bootWordPress() {
  const cli = await runCLI({
    command: "server",
    port: nextPort++ + (process.pid % 200) * 3,
    quiet: true,
    skipBrowser: true,
    login: false,
    workers: 1,
    mount: [{ hostPath: PLUGIN_DIR, vfsPath: "/wordpress/wp-content/plugins/analyticstrend" }],
    blueprint: { steps: [{ step: "activatePlugin", pluginPath: "analyticstrend/analyticstrend.php" }] },
  });
  return {
    url: cli.serverUrl,
    // Runs PHP with WordPress loaded, and returns what it printed.
    async php(code) {
      const result = await cli.playground.run({ code: `<?php require "/wordpress/wp-load.php"; ${code}` });
      if (result.errors) throw new Error(result.errors);
      return result.text;
    },
    async page(pathname = "/") {
      return (await fetch(cli.serverUrl + pathname)).text();
    },
    async stop() {
      await cli[Symbol.asyncDispose]();
    },
  };
}

export const KEY = `wk_${"0".repeat(32)}`;

/** What wp_head prints for the user with this role, or for a visitor when role is null. */
export function headAs(wp, role) {
  const login = role
    ? `$u = get_user_by("login", "test_${role}") ?: get_user_by("id", wp_insert_user(["user_login" => "test_${role}", "user_pass" => wp_generate_password(), "role" => "${role}"])); wp_set_current_user($u->ID);`
    : "wp_set_current_user(0);";
  return wp.php(`${login} ob_start(); do_action("wp_head"); echo ob_get_clean();`);
}
