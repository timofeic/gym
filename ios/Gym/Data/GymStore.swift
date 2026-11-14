import Foundation
import GymCore
import PostgREST

/// All reads and writes to Supabase, as the signed-in user. Row level
/// security on the server limits every query to that user's data.
struct GymStore: Sendable {
    let db: PostgrestClient
    let userId: UUID

    init(config: AppConfig, accessToken: String, userId: UUID) {
        self.userId = userId
        db = PostgrestClient(
            url: config.supabaseURL.appending(path: "rest/v1"),
            headers: ["apikey": config.supabaseAnonKey, "Authorization": "Bearer \(accessToken)"],
            logger: nil
        )
    }

    // MARK: Exercises and categories

    func exercises() async throws -> [Exercise] {
        let all: [Exercise] = try await db.from("exercises").select().order("name").execute().value
        return Library.visible(all, for: userId)
    }

    func categories() async throws -> [GymCore.Category] {
        try await db.from("categories").select("id, name").order("name").execute().value
    }

    private struct ExerciseRow: Encodable {
        let id: UUID, name: String, sets: Int, reps: Int, weight: Double, categories: [String]
        let user_id: UUID?, parent_exercise_id: UUID?, is_default: Bool
        init(_ e: Exercise) {
            id = e.id; name = e.name; sets = e.sets; reps = e.reps; weight = e.weight; categories = e.categories
            user_id = e.userId; parent_exercise_id = e.parentExerciseId; is_default = e.isDefault
        }
    }

    func addExercise(_ exercise: Exercise) async throws {
        var e = exercise
        e.userId = userId
        e.isDefault = false
        e.parentExerciseId = nil
        try await db.from("exercises").insert(ExerciseRow(e)).execute()
    }

    func saveEdit(original: Exercise, edited: Exercise) async throws {
        switch Library.planEdit(original: original, edited: edited, userId: userId) {
        case .createCopy(let copy):
            try await db.from("exercises").insert(ExerciseRow(copy)).execute()
        case .update(let e):
            struct Changes: Encodable { let name: String, sets: Int, reps: Int, weight: Double, categories: [String] }
            try await db.from("exercises")
                .update(Changes(name: e.name, sets: e.sets, reps: e.reps, weight: e.weight, categories: e.categories))
                .eq("id", value: e.id)
                .execute()
        }
    }

    enum DeleteError: LocalizedError {
        case usedInWorkouts
        var errorDescription: String? { "This exercise is in past workouts, so it can't be deleted." }
    }

    func deleteExercise(_ exercise: Exercise) async throws {
        struct Ref: Decodable { let workout_id: UUID }
        let uses: [Ref] = try await db.from("workout_exercises").select("workout_id")
            .eq("exercise_id", value: exercise.id).limit(1).execute().value
        if !uses.isEmpty { throw DeleteError.usedInWorkouts }
        try await db.from("exercises").delete().eq("id", value: exercise.id).execute()
    }

    /// Deleting an edited copy brings back the built-in it came from.
    func resetToDefault(_ exercise: Exercise) async throws {
        guard exercise.parentExerciseId != nil else { return }
        try await deleteExercise(exercise)
    }

    func addCategory(_ name: String) async throws {
        struct Row: Encodable { let name: String }
        try await db.from("categories").insert(Row(name: name.trimmingCharacters(in: .whitespaces))).execute()
    }

    /// Renames (`to` non-nil) or deletes a category, and fixes every exercise using it.
    func changeCategory(_ category: GymCore.Category, to newName: String?) async throws {
        struct Row: Decodable { let id: UUID; let categories: [String]? }
        let using: [Row] = try await db.from("exercises").select("id, categories")
            .contains("categories", value: [category.name]).execute().value
        for row in using {
            struct Update: Encodable { let categories: [String] }
            let updated = Library.recategorise(row.categories ?? [], from: category.name, to: newName)
            try await db.from("exercises").update(Update(categories: updated)).eq("id", value: row.id).execute()
        }
        if let newName {
            struct Rename: Encodable { let name: String }
            try await db.from("categories").update(Rename(name: newName)).eq("id", value: category.id).execute()
        } else {
            try await db.from("categories").delete().eq("id", value: category.id).execute()
        }
    }

    // MARK: Workouts

    private struct WorkoutRow: Decodable {
        struct Entry: Decodable {
            struct Ex: Decodable { let id: UUID; let name: String; let categories: [String]? }
            let exercise_id: UUID, sets: Int, reps: Int, weight: Double
            let exercises: Ex?
        }
        let id: UUID
        let date: Date
        let workout_exercises: [Entry]

        var workout: Workout {
            Workout(id: id, date: date, entries: workout_exercises.map {
                WorkoutEntry(exerciseId: $0.exercise_id, name: $0.exercises?.name ?? "Exercise",
                             categories: $0.exercises?.categories ?? [], sets: $0.sets, reps: $0.reps, weight: $0.weight)
            })
        }
    }

    private static let workoutColumns = "id, date, workout_exercises(exercise_id, sets, reps, weight, exercises(id, name, categories))"

    func recentWorkouts(limit: Int = 10) async throws -> [Workout] {
        let rows: [WorkoutRow] = try await db.from("workouts").select(Self.workoutColumns)
            .order("date", ascending: false).limit(limit).execute().value
        return rows.map(\.workout)
    }

    func workouts(since: Date) async throws -> [Workout] {
        let rows: [WorkoutRow] = try await db.from("workouts").select(Self.workoutColumns)
            .gte("date", value: since).order("date").execute().value
        return rows.map(\.workout)
    }

    func allWorkouts() async throws -> [Workout] {
        let rows: [WorkoutRow] = try await db.from("workouts").select(Self.workoutColumns)
            .order("date").execute().value
        return rows.map(\.workout)
    }

    private struct EntryRow: Encodable {
        let workout_id: UUID, exercise_id: UUID, sets: Int, reps: Int, weight: Double
    }

    /// Saves a new workout. Values are clamped to the logging limits.
    @discardableResult
    func addWorkout(entries: [WorkoutEntry], date: Date = Date()) async throws -> UUID {
        struct New: Encodable { let user_id: UUID; let date: Date }
        struct Created: Decodable { let id: UUID }
        let created: Created = try await db.from("workouts").insert(New(user_id: userId, date: date))
            .select("id").single().execute().value
        try await insertEntries(entries, into: created.id)
        return created.id
    }

    func updateWorkout(_ workout: Workout) async throws {
        struct Change: Encodable { let date: Date }
        try await db.from("workouts").update(Change(date: workout.date)).eq("id", value: workout.id).execute()
        try await db.from("workout_exercises").delete().eq("workout_id", value: workout.id).execute()
        try await insertEntries(workout.entries, into: workout.id)
    }

    func deleteWorkout(_ workout: Workout) async throws {
        try await db.from("workout_exercises").delete().eq("workout_id", value: workout.id).execute()
        try await db.from("workouts").delete().eq("id", value: workout.id).execute()
    }

    private func insertEntries(_ entries: [WorkoutEntry], into workoutId: UUID) async throws {
        guard !entries.isEmpty else { return }
        let rows = entries.map(Limits.clamp).map {
            EntryRow(workout_id: workoutId, exercise_id: $0.exerciseId, sets: $0.sets, reps: $0.reps, weight: $0.weight)
        }
        try await db.from("workout_exercises").insert(rows).execute()
    }
}
