import Foundation
import GymCore

/// Talks to the sign-in service (Next.js API routes in gym-app/app/api/native).
struct GymService: Sendable {
    let baseURL: URL
    var session: URLSession = .shared

    struct Session: Codable, Sendable {
        let accessToken: String
        let expiresAt: TimeInterval
        let user: SignedInUser
        var isExpired: Bool { Date().timeIntervalSince1970 > expiresAt - 60 }
    }

    struct VoicePass: Codable, Sendable {
        let serverUrl: String
        let roomName: String
        let participantToken: String
    }

    struct ServiceError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    func signIn(googleIdToken: String) async throws -> Session {
        try await post("api/native/session", body: ["idToken": googleIdToken])
    }

    func devSignIn(email: String) async throws -> Session {
        try await post("api/native/dev-session", body: ["email": email])
    }

    func voicePass(accessToken: String, timeZone: TimeZone = .current) async throws -> VoicePass {
        try await post("api/native/voice-token", body: ["timezone": timeZone.identifier], bearer: accessToken)
    }

    private func post<T: Decodable>(_ path: String, body: [String: String], bearer: String? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        if let bearer { req.setValue("Bearer \(bearer)", forHTTPHeaderField: "authorization") }
        req.httpBody = try JSONEncoder().encode(body)

        let data: Data, response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw ServiceError(message: "Couldn't reach the gym service. Check your connection.")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw ServiceError(message: message ?? "Something went wrong (\(status)).")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
