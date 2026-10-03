# AnalyticsTrend with WXT, directly

WXT calling the AnalyticsTrend extension SDK itself, without WXT's analytics module. The one
rule to know: `initBackground` goes inside `defineBackground`'s `main()`, because WXT imports
the background file in Node during the build. See `entrypoints/background.ts`.

```bash
WXT_ANALYTICSTREND_WRITE_KEY=wk_your_key pnpm --filter example-wxt-direct build
```

Guide: <https://analyticstrend.com/docs/guide/install-wxt>
