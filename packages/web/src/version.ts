// This package's own version, sent as clientVersion on every batch.
//
// Its own constant rather than sdk-core's SDK_VERSION, now that the two SDKs
// release separately: the extension went to 0.2.0 for a browser fix this
// package never needed. version.test.ts fails if this and package.json ever
// disagree.
export const WEB_SDK_VERSION = "0.5.0";
