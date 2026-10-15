# Sending events from an iOS or macOS app

AnalyticsTrend over HTTP, with no SDK. `Sources/Example/Analytics.swift` is the whole client: a
queue of events, an anonymous id, and one batch per `flush()` sent with `client: "app"`, retried
with the same body after a network error or a 5xx. Copy it into an iOS or macOS app. It uses
`URLSession` only, and builds on Linux too, for a server.

## Try it against the mock collector

From the repository root:

```bash
pnpm install && pnpm build:packages
pnpm mock-collector            # in one terminal
cd examples/app-swift
ANALYTICSTREND_WRITE_KEY=wk_example ANALYTICSTREND_ENDPOINT=http://localhost:47300/v1/collect swift run
```

It prints `202 {"accepted":2,...}`. Run it again: the same anonymous id, new events.

## In an app

- **The anonymous id:** keep it in `UserDefaults` rather than a file. Keep it random: never the
  IDFA, an email address or an account id.
- **When to send:** call `flush()` when the app moves to the background and every minute or so
  while it is open, off the main thread.
- **The write key** is public by design: the app can carry it as a constant.
- **Apple's App Privacy answers** for what this sends are in
  [Install in an app](https://analyticstrend.com/docs/guide/install-app).
