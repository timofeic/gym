import Foundation

/// Limits when logging a workout (same as the web app).
public enum Limits {
    public static let sets = 1...10
    public static let reps = 1...100
    public static let weight = 0.0...500.0

    public static func clamp(_ entry: WorkoutEntry) -> WorkoutEntry {
        var e = entry
        e.sets = min(max(e.sets, sets.lowerBound), sets.upperBound)
        e.reps = min(max(e.reps, reps.lowerBound), reps.upperBound)
        e.weight = min(max(e.weight, weight.lowerBound), weight.upperBound)
        return e
    }

    /// Plain-English problems with an entry, empty when it's fine.
    public static func problems(_ entry: WorkoutEntry) -> [String] {
        var out: [String] = []
        if !sets.contains(entry.sets) { out.append("Sets must be between \(sets.lowerBound) and \(sets.upperBound)") }
        if !reps.contains(entry.reps) { out.append("Reps must be between \(reps.lowerBound) and \(reps.upperBound)") }
        if !weight.contains(entry.weight) { out.append("Weight must be between 0 and 500 kg") }
        return out
    }
}

public enum ExerciseNames {
    /// Trim, lower case, single spaces. Matches the database's normalized_name.
    public static func normalize(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    /// The existing exercise that clashes with `name`, ignoring the exercise
    /// being edited and the built-in it was copied from.
    public static func clash(for name: String, editing: Exercise? = nil, in library: [Exercise]) -> Exercise? {
        let target = normalize(name)
        let ignore = Set([editing?.id, editing?.parentExerciseId].compactMap { $0 })
        return library.first { !ignore.contains($0.id) && normalize($0.name) == target }
    }
}

public enum Library {
    /// What a person sees: their own exercises, plus built-ins they haven't
    /// replaced with an edited copy. Sorted by name.
    public static func visible(_ all: [Exercise], for userId: UUID) -> [Exercise] {
        let replaced = Set(all.filter { $0.userId == userId }.compactMap(\.parentExerciseId))
        return all
            .filter { $0.userId == userId || ($0.isDefault && !replaced.contains($0.id)) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    public static func filter(_ exercises: [Exercise], search: String, categories: Set<String>) -> [Exercise] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        return exercises.filter { ex in
            (needle.isEmpty || ex.name.lowercased().contains(needle)) &&
            (categories.isEmpty || !categories.isDisjoint(with: ex.categories))
        }
    }

    /// What saving an edit should do: built-ins become a personal copy.
    public enum EditPlan: Equatable, Sendable {
        case createCopy(Exercise)
        case update(Exercise)
    }

    public static func planEdit(original: Exercise, edited: Exercise, userId: UUID) -> EditPlan {
        if original.isBuiltIn {
            var copy = edited
            copy.id = UUID()
            copy.userId = userId
            copy.parentExerciseId = original.id
            copy.isDefault = false
            return .createCopy(copy)
        }
        return .update(edited)
    }

    /// Category lists after a rename (`to` non-nil) or delete (`to` nil).
    public static func recategorise(_ categories: [String], from old: String, to new: String?) -> [String] {
        var out: [String] = []
        for c in categories {
            let replacement = c == old ? new : c
            if let r = replacement, !out.contains(r) { out.append(r) }
        }
        return out
    }
}
