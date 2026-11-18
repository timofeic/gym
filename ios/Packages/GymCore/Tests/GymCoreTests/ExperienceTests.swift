import Foundation
import Testing
@testable import GymCore

// MARK: Fakes

final class MemoryTimerStorage: RestTimerStorage, @unchecked Sendable {
    var saved: RestTimerState?
    init(_ s: RestTimerState? = nil) { saved = s }
    func load() -> RestTimerState? { saved }
    func save(_ state: RestTimerState?) { saved = state }
}

actor RecordingAlerts: RestAlertScheduling {
    var scheduled: [(Date, Int)] = []
    var cancels = 0
    func prepare() {}
    func schedule(endsAt: Date, seconds: Int) { scheduled.append((endsAt, seconds)) }
    func cancel() { cancels += 1 }
}

/// The first rest on a fresh install: the person takes a while to answer the
/// notification question.
actor FirstTimeAlerts: RestAlertScheduling {
    let clock: TestClock
    let answerTakes: TimeInterval
    var asked = false
    var scheduled: [Date] = []
    init(clock: TestClock, answerTakes: TimeInterval) { self.clock = clock; self.answerTakes = answerTakes }
    func prepare() {
        guard !asked else { return }
        asked = true
        clock.now += answerTakes // the person reads the question and taps Allow
    }
    func schedule(endsAt: Date, seconds: Int) {
        if !asked { prepare() } // the old way: ask only once the rest is running
        scheduled.append(endsAt)
    }
    func cancel() {}
}

/// A clock the test moves by hand.
final class TestClock: @unchecked Sendable {
    var now = Date(timeIntervalSince1970: 1_800_000_000)
    var read: @Sendable () -> Date { { [self] in self.now } }
}

actor FakeLogger: SetLogging {
    let library: [Exercise]
    var saved: [(entries: [WorkoutEntry], date: Date)] = []
    init(_ library: [Exercise]) { self.library = library }
    func exercises() async throws -> [Exercise] { library }
    func addWorkout(entries: [WorkoutEntry], date: Date) async throws -> UUID {
        saved.append((entries, date))
        return UUID()
    }
}

// MARK: Rest timer

@Suite("Rest timer")
@MainActor
struct RestTimerTests {
    @Test func countsDownFromTheStartAndFinishes() async throws {
        let clock = TestClock(), alerts = RecordingAlerts(), storage = MemoryTimerStorage()
        let timer = RestTimerEngine(storage: storage, alerts: alerts, clock: clock.read)
        let s = try await timer.start(seconds: 90)
        #expect(s.secondsLeft(at: clock.now) == 90)
        #expect(s.secondsLeft(at: clock.now.addingTimeInterval(30.2)) == 60)
        #expect(!s.isFinished(at: clock.now.addingTimeInterval(89)))
        #expect(s.isFinished(at: clock.now.addingTimeInterval(90)))
        #expect(s.secondsLeft(at: clock.now.addingTimeInterval(500)) == 0)
        #expect(s.progress(at: clock.now.addingTimeInterval(45)) == 0.5)
        let scheduled = await alerts.scheduled
        #expect(scheduled.count == 1 && scheduled[0].0 == clock.now.addingTimeInterval(90) && scheduled[0].1 == 90)
    }

    /// Found by the blind tester: the first rest asked for notification
    /// permission once it was already running, and its alert came late.
    /// Asking first means the whole rest, and its alert, start after the answer.
    @Test func theFirstRestAsksAboutNotificationsBeforeItStarts() async throws {
        let clock = TestClock(), tapped = clock.now
        let alerts = FirstTimeAlerts(clock: clock, answerTakes: 20)
        let timer = RestTimerEngine(storage: MemoryTimerStorage(), alerts: alerts, clock: clock.read)
        let s = try await timer.start(seconds: 90)
        let answered = tapped.addingTimeInterval(20)
        #expect(s.startedAt == answered, "The rest starts once the question is answered")
        #expect(s.secondsLeft(at: answered) == 90)
        #expect(await alerts.scheduled == [answered.addingTimeInterval(90)])
        // Later rests aren't held up.
        let next = try await timer.start(seconds: 60)
        #expect(next.startedAt == clock.now)
    }

