# Changelog

## 0.7.0

- **`$screen` is a reserved property**: the screen an app shows, as the app names it, sent with a `screen_view` event when the screen appears. Up to 128 characters, like a path.

## 0.6.0

- **`page_engagement` and `$engaged_ms`.** The web SDK's signal of how long a page was visible, from 0.6.0. `$engaged_ms` is reserved. It is kept only on a `page_engagement` event, as a whole number from 1,000 to 1,800,000 (`LIMITS.MIN_ENGAGED_MS`, `LIMITS.MAX_ENGAGED_MS`); anywhere else it is dropped and the event kept. `ENGAGEMENT_EVENT` names the event.

## 0.5.0

- **`"app"` is a client kind.** A mobile, desktop, server or game app sending events over HTTP says so with `client: "app"`, instead of passing for a website or an extension. `"web"` and `"extension"` are unchanged, and the SDKs still send them.
- **An app may say what it runs on.** Optional `os` (`APP_OS`: iOS, Android, macOS, Windows, Linux, ChromeOS) and `deviceType` (`DEVICE_TYPES`: mobile, tablet, desktop) on a batch, since a native app's User-Agent names neither. Values off the list are dropped, not refused.
- **`validateBatch` returns the checked batch,** with anything the envelope drops left out, rather than its input.

## 0.3.0

- **`location: false` on a batch.** A batch can say that the person declined location, and `validateEnvelope` carries it through. Only `false` counts; any other value is dropped rather than guessed at. The collector then works no country or region out of the request's address.

## 0.2.0

- **A reserved prop namespace.** Props beginning with `$` now belong to the SDKs. A `$` key that is not one of `RESERVED_PROPS` is rejected, with the rest of the batch still accepted, so a customer prop can never be mistaken for a value an SDK captured. Events with no `$` props are unaffected: 0.1.x clients keep working unchanged.
- **Capture length limits.** `MAX_CAPTURED_VALUE_LENGTH` (64) and `MAX_CAPTURED_PATH_LENGTH` (128) bound what an SDK may attach, so the reserved props cannot spend more than half of `MAX_PROPS_BYTES` and leave a customer short of their own.

## 0.1.2

- **Event ids.** Events may carry an optional `id`, a string of 1 to 64 characters. With it, the collector stores each event once, however many times it arrives. A page that unloads before the collector answers keeps its queue and sends it again, which used to store the same events two or three times per page change. Events without one are still accepted.

## 0.1.1

- **Importable.** 0.1.0 was published in a way that skipped this package's publish settings,
  so its entry point named source files the package does not contain, and any import of it
  failed to resolve. It now points at the compiled code it ships. No code changed.

## 0.1.0

First release.
