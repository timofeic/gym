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
    /// Alert title for `error`. Expected refusals say what happened rather than
    /// "Something went wrong".
    var errorTitle = AppModel.faultTitle
    nonisolated static let faultTitle = "Something went wrong"

    var calendar = Stats.calendar()

    /// Posted when something outside the screens (a Siri shortcut) saved a workout.
    nonisolated static let dataChangedElsewhere = Notification.Name("gym.data-changed-elsewhere")
    @ObservationIgnored private var observer: (any NSObjectProtocol)?

    init(store: GymStore, user: SignedInUser) {
        self.store = store
        self.user = user
        observer = NotificationCenter.default.addObserver(forName: Self.dataChangedElsewhere, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.reload(.workouts) }
        }
    }

    isolated deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    var weekPerDay: [Stats.DayCount] { Stats.workoutsPerDay(history, now: Date(), calendar: calendar) }
    var weeklySets: [(category: String, sets: Int)] { Stats.weeklySets(history, now: Date(), calendar: calendar) }

    func loadAll() async {
        await attempt {
            async let ex = store.exercises()
            async let cats = store.categories()
            async let rec = store.recentWorkouts()
            async let all = store.allWorkouts()
            let (e, c, r, h) = try await (ex, cats, rec, all)
            (exercises, categories) = (e, c)
            (recent, history) = (Library.relabel(r, using: e), Library.relabel(h, using: e))
        }
        loaded = true
    }

    func reload(_ kind: CoachMessage.DataKind) async {
        await attempt {
            switch kind {
            case .workouts:
                async let rec = store.recentWorkouts()
                async let all = store.allWorkouts()
                let (r, h) = try await (rec, all)
                (recent, history) = (Library.relabel(r, using: exercises), Library.relabel(h, using: exercises))
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
            show(error)
            return false
        }
    }

    private func attempt(_ work: () async throws -> Void) async {
        do { try await work(); error = nil } catch { show(error) }
    }

    private func show(_ error: Error) {
        errorTitle = (error as? ExplainedError)?.title ?? Self.faultTitle
        self.error = error.localizedDescription
    }
}

/// An expected refusal, not a fault: shown under its own plain title.
protocol ExplainedError: LocalizedError {
    var title: String { get }
}
