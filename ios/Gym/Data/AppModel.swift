import Foundation
import GymCore

/// Everything the screens show, loaded from Supabase for the signed-in user.
@MainActor @Observable
final class AppModel {
    let store: GymStore
    let user: SignedInUser

    private(set) var exercises: [Exercise] = []
    private(set) var categories: [GymCore.Category] = []
    private(set) var recent: [Workout] = []
    private(set) var history: [Workout] = []
    private(set) var loaded = false
    var error: String?

    var calendar = Stats.calendar()

    init(store: GymStore, user: SignedInUser) {
        self.store = store
        self.user = user
    }

    var weekPerDay: [Stats.DayCount] { Stats.workoutsPerDay(history, now: Date(), calendar: calendar) }
    var weeklySets: [(category: String, sets: Int)] { Stats.weeklySets(history, now: Date(), calendar: calendar) }

    func loadAll() async {
        await attempt {
            async let ex = store.exercises()
            async let cats = store.categories()
            async let rec = store.recentWorkouts()
            async let all = store.allWorkouts()
            (exercises, categories, recent, history) = try await (ex, cats, rec, all)
        }
        loaded = true
    }

    func reload(_ kind: CoachMessage.DataKind) async {
        await attempt {
            switch kind {
            case .workouts:
                async let rec = store.recentWorkouts()
                async let all = store.allWorkouts()
                (recent, history) = try await (rec, all)
            case .exercises:
                exercises = try await store.exercises()
            case .categories:
                async let cats = store.categories()
                async let ex = store.exercises()
                (categories, exercises) = try await (cats, ex)
            }
        }
    }

    /// Runs a change, then reloads what it touched. Returns false and sets
    /// `error` when it fails.
    @discardableResult
    func change(_ kind: CoachMessage.DataKind, _ work: () async throws -> Void) async -> Bool {
        do {
            try await work()
            await reload(kind)
            if kind == .categories || kind == .exercises { await reload(.workouts) }
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    private func attempt(_ work: () async throws -> Void) async {
        do { try await work(); error = nil } catch { self.error = error.localizedDescription }
    }
}
