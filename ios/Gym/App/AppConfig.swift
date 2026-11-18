import Foundation

/// Values from Info.plist, set through Config/*.xcconfig.
struct AppConfig: Sendable {
    let serviceURL: URL
    let supabaseURL: URL
    let supabaseAnonKey: String
    let devLoginEmail: String?
    let googleClientID: String?

    static let current: AppConfig = {
        let info = Bundle.main.infoDictionary ?? [:]
        func string(_ key: String) -> String? {
            let env = ProcessInfo.processInfo.environment
            // UI tests can point the app elsewhere without rebuilding.
            if let v = env["GYM_" + key], !v.isEmpty { return v }
            guard let v = info[key] as? String, !v.isEmpty, !v.hasPrefix("$(") else { return nil }
            return v
        }
        return AppConfig(
            serviceURL: URL(string: string("GymServiceURL") ?? "http://localhost:3030")!,
            supabaseURL: URL(string: string("SupabaseURL") ?? "http://127.0.0.1:54321")!,
            supabaseAnonKey: string("SupabaseAnonKey") ?? "",
            devLoginEmail: string("DevLoginEmail"),
            googleClientID: string("GIDClientID")
        )
    }()
}
