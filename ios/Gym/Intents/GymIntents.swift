import AppIntents
import Foundation
import GymCore
import Security

// Siri and Shortcuts. These run without opening Gym, using the session the
// app saved when you signed in. The logic lives in GymCore (ShortcutActions)
// so it is unit tested there.

struct LogSetIntent: AppIntent {
    static let title: LocalizedStringResource = "Log a set"
    static let description = IntentDescription("Saves an exercise to Gym as a new workout, without opening the app.")
    static let openAppWhenRun = false

    @Parameter(title: "Exercise", requestValueDialog: "Which exercise?")
    var exercise: ExerciseEntity

    @Parameter(title: "Sets", description: "1 to 10. Leave empty to use the exercise's usual number.",
               inclusiveRange: (1, 10))
    var sets: Int?

    @Parameter(title: "Reps", description: "1 to 100. Leave empty to use the exercise's usual number.",
               inclusiveRange: (1, 100))
    var reps: Int?

    @Parameter(title: "Weight (kg)", description: "0 to 500 kg. Leave empty to use the exercise's usual weight.",
               inclusiveRange: (0, 500))
    var weight: Double?

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$exercise): \(\.$sets) sets of \(\.$reps) at \(\.$weight) kg")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            let logged = try await ShortcutActions.logSet(
                exerciseId: exercise.id, sets: sets, reps: reps, weight: weight, using: SavedSession.store())
            NotificationCenter.default.post(name: AppModel.dataChangedElsewhere, object: nil)
            return .result(dialog: "\(logged.dialog)")
        } catch let failure as ShortcutActions.Failure {
            throw IntentFailure(failure.localizedDescription)
        }
    }
}

struct StartRestIntent: AppIntent {
    static let title: LocalizedStringResource = "Start a rest timer"
    static let description = IntentDescription("Starts Gym's rest timer. You get a notification when it's done.")
    static let openAppWhenRun = false

    @Parameter(title: "Seconds", default: 90, inclusiveRange: (1, 3600))
    var seconds: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Rest for \(\.$seconds) seconds")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            let dialog = try await ShortcutActions.startRest(seconds: seconds, on: .shared)
            return .result(dialog: "\(dialog)")
        } catch {
            throw IntentFailure(error.localizedDescription)
        }
    }
}

struct GymShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogSetIntent(),
            phrases: ["Log a set in \(.applicationName)", "Log a set with \(.applicationName)", "Log an exercise in \(.applicationName)"],
            shortTitle: "Log a set",
            systemImageName: "dumbbell"
        )
        AppShortcut(
            intent: StartRestIntent(),
            phrases: ["Start a rest timer in \(.applicationName)", "Start a rest in \(.applicationName)", "Rest timer in \(.applicationName)"],
            shortTitle: "Start rest timer",
            systemImageName: "timer"
        )
    }
}

// MARK: Exercises for the "Exercise" parameter

struct ExerciseEntity: AppEntity, Identifiable {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Exercise"
    static let defaultQuery = ExerciseQuery()

    let id: UUID
    let name: String
    let usual: String

    init(_ e: Exercise) {
        id = e.id
        name = e.name
        usual = "\(e.sets) × \(e.reps) @ \(Format.kg(e.weight)) kg"
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(usual)")
    }
}

struct ExerciseQuery: EntityStringQuery {
    func entities(for identifiers: [UUID]) async throws -> [ExerciseEntity] {
        let ids = Set(identifiers)
        return try await library().filter { ids.contains($0.id) }.map(ExerciseEntity.init)
    }

    func entities(matching string: String) async throws -> [ExerciseEntity] {
        Library.filter(try await library(), search: string, categories: []).map(ExerciseEntity.init)
    }

    func suggestedEntities() async throws -> [ExerciseEntity] {
        try await library().map(ExerciseEntity.init)
    }

    private func library() async throws -> [Exercise] {
        guard let store = SavedSession.store() else { throw IntentFailure(ShortcutActions.Failure.signedOut.localizedDescription) }
        return try await store.exercises()
    }
}

// MARK: Plumbing

struct IntentFailure: Error, CustomLocalizedStringResourceConvertible {
    let message: String
    init(_ message: String) { self.message = message }
    var localizedStringResource: LocalizedStringResource { "\(message)" }
}

extension GymStore: SetLogging {}

/// Reads the session the app keeps in the Keychain (see Auth.swift; same
/// item, read only).
enum SavedSession {
    static func store(config: AppConfig = .current) -> GymStore? {
        guard let session = load(), !session.isExpired else { return nil }
        return GymStore(config: config, accessToken: session.accessToken, userId: session.user.id)
    }

    private static func load() -> GymService.Session? {
        var out: AnyObject?
        let status = SecItemCopyMatching([
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: "gym.session",
            kSecReturnData: true,
        ] as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(GymService.Session.self, from: data)
    }
}
