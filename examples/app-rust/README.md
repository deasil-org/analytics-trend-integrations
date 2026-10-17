# Sending events from a Rust app

AnalyticsTrend over HTTP, with no SDK. `src/analytics.rs` is the whole client: a queue of events,
an anonymous id kept in a file, and one batch per `flush()` sent with `client: "app"`, retried with
the same body after a network error or a 5xx. Copy it into a native app or a server.

It also sends `os` and `deviceType` (from `std::env::consts::OS`), because a native app's User-Agent names
neither: one of iOS, Android, macOS, Windows, Linux or ChromeOS, and one of mobile, tablet or
desktop. Never a version or a model. On a server, leave both out: its system is not its user's.

When a screen appears, `analytics.screen("Notes")` sends a `screen_view` with its name as `$screen`, for the
Screens report. Name screens as you would to a colleague; never put a person's name, a note's
title or an id in one.

## Try it against the mock collector

From the repository root:

```bash
pnpm install && pnpm build:packages
pnpm mock-collector            # in one terminal
cd examples/app-rust
ANALYTICSTREND_WRITE_KEY=wk_example ANALYTICSTREND_ENDPOINT=http://localhost:47300/v1/collect cargo run
```

It prints `202 {"accepted":2,...}`. Run it again: the same anonymous id, new events.
`cargo test` checks the batch, the id and the retry.

## Send to a real project

Use the write key from your project's Setup page and leave `ANALYTICSTREND_ENDPOINT` unset.

## The anonymous id

The example keeps it in `.analyticstrend-id` beside it. A real app keeps it in its data
directory, from the `dirs` crate's `data_dir()` or your framework's equivalent. Keep it random:
never an email address, an account id or a device identifier.

See [Install in an app](https://analyticstrend.com/docs/guide/install-app).
