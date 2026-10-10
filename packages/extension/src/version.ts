// This package's own version, sent as clientVersion on every batch.
//
// Separate from sdk-core's SDK_VERSION, which the web SDK shares and which
// stays at whatever the web SDK last shipped. The two now release on their own
// schedules — 0.2.0 of this package exists because a real browser found bugs
// in 0.1.0 — and events from the broken release have to be distinguishable from
// the fixed one in the data. version.test.ts fails if this and package.json
// ever disagree, which is the whole of the maintenance burden.
export const EXTENSION_SDK_VERSION = "0.5.0";
