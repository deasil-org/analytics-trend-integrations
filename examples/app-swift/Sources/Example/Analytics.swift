// Sending events to AnalyticsTrend over HTTP, with no SDK. Copy this file into
// an iOS or macOS app; it also builds on Linux, for a server.
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(UIKit)
import UIKit
#endif

final class Analytics {
    private let writeKey: String
    private let endpoint: URL
    private let idFile: URL
    private let appVersion: String
    private var queue: [[String: Any]] = []

    /// The system and device type, as the collector's families: a native
    /// app's User-Agent names neither. Never a version or a model.
    #if os(iOS)
    static let os = "iOS"
    static let deviceType = UIDevice.current.userInterfaceIdiom == .pad ? "tablet" : "mobile"
    #elseif os(macOS)
    static let os = "macOS"
    static let deviceType = "desktop"
    #elseif os(Windows)
    static let os = "Windows"
    static let deviceType = "desktop"
    #else
    static let os = "Linux"
    static let deviceType = "desktop"
    #endif

    init(writeKey: String, endpoint: URL, idFile: URL, appVersion: String) {
        self.writeKey = writeKey
        self.endpoint = endpoint
        self.idFile = idFile
        self.appVersion = appVersion
    }

    /// One random id per user, made once and kept. An iOS app keeps it in
    /// UserDefaults. Never an email address, an account id or the IDFA.
    var anonymousId: String {
        if let kept = try? String(contentsOf: idFile, encoding: .utf8), !kept.isEmpty {
            return kept.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let made = UUID().uuidString.lowercased()
        try? made.write(to: idFile, atomically: true, encoding: .utf8)
        return made
    }

    /// Each event gets its own id when it happens, so a retry sends the same ids.
    func track(_ name: String) {
        let stamp = ISO8601DateFormatter()
        stamp.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        queue.append(["id": UUID().uuidString.lowercased(), "name": name, "ts": stamp.string(from: Date())])
    }

    /// Sends the queue as one batch. A network error or a 5xx is retried with
    /// the same body; a 4xx is not, since sending it again would not help.
    func flush() -> (status: Int, body: String)? {
        let batch: [String: Any] = [
            "writeKey": writeKey,
            "client": "app",
            "clientVersion": "example-swift-1.0.0",
            "appVersion": appVersion,
            "anonymousId": anonymousId,
            "os": Analytics.os,
            "deviceType": Analytics.deviceType,
            "events": queue,
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: batch) else { return nil }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = body

        let delays: [Double] = [0.5, 1, 2]
        for attempt in 0...delays.count {
            let done = DispatchSemaphore(value: 0)
            var answer: (status: Int, body: String)?
            URLSession.shared.dataTask(with: request) { data, response, _ in
                if let response = response as? HTTPURLResponse {
                    answer = (response.statusCode, String(decoding: data ?? Data(), as: UTF8.self))
                }
                done.signal()
            }.resume()
            done.wait()
            if let answer, answer.status < 500 || attempt == delays.count {
                if answer.status < 300 { queue.removeAll() }
                return answer
            }
            if attempt == delays.count { return nil }
            Thread.sleep(forTimeInterval: delays[attempt])
        }
        return nil
    }
}
