import Foundation

/// An exercise in the library. Built-in exercises have `isDefault == true` and
/// no owner; a person's own exercises (including edited copies of built-ins)
/// carry their `userId`.
public struct Exercise: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var sets: Int
    public var reps: Int
    public var weight: Double
    public var categories: [String]
    public var userId: UUID?
    public var parentExerciseId: UUID?
    public var isDefault: Bool

    public init(id: UUID = UUID(), name: String, sets: Int = 3, reps: Int = 10, weight: Double = 0,
                categories: [String] = [], userId: UUID? = nil, parentExerciseId: UUID? = nil, isDefault: Bool = false) {
        self.id = id; self.name = name; self.sets = sets; self.reps = reps; self.weight = weight
        self.categories = categories; self.userId = userId; self.parentExerciseId = parentExerciseId; self.isDefault = isDefault
    }

    enum CodingKeys: String, CodingKey {
        case id, name, sets, reps, weight, categories
        case userId = "user_id", parentExerciseId = "parent_exercise_id", isDefault = "is_default"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        sets = try c.decodeIfPresent(Int.self, forKey: .sets) ?? 3
        reps = try c.decodeIfPresent(Int.self, forKey: .reps) ?? 10
        weight = try c.decodeIfPresent(Double.self, forKey: .weight) ?? 0
        categories = try c.decodeIfPresent([String].self, forKey: .categories) ?? []
        userId = try c.decodeIfPresent(UUID.self, forKey: .userId)
        parentExerciseId = try c.decodeIfPresent(UUID.self, forKey: .parentExerciseId)
        isDefault = try c.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
    }

    /// A built-in exercise nobody owns. Editing one makes a personal copy.
    public var isBuiltIn: Bool { isDefault && userId == nil }
}

public struct Category: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public init(id: UUID = UUID(), name: String) { self.id = id; self.name = name }
}

/// One exercise as done in a workout.
public struct WorkoutEntry: Codable, Hashable, Sendable, Identifiable {
    public var exerciseId: UUID
    public var name: String
    public var categories: [String]
    public var sets: Int
    public var reps: Int
    public var weight: Double
    public var id: UUID { exerciseId }

    public init(exerciseId: UUID, name: String, categories: [String] = [], sets: Int, reps: Int, weight: Double) {
        self.exerciseId = exerciseId; self.name = name; self.categories = categories
        self.sets = sets; self.reps = reps; self.weight = weight
    }

    public init(from exercise: Exercise) {
        self.init(exerciseId: exercise.id, name: exercise.name, categories: exercise.categories,
                  sets: exercise.sets, reps: exercise.reps, weight: exercise.weight)
    }
}

public struct Workout: Hashable, Sendable, Identifiable {
    public var id: UUID
    public var date: Date
    public var entries: [WorkoutEntry]
    public init(id: UUID = UUID(), date: Date, entries: [WorkoutEntry]) {
        self.id = id; self.date = date; self.entries = entries
    }
}

public struct SignedInUser: Codable, Hashable, Sendable {
    public var id: UUID
    public var email: String
    public var name: String?
    public init(id: UUID, email: String, name: String?) { self.id = id; self.email = email; self.name = name }
}
