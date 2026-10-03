# My extension

A [WXT](https://wxt.dev) extension measured with [AnalyticsTrend](https://analyticstrend.com):
a popup that sends events, a "Share anonymous usage" switch, and on Firefox the built-in
data-collection choice.

## Start

```bash
npx giget@latest gh:deasil-org/analytics-trend-integrations/templates/wxt my-extension
cd my-extension
cp .env.example .env    # then put your write key in it
npm install
```

Your write key is on your dashboard's Settings screen. It is public by design: it can write
events and read nothing.

## Develop

```bash
npm run dev            # Chrome
npm run dev:firefox    # Firefox
```

## Build and zip

```bash
npm run build          # .output/chrome-mv3 and .output/firefox-mv3
npm run zip            # the zips to upload to each store
```

Before you submit, change the name in `wxt.config.ts` and replace the placeholder Firefox
add-on id, `my-extension@example.com`, with your own.

## What to declare to the stores

The [store disclosure helper](https://analyticstrend.com/tools/store-disclosure) gives the
Chrome Web Store answers and the Firefox block for an extension using AnalyticsTrend. The
Firefox block in `wxt.config.ts` is already the one it gives.

The full guide is at <https://analyticstrend.com/docs/guide/install-wxt>.
