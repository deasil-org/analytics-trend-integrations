import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));

// The bundle is built from the sibling packages' source, not their dist, so the
// bytes depend on the source alone and not on whether those were built first.
const source = (name) => fileURLToPath(new URL(`../../${name}/src/index.ts`, import.meta.url));

/**
 * dist/script.js: the SDK, sdk-core and event-schema in one minified file,
 * started by its own <script> tag. The same source gives the same bytes,
 * because the docs publish this file's integrity hash and a browser refuses
 * anything that does not match it.
 */
export async function buildScript() {
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const result = await build({
    entryPoints: [`${root}src/script.ts`],
    bundle: true,
    format: "iife",
    minify: true,
    target: "es2019",
    legalComments: "none",
    alias: {
      "@analyticstrend/event-schema": source("event-schema"),
      "@analyticstrend/sdk-core": source("sdk-core"),
    },
    banner: { js: `/*! @analyticstrend/web ${version} | MIT */` },
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0].contents;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await mkdir(`${root}dist`, { recursive: true });
  await writeFile(`${root}dist/script.js`, await buildScript());
}
