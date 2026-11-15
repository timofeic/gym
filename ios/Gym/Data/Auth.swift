import AuthenticationServices
import CryptoKit
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
        if let saved = Keychain.load(), !saved.isExpired { session = saved } else { AppleID.delete() }
    }

    /// The raw nonce for the Apple sheet that is open now. Apple gets its
    /// SHA-256; the server gets this and checks they match.
    private var appleNonce: String?

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

    // MARK: Sign in with Apple

    /// Fills in the request when the Apple button is tapped.
    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        appleNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    /// Called when the Apple sheet closes.
    func finishAppleSignIn(_ result: Result<ASAuthorization, any Error>) async {
        let nonce = appleNonce
        appleNonce = nil
        switch result {
        case .failure(let e as ASAuthorizationError) where e.code == .canceled:
            return
        case .failure(let e as ASAuthorizationError) where e.code == .unknown:
            // What the simulator (or a build without the capability) says.
            error = "Sign in with Apple isn't available here. Sign in to iCloud in Settings, or use another option."
            return
        case .failure(let e):
            error = e.localizedDescription
            return
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8),
                  let nonce
            else {
                error = "Apple didn't return a sign-in token. Please try again."
                return
            }
            // Apple only shares the name on the very first sign-in.
            let name = credential.fullName.map { PersonNameComponentsFormatter().string(from: $0) }
            await run {
                try await self.service.signIn(appleIdentityToken: identityToken, nonce: nonce, name: name)
            }
            if session != nil { AppleID.save(credential.user) }
        }
    }

    /// If the person stopped using Sign in with Apple for Gym (iPhone
    /// Settings > Sign in with Apple), sign out here too.
    func checkAppleCredential() async {
        guard session != nil, let userID = AppleID.load() else { return }
        let state = try? await ASAuthorizationAppleIDProvider().credentialState(forUserID: userID)
        if state == .revoked || state == .notFound { signOut() }
    }

    static func randomNonce(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func devSignIn() async {
        guard let email = config.devLoginEmail else { return }
        await run { try await self.service.devSignIn(email: email) }
    }

    /// Called at launch: a saved session that has run out is renewed quietly
    /// from Google's remembered sign-in.
    func restore() async {
        await checkAppleCredential()
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
        AppleID.delete()
        session = nil
    }

    private func run(_ work: @escaping () async throws -> GymService.Session) async {
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            let s = try await work()
            // Forget any earlier Apple id; the Apple path saves its own after this.
            AppleID.delete()
            Keychain.save(s)
            session = s
        } catch let e as GIDSignInError where e.code == .canceled {
            // Closed the Google sheet; nothing to say.
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Apple's user id for whoever signed in with Apple, to check later whether
/// they've stopped using it with Gym. Not a secret.
private enum AppleID {
    static let key = "gym.appleUserID"
    static func save(_ id: String) { UserDefaults.standard.set(id, forKey: key) }
    static func load() -> String? { UserDefaults.standard.string(forKey: key) }
    static func delete() { UserDefaults.standard.removeObject(forKey: key) }
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
