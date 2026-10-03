# @analyticstrend/wxt-analytics

AnalyticsTrend as a provider for [WXT](https://wxt.dev)'s analytics module. Events go through
the AnalyticsTrend extension SDK, so they survive a suspended background, honour Firefox's
data-collection consent and Global Privacy Control, and can record uninstalls. WXT's own
on/off switch governs all of it.

```bash
npm install @analyticstrend/wxt-analytics @analyticstrend/extension @wxt-dev/analytics@0.5.4
```

Use `@wxt-dev/analytics` 0.5.4 with npm: 0.5.5 and 0.5.6 publish a development `postinstall`
script that fails under npm. pnpm, which skips dependency install scripts, works with any of
them.

```ts
// wxt.config.ts
export default defineConfig({ modules: ["@wxt-dev/analytics/module"] });

// app.config.ts
import { analyticsTrend } from "@analyticstrend/wxt-analytics";

export default defineAppConfig({
  analytics: {
    enabled: storage.defineItem("local:analytics-enabled", { fallback: true }),
    providers: [
      analyticsTrend({ writeKey: import.meta.env.WXT_ANALYTICSTREND_WRITE_KEY, uninstallTracking: true }),
    ],
  },
});
```

## What reaches AnalyticsTrend

| WXT hands the provider | What happens |
| --- | --- |
| `track`: the event name and properties | Sent as the event and its properties |
| An auto-tracked click: tag, id, class | Sent |
| An auto-tracked click: text and link | Dropped. On a website they are that site's content and a full address |
| `page(url)` | `page_viewed`, with `path` only for the extension's own pages |
| `identify` | Ignored. The SDK keeps its own random identifier |
| Language, screen, referrer, address, title, session | Never sent |

Full guide: <https://analyticstrend.com/docs/guide/install-wxt>
