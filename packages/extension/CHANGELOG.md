# Changelog

## 0.5.0

- **Your own consent switch.** `initBackground({ consent })` takes a function that says whether the person has allowed analytics, as a boolean or a promise of one. It is asked before every event and every send, alongside Firefox's data-collection consent and Global Privacy Control, and all of them have to allow it. While it says no, nothing is sent or stored, no identifier is created, and the uninstall link is cleared. Anything but `true`, an error or a rejected promise counts as no.
- **`client.consentChanged()`** makes the uninstall link follow a change straight away. Call it after the switch flips. It sends nothing.
- Without `consent`, nothing changes.

## 0.4.0

- **Firefox's `locationInfo` toggle is honoured on its own.** The collector works a country, and in some countries a region, out of each request's address, which Mozilla counts as `locationInfo`. Declare it as optional next to `technicalAndInteraction`, and someone who turns location off is still counted, with no country or region: every batch says `location: false`, and the uninstall link carries `l=0`. Both follow a change of mind without a restart. Extensions that do not declare it, and Chrome, are unaffected.
- **Needs a collector from 2026-09-30 or later** to act on it. An older collector ignores the flag and still works out a location, so update a self-hosted collector before shipping this.
- `hasLocationConsent` and `LOCATION_DATA_PERMISSION` are exported, beside `hasDataConsent`.

## 0.3.0

- **Browsers sending Global Privacy Control are no longer counted by default,** where the
  browser exposes the signal to the background context. It is checked before every event,
  alongside Firefox's data-collection consent. `respectGlobalPrivacyControl: false` counts
  them anyway, and `clearDataOnGlobalPrivacyControl: true` also deletes the stored identifier
  and queue.
- **The identifier is created only once collection is allowed,** so an extension that is
  never allowed to collect never creates one.
- **The uninstall URL is cleared the moment collection stops being allowed,** whether by GPC
  or by withdrawn consent, and registered again when it resumes. It carries the identifier,
  and Chrome keeps it across restarts. Before this release it was registered even when
  Firefox's data-collection consent was off.
- **`client.enabled()`** resolves to whether anything is being counted.

## 0.2.1

- **No more duplicate events.** Events now carry an id (from `@analyticstrend/sdk-core` 0.1.2), so the collector stores each event once, however many times a retry sends it.

## 0.2.0

**Upgrade if you use Chrome.** Found by loading an instrumented extension into real Chromium
and Firefox rather than simulating them.

### Breaking

- `initBackground` now returns its client immediately instead of a promise. Remove the
  `await` from your background script:

  ```js
  // before
  const analytics = await initBackground({ writeKey });
  // after
  const analytics = initBackground({ writeKey });
  ```

  The documented `await` form sent nothing at all in Chrome, which refuses to run a service
  worker that uses top-level `await`. The extension installed, its background never ran, and
  there was no error to see. Existing `await initBackground(...)` calls keep working anywhere
  top-level `await` is allowed, because awaiting a non-promise returns it unchanged — but
  they should go, since the reason for the change is Chrome.

### Fixed

- Content-script and popup events are no longer lost when their message is what wakes a
  suspended background. The listener is now attached before anything is awaited.
- Events are sent about five seconds after they are tracked, instead of waiting for 50
  queued events or the next background start. Sends back off, up to five minutes, while the
  collector is failing.

### Added

- Firefox data-collection consent is honoured. If your manifest declares
  `technicalAndInteraction` as an optional data-collection permission and the person has not
  granted it, events are dropped rather than stored or sent, and sending resumes if it is
  granted later. Extensions that declare nothing, and Chrome, are unaffected.
- `hasDataConsent`, `onDataConsentChanged` and `ANALYTICS_DATA_PERMISSION` are exported, so
  an extension can show whether analytics are on and ask again from a click.
- Events now report this package's own version as `clientVersion`.

### Also

- **Installable, and importable.** 0.1.0 was published with npm rather than pnpm, which
  left a workspace placeholder, `workspace:*`, in its dependencies, and skipped the setting
  that points the entry at the compiled code. The first made `npm install` fail; the second
  would have broken every import. Both are fixed.

### Docs

- `host_permissions` is not needed to reach the collector, and the install guides no longer
  ask for it. Dropping it removes a data-access warning from your install prompt.

## 0.1.0

First release.
