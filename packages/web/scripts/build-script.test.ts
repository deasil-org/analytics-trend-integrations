import { describe, expect, it } from "vitest";
import { buildScript } from "./build-script.mjs";

// Narrowly typed, as version.test.ts does, because this package carries no
// Node types: it ships inside customers' pages and stays dependency-light.
type Crypto = { createHash(algorithm: string): { update(data: Uint8Array): { digest(encoding: "base64"): string } } };
const NODE_CRYPTO = "node:crypto";

describe("the script-tag build", () => {
  // The docs publish this file's integrity hash, so the same source has to
  // give the same bytes every time.
  it("gives the same bytes twice", async () => {
    const { createHash } = (await import(NODE_CRYPTO)) as Crypto;
    const [a, b] = await Promise.all([buildScript(), buildScript()]);
    expect(createHash("sha384").update(a).digest("base64")).toBe(createHash("sha384").update(b).digest("base64"));
  });

  it("is one self-contained file that names its version and starts itself", async () => {
    const text = new TextDecoder().decode(await buildScript());
    expect(text).toMatch(/^\/\*! @analyticstrend\/web \d+\.\d+\.\d+ \| MIT \*\//);
    expect(text).not.toMatch(/\bimport\s*\(|\brequire\(/);
    expect(text).toContain("currentScript");
  });
});
