# Changelog

## 0.2.0

- **`locationAllowed`.** A client can be told whether the collector may work a location out of its requests. It is asked at every send, because that is when the collector reads the address; when it answers false, or throws, each batch says `location: false`. Omitted, nothing changes. The extension SDK answers it from Firefox's `locationInfo` permission.

## 0.1.2

- **Every tracked event gets an id**, assigned once and resent unchanged on every retry, so the collector stores each event once, however many times it arrives. A page that unloads before the collector answers keeps its queue and sends it again, which used to store the same events two or three times per page change.

## 0.1.1

- **Installable, and importable.** 0.1.0 was published with npm rather than pnpm, which
  left a workspace placeholder, `workspace:*`, in its dependencies, and skipped the setting
  that points the entry at the compiled code. The first made `npm install` fail; the second
  would have broken every import. Both are fixed.
- `SDK_VERSION` now matches this package's version. Each platform SDK reports its own
  version on the wire.

## 0.1.0

First release.
