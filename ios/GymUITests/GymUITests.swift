import XCTest

/// Drives the real app against the local database and sign-in service.
/// Before running: gym-app/scripts/localdb/localdb.sh reset, then
/// PORT=3030 gym-app/scripts/dev-native.sh (see ios/README.md).
final class GymUITests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-resetSession"]
        app.launch()
        let signIn = app.buttons["signInDev"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 10), "Dev sign-in button should show")
        signIn.tap()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 15), "Should land on Overview")
    }

    func testSeededHistoryShowsOnHome() {
        XCTAssertTrue(app.staticTexts["Bench Press: 3 × 8 @ 60 kg"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.otherElements["weekChart"].exists || app.images["weekChart"].exists || app.descendants(matching: .any)["weekChart"].exists)
    }

    func testLoggingAWorkoutAddsItToRecentWorkouts() {
        app.buttons["logWorkout"].tap()
        app.buttons["addExercise"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("Deadlift")
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Deadlift'")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Deadlift"].waitForExistence(timeout: 5))
        app.buttons["saveWorkout"].tap()
        XCTAssertTrue(app.staticTexts["Deadlift: 3 × 5 @ 100 kg"].waitForExistence(timeout: 10),
                      "The new workout should appear with the exercise's default sets, reps and weight")
    }

    func testAddingAnExerciseAndCatchingADuplicateName() {
        app.tabBars.buttons["Exercises"].tap()
        app.buttons["newExercise"].tap()
        let name = app.textFields["exerciseName"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("  bench   PRESS")
        app.buttons["saveExercise"].tap()
        XCTAssertTrue(app.staticTexts["exerciseProblem"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["exerciseProblem"].label.contains("Bench Press"))

        clear(name)
        name.typeText("Goblet Squat \(Int.random(in: 1000...9999))")
        app.buttons["saveExercise"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Goblet Squat'")).firstMatch.waitForExistence(timeout: 10))
    }

    func testEditingABuiltInMakesAPersonalCopy() {
        app.tabBars.buttons["Exercises"].tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Bicep Curl'")).firstMatch.tap()
        let save = app.buttons["saveExercise"]
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["This is a built-in exercise. Saving makes your own copy; you can reset it later."].exists)
        app.buttons["Increment"].firstMatch.tap()
        save.tap()
        XCTAssertTrue(app.staticTexts["Edited"].waitForExistence(timeout: 10), "The edited copy should be marked")
    }

    /// Screenshots of each screen, for review. Only runs with
    /// TEST_RUNNER_CAPTURE_SCREENS=1 xcodebuild test ...
    func testCaptureScreens() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["CAPTURE_SCREENS"] == "1")
        func shot(_ name: String) {
            sleep(2)
            let a = XCTAttachment(screenshot: app.screenshot())
            a.name = name
            a.lifetime = .keepAlways
            add(a)
        }
        shot("1-home")
        app.buttons["logWorkout"].tap()
        app.buttons["addExercise"].tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Bench Press'")).firstMatch.tap()
        shot("2-log-workout")
        app.buttons["Cancel"].firstMatch.tap()
        app.tabBars.buttons["Progress"].tap()
        shot("3-progress")
        app.tabBars.buttons["Exercises"].tap()
        shot("4-exercises")
        app.tabBars.buttons["Coach"].tap()
        shot("5-coach")
    }

    /// Puts the cursor at the end of a text field and deletes everything.
    private func clear(_ field: XCUIElement) {
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
        let text = field.value as? String ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: text.count + 2))
    }

    func testSigningOutReturnsToSignIn() {
        app.buttons["settingsButton"].firstMatch.tap()
        app.buttons["signOut"].tap()
        XCTAssertTrue(app.buttons["signInDev"].waitForExistence(timeout: 5))
    }
}
