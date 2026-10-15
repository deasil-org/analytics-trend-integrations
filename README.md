# AnalyticsTrend integrations

The SDKs, framework integrations, a starter template and working examples for
[AnalyticsTrend](https://analyticstrend.com), privacy-first product analytics for websites,
browser extensions, and mobile, desktop and server apps, with no cookies and no
fingerprinting, which keeps no IP addresses: each one is used to work out a country or region,
then discarded.

| Path | What it is |
| --- | --- |
| [`packages/extension`](packages/extension) | `@analyticstrend/extension`, the SDK for Chromium and Firefox extensions |
| [`packages/web`](packages/web) | `@analyticstrend/web`, the SDK for websites, and its script tag |
| [`packages/sdk-core`](packages/sdk-core) | `@analyticstrend/sdk-core`, the queue, batching and retry both SDKs share |
| [`packages/event-schema`](packages/event-schema) | `@analyticstrend/event-schema`, the wire contract between the SDKs and the collector |
| [`packages/wxt-analytics`](packages/wxt-analytics) | `@analyticstrend/wxt-analytics`, a provider for WXT's analytics module |
| [`templates/wxt`](templates/wxt) | A WXT starter extension, already measured |
| [`examples/wxt-direct`](examples/wxt-direct) | WXT calling the SDK directly |
| [`examples/crxjs`](examples/crxjs) | CRXJS on Vite |
| [`examples/plasmo`](examples/plasmo) | Plasmo |
| [`examples/plain`](examples/plain) | No framework at all |
| [`examples/app-*`](#apps-over-http) | Apps sending over HTTP: Node, Python, Rust, Tauri, Swift, Kotlin and C# |

Start a new extension from the template:

```bash
npx giget@latest gh:deasil-org/analytics-trend-integrations/templates/wxt my-extension
```

Every project here builds for Chrome and Firefox in CI, and each build is checked for the
storage permission, the right background for each browser, Firefox's data-collection block,
and no remote code.

## Apps over HTTP

A mobile, desktop, server or game app needs no SDK: it sends events to the collector over HTTP,
with `client: "app"`. Each example below does the same four things, so they compare line for
line: it reads the write key from `ANALYTICSTREND_WRITE_KEY`, keeps a random anonymous id,
sends its events as one batch, and retries a failed send with the same event ids. An app also
says what it runs on, with `os` and `deviceType`, since its User-Agent names neither; a server
sends neither, and sends `"location": false`.

| Example | For |
| --- | --- |
| [`examples/app-node`](examples/app-node) | A Node server |
| [`examples/app-python`](examples/app-python) | A Python server or script |
| [`examples/app-rust`](examples/app-rust) | A Rust app or server |
| [`examples/app-tauri`](examples/app-tauri) | A Tauri 2 desktop app, sending from its Rust side |
| [`examples/app-swift`](examples/app-swift) | iOS and macOS apps |
| [`examples/app-kotlin`](examples/app-kotlin) | Android and JVM apps |
| [`examples/app-dotnet`](examples/app-dotnet) | .NET apps and Unity games |

Try any of them without a project, against a mock collector that checks each batch with the
collector's own rules:

```bash
pnpm install && pnpm build:packages
pnpm mock-collector
```

`pnpm check:app-examples` runs every example against it, twice, in Docker where its
toolchain is not installed. The guide is [Install in an app](https://analyticstrend.com/docs/guide/install-app).

## Releasing

Raise the version in the package's `package.json` and add a line to its `CHANGELOG.md`,
then, from the repository root:

```bash
pnpm test && pnpm release
```

`pnpm release` publishes every package under `packages/` whose version is not on npm yet, in
dependency order, and skips the rest. Publish with pnpm only: it replaces the `workspace:*`
links between the SDKs with real versions, and npm would publish them as they are.

Documentation: <https://analyticstrend.com/docs>. Issues and questions:
[GitHub issues](https://github.com/deasil-org/analytics-trend-integrations/issues).

MIT licensed.
