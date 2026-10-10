# AnalyticsTrend example extension

A complete Manifest V3 extension instrumented with `@analyticstrend/extension`, with no
framework. One build loads unchanged in Chrome and in Firefox. Copy it as a starting point.

It sends three events:

| Event | Sent from | When |
| --- | --- | --- |
| `background_started` | the background | every time the browser starts the background |
| `page_visited` | a content script | on pages under `example.com` and `localhost` |
| `popup_opened`, `hello_clicked` | the popup | when the popup opens, and when its button is pressed |

Nothing about the page is sent: no URL, no title. The event name is the whole record.

## Build

```bash
AT_WRITE_KEY=wk_your_key pnpm --filter example-plain build
```

The output is `dist/`. `AT_ENDPOINT` points it at a collector other than `https://analyticstrend.com`.

The SDK is bundled into the extension at build time. Manifest V3 forbids remote code, and
Mozilla's reviewers reject it, so every line the extension runs has to be inside the package
the store reviews.

## Run

**Chrome:** open `chrome://extensions`, turn on Developer mode, choose *Load unpacked*, and
pick `dist/`.

**Firefox:**

```bash
pnpm --filter example-plain firefox
```

That builds and opens Firefox with the extension installed as a temporary add-on. Or open
`about:debugging#/runtime/this-firefox` and choose *Load Temporary Add-on*.

## Check it in real browsers

```bash
pnpm --filter example-plain check:browsers
```

This loads the build into real Chromium and real Firefox, points it at a local stub
collector, and checks from the receiving end that:

- the background starts and delivers within seconds;
- every page load delivers its `page_visited`, none lost;
- each arrives within 15 seconds, including after the background has gone idle and been
  suspended, which is the case unit tests cannot reproduce;
- one anonymous id and the right write key are on every batch.

It takes about two minutes per browser, because it has to wait out the background's idle
timeout twice. It needs Firefox installed and the Chromium that Playwright downloads
(`npx playwright install chromium`); `CHROMIUM_PATH` and `FIREFOX_PATH` override both.
Branded Google Chrome cannot be used, because it ignores `--load-extension` from version 137.

## What the manifest is doing

- **Both background keys.** Chrome reads `background.service_worker` and Firefox reads
  `background.scripts`; each ignores the other. `web-ext lint` warns that Firefox does not
  support `service_worker`, and that one warning is expected.
- **`storage`, and no host permissions.** Storage holds the queue and the anonymous id. The
  collector answers cross-origin requests itself, so no `host_permissions` entry is needed,
  and the install prompt carries no "read and change your data" warning.
- **`data_collection_permissions`.** Firefox asks extensions to declare what they collect.
  Mozilla's schema accepts the analytics category, `technicalAndInteraction`, only as
  optional, never as required. `locationInfo` is declared as optional too, because the
  collector works a country and region out of each request; the SDK honours it on its own.

## The background script

```ts
const analytics = initBackground({ writeKey, endpoint, uninstallTracking: true });
analytics.track("background_started");
```

Not awaited, on purpose. Chrome will not run a service worker that uses top-level `await`:
the extension installs, its background never executes, and nothing is sent, with no error on
any page you would think to look at.
