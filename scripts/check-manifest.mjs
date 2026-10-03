// Checks a built extension for what a store reviewer looks at first: the one
// permission the SDK needs, the right background for each browser, Firefox's
// data-collection block, and no script loaded from the network.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OPTIONAL = ["locationInfo", "technicalAndInteraction"];

// Every project's builds, checked by `pnpm check`. Each project adds its own.
export const BUILDS = [
  ["templates/wxt", "chrome", ".output/chrome-mv3"],
  ["templates/wxt", "firefox", ".output/firefox-mv3"],
  ["examples/wxt-direct", "chrome", ".output/chrome-mv3"],
  ["examples/wxt-direct", "firefox", ".output/firefox-mv3"],
];

export async function checkBuild(browser, dir) {
  const problems = [];
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));

  if (manifest.manifest_version !== 3) problems.push("manifest_version is not 3");
  if (!manifest.permissions?.includes("storage")) problems.push('permissions lacks "storage"');

  if (browser === "chrome" && !manifest.background?.service_worker) {
    problems.push("the Chrome background has no service_worker");
  }
  if (browser === "firefox") {
    if (!manifest.background?.scripts?.length) problems.push("the Firefox background has no scripts");
    const gecko = manifest.browser_specific_settings?.gecko;
    if (!gecko?.id) problems.push("gecko.id is missing");
    if (!(Number.parseFloat(gecko?.strict_min_version ?? "0") >= 140)) {
      problems.push("strict_min_version is missing or below 140.0");
    }
    const permissions = gecko?.data_collection_permissions;
    if (JSON.stringify(permissions?.required) !== JSON.stringify(["none"])) {
      problems.push('data_collection_permissions.required is not ["none"]');
    }
    if (JSON.stringify([...(permissions?.optional ?? [])].sort()) !== JSON.stringify(OPTIONAL)) {
      problems.push("data_collection_permissions.optional is not technicalAndInteraction and locationInfo");
    }
  }

  if (/https?:/.test(JSON.stringify(manifest.content_security_policy ?? ""))) {
    problems.push("the content security policy allows a remote address");
  }
  for (const file of await htmlFiles(dir)) {
    if (/<script[^>]+src=["']https?:/i.test(await readFile(file, "utf8"))) {
      problems.push(`${path.relative(dir, file)} loads a remote script`);
    }
  }
  return problems;
}

async function htmlFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function main(args) {
  const targets = [];
  if (args.length === 0) {
    for (const [project, browser, output] of BUILDS) targets.push([browser, path.join(ROOT, project, output)]);
  } else {
    for (let i = 0; i < args.length; i += 2) targets.push([args[i], path.resolve(args[i + 1] ?? "")]);
  }

  let failed = false;
  for (const [browser, dir] of targets) {
    if (browser !== "chrome" && browser !== "firefox") {
      console.error(`unknown browser "${browser}": use chrome or firefox`);
      failed = true;
      continue;
    }
    const problems = await checkBuild(browser, dir).catch((error) => [`cannot read the build: ${error.message}`]);
    console.log(`${problems.length ? "✗" : "✓"} ${browser} ${path.relative(ROOT, dir) || dir}`);
    for (const problem of problems) console.log(`    ${problem}`);
    if (problems.length) failed = true;
  }
  if (targets.length === 0) console.log("No builds to check.");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
