import Foundation
import GymCore
@preconcurrency import UserNotifications

extension RestTimerEngine {
    /// The app's one rest timer. Workouts, the in-app coach and Siri all use it.
    @MainActor static let shared = RestTimerEngine(storage: DefaultsTimerStorage(), alerts: RestNotifications.shared)
}

/// Keeps the running timer in UserDefaults so it survives the app closing,
/// and so a timer Siri started shows when the app opens.
final class DefaultsTimerStorage: RestTimerStorage, @unchecked Sendable {
    private let key = "restTimer"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if ProcessInfo.processInfo.arguments.contains("-resetRestTimer") { defaults.removeObject(forKey: key) }
    }

    func load() -> RestTimerState? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(RestTimerState.self, from: $0) }
    }

    func save(_ state: RestTimerState?) {
        if let state, let data = try? JSONEncoder().encode(state) {
            defaults.set(data, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
}

/// A local notification when the rest is over. Asks for permission the
/// first time a rest starts, not at launch.
final class RestNotifications: NSObject, RestAlertScheduling, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = RestNotifications()
    static let id = "gym.rest-timer"

    private var center: UNUserNotificationCenter { .current() }

    override init() {
        super.init()
        center.delegate = self
    }

    func schedule(endsAt: Date, seconds: Int) async {
        let center = self.center
        center.removePendingNotificationRequests(withIdentifiers: [Self.id])
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
        }
        let content = UNMutableNotificationContent()
        content.title = "Rest done"
        content.body = "Time for your next set."
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        let wait = max(1, endsAt.timeIntervalSinceNow)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: Self.id, content: content, trigger: trigger))
    }

    func cancel() async {
        center.removePendingNotificationRequests(withIdentifiers: [Self.id])
        center.removeDeliveredNotifications(withIdentifiers: [Self.id])
    }

    // Show the alert even when Gym is open.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
