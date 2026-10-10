// Refuses to publish unless pnpm is the one publishing.
//
// The packages are published through pnpm because pnpm does two things at pack
// time that npm does not. It swaps in the provider's publishConfig main, types
// and exports, where npm would leave the source-pointing fields used inside
// this repository. And it turns each `workspace:*` dependency between the SDKs
// into the version it names, where npm would publish `workspace:*` itself,
// which no one can install. Wired in as prepublishOnly, which both npm and pnpm
// run; the user agent is how they identify themselves.
const agent = process.env.npm_config_user_agent ?? "";

if (!agent.startsWith("pnpm/")) {
  console.error(
    [
      "",
      "Publish with pnpm, not npm. Every package whose version is not on npm yet:",
      "",
      "  pnpm release",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
