import Foundation

let environment = ProcessInfo.processInfo.environment
guard let writeKey = environment["ANALYTICSTREND_WRITE_KEY"] else {
    print("Set ANALYTICSTREND_WRITE_KEY to your project's write key.")
    exit(1)
}
let endpoint = URL(string: environment["ANALYTICSTREND_ENDPOINT"] ?? "https://analyticstrend.com/v1/collect")!
// Kept beside the program here; an iOS or macOS app keeps it in UserDefaults.
let idFile = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(".analyticstrend-id")

let analytics = Analytics(writeKey: writeKey, endpoint: endpoint, idFile: idFile, appVersion: "1.0.0")
analytics.track("app_opened")
analytics.track("note_created")
if let answer = analytics.flush() {
    print(answer.status, answer.body)
} else {
    print("Could not reach the collector.")
    exit(1)
}
