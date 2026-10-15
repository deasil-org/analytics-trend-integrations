# Sending events from a Tauri app

A Tauri 2 app that sends events to AnalyticsTrend from its Rust side, over HTTP, with no SDK. The
page calls a `track` command; the command queues the event and sends the queue, off the main
thread. The client is `src-tauri/src/analytics.rs`, the same as in the Rust example, and the
anonymous id lives in the app's data directory (`app.path().app_data_dir()`).

## Run it

You need [Tauri's prerequisites](https://tauri.app/start/prerequisites/) and its CLI
(`cargo install tauri-cli --version "^2"`). Then, against the mock collector:

```bash
pnpm mock-collector            # from the repository root, in one terminal
cd examples/app-tauri/src-tauri
ANALYTICSTREND_WRITE_KEY=wk_example ANALYTICSTREND_ENDPOINT=http://localhost:47300/v1/collect cargo tauri dev
```

The window sends `app_opened` when it opens and `note_created` on each click, and shows the
collector's answer. `cargo test` in `src-tauri` checks the client without opening a window.

## In your own app

Copy `analytics.rs`, register `track` with `invoke_handler`, and keep one `Analytics` in managed
state, as `lib.rs` does. The write key is public by design: a shipped app can carry it as a
constant instead of reading it from the environment. Sending from Rust rather than from the
page means the page needs no network permission for it.

See [Install in an app](https://analyticstrend.com/docs/guide/install-app).
