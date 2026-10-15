# Sending events from a .NET app or a Unity game

AnalyticsTrend over HTTP, with no SDK. The `Analytics` class in `Program.cs` is the whole client:
a queue of events, an anonymous id, and one batch per `FlushAsync()` sent with `client: "app"`,
retried with the same body after a network error or a 5xx.

## Try it against the mock collector

From the repository root:

```bash
pnpm install && pnpm build:packages
pnpm mock-collector            # in one terminal
cd examples/app-dotnet
ANALYTICSTREND_WRITE_KEY=wk_example ANALYTICSTREND_ENDPOINT=http://localhost:47300/v1/collect dotnet run
```

It prints `202 {"accepted":2,...}`. Run it again: the same anonymous id, new events.

## In a Unity game

The batch is the same; two things change:

- **The anonymous id:** keep it in `PlayerPrefs`:

  ```csharp
  var id = PlayerPrefs.GetString("analyticstrend-id", "");
  if (id == "") { id = System.Guid.NewGuid().ToString(); PlayerPrefs.SetString("analyticstrend-id", id); }
  ```

  Keep it random: never a device identifier, an email address or an account id.
- **Sending:** use `UnityWebRequest` in a coroutine (with `uploadHandler` set to the JSON and the
  `content-type` header set to `application/json`), which works on every platform Unity builds
  for, WebGL included.

The write key is public by design: a game can carry it as a constant. See
[Install in an app](https://analyticstrend.com/docs/guide/install-app).
