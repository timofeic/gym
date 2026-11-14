import Foundation
import Testing
@testable import GymCore

let me = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
let someoneElse = UUID()

func builtIn(_ name: String, _ cats: [String] = []) -> Exercise {
    Exercise(name: name, categories: cats, isDefault: true)
}

@Suite("Logging limits")
struct LimitsTests {
    @Test func outOfRangeValuesAreClampedToTheLimits() {
        let e = Limits.clamp(WorkoutEntry(exerciseId: UUID(), name: "Bench", sets: 0, reps: 250, weight: -5))
        #expect(e.sets == 1 && e.reps == 100 && e.weight == 0)
        #expect(Limits.clamp(WorkoutEntry(exerciseId: UUID(), name: "Deadlift", sets: 11, reps: 5, weight: 600)).weight == 500)
    }

    @Test func problemsAreSpelledOut() {
        let bad = WorkoutEntry(exerciseId: UUID(), name: "x", sets: 12, reps: 0, weight: 501)
        #expect(Limits.problems(bad) == [
            "Sets must be between 1 and 10",
            "Reps must be between 1 and 100",
            "Weight must be between 0 and 500 kg",
        ])
        #expect(Limits.problems(WorkoutEntry(exerciseId: UUID(), name: "ok", sets: 3, reps: 8, weight: 60)).isEmpty)
    }
}

@Suite("Exercise library")
struct LibraryTests {
    @Test func youSeeYourOwnPlusBuiltInsYouHaveNotReplaced() {
        let bench = builtIn("Bench Press"), squat = builtIn("Back Squat")
        let myBench = Exercise(name: "Bench Press (paused)", userId: me, parentExerciseId: bench.id)
        let mine = Exercise(name: "Arnold Press", userId: me)
        let theirs = Exercise(name: "Secret Lift", userId: someoneElse)
        let names = Library.visible([bench, squat, myBench, mine, theirs], for: me).map(\.name)
        #expect(names == ["Arnold Press", "Back Squat", "Bench Press (paused)"])
    }

    @Test func namesClashIgnoringCaseAndSpaces() {
        let lib = [builtIn("Bench Press")]
        #expect(ExerciseNames.normalize("  bench   PRESS ") == "bench press")
        #expect(ExerciseNames.clash(for: "bench  press", in: lib)?.name == "Bench Press")
        #expect(ExerciseNames.clash(for: "Incline Bench", in: lib) == nil)
    }

    @Test func editingDoesNotClashWithItselfOrTheBuiltInItCameFrom() {
        let bench = builtIn("Bench Press")
        let copy = Exercise(name: "Bench Press", userId: me, parentExerciseId: bench.id)
        #expect(ExerciseNames.clash(for: "bench press", editing: copy, in: [bench, copy]) == nil)
        #expect(ExerciseNames.clash(for: "Bench Press", editing: bench, in: [bench]) == nil)
    }

    @Test func editingABuiltInMakesAPersonalCopy() {
        let bench = builtIn("Bench Press", ["Chest"])
        var edited = bench; edited.weight = 70
        guard case .createCopy(let copy) = Library.planEdit(original: bench, edited: edited, userId: me) else {
            Issue.record("expected a copy"); return
        }
        #expect(copy.id != bench.id && copy.userId == me && copy.parentExerciseId == bench.id && !copy.isDefault && copy.weight == 70)
    }

    @Test func editingYourOwnExerciseUpdatesIt() {
        let mine = Exercise(name: "Arnold Press", userId: me)
        var edited = mine; edited.reps = 12
        #expect(Library.planEdit(original: mine, edited: edited, userId: me) == .update(edited))
    }

    @Test func searchAndCategoryFiltersCombine() {
        let lib = [builtIn("Bench Press", ["Chest"]), builtIn("Incline Bench", ["Chest", "Shoulders"]), builtIn("Squat", ["Legs"])]
        #expect(Library.filter(lib, search: "bench", categories: ["Shoulders"]).map(\.name) == ["Incline Bench"])
        #expect(Library.filter(lib, search: "", categories: []).count == 3)
    }

