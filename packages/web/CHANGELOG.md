# Changelog

## 0.4.0

- **A script tag for sites without a build step.** `dist/script.js` is the whole SDK in one
  file, configured by its tag's data attributes: `data-write-key` (required),
  `data-endpoint`, `data-auto-capture="false"`, `data-respect-gpc="false"`,
  `data-clear-on-gpc="true"` and `data-page-views="false"`. It sends a page view when the page
  loads and exposes the client as `window.analyticstrend`. Load it from jsDelivr with an exact
  version and its integrity hash, or host it yourself; see the install guide. Not for
  extensions: Manifest V3 forbids remote code, so they keep the package.

## 0.3.0

- **Browsers sending Global Privacy Control are no longer counted by default.** When
  `navigator.globalPrivacyControl` is true, `init` returns a client that sends nothing, stores
  nothing and registers no listeners. Your counts drop by the share of visitors who send it,
  which no one can see, because seeing it would mean collecting from them.
- **`respectGlobalPrivacyControl: false`** counts those browsers anyway. Use it only on a
  considered legal position.
- **`clearDataOnGlobalPrivacyControl: true`** also deletes an identifier and queue stored
  before the signal appeared. It is off by default; no privacy law requires it.
- **`client.enabled`** is false when nothing is being counted.

## 0.2.0

- **Traffic sources, captured for you.** Events now carry where the visit came from: the referrer hostname, `utm_source` and its siblings, `ref`/`source`, and the *name* of a `gclid`/`msclkid`/`fbclid` parameter where one is present. Resolved once per document, because `document.referrer` does not change when a single-page app changes route.
- **Navigation.** Every event carries the current path, and a page view carries the previous one, which is what makes page-to-page flow reporting possible. In a single-page app the chain comes from the SDK itself; on a full page load it falls back to a same-origin referrer, which keeps its path where a cross-origin one would not.
- **Only whitelisted parameter names are read**, never the raw query string, and a click identifier is recorded by name rather than by value.
- **`init({ autoCapture: false })`** turns all of the above off.

## 0.1.2

- **No more duplicate events.** Events now carry an id (from `@analyticstrend/sdk-core` 0.1.2), so the collector stores each event once, however many times it arrives. A page that unloads before the collector answers keeps its queue and sends it again, which used to store the same events two or three times per page change.

## 0.1.1

- **Installable, and importable.** 0.1.0 was published with npm rather than pnpm, which
  left a workspace placeholder, `workspace:*`, in its dependencies, and skipped the setting
  that points the entry at the compiled code. The first made `npm install` fail; the second
  would have broken every import. Both are fixed.
- Reports this package's own version as `clientVersion` rather than a shared constant.

## 0.1.0

First release.
