import XCTest

/// Journeys F1, F3, F4, G2 and E6: the Coach tab, Settings, the rest timer
/// and the Siri / Shortcuts actions. Runs against the local database and
/// sign-in service like GymUITests (see ios/README.md).
final class ExperienceTests: XCTestCase {
    var app: XCUIApplication!
    var springboard: XCUIApplication { XCUIApplication(bundleIdentifier: "com.apple.springboard") }

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    /// Fresh sign-in. `env` adds launch environment values.
    private func launchSignedIn(_ env: [String: String] = [:], resetTimer: Bool = true) {
        app.launchArguments = ["-resetSession"] + (resetTimer ? ["-resetRestTimer"] : [])
        app.launchEnvironment = env
        app.launch()
        let signIn = app.buttons["signInDev"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 15), "Dev sign-in button should show")
        signIn.tap()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 60), "Should land on Overview")
    }

    private func openSettings() {
        app.buttons["settingsButton"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
    }

    private func closeSettings() {
        app.navigationBars["Settings"].buttons["Done"].tap()
    }

    /// Sets "Voice coach in the app" from Settings.
    private func setVoiceCoach(_ on: Bool) {
        openSettings()
        let toggle = app.switches["voiceCoachToggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        if (toggle.value as? String == "1") != on { toggle.switches.firstMatch.tap() }
        XCTAssertEqual(toggle.value as? String, on ? "1" : "0")
        closeSettings()
    }

    private func shot(_ name: String, _ of: XCUIApplication? = nil) {
        let a = XCTAttachment(screenshot: (of ?? app).screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// Taps Allow on a system permission alert if one is showing.
    private func allowSystemAlert(timeout: TimeInterval = 5) {
        let alert = springboard.alerts.firstMatch
        guard alert.waitForExistence(timeout: timeout) else { return }
        for label in ["Allow", "OK"] where alert.buttons[label].exists {
            alert.buttons[label].tap()
            return
        }
    }

    // MARK: F1, G2

    func testCoachTabExplainsClaudeAndChatGPTUntilTheVoiceCoachIsTurnedOn() {
        launchSignedIn()
        setVoiceCoach(false)
        app.tabBars.buttons["Coach"].tap()

        XCTAssertTrue(app.staticTexts["Coach in Claude or ChatGPT"].waitForExistence(timeout: 5))
        let url = app.staticTexts["connectorURL"]
        XCTAssertTrue(url.exists)
        XCTAssertTrue(url.label.hasSuffix("/api/mcp"), "Connector link should end in /api/mcp, was \(url.label)")
        XCTAssertFalse(app.buttons["startCoach"].exists, "The in-app coach is off by default")
        app.buttons["copyConnectorURL"].tap()
        XCTAssertTrue(app.buttons["Copied"].waitForExistence(timeout: 2))
        shot("coach-tab-connector-guide")

        // No microphone prompt just from opening the Coach tab.
        XCTAssertFalse(springboard.alerts.firstMatch.waitForExistence(timeout: 2))

        setVoiceCoach(true)
        app.tabBars.buttons["Coach"].tap()
        XCTAssertTrue(app.buttons["startCoach"].waitForExistence(timeout: 5), "Turning it on shows the in-app coach")
        XCTAssertFalse(springboard.alerts.firstMatch.exists, "Still no microphone prompt until Start")
        shot("coach-tab-voice-coach-on")

        // The setting is remembered.
        app.terminate()
        launchSignedIn()
        app.tabBars.buttons["Coach"].tap()
        XCTAssertTrue(app.buttons["startCoach"].waitForExistence(timeout: 5), "The switch should be remembered")

        setVoiceCoach(false)
        app.tabBars.buttons["Coach"].tap()
        XCTAssertTrue(app.staticTexts["connectorURL"].waitForExistence(timeout: 5))
    }

    /// With the switch on, Start asks for the microphone, then joins LiveKit
    /// (or says voice isn't set up when the service has no LiveKit keys).
    func testVoiceCoachAsksForTheMicrophoneOnlyWhenStarted() {
        launchSignedIn()
        setVoiceCoach(true)
        defer { setVoiceCoach(false) }
        app.tabBars.buttons["Coach"].tap()
        app.buttons["startCoach"].tap()
        allowSystemAlert(timeout: 5)

        let end = app.buttons["endCoach"]
        let error = app.staticTexts["coachError"]
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline, !end.exists, !error.exists { _ = end.waitForExistence(timeout: 1) }
        if error.exists {
            XCTAssertEqual(error.label, "Voice coach is not set up yet")
        } else {
            XCTAssertTrue(end.exists, "Should be in a live coach session")
            end.tap()
            XCTAssertTrue(app.buttons["startCoach"].waitForExistence(timeout: 10))
        }
    }

    func testSettingsHasThePrivacyPolicyAndCoachSwitch() {
        launchSignedIn()
        openSettings()
        XCTAssertTrue(app.switches["voiceCoachToggle"].exists)
        app.swipeUp()
        let privacy = app.buttons["privacyPolicy"]
        XCTAssertTrue(privacy.waitForExistence(timeout: 5))
        XCTAssertEqual(privacy.label, "Privacy policy")
        XCTAssertTrue(app.buttons["deleteAccount"].exists)
        shot("settings")
    }

    // MARK: E6 connected apps

    func testRevokingAConnectedApp() {
        launchSignedIn(["GYM_STUB_ACCOUNT": "1"])
        openSettings()
        let claude = app.descendants(matching: .any)["connectedApp-Claude"]
        XCTAssertTrue(claude.waitForExistence(timeout: 10), "Connected apps should list Claude")
        XCTAssertTrue(app.descendants(matching: .any)["connectedApp-ChatGPT"].exists)
        shot("settings-connected-apps")

        app.buttons["revoke-Claude"].tap()
        let confirm = app.buttons["confirmRevoke"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        XCTAssertTrue(claude.waitForNonExistence(timeout: 10), "Claude should be gone after revoking")
        XCTAssertTrue(app.descendants(matching: .any)["connectedApp-ChatGPT"].exists, "Other apps stay connected")
    }

    /// Before the connector's API is deployed the list says so calmly
    /// instead of showing an error.
    func testConnectedAppsAgainstTheRealService() {
        launchSignedIn()
        openSettings()
        let message = app.staticTexts["connectedAppsMessage"]
        let anyApp = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'connectedApp-'")).firstMatch
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline, !message.exists, !anyApp.exists { _ = message.waitForExistence(timeout: 1) }
        XCTAssertTrue(message.exists || anyApp.exists, "Connected apps should load")
        if message.exists {
            XCTAssertFalse(message.label.contains("went wrong"), "Should not show an error: \(message.label)")
            XCTAssertFalse(message.label.contains("Couldn't reach"), "Should not show an error: \(message.label)")
        }
    }

    func testDeletingTheAccountAsksTwiceThenSignsOut() {
        launchSignedIn(["GYM_STUB_ACCOUNT": "1"])
        openSettings()
        app.swipeUp()
        app.buttons["deleteAccount"].tap()
        XCTAssertTrue(app.alerts["Delete your account?"].waitForExistence(timeout: 5))
        shot("delete-account-first-confirm")

        // Backing out at the second step keeps the account.
        app.alerts.buttons["Continue"].firstMatch.tap()
        XCTAssertTrue(app.alerts["Are you sure?"].waitForExistence(timeout: 5))
        app.alerts.buttons["Keep my account"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Settings"].exists)

        app.buttons["deleteAccount"].tap()
        app.alerts.buttons["Continue"].firstMatch.tap()
        XCTAssertTrue(app.alerts["Are you sure?"].waitForExistence(timeout: 5))
        app.alerts.buttons["Delete my account"].firstMatch.tap()
        XCTAssertTrue(app.buttons["signInDev"].waitForExistence(timeout: 10), "Should be signed out")
    }

    // MARK: F4 rest timer

    func testRestTimerKeepsCountingInTheBackgroundAndNotifies() {
        launchSignedIn(["GYM_TEST_REST_SECONDS": "8"])
        app.buttons["logWorkout"].tap()
        let start = app.buttons["startRest"]
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        allowSystemAlert() // notification permission, asked at first use

        let countdown = app.staticTexts["restTimerCountdown"].firstMatch
        XCTAssertTrue(countdown.waitForExistence(timeout: 5))
        let first = seconds(countdown.label)
        XCTAssertTrue((60...90).contains(first), "Starts at 1:30 and counts down, was \(countdown.label)")
        shot("rest-timer-in-workout")

        // Leave the app for a few seconds: it keeps counting.
        XCUIDevice.shared.press(.home)
        sleep(4)
        app.activate()
        XCTAssertTrue(countdown.waitForExistence(timeout: 5))
        // "Next set" (-1 here) means it finished while we were away, which also counts.
        let left = seconds(countdown.label)
        XCTAssertTrue(left == -1 || (left > 0 && left <= first - 4), "Should have kept counting in the background: \(first)s before, \(left)s after")

        // Skip it, then start a short one and wait for the notification outside the app.
        app.buttons["restTimerSkip"].firstMatch.tap()
        XCTAssertTrue(countdown.waitForNonExistence(timeout: 5))
        app.buttons["restLengths"].tap()
        let short = app.buttons["rest8"]
        XCTAssertTrue(short.waitForExistence(timeout: 5), "Test length shows in the menu")
        short.tap()
        XCTAssertTrue(countdown.waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        let banner = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Rest done'")).firstMatch
        XCTAssertTrue(banner.waitForExistence(timeout: 60), "A 'Rest done' notification should arrive")
        shot("rest-timer-notification", springboard)
    }

    // MARK: F3 Siri and Shortcuts

    /// Runs both Gym actions from the Shortcuts app with Gym closed, then
    /// opens Gym to check what they did.
    ///
    /// iOS only runs App Shortcuts for an app signed with a team. Simulator
    /// builds are ad-hoc signed, so sign Gym.app with your Apple Development
    /// certificate after building and use test-without-building (see the PR).
    func testShortcutsAppRunsGymActionsWithoutOpeningGym() throws {
        launchSignedIn() // saves a session, as signing in on the phone would
        app.terminate()

        let shortcuts = XCUIApplication(bundleIdentifier: "com.apple.shortcuts")
        shortcuts.launch()
        _ = shortcuts.wait(for: .runningForeground, timeout: 90)
        if !shortcuts.otherElements["Log a set"].firstMatch.waitForExistence(timeout: 30) {
            dismissShortcutsWelcome(shortcuts)
        }
        _ = try openGymInShortcuts(shortcuts)
        shot("shortcuts-gym-actions", shortcuts)

        // "Start a rest timer"
        shortcuts.otherElements["Start rest timer"].firstMatch.tap()
        allowSystemAlert(timeout: 8)
        XCTAssertTrue(waitForText("Rest timer started", in: [shortcuts, springboard], timeout: 60),
                      "Shortcut should confirm the rest started")
        shot("shortcuts-rest-timer-result", springboard)
        dismissResult(shortcuts)

        // "Log a set": pick an exercise, use its usual numbers.
        shortcuts.otherElements["Log a set"].firstMatch.tap()
        XCTAssertTrue(waitForText("Deadlift", in: [shortcuts, springboard], timeout: 60, beginsWith: true), "Should ask which exercise")
        let deadlift = [shortcuts, springboard].map { $0.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Deadlift'")).firstMatch }.first { $0.exists }!
        shot("shortcuts-log-set-pick-exercise", springboard)
        deadlift.tap()
        XCTAssertTrue(waitForText("Logged Deadlift", in: [shortcuts, springboard], timeout: 60),
                      "Shortcut should confirm the set was logged")
        shot("shortcuts-log-set-result", springboard)
        dismissResult(shortcuts)
        shortcuts.terminate()

        // Gym shows both.
        app.launchArguments = []
        app.launchEnvironment = [:]
        app.launch()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["restTimerCountdown"].firstMatch.waitForExistence(timeout: 5), "The rest Siri started shows in Gym")
        XCTAssertTrue(app.staticTexts["Deadlift: 3 × 5 @ 100 kg"].waitForExistence(timeout: 10), "The set Siri logged shows in Gym")
        shot("home-after-shortcuts")

        // Leave things as they were for the other tests.
        app.buttons["restTimerSkip"].firstMatch.tap()
        app.staticTexts["Deadlift: 3 × 5 @ 100 kg"].firstMatch.press(forDuration: 1.5)
        let delete = app.buttons["Delete"].firstMatch
        XCTAssertTrue(delete.waitForExistence(timeout: 10))
        delete.tap()
        let confirm = app.buttons["Delete workout"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        XCTAssertTrue(app.staticTexts["Deadlift: 3 × 5 @ 100 kg"].waitForNonExistence(timeout: 10))
    }

    private func dismissShortcutsWelcome(_ s: XCUIApplication) {
        for label in ["Continue", "Not Now", "OK", "Get Started"] {
            let b = s.buttons[label]
            if b.waitForExistence(timeout: 2) { b.tap() }
        }
    }

    /// Finds Gym's App Shortcuts in the Shortcuts app (Library > All Shortcuts).
    private func openGymInShortcuts(_ s: XCUIApplication) throws -> XCUIElement {
        let logASet = s.otherElements["Log a set"].firstMatch
        if !logASet.waitForExistence(timeout: 10) {
            for label in ["Library", "All Shortcuts", "Shortcuts"] where s.buttons[label].exists { s.buttons[label].firstMatch.tap() }
            for _ in 0..<4 where !logASet.exists { s.swipeUp(); _ = logASet.waitForExistence(timeout: 2) }
        }
        XCTAssertTrue(logASet.exists, "Gym's actions should show in the Shortcuts app")
        XCTAssertTrue(s.otherElements["Start rest timer"].firstMatch.exists)
        return logASet
    }

    /// The result card is drawn by the system, so look in SpringBoard too.
    private func waitForText(_ text: String, in apps: [XCUIApplication], timeout: TimeInterval, beginsWith: Bool = false) -> Bool {
        let format = beginsWith ? "label BEGINSWITH %@" : "label CONTAINS %@"
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            for a in apps where a.descendants(matching: .any).matching(NSPredicate(format: format, text)).firstMatch.exists { return true }
            sleep(1)
        }
        return false
    }

    private func dismissResult(_ s: XCUIApplication) {
        for a in [springboard, s] {
            for label in ["Done", "OK", "Close"] where a.buttons[label].firstMatch.exists {
                a.buttons[label].firstMatch.tap()
                return
            }
        }
        s.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
    }

    private func seconds(_ label: String) -> Int {
        let parts = label.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : -1
    }
}
