import Foundation

/// An app (Claude, ChatGPT, ...) the person has let into their gym data
/// through the connector.
public struct ConnectedApp: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var clientName: String
    public var createdAt: Date
    public var lastUsedAt: Date?

    public init(id: String, clientName: String, createdAt: Date, lastUsedAt: Date? = nil) {
        self.id = id; self.clientName = clientName; self.createdAt = createdAt; self.lastUsedAt = lastUsedAt
    }
}

/// Account calls on the gym service, all with the app's access token:
/// `GET /api/connections`, `DELETE /api/connections/{id}`,
/// `POST /api/native/delete-account`.
public struct AccountClient: Sendable {
    public typealias Transport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

    public enum Connections: Equatable, Sendable {
        case apps([ConnectedApp])
        /// The service doesn't have this yet (404).
        case notAvailable
    }

    public struct Failure: LocalizedError, Equatable {
        public let message: String
        public let status: Int
        public var errorDescription: String? { message }
        public var isNotAvailable: Bool { status == 404 }
    }

    public let baseURL: URL
    public let accessToken: String
    private let transport: Transport

    public init(baseURL: URL, accessToken: String, transport: Transport? = nil) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.transport = transport ?? { req in
            let (data, response) = try await URLSession.shared.data(for: req)
            return (data, response as? HTTPURLResponse ?? HTTPURLResponse())
        }
    }

    public func connections() async throws -> Connections {
        do {
            let data = try await send("GET", "api/connections")
            return .apps(try Self.decoder.decode([ConnectedApp].self, from: data))
        } catch let f as Failure where f.isNotAvailable {
            return .notAvailable
        }
    }

    public func revoke(_ app: ConnectedApp) async throws {
        _ = try await send("DELETE", "api/connections/\(app.id)")
    }

    public func deleteAccount() async throws {
        do {
            _ = try await send("POST", "api/native/delete-account")
        } catch let f as Failure where f.isNotAvailable {
            throw Failure(message: "Deleting your account from the app isn't available yet. Please try again after the next update.", status: 404)
        }
    }

    private func send(_ method: String, _ path: String) async throws -> Data {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = method
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "authorization")
        req.setValue("application/json", forHTTPHeaderField: "accept")
        if method == "POST" {
            req.setValue("application/json", forHTTPHeaderField: "content-type")
            req.httpBody = Data("{}".utf8)
        }
        let data: Data, response: HTTPURLResponse
        do {
            (data, response) = try await transport(req)
        } catch {
            throw Failure(message: "Couldn't reach the gym service. Check your connection.", status: 0)
        }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw Failure(message: message ?? "Something went wrong (\(response.statusCode)).", status: response.statusCode)
        }
        return data
    }

    /// ISO 8601 dates, with or without fractional seconds (any number of digits).
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            // Postgres gives six fractional digits; the formatter wants up to three.
            let text = try c.decode(String.self)
                .replacingOccurrences(of: #"(\.\d{3})\d+"#, with: "$1", options: .regularExpression)
            let plain = ISO8601DateFormatter()
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: text) ?? plain.date(from: text) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Not an ISO 8601 date: \(text)")
        }
        return d
    }()
}

/// A pretend gym service for UI tests and previews: two connected apps,
/// revoking removes one, deleting the account succeeds.
public actor StubAccountService {
    private var apps: [ConnectedApp]
    public private(set) var deletedAccount = false

    public init(apps: [ConnectedApp]? = nil, now: Date = Date()) {
        self.apps = apps ?? [
            ConnectedApp(id: "conn-claude", clientName: "Claude", createdAt: now.addingTimeInterval(-9 * 86_400),
                         lastUsedAt: now.addingTimeInterval(-3_600)),
            ConnectedApp(id: "conn-chatgpt", clientName: "ChatGPT", createdAt: now.addingTimeInterval(-2 * 86_400)),
        ]
    }

    public nonisolated var transport: AccountClient.Transport {
        { [self] req in try await self.handle(req) }
    }

    private func handle(_ req: URLRequest) throws -> (Data, HTTPURLResponse) {
        let path = req.url?.path ?? ""
        func reply(_ status: Int, _ body: Data = Data("{}".utf8)) -> (Data, HTTPURLResponse) {
            (body, HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        guard req.value(forHTTPHeaderField: "authorization")?.hasPrefix("Bearer ") == true else { return reply(401) }
        switch (req.httpMethod ?? "GET", path) {
        case ("GET", "/api/connections"):
            let e = JSONEncoder()
            e.dateEncodingStrategy = .iso8601
            return reply(200, try e.encode(apps))
        case ("DELETE", let p) where p.hasPrefix("/api/connections/"):
            let id = String(p.dropFirst("/api/connections/".count))
            guard apps.contains(where: { $0.id == id }) else { return reply(404) }
            apps.removeAll { $0.id == id }
            return reply(204, Data())
        case ("POST", "/api/native/delete-account"):
            deletedAccount = true
            return reply(200, Data(#"{"ok":true}"#.utf8))
        default:
            return reply(404)
        }
    }
}
