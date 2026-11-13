// Copies the plugin into a checkout of its WordPress.org Subversion
// repository, as trunk and as tags/<version>, with the directory's icon,
// banners and screenshots (wp-assets/) as assets/, and prints the commands
// that publish it. It runs no svn command itself: publishing is the owner's
// step.
//
//   svn co https://plugins.svn.wordpress.org/analyticstrend <dir>
//   node scripts/copy-script.mjs && node scripts/svn-sync.mjs <dir>
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { PLUGIN, ROOT, pluginFiles, pluginVersion } from "./files.mjs";

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

// assets/ is replaced whole too, so an image dropped from wp-assets/ leaves
// the directory as well.
const art = path.join(ROOT, "wp-assets");
const assets = path.join(checkout, "assets");
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
for (const name of readdirSync(art)) cpSync(path.join(art, name), path.join(assets, name));

console.log(`Copied ${files.length} files to trunk and tags/${version}, and the directory's images to assets. To publish, from ${checkout}:

  svn add --force trunk tags/${version} assets
  svn propset svn:mime-type image/png assets/*.png
  svn propset svn:mime-type image/svg+xml assets/*.svg
  svn status            # check for files marked ! (removed) and svn rm them
  svn ci -m "Release ${version}"
`);
