import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "./constants.ts";

// This package has no @types/node dependency, for the same reason index.test.ts
// gives: it ships inside customers' extensions and stays dependency-light. The
// one Node call this file makes is typed narrowly here instead, and loaded
// through a variable so the compiler does not go looking for Node's types.
type ReadFile = { readFileSync(path: URL, encoding: "utf8"): string };
const NODE_FS = "node:fs";

describe("SDK_VERSION", () => {
  it("matches the version in package.json", async () => {
    // Every event carries this as clientVersion. If it lags behind the
    // published version, events from a fixed release are indistinguishable
    // from the broken one they replaced.
    const { readFileSync } = (await import(NODE_FS)) as ReadFile;
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };

    expect(SDK_VERSION).toBe(manifest.version);
  });
});
