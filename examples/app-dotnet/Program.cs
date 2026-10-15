// Sending events to AnalyticsTrend over HTTP, with no SDK, from .NET. In Unity,
// keep the id in PlayerPrefs and send with UnityWebRequest; the batch is the same.
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

var writeKey = Environment.GetEnvironmentVariable("ANALYTICSTREND_WRITE_KEY");
if (string.IsNullOrEmpty(writeKey))
{
    Console.Error.WriteLine("Set ANALYTICSTREND_WRITE_KEY to your project's write key.");
    return 1;
}
var endpoint = Environment.GetEnvironmentVariable("ANALYTICSTREND_ENDPOINT") ?? "https://analyticstrend.com/v1/collect";

// Kept beside the program here; a game keeps it in PlayerPrefs.
var analytics = new Analytics(writeKey, endpoint, ".analyticstrend-id", "1.0.0");
analytics.Track("app_opened");
analytics.Track("note_created");
var (status, body) = await analytics.FlushAsync();
Console.WriteLine($"{status} {body}");
return 0;

class Analytics(string writeKey, string endpoint, string idFile, string appVersion)
{
    static readonly HttpClient Http = new();

    // The system, as one of the collector's families: a native app's
    // User-Agent names none. Never a version or a model.
    static string Os =>
        OperatingSystem.IsWindows() ? "Windows"
        : OperatingSystem.IsMacOS() ? "macOS"
        : OperatingSystem.IsIOS() ? "iOS"
        : OperatingSystem.IsAndroid() ? "Android"
        : "Linux";
    readonly List<object> queue = [];

    // One random id per user, made once and kept. Never an email address, an
    // account id or a device identifier.
    public string AnonymousId
    {
        get
        {
            if (File.Exists(idFile) && File.ReadAllText(idFile).Trim() is { Length: > 0 } kept) return kept;
            var made = Guid.NewGuid().ToString();
            File.WriteAllText(idFile, made);
            return made;
        }
    }

    // Each event gets its own id when it happens, so a retry sends the same ids.
    public void Track(string name) =>
        queue.Add(new { id = Guid.NewGuid().ToString(), name, ts = DateTime.UtcNow.ToString("o") });

    // Sends the queue as one batch. A network error or a 5xx is retried with
    // the same body; a 4xx is not, since sending it again would not help.
    public async Task<(int, string)> FlushAsync()
    {
        var body = JsonSerializer.Serialize(new
        {
            writeKey,
            client = "app",
            clientVersion = "example-dotnet-1.0.0",
            appVersion,
            anonymousId = AnonymousId,
            os = Os,
            deviceType = OperatingSystem.IsIOS() || OperatingSystem.IsAndroid() ? "mobile" : "desktop",
            events = queue,
        });
        int[] delays = [500, 1000, 2000];
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                var content = new StringContent(body, Encoding.UTF8);
                content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
                var response = await Http.PostAsync(endpoint, content);
                var status = (int)response.StatusCode;
                if (status < 500 || attempt == delays.Length)
                {
                    if (status < 300) queue.Clear();
                    return (status, await response.Content.ReadAsStringAsync());
                }
            }
            catch (HttpRequestException) when (attempt < delays.Length)
            {
            }
            await Task.Delay(delays[attempt]);
        }
    }
}
