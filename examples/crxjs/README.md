# AnalyticsTrend with CRXJS

A Vite extension built with [CRXJS](https://crxjs.dev), instrumented with the AnalyticsTrend
extension SDK. One `manifest.config.ts` serves both browsers: `vite build --mode firefox`
builds the Firefox version.

```bash
VITE_ANALYTICSTREND_WRITE_KEY=wk_your_key pnpm --filter example-crxjs build
```

Guide: <https://analyticstrend.com/docs/guide/install-crxjs>
