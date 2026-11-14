import Foundation
import GoogleSignIn
import GymCore
import Security
import UIKit

/// Who is signed in. The session is kept in the Keychain so the app opens
/// straight to your data.
@MainActor @Observable
final class Auth {
    private(set) var session: GymService.Session?
    var error: String?
    var isWorking = false

    let config: AppConfig
    let service: GymService

    init(config: AppConfig = .current) {
        self.config = config
        self.service = GymService(baseURL: config.serviceURL)
        if ProcessInfo.processInfo.arguments.contains("-resetSession") { Keychain.delete() }
        if let saved = Keychain.load(), !saved.isExpired { session = saved }
    }

    var canUseDevSignIn: Bool { config.devLoginEmail != nil }
    var canUseGoogle: Bool { config.googleClientID != nil }

    func signInWithGoogle() async {
        guard let presenter = UIApplication.shared.topViewController else { return }
        await run {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else {
                throw GymService.ServiceError(message: "Google didn't return a sign-in token.")
            }
            return try await self.service.signIn(googleIdToken: idToken)
        }
    }

    func devSignIn() async {
        guard let email = config.devLoginEmail else { return }
        await run { try await self.service.devSignIn(email: email) }
    }

    /// Called at launch: a saved session that has run out is renewed quietly
    /// from Google's remembered sign-in.
    func restore() async {
        guard session == nil, canUseGoogle, GIDSignIn.sharedInstance.hasPreviousSignIn() else { return }
        await run {
            let user = try await GIDSignIn.sharedInstance.restorePreviousSignIn()
            guard let idToken = user.idToken?.tokenString else {
                throw GymService.ServiceError(message: "Please sign in again.")
            }
            return try await self.service.signIn(googleIdToken: idToken)
        }
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        Keychain.delete()
        session = nil
    }

    private func run(_ work: @escaping () async throws -> GymService.Session) async {
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            let s = try await work()
            Keychain.save(s)
            session = s
        } catch let e as GIDSignInError where e.code == .canceled {
            // Closed the Google sheet; nothing to say.
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private enum Keychain {
    static let account = "gym.session"

    static func save(_ session: GymService.Session) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        delete()
        SecItemAdd([
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: account,
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ] as CFDictionary, nil)
    }

    static func load() -> GymService.Session? {
        var out: AnyObject?
        let status = SecItemCopyMatching([
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: account,
            kSecReturnData: true,
        ] as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(GymService.Session.self, from: data)
    }

    static func delete() {
        SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrAccount: account] as CFDictionary)
    }
}

extension UIApplication {
    var topViewController: UIViewController? {
        let scene = connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
            ?? connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var top = scene?.keyWindow?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }
}