    @Test func isSavedSoItSurvivesTheAppClosing() async throws {
        let clock = TestClock(), storage = MemoryTimerStorage()
        let first = RestTimerEngine(storage: storage, alerts: RecordingAlerts(), clock: clock.read)
        try await first.start(seconds: 120)
        clock.now += 60 // app was in the background or closed
        let reopened = RestTimerEngine(storage: storage, alerts: RecordingAlerts(), clock: clock.read)
        #expect(reopened.state?.secondsLeft(at: clock.now) == 60)
    }

    @Test func picksUpATimerStartedBySiri() async throws {
        let clock = TestClock(), storage = MemoryTimerStorage()
        let app = RestTimerEngine(storage: storage, alerts: RecordingAlerts(), clock: clock.read)
        #expect(app.state == nil)
        storage.saved = RestTimerState(startedAt: clock.now, endsAt: clock.now + 60)
        app.refresh()
        #expect(app.state?.secondsLeft(at: clock.now) == 60)
    }

    @Test func aNewRestReplacesTheOldOne() async throws {
        let clock = TestClock(), alerts = RecordingAlerts()
        let timer = RestTimerEngine(storage: MemoryTimerStorage(), alerts: alerts, clock: clock.read)
        try await timer.start(seconds: 60)
        clock.now += 10
        try await timer.start(seconds: 180)
        #expect(timer.state?.secondsLeft(at: clock.now) == 180)
        #expect(await alerts.scheduled.count == 2)
    }

    @Test func addingTimeMovesTheEndAndTheAlert() async throws {
        let clock = TestClock(), alerts = RecordingAlerts()
        let timer = RestTimerEngine(storage: MemoryTimerStorage(), alerts: alerts, clock: clock.read)
        try await timer.start(seconds: 60)
        clock.now += 20
        await timer.add(seconds: 30)
        #expect(timer.state?.secondsLeft(at: clock.now) == 70)
        #expect(await alerts.scheduled.last?.1 == 70)
    }

    @Test func skippingCancelsTheAlert() async throws {
        let storage = MemoryTimerStorage(), alerts = RecordingAlerts()
        let timer = RestTimerEngine(storage: storage, alerts: alerts)
        try await timer.start(seconds: 60)
        await timer.cancel()
        #expect(timer.state == nil && storage.saved == nil)
        #expect(await alerts.cancels == 1)
    }

    @Test func aLongFinishedTimerIsCleared() async throws {
        let clock = TestClock(), storage = MemoryTimerStorage()
        let timer = RestTimerEngine(storage: storage, alerts: RecordingAlerts(), clock: clock.read)
        try await timer.start(seconds: 60)
        clock.now += 60 + 60
        timer.refresh()
        #expect(timer.state != nil, "Shows 'Rest done' for a few minutes")
        clock.now += RestTimer.keepFinishedFor
        timer.refresh()
        #expect(timer.state == nil)
    }

    @Test func refusesSillyLengths() async {
        let timer = RestTimerEngine(storage: MemoryTimerStorage(), alerts: RecordingAlerts())
        await #expect(throws: RestTimer.OutOfRange(seconds: 0)) { try await timer.start(seconds: 0) }
        await #expect(throws: RestTimer.OutOfRange(seconds: 3601)) { try await timer.start(seconds: 3601) }
        #expect(timer.state == nil)
    }

    @Test func formatting() {
        #expect(RestTimer.format(seconds: 90) == "1:30")
        #expect(RestTimer.format(seconds: 5) == "0:05")
        #expect(RestTimer.format(seconds: 600) == "10:00")
        #expect(RestTimer.spoken(seconds: 45) == "45 seconds")
        #expect(RestTimer.spoken(seconds: 60) == "1 minute")
        #expect(RestTimer.spoken(seconds: 90) == "90 seconds")
        #expect(RestTimer.spoken(seconds: 150) == "2 minutes 30 seconds")
    }

