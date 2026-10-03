# AnalyticsTrend integrations

Framework integrations, a starter template and working examples for
[AnalyticsTrend](https://analyticstrend.com), product analytics for browser extensions and
websites with no cookies and no fingerprinting, which keeps no IP addresses: each one is
used to work out a country or region, then discarded.

| Path | What it is |
| --- | --- |
| [`packages/wxt-analytics`](packages/wxt-analytics) | `@analyticstrend/wxt-analytics`, a provider for WXT's analytics module |
| [`templates/wxt`](templates/wxt) | A WXT starter extension, already measured |
| [`examples/wxt-direct`](examples/wxt-direct) | WXT calling the SDK directly |
| [`examples/crxjs`](examples/crxjs) | CRXJS on Vite |
| [`examples/plasmo`](examples/plasmo) | Plasmo |
| [`examples/plain`](examples/plain) | No framework at all |

Start a new extension from the template:

```bash
npx giget@latest gh:deasil-org/analytics-trend-integrations/templates/wxt my-extension
```

Every project here builds for Chrome and Firefox in CI, and each build is checked for the
storage permission, the right background for each browser, Firefox's data-collection block,
and no remote code.

Documentation: <https://analyticstrend.com/docs>. Issues and questions:
[GitHub issues](https://github.com/deasil-org/analytics-trend-integrations/issues).

MIT licensed.
