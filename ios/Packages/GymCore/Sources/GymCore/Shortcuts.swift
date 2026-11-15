import Foundation

/// What the "Log a set" Siri shortcut needs from the database.
public protocol SetLogging: Sendable {
    func exercises() async throws -> [Exercise]
    @discardableResult
    func addWorkout(entries: [WorkoutEntry], date: Date) async throws -> UUID
}

/// The work behind the Siri and Shortcuts actions, kept here so it can be
/// unit tested. The App Intents in the app only fill in the parameters.
public enum ShortcutActions {
    public enum Failure: LocalizedError, Equatable {
        case signedOut
        case unknownExercise
        case invalid([String])

        public var errorDescription: String? {
            switch self {
            case .signedOut: "Open Gym and sign in first."
            case .unknownExercise: "That exercise isn't in your library any more."
            case .invalid(let problems): problems.joined(separator: ". ") + "."
            }
        }
    }

    public struct LoggedSet: Equatable, Sendable {
        public let workoutId: UUID
        public let entry: WorkoutEntry
        public var dialog: String { "Logged \(Format.entry(entry))." }
    }

    /// Saves one exercise as a new workout dated `now`. Missing numbers come
    /// from the exercise's defaults. Numbers outside the logging limits are
    /// refused with the same messages the app shows.
    public static func logSet(exerciseId: UUID, sets: Int?, reps: Int?, weight: Double?,
                              using store: SetLogging?, now: Date = Date()) async throws -> LoggedSet {
        guard let store else { throw Failure.signedOut }
        guard let exercise = try await store.exercises().first(where: { $0.id == exerciseId }) else {
            throw Failure.unknownExercise
        }
        var entry = WorkoutEntry(from: exercise)
        if let sets { entry.sets = sets }
        if let reps { entry.reps = reps }
        if let weight { entry.weight = weight }
        let problems = Limits.problems(entry)
        guard problems.isEmpty else { throw Failure.invalid(problems) }
        let id = try await store.addWorkout(entries: [entry], date: now)
        return LoggedSet(workoutId: id, entry: entry)
    }

    /// Starts the shared rest timer and says when it ends.
    @MainActor
    public static func startRest(seconds: Int, on timer: RestTimerEngine) async throws -> String {
        try await timer.start(seconds: seconds)
        return "Rest timer started for \(RestTimer.spoken(seconds: seconds)). I'll let you know when it's done."
    }
}

public enum Format {
    /// "60", "62.5"
    public static func kg(_ weight: Double) -> String {
        weight.formatted(.number.precision(.fractionLength(0...1)).locale(Locale(identifier: "en_AU")))
    }

    /// "Bench Press: 3 × 8 @ 80 kg"
    public static func entry(_ e: WorkoutEntry) -> String {
        "\(e.name): \(e.sets) × \(e.reps) @ \(kg(e.weight)) kg"
    }
}