    @Test func theCoachsRestMessageUsesTheSameLimits() {
        let msg = CoachMessage.parse(topic: CoachMessage.restTimerTopic, payload: Data(#"{"seconds":3600}"#.utf8))
        #expect(msg == .restTimer(seconds: 3600))
        #expect(RestTimer.allowedSeconds.contains(3600))
        #expect(CoachMessage.parse(topic: CoachMessage.restTimerTopic, payload: Data(#"{"seconds":3601}"#.utf8)) == nil)
    }
}

// MARK: Siri and Shortcuts

@Suite("Shortcut actions")
struct ShortcutActionTests {
    let bench = Exercise(name: "Bench Press", sets: 3, reps: 8, weight: 60, categories: ["Chest"], isDefault: true)

    @Test func logsASetWithTheNumbersGiven() async throws {
        let store = FakeLogger([bench])
        let when = Date(timeIntervalSince1970: 1_800_000_000)
        let logged = try await ShortcutActions.logSet(exerciseId: bench.id, sets: 4, reps: 6, weight: 82.5, using: store, now: when)
        #expect(logged.dialog == "Logged Bench Press: 4 × 6 @ 82.5 kg.")
        let saved = await store.saved
        #expect(saved.count == 1)
        #expect(saved[0].date == when)
        #expect(saved[0].entries == [WorkoutEntry(exerciseId: bench.id, name: "Bench Press", categories: ["Chest"], sets: 4, reps: 6, weight: 82.5)])
    }

    @Test func missingNumbersComeFromTheExercise() async throws {
        let store = FakeLogger([bench])
        let logged = try await ShortcutActions.logSet(exerciseId: bench.id, sets: nil, reps: nil, weight: 80, using: store)
        #expect(logged.entry.sets == 3 && logged.entry.reps == 8 && logged.entry.weight == 80)
    }

    @Test func refusesNumbersOutsideTheLimitsAndSavesNothing() async throws {
        let store = FakeLogger([bench])
        await #expect(throws: ShortcutActions.Failure.invalid(["Weight must be between 0 and 500 kg"])) {
            try await ShortcutActions.logSet(exerciseId: bench.id, sets: 3, reps: 8, weight: 501, using: store)
        }
        await #expect(throws: ShortcutActions.Failure.invalid(["Sets must be between 1 and 10", "Reps must be between 1 and 100"])) {
            try await ShortcutActions.logSet(exerciseId: bench.id, sets: 11, reps: 0, weight: 50, using: store)
        }
        #expect(await store.saved.isEmpty)
    }

    @Test func needsASignedInSession() async {
        await #expect(throws: ShortcutActions.Failure.signedOut) {
            try await ShortcutActions.logSet(exerciseId: bench.id, sets: 1, reps: 1, weight: 1, using: nil)
        }
        #expect(ShortcutActions.Failure.signedOut.localizedDescription == "Open Gym and sign in first.")
    }

    @Test func saysSoWhenTheExerciseIsGone() async {
        await #expect(throws: ShortcutActions.Failure.unknownExercise) {
            try await ShortcutActions.logSet(exerciseId: UUID(), sets: 1, reps: 1, weight: 1, using: FakeLogger([bench]))
        }
    }

    @MainActor @Test func startsTheSharedRestTimer() async throws {
        let clock = TestClock(), alerts = RecordingAlerts()
        let timer = RestTimerEngine(storage: MemoryTimerStorage(), alerts: alerts, clock: clock.read)
        let dialog = try await ShortcutActions.startRest(seconds: 120, on: timer)
        #expect(dialog == "Rest timer started for 2 minutes. I'll let you know when it's done.")
        #expect(timer.state?.secondsLeft(at: clock.now) == 120)
        #expect(await alerts.scheduled.count == 1)
    }

    @MainActor @Test func restLengthIsChecked() async {
        let timer = RestTimerEngine(storage: MemoryTimerStorage(), alerts: RecordingAlerts())
        await #expect(throws: RestTimer.OutOfRange.self) { try await ShortcutActions.startRest(seconds: 7200, on: timer) }
    }
}

// MARK: Connected apps and account

@Suite("Account client")
struct AccountClientTests {
    let base = URL(string: "https://gym.example.test")!

