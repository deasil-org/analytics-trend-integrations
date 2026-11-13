// Runs WordPress's Plugin Check, the tool the plugin review team runs on every
// submission, on the plugin in Playground, and prints what it finds. Exits 1
// on an error; warnings are printed and leave the exit code at 0.
//
//   pnpm --filter analyticstrend-wordpress plugin-check
//
// Only the static checks run (code, readme, headers, escaping, i18n and the
// rest): the runtime ones need a browser request Playground can't make here.
// Plugin Check runs PHP_CodeSniffer, which asks for two things Playground's
// PHP doesn't have, an exclusive file lock and a stdin stream, so the copy
// installed in Playground has both switched off. Nothing outside Playground
// changes.
import { runCLI } from "@wp-playground/cli";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PLUGIN } from "./files.mjs";

const out = mkdtempSync(path.join(tmpdir(), "analyticstrend-plugin-check-"));
const PHPCS = "/wordpress/wp-content/plugins/plugin-check/vendor/squizlabs/php_codesniffer/src/";

const patchPhpcs = `<?php
$reporter = '${PHPCS}Reporter.php';
file_put_contents($reporter, str_replace('LOCK_EX', '0', file_get_contents($reporter)));
$config = '${PHPCS}Config.php';
file_put_contents($config, str_replace("if (defined('STDIN') === false", "if (true || defined('STDIN') === false", file_get_contents($config)));`;

const runChecks = `<?php
require '/wordpress/wp-load.php';
use WordPress\\Plugin_Check\\Checker\\Check_Context;
use WordPress\\Plugin_Check\\Checker\\Check_Repository;
use WordPress\\Plugin_Check\\Checker\\Check_Result;
use WordPress\\Plugin_Check\\Checker\\Default_Check_Repository;
$report = array( 'failed' => array() );
try {
  $result = new Check_Result( new Check_Context( WP_PLUGIN_DIR . '/analyticstrend/analyticstrend.php' ) );
  $checks = ( new Default_Check_Repository() )->get_checks( Check_Repository::TYPE_STATIC | Check_Repository::INCLUDE_EXPERIMENTAL )->to_map();
  foreach ( $checks as $slug => $check ) {
    try { $check->run( $result ); } catch ( Throwable $e ) { $report['failed'][ $slug ] = $e->getMessage(); }
  }
  $report['checks']   = array_keys( $checks );
  $report['errors']   = $result->get_errors();
  $report['warnings'] = $result->get_warnings();
} catch ( Throwable $e ) {
  $report['fatal'] = get_class( $e ) . ': ' . $e->getMessage();
}
file_put_contents( '/out/report.json', json_encode( $report ) );`;

try {
  await runCLI({
    command: "run-blueprint",
    quiet: true,
    mount: [
      { hostPath: PLUGIN, vfsPath: "/wordpress/wp-content/plugins/analyticstrend" },
      { hostPath: out, vfsPath: "/out" },
    ],
    blueprint: {
      preferredVersions: { php: "8.2", wp: "latest" },
      steps: [
        { step: "installPlugin", pluginData: { resource: "wordpress.org/plugins", slug: "plugin-check" } },
        { step: "runPHP", code: patchPhpcs },
        { step: "activatePlugin", pluginPath: "analyticstrend/analyticstrend.php" },
        { step: "runPHP", code: runChecks },
      ],
    },
  });
  const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8"));
  if (report.fatal) throw new Error(`Plugin Check did not run: ${report.fatal}`);

  // Plugin Check groups its findings by file, then line, then column.
  const list = (found) =>
    Object.entries(found).flatMap(([file, lines]) =>
      Object.entries(lines).flatMap(([line, columns]) =>
        Object.values(columns).flatMap((items) => items.map((item) => `  ${file}:${line}  ${item.code}\n    ${item.message}`)),
      ),
    );
  const errors = list(report.errors);
  const warnings = list(report.warnings);
  console.log(`Plugin Check ran ${report.checks.length} checks: ${errors.length} errors, ${warnings.length} warnings.`);
  for (const [slug, message] of Object.entries(report.failed)) console.log(`  The ${slug} check could not run: ${message}`);
  if (errors.length) console.log(`Errors:\n${errors.join("\n")}`);
  if (warnings.length) console.log(`Warnings:\n${warnings.join("\n")}`);
  process.exitCode = errors.length ? 1 : 0;
} finally {
  rmSync(out, { recursive: true, force: true });
}
