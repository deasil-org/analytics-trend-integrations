// Copies the plugin into a checkout of its WordPress.org Subversion
// repository, as trunk and as tags/<version>, and prints the commands that
// publish it. It runs no svn command itself: publishing is the owner's step.
//
//   svn co https://plugins.svn.wordpress.org/analyticstrend <dir>
//   node scripts/copy-script.mjs && node scripts/svn-sync.mjs <dir>
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { PLUGIN, pluginFiles, pluginVersion } from "./files.mjs";

const checkout = process.argv[2];
if (!checkout) {
  console.error("usage: node scripts/svn-sync.mjs <svn-checkout-dir>");
  process.exit(2);
}

const version = pluginVersion(readFileSync(path.join(PLUGIN, "analyticstrend.php"), "utf8"));
const files = pluginFiles();
for (const where of ["trunk", path.join("tags", version)]) {
  const target = path.join(checkout, where);
  // trunk is replaced whole, so a file the plugin no longer has goes too.
  rmSync(target, { recursive: true, force: true });
  for (const file of files) {
    const to = path.join(target, ...file.split("/"));
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(path.join(PLUGIN, ...file.split("/")), to);
  }
}

console.log(`Copied ${files.length} files to trunk and tags/${version}. To publish, from ${checkout}:

  svn add --force trunk tags/${version}
  svn status            # check for files marked ! (removed) and svn rm them
  svn ci -m "Release ${version}"
`);