    func client(status: Int, body: String, record: (@Sendable (URLRequest) -> Void)? = nil) -> AccountClient {
        AccountClient(baseURL: base, accessToken: "tok") { req in
            record?(req)
            return (Data(body.utf8), HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    @Test func listsConnectedAppsWithTheBearerToken() async throws {
        let seen = Box<URLRequest>()
        let c = client(status: 200, body: """
            [{"id":"a1","clientName":"Claude","createdAt":"2026-11-01T10:00:00.123Z","lastUsedAt":"2026-11-13T09:00:00Z"},
             {"id":"b2","clientName":"ChatGPT","createdAt":"2026-11-02T10:00:00Z","lastUsedAt":null}]
            """) { seen.value = $0 }
        guard case .apps(let apps) = try await c.connections() else { Issue.record("expected apps"); return }
        #expect(apps.map(\.clientName) == ["Claude", "ChatGPT"])
        #expect(apps[0].lastUsedAt != nil && apps[1].lastUsedAt == nil)
        #expect(seen.value?.url?.absoluteString == "https://gym.example.test/api/connections")
        #expect(seen.value?.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
    }

    @Test func readsPostgresTimestamps() async throws {
        let c = client(status: 200, body: #"[{"id":"a1","clientName":"Claude","createdAt":"2026-11-14T08:00:00.123456+00:00","lastUsedAt":"2026-11-14T09:30:00+10:00"}]"#)
        guard case .apps(let apps) = try await c.connections() else { Issue.record("expected apps"); return }
        #expect(apps[0].createdAt.timeIntervalSince1970.rounded() == 1_794_643_200)
        #expect(apps[0].lastUsedAt?.timeIntervalSince1970 == 1_794_612_600)
    }

    @Test func notDeployedYetIsNotAnError() async throws {
        #expect(try await client(status: 404, body: "<html>Not found</html>").connections() == .notAvailable)
    }

    @Test func revokeDeletesThatConnection() async throws {
        let seen = Box<URLRequest>()
        let app = ConnectedApp(id: "a1", clientName: "Claude", createdAt: Date())
        try await client(status: 204, body: "") { seen.value = $0 }.revoke(app)
        #expect(seen.value?.httpMethod == "DELETE")
        #expect(seen.value?.url?.path == "/api/connections/a1")
    }

    @Test func serviceErrorsAreShownInPlainEnglish() async {
        let c = client(status: 500, body: #"{"error":"Database is down"}"#)
        await #expect(throws: AccountClient.Failure(message: "Database is down", status: 500)) { try await c.connections() }
        let offline = AccountClient(baseURL: base, accessToken: "tok") { _ in throw URLError(.notConnectedToInternet) }
        await #expect(throws: AccountClient.Failure(message: "Couldn't reach the gym service. Check your connection.", status: 0)) {
            try await offline.connections()
        }
    }

    @Test func deleteAccountPostsAndExplainsWhenNotAvailable() async throws {
        let seen = Box<URLRequest>()
        try await client(status: 200, body: "{}") { seen.value = $0 }.deleteAccount()
        #expect(seen.value?.httpMethod == "POST" && seen.value?.url?.path == "/api/native/delete-account")
        #expect(seen.value?.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
        do {
            try await client(status: 404, body: "").deleteAccount()
            Issue.record("expected an error")
        } catch let f as AccountClient.Failure {
            #expect(f.isNotAvailable && f.message.contains("isn't available yet"))
        }
    }

    @Test func theStubServiceBehavesLikeTheContract() async throws {
        let stub = StubAccountService()
        let c = AccountClient(baseURL: base, accessToken: "tok", transport: stub.transport)
        guard case .apps(let apps) = try await c.connections() else { Issue.record("expected apps"); return }
        #expect(apps.map(\.clientName) == ["Claude", "ChatGPT"])
        try await c.revoke(apps[0])
        guard case .apps(let after) = try await c.connections() else { Issue.record("expected apps"); return }
        #expect(after.map(\.clientName) == ["ChatGPT"])
        try await c.deleteAccount()
        #expect(await stub.deletedAccount)
    }
}

final class Box<T>: @unchecked Sendable {
    var value: T?
}
