import Foundation
import Observation

/// A running (or just finished) rest. It only stores dates, so it keeps
/// "counting" while the app is in the background or not running at all.
public struct RestTimerState: Codable, Equatable, Sendable {
    public var startedAt: Date
    public var endsAt: Date

    public init(startedAt: Date, endsAt: Date) {
        self.startedAt = startedAt
        self.endsAt = endsAt
    }

    public var duration: TimeInterval { endsAt.timeIntervalSince(startedAt) }

    /// Whole seconds left, rounded up, never below zero.
    public func secondsLeft(at now: Date) -> Int {
        max(0, Int(endsAt.timeIntervalSince(now).rounded(.up)))
    }

    public func isFinished(at now: Date) -> Bool { now >= endsAt }

    /// 0 at the start, 1 when done.
    public func progress(at now: Date) -> Double {
        guard duration > 0 else { return 1 }
        return min(1, max(0, now.timeIntervalSince(startedAt) / duration))
    }
}

public enum RestTimer {
    /// Same range the coach's `gym.rest-timer` message accepts.
    public static let allowedSeconds = 1...3600
    /// Quick picks in the app.
    public static let presets = [60, 90, 120, 180]
    public static let defaultSeconds = 90
    /// A finished timer stays on screen as "Rest done" for this long.
    public static let keepFinishedFor: TimeInterval = 5 * 60

    public struct OutOfRange: LocalizedError, Equatable {
        public let seconds: Int
        public var errorDescription: String? { "A rest can be 1 second to 60 minutes." }
    }

    /// "0:45", "1:30", "10:00"
    public static func format(seconds: Int) -> String {
        let s = max(0, seconds)
        return "\(s / 60):\(String(format: "%02d", s % 60))"
    }

    /// "90 seconds", "1 minute", "2 minutes 30 seconds"
    public static func spoken(seconds: Int) -> String {
        let m = seconds / 60, s = seconds % 60
        func unit(_ n: Int, _ word: String) -> String { "\(n) \(word)\(n == 1 ? "" : "s")" }
        if m == 0 { return unit(s, "second") }
        if s == 0 { return unit(m, "minute") }
        if m == 1 && s == 30 { return "90 seconds" }
        return "\(unit(m, "minute")) \(unit(s, "second"))"
    }
}

/// Where the running timer is kept between launches (UserDefaults in the app).
public protocol RestTimerStorage: AnyObject, Sendable {
    func load() -> RestTimerState?
    func save(_ state: RestTimerState?)
}

/// Tells the person when the rest is over (a local notification in the app).
public protocol RestAlertScheduling: Sendable {
    /// Asks for permission if it hasn't been asked yet. Called before a rest
    /// starts, so the question never runs while a rest is already counting.
    func prepare() async
    /// Schedules the alert (asking for permission first if it still has to).
    func schedule(endsAt: Date, seconds: Int) async
    func cancel() async
}

/// The one rest timer the app has. Buttons in a workout, the in-app voice
/// coach and the Siri shortcut all start this same timer.
@MainActor @Observable
public final class RestTimerEngine {
    public private(set) var state: RestTimerState?

    @ObservationIgnored private let storage: RestTimerStorage
    @ObservationIgnored private let alerts: RestAlertScheduling
    @ObservationIgnored private let clock: @Sendable () -> Date

    public init(storage: RestTimerStorage, alerts: RestAlertScheduling, clock: @escaping @Sendable () -> Date = Date.init) {
        self.storage = storage
        self.alerts = alerts
        self.clock = clock
        state = storage.load()
        refresh()
    }

    /// Starts a new rest, replacing any running one.
    @discardableResult
    public func start(seconds: Int) async throws -> RestTimerState {
        guard RestTimer.allowedSeconds.contains(seconds) else { throw RestTimer.OutOfRange(seconds: seconds) }
        // On the first rest this asks about notifications. The rest starts
        // after the answer, so its alert is scheduled while Gym is still open.
        await alerts.prepare()
        let now = clock()
        let new = RestTimerState(startedAt: now, endsAt: now.addingTimeInterval(TimeInterval(seconds)))
        set(new)
        await alerts.schedule(endsAt: new.endsAt, seconds: seconds)
        return new
    }

    /// Adds time to the running rest (or starts one if it has finished).
    public func add(seconds: Int) async {
        let now = clock()
        guard var s = state, !s.isFinished(at: now) else {
            _ = try? await start(seconds: seconds)
            return
        }
        s.endsAt = s.endsAt.addingTimeInterval(TimeInterval(seconds))
        set(s)
        await alerts.schedule(endsAt: s.endsAt, seconds: s.secondsLeft(at: now))
    }

    public func cancel() async {
        set(nil)
        await alerts.cancel()
    }

    /// Picks up a timer started elsewhere (for example by Siri) and drops one
    /// that finished a while ago.
    public func refresh() {
        let stored = storage.load()
        if stored != state { state = stored }
        if let s = state, clock().timeIntervalSince(s.endsAt) > RestTimer.keepFinishedFor { set(nil) }
    }

    private func set(_ new: RestTimerState?) {
        state = new
        storage.save(new)
    }
}
