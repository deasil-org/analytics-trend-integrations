// Sending events to AnalyticsTrend over HTTP, with no SDK. HttpURLConnection
// rather than java.net.http, because Android has only the former: the
// Analytics class works unchanged in an Android app.
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.UUID
import kotlin.system.exitProcess

class Analytics(
    private val writeKey: String,
    private val endpoint: String,
    private val idFile: File,
    private val appVersion: String,
) {
    private val queue = mutableListOf<String>()

    // The system and device type, as the collector's families: a native app's
    // User-Agent names neither. Android reports its system as Linux, so it is
    // told apart by its runtime. Never a version or a model.
    private val android = System.getProperty("java.vm.vendor")?.contains("Android") == true
    private val os = when {
        android -> "Android"
        System.getProperty("os.name").startsWith("Windows") -> "Windows"
        System.getProperty("os.name").startsWith("Mac") -> "macOS"
        else -> "Linux"
    }
    private val deviceType = if (android) "mobile" else "desktop"

    /** One random id per user, made once and kept. Never an email, an account id or the Android ID. */
    val anonymousId: String
        get() {
            if (idFile.exists()) idFile.readText().trim().takeIf { it.isNotEmpty() }?.let { return it }
            return UUID.randomUUID().toString().also { idFile.writeText(it) }
        }

    /** Each event gets its own id when it happens, so a retry sends the same ids. */
    fun track(name: String) {
        queue += "{\"id\":${quote(UUID.randomUUID().toString())},\"name\":${quote(name)},\"ts\":${quote(Instant.now().toString())}}"
    }

    /** A screen as it appears, by the name you give it: never a person's name, a note's title or an id. */
    fun screen(name: String) {
        queue += "{\"id\":${quote(UUID.randomUUID().toString())},\"name\":\"screen_view\",\"ts\":${quote(Instant.now().toString())}," +
            "\"props\":{\"\$screen\":${quote(name)}}}"
    }

    /** Sends the queue as one batch. A network error or a 5xx is retried with the same body; a 4xx is not. */
    fun flush(): Pair<Int, String> {
        val body = "{\"writeKey\":${quote(writeKey)},\"client\":\"app\",\"clientVersion\":\"example-kotlin-1.0.0\"," +
            "\"appVersion\":${quote(appVersion)},\"anonymousId\":${quote(anonymousId)}," +
            "\"os\":${quote(os)},\"deviceType\":${quote(deviceType)},\"events\":[${queue.joinToString(",")}]}"
        val delays = listOf(500L, 1000L, 2000L)
        for (attempt in 0..delays.size) {
            try {
                val connection = URL(endpoint).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("content-type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray()) }
                val status = connection.responseCode
                val stream = if (status < 400) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader()?.readText() ?: ""
                if (status < 500 || attempt == delays.size) {
                    if (status < 300) queue.clear()
                    return status to text
                }
            } catch (error: IOException) {
                if (attempt == delays.size) throw error
            }
            Thread.sleep(delays[attempt])
        }
        error("unreachable")
    }

    private fun quote(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}

fun main() {
    val writeKey = System.getenv("ANALYTICSTREND_WRITE_KEY") ?: run {
        System.err.println("Set ANALYTICSTREND_WRITE_KEY to your project's write key.")
        exitProcess(1)
    }
    val endpoint = System.getenv("ANALYTICSTREND_ENDPOINT") ?: "https://analyticstrend.com/v1/collect"
    // Kept beside the program here; an Android app keeps it in SharedPreferences.
    val analytics = Analytics(writeKey, endpoint, File(".analyticstrend-id"), "1.0.0")
    analytics.track("app_opened")
    analytics.screen("Notes")
    analytics.track("note_created")
    val (status, body) = analytics.flush()
    println("$status $body")
}
