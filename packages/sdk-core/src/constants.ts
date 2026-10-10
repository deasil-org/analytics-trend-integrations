// Values every platform SDK needs identical copies of. They lived twice,
// once in each platform SDK, under a comment saying the two must not drift —
// which is a note asking a human to do a compiler's job. A shared export is
// where that instruction belongs.
//
// What stays platform-specific stays platform-specific: the web transport's
// keepalive body-size gate is about a browser API no extension background
// context has, and belongs in the web package.

// The version reported as `clientVersion` on every batch, and the only thing
// that tells a support conversation which SDK build produced an event.
//
// Known gap, deliberately not fixed here: this is a hand-maintained literal
// that duplicates each platform package's package.json version, so bumping a
// package leaves the wire reporting the old number with nothing to catch it.
// The fix is to stop hand-maintaining it — have the build inject the version
// (a bundler define, or a generated module) so the single source of truth is
// the manifest that is actually published.
// This package's own version. No longer sent on the wire: each platform SDK
// now reports its own version as clientVersion, because they release
// separately. Kept, and kept accurate, because it is part of this package's
// published API. version.test.ts pins it to package.json.
export const SDK_VERSION = "0.2.0";

// Where batches go when an integrator does not name an endpoint.
export const DEFAULT_ENDPOINT = "https://analyticstrend.com";

// Deliberately NOT namespaced by write key, unlike the queue: this identifies
// the visitor, not the product, and two of our kits on one page see the same
// person. (The queue key is namespaced, and for the opposite reason — see
// queueKey in @analyticstrend/web.)
export const ANONYMOUS_ID_STORAGE_KEY = "analyticstrend.anonymousId";

// Comfortably under sdk-core's default 500-event queue cap and the collector's
// 100-event-per-batch limit, so a producer that tracks regularly never lets
// the queue approach the point where it starts evicting its oldest events.
// This bounds loss, not delivery delay — see flushAt's doc comment on
// ClientOptions.
export const DEFAULT_FLUSH_AT = 50;

// One function, one copy of the reasoning, because this classification decides
// whether events survive a failure and both SDKs must answer it identically.
//
// 5xx means the server failed and may succeed later. 429 and 408 are
// explicitly "try again", so treating them as permanent would throw away
// events the server actually asked us to resend. Everything else in the 4xx
// range is a batch the server will never accept — a bad write key, a malformed
// payload — and retrying it forever would wedge the queue behind an event that
// can never drain.
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}
