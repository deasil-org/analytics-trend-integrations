# Sending events from an Android or JVM app

AnalyticsTrend over HTTP, with no SDK. The `Analytics` class in `src/main/kotlin/Main.kt` is the
whole client: a queue of events, an anonymous id, and one batch per `flush()` sent with
`client: "app"`, retried with the same body after a network error or a 5xx. It uses
`HttpURLConnection`, which Android has, so it works unchanged in an Android app.

It also sends `os` and `deviceType` (Android is told apart from Linux by its runtime), because a native app's User-Agent names
neither: one of iOS, Android, macOS, Windows, Linux or ChromeOS, and one of mobile, tablet or
desktop. Never a version or a model.

## Try it against the mock collector

From the repository root:

```bash
pnpm install && pnpm build:packages
pnpm mock-collector            # in one terminal
cd examples/app-kotlin
ANALYTICSTREND_WRITE_KEY=wk_example ANALYTICSTREND_ENDPOINT=http://localhost:47300/v1/collect gradle run
```

It prints `202 {"accepted":2,...}`. Run it again: the same anonymous id, new events.

## In an Android app

- **The anonymous id:** keep it in `SharedPreferences` rather than a file:

  ```kotlin
  val prefs = context.getSharedPreferences("analyticstrend", Context.MODE_PRIVATE)
  val id = prefs.getString("id", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("id", it).apply() }
  ```

  Keep it random: never the Android ID, an advertising id, an email address or an account id.
- **When to send:** never on the main thread. Call `flush()` from a coroutine on
  `Dispatchers.IO`, or a WorkManager job, when the app moves to the background.
- **Permissions:** `android.permission.INTERNET`, which most apps already have.
- **Google Play's Data safety answers** for what this sends are in
  [Install in an app](https://analyticstrend.com/docs/guide/install-app).
