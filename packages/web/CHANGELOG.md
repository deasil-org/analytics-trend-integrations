# Changelog

## 0.9.0

- **Breaking: the client is `window.analyticsTrend`.** The script tag exposes its client as `window.analyticsTrend`, camel case with the T capitalised, as `window.analyticsTrendConfig` and `window.analyticsTrendQueue` are. `window.analyticstrend` is no longer set, with no alias, so a page that calls `window.analyticstrend.track("signup")` must call `window.analyticsTrend.track("signup")` instead. A copy of 0.8.0 on the same page as 0.9.0 does not see it as a client with the same key, so keep one version on a page. Nothing changes for `init`, which returns the client as before.

## 0.8.0

- **Automated browsers are no longer counted by default.** When `navigator.webdriver` is true, as it is in a browser driven by Puppeteer, Playwright or Selenium, `init` returns a client that sends nothing, stores nothing and listens for nothing, as it does for Global Privacy Control, and `enabled` is `false`. Such a browser is a crawler far more often than a person: one running real Chrome sends an ordinary User-Agent, so the collector's bot check cannot see it, and each of its visits is a one-page visit from nowhere. The flag is read in the browser and never sent. `init({ countAutomatedBrowsers: true })`, or `data-count-automated="true"` on the script tag, counts them anyway, for a site whose own end-to-end tests check its events.
- **Options from a page global.** The script tag also reads its options from `window.analyticsTrendConfig`, for an install that can't set attributes on the tag it adds, such as Google Tag Manager. The keys are the tag's attributes in camelCase with the same string values (`writeKey`, `pageViews`, `outboundLinks` and the rest), and an attribute on the tag wins over the same key. The script also starts when it was injected after the page parsed, as long as the global gives a write key.
- **Events sent before the script loads.** Events pushed onto `window.analyticsTrendQueue` as `[name, props]` before the script loads are sent once it starts, once each, and a push after that is sent at once. The queue stays an array.
- **One client per write key.** A second copy of the script with the same write key on a page starts nothing and leaves the first client as `window.analyticstrend`, so a site with the tag by hand that also installs a plugin is not counted twice.

## 0.7.1

- **The README in French, Spanish, Portuguese and German.** `README.fr.md`, `README.es.md`, `README.pt-BR.md` and `README.de.md` ship beside `README.md`, each README starts with a line linking to the others, and the package lists translated keywords for npm search. No change to what the package does.
- **The README no longer tells a single-page app to count its own route changes.** It shows `init({ pageViews: "history" })`, which sends a page view when `init` runs and on every path change, and says that a page view the app also sends for the page just counted is not sent twice.

## 0.7.0

- **Form submissions.** `init({ formSubmissions: true })`, or `data-form-submissions="true"` on the script tag, sends `form_submit` when a form on the page is submitted, with `$form`: the form's `id`, or its `name` when it has no id. Never a field, a value or the address the form is sent to. A form the browser refuses as invalid is not counted, and the submit is never stopped or delayed. **Off by default**: it is a new kind of collection, so check that your privacy wording covers it before turning it on.
- Depends on `@analyticstrend/event-schema` 0.8.0, which reserves `$form`.

## 0.6.1

- **Installs from npm with the published `@analyticstrend/event-schema` 0.6.0.** 0.6.0 was published naming event-schema 0.7.0 before that version existed. No change to what the SDK does.

## 0.6.0

- **How long each page was visible.** With auto-capture on (the default), the SDK sends a `page_engagement` event with `$engaged_ms` when the page is hidden or closed, and when a single-page app moves to another path. It counts only time the page was visible, sends nothing under a second (carried over to the next signal), and at most 30 minutes in one signal. It carries no identity: the same random identifier and captured props as every event. AnalyticsTrend uses it for visit duration and bounce rate. **This is a new kind of collection that is on by default**, so check that your privacy wording covers how long pages are viewed. `init({ engagement: false })` or `data-engagement="false"` turns it off alone; `autoCapture: false` turns it off with the rest.
- **`page_engagement` is reserved** for this signal: an event of your own with that name is read as one.

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
