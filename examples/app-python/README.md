# Sending events from a Python server

AnalyticsTrend over HTTP with only the standard library: `main.py` keeps an anonymous id, sends two events in one
batch with `client: "app"`, and retries a failed send with the same event ids. It sends
`"location": false`, because a server's address is not its user's.

## Try it against the mock collector

From the repository root:

```bash
pnpm install && pnpm build:packages
pnpm mock-collector            # in one terminal
cd examples/app-python
ANALYTICSTREND_WRITE_KEY=wk_example ANALYTICSTREND_ENDPOINT=http://localhost:47300/v1/collect python main.py
```

It prints `202 {"accepted":2,...}`. Run it again: the same anonymous id, new events.

## Send to a real project

Use the write key from your project's Setup page and leave `ANALYTICSTREND_ENDPOINT` unset:

```bash
ANALYTICSTREND_WRITE_KEY=wk_your_key python main.py
```

## The anonymous id

The example keeps its id in `.analyticstrend-id` beside it. A server sending on a user's behalf
should use the id that user's app already keeps, so the server's events join the user's own. Keep
it random: never an email address, an account id or a device identifier.

See [Install in an app](https://analyticstrend.com/docs/guide/install-app) and the
[collector HTTP API](https://analyticstrend.com/docs/reference/collector-api).
