# Changelog

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
