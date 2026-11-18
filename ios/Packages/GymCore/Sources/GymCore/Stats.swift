import Foundation

public enum Stats {
    /// Sunday-start calendar in the given time zone.
    public static func calendar(_ timeZone: TimeZone = .current) -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        cal.firstWeekday = 1
        return cal
    }

    public static func weekInterval(containing date: Date, calendar cal: Calendar) -> DateInterval {
        cal.dateInterval(of: .weekOfYear, for: date)!
    }

    /// Total sets per category in the week containing `now`. Every category
    /// counts, whatever it's called, so renaming one never changes the count.
    /// Same rule as the web app and the connector.
    public static func weeklySets(_ workouts: [Workout], now: Date, calendar cal: Calendar) -> [(category: String, sets: Int)] {
        let week = weekInterval(containing: now, calendar: cal)
        var totals: [String: Int] = [:]
        for w in workouts where week.contains(w.date) && w.date < week.end {
            for e in w.entries {
                for c in Set(e.categories) {
                    totals[c, default: 0] += e.sets
                }
            }
        }
        return totals.map { ($0.key, $0.value) }.sorted { $0.sets == $1.sets ? $0.category < $1.category : $0.sets > $1.sets }
    }

    public struct DayCount: Hashable, Sendable, Identifiable {
        public var day: Date
        public var label: String
        public var workouts: Int
        public var id: Date { day }
    }

    /// Workouts per day, Sunday to Saturday, for the week containing `now`.
    public static func workoutsPerDay(_ workouts: [Workout], now: Date, calendar cal: Calendar) -> [DayCount] {
        let week = weekInterval(containing: now, calendar: cal)
        let symbols = cal.shortWeekdaySymbols
        return (0..<7).map { offset in
            let day = cal.date(byAdding: .day, value: offset, to: week.start)!
            let count = workouts.filter { cal.isDate($0.date, inSameDayAs: day) }.count
            return DayCount(day: day, label: symbols[cal.component(.weekday, from: day) - 1], workouts: count)
        }
    }

    public struct ProgressPoint: Hashable, Sendable, Identifiable {
        public var date: Date
        public var weight: Double
        public var reps: Int
        public var id: Date { date }
    }

    public struct ExerciseProgress: Hashable, Sendable, Identifiable {
        public var exerciseId: UUID
        public var name: String
        public var categories: [String]
        public var points: [ProgressPoint]
        public var id: UUID { exerciseId }
    }

    /// Weight and reps over time for each exercise done in at least `minWorkouts` workouts.
    public static func progress(_ workouts: [Workout], minWorkouts: Int) -> [ExerciseProgress] {
        var byExercise: [UUID: ExerciseProgress] = [:]
        for w in workouts.sorted(by: { $0.date < $1.date }) {
            for e in w.entries {
                byExercise[e.exerciseId, default: ExerciseProgress(exerciseId: e.exerciseId, name: e.name, categories: e.categories, points: [])]
                    .points.append(ProgressPoint(date: w.date, weight: e.weight, reps: e.reps))
            }
        }
        return byExercise.values
            .filter { $0.points.count >= max(minWorkouts, 1) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}
