# @analyticstrend/sdk-core

The queueing, batching and retry behaviour shared by AnalyticsTrend's browser SDKs, kept
platform-agnostic so the two thin adapters cannot drift apart.

Handles the parts that are easy to get subtly wrong: persisting before sending, recording
progress per batch so a teardown never replays, serialising queue operations so concurrent
calls cannot lose events, and backing off rather than retrying once per event while offline.

You do not normally install this directly — it arrives with
[`@analyticstrend/extension`](https://www.npmjs.com/package/@analyticstrend/extension) or
[`@analyticstrend/web`](https://www.npmjs.com/package/@analyticstrend/web).

Full documentation: <https://analyticstrend.com/docs>
