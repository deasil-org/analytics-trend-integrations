// Refuses to publish unless pnpm is the one publishing.
//
// The provider is published through pnpm because pnpm swaps in publishConfig's
// main, types and exports at pack time, and npm leaves the source-pointing
// fields used inside this repository. Published with npm, the package would
// point at files it does not contain. Wired in as prepublishOnly, which both
// npm and pnpm run; the user agent is how they identify themselves.
const agent = process.env.npm_config_user_agent ?? "";

if (!agent.startsWith("pnpm/")) {
  console.error(
    [
      "",
      "Publish this package with pnpm, not npm:",
      "",
      "  pnpm --filter @analyticstrend/wxt-analytics publish --access public",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