    @Test func renamingOrDeletingACategoryUpdatesExercises() {
        #expect(Library.recategorise(["Chest", "Push"], from: "Chest", to: "Pecs") == ["Pecs", "Push"])
        #expect(Library.recategorise(["Chest", "Push"], from: "Chest", to: nil) == ["Push"])
        #expect(Library.recategorise(["Chest", "Pecs"], from: "Chest", to: "Pecs") == ["Pecs"])
    }
}

@Suite("Weekly numbers")
struct StatsTests {
    let cal = Stats.calendar(TimeZone(identifier: "Australia/Melbourne")!)

    func date(_ s: String) -> Date {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    // Wednesday 12 Nov 2026, Melbourne. The week runs Sun 8 Nov to Sat 14 Nov.
    var now: Date { date("2026-11-12T10:00:00+11:00") }

    func workout(_ when: String, _ entries: [WorkoutEntry]) -> Workout { Workout(date: date(when), entries: entries) }

    @Test func weeklySetsCountThisWeekOnlyAndSkipSplitCategories() {
        let bench = WorkoutEntry(exerciseId: UUID(), name: "Bench", categories: ["Chest", "Upper", "Push"], sets: 3, reps: 8, weight: 60)
        let row = WorkoutEntry(exerciseId: UUID(), name: "Row", categories: ["Back", "Pull"], sets: 4, reps: 10, weight: 50)
        let sets = Stats.weeklySets([
            workout("2026-11-08T00:30:00+11:00", [bench, row]),     // Sunday morning: this week
            workout("2026-11-11T18:00:00+11:00", [bench]),
            workout("2026-11-07T23:30:00+11:00", [bench, row]),     // Saturday night: last week
        ], now: now, calendar: cal)
        #expect(sets.map(\.category) == ["Chest", "Back"])
        #expect(sets.map(\.sets) == [6, 4])
    }

    @Test func workoutsPerDayRunSundayToSaturdayInLocalTime() {
        let days = Stats.workoutsPerDay([
            workout("2026-11-08T00:30:00+11:00", []),
            workout("2026-11-11T07:00:00+11:00", []),
            workout("2026-11-11T19:00:00+11:00", []),
            workout("2026-11-10T13:30:00Z", []),  // 00:30 Wed in Melbourne
        ], now: now, calendar: cal)
        #expect(days.map(\.label) == ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
        #expect(days.map(\.workouts) == [1, 0, 0, 3, 0, 0, 0])
    }

    @Test func progressOnlyIncludesExercisesDoneOftenEnoughInDateOrder() {
        let benchId = UUID(), squatId = UUID()
        let b = { (w: Double) in WorkoutEntry(exerciseId: benchId, name: "Bench", sets: 3, reps: 8, weight: w) }
        let s = WorkoutEntry(exerciseId: squatId, name: "Squat", sets: 5, reps: 5, weight: 80)
        let p = Stats.progress([
            workout("2026-11-11T10:00:00+11:00", [b(62.5)]),
            workout("2026-11-01T10:00:00+11:00", [b(60), s]),
        ], minWorkouts: 2)
        #expect(p.map(\.name) == ["Bench"])
        #expect(p[0].points.map(\.weight) == [60, 62.5])
    }
}

@Suite("Messages from the coach")
struct CoachMessageTests {
    @Test func understandsDataChangesAndRestTimers() {
        #expect(CoachMessage.parse(topic: "gym.data-changed", payload: Data(#"{"kind":"workouts"}"#.utf8)) == .dataChanged(.workouts))
        #expect(CoachMessage.parse(topic: "gym.rest-timer", payload: Data(#"{"seconds":90}"#.utf8)) == .restTimer(seconds: 90))
    }

    @Test func ignoresAnythingElse() {
        #expect(CoachMessage.parse(topic: "gym.data-changed", payload: Data(#"{"kind":"pizza"}"#.utf8)) == nil)
        #expect(CoachMessage.parse(topic: "gym.rest-timer", payload: Data(#"{"seconds":0}"#.utf8)) == nil)
        #expect(CoachMessage.parse(topic: "other", payload: Data(#"{"kind":"workouts"}"#.utf8)) == nil)
        #expect(CoachMessage.parse(topic: "gym.rest-timer", payload: Data("nope".utf8)) == nil)
    }
}
