import XCTest

/// Journeys C4 and C5: managing categories in Settings, and the reason shown
/// when an exercise can't be deleted. Runs against the local database and
/// sign-in service like GymUITests (see ios/README.md). Puts the seeded
/// categories back as it found them.
final class CategoryTests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-resetSession"]
        app.launch()
        let signIn = app.buttons["signInDev"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 15), "Dev sign-in button should show")
        signIn.tap()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 60), "Should land on Overview")
    }

    // MARK: C5

    func testRenamingAndDeletingACategoryUpdatesBuiltInExercises() {
        // Rename Legs to Quads. Back Squat is a built-in in Legs.
        openSettings()
        swipe(category: "Legs", action: "Rename")
        let alert = app.alerts["Rename category"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        let field = alert.textFields.firstMatch
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 6) + "Quads")
        alert.buttons["Rename"].tap()
        XCTAssertTrue(scrollTo(app.staticTexts["Quads"]), "Quads should be listed")
        XCTAssertFalse(app.staticTexts["Legs"].exists)
        closeSettings()

        app.tabBars.buttons["Exercises"].tap()
        app.buttons["Quads"].firstMatch.tap()
        sleep(2)
        shot("C5-Quads-filter")
        let squat = row("Back Squat")
        XCTAssertTrue(squat.waitForExistence(timeout: 10), "Back Squat should show under the renamed category")
        XCTAssertTrue(squat.label.contains("Quads"), "Back Squat should list Quads, not Legs: \(squat.label)")
        XCTAssertTrue(squat.label.contains("Edited"), "It's now the person's own copy, so it's marked: \(squat.label)")
        XCTAssertTrue(row("Deadlift").exists, "Deadlift is a built-in in Legs too")
        app.buttons["Quads"].firstMatch.tap()

        // Delete Quads: it comes off Back Squat as well.
        openSettings()
        swipe(category: "Quads", action: "Delete")
        app.buttons["Delete category"].tap()
        XCTAssertTrue(app.staticTexts["Quads"].waitForNonExistence(timeout: 10))
        XCTAssertTrue(scrollTo(app.staticTexts["Pull"]), "Settings list should still show the rest")
        XCTAssertFalse(app.staticTexts["Quads"].exists)
        closeSettings()
        app.tabBars.buttons["Exercises"].tap()
        XCTAssertFalse(app.buttons["Quads"].exists, "No Quads chip once it's deleted")
        XCTAssertTrue(row("Back Squat").waitForExistence(timeout: 10))
        XCTAssertFalse(row("Back Squat").label.contains("Quads"), row("Back Squat").label)
        shot("C5-after-delete")

        // Put things back: Legs again, and Reset brings back the built-ins.
        openSettings()
        let newName = app.textFields["New category"]
        XCTAssertTrue(scrollTo(newName))
        newName.tap()
        newName.typeText("Legs")
        app.buttons["Add"].tap()
        XCTAssertTrue(scrollTo(app.staticTexts["Legs"]))
        closeSettings()
        for name in ["Back Squat", "Deadlift"] {
            row(name).swipeLeft()
            app.buttons["Reset"].tap()
            XCTAssertTrue(app.staticTexts["Edited"].waitForNonExistence(timeout: 10) || !row(name).label.contains("Edited"))
        }
        XCTAssertTrue(row("Back Squat").label.contains("Legs"), row("Back Squat").label)
    }

    // MARK: C4

    func testDeletingAUsedExerciseExplainsWhyWithAPlainTitle() {
        // Built-ins can't be deleted at all, so use an exercise of the person's own.
        app.tabBars.buttons["Exercises"].tap()
        let name = "Used Lift \(Int.random(in: 1000...9999))"
        app.buttons["newExercise"].tap()
        let field = app.textFields["exerciseName"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(name)
        app.buttons["saveExercise"].tap()
        XCTAssertTrue(row(name).waitForExistence(timeout: 10))

        // Log a workout with it.
        app.tabBars.buttons["Home"].tap()
        app.buttons["logWorkout"].tap()
        app.buttons["addExercise"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(name)
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch.tap()
        app.buttons["saveWorkout"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "\(name):")).firstMatch.waitForExistence(timeout: 10))

        app.tabBars.buttons["Exercises"].tap()
        let find = app.searchFields["Search exercises"]
        XCTAssertTrue(find.waitForExistence(timeout: 5))
        find.tap()
        find.typeText(name)
        XCTAssertTrue(row(name).waitForExistence(timeout: 5))
        row(name).swipeLeft()
        app.buttons["Delete"].tap()
        app.buttons["Delete"].firstMatch.tap()
        let alert = app.alerts["Can't delete this exercise"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10), "The title should say what happened, not that something broke")
        XCTAssertTrue(alert.staticTexts["This exercise is in past workouts, so it can't be deleted."].exists)
        XCTAssertFalse(app.alerts["Something went wrong"].exists)
        shot("C4-cant-delete")
        alert.buttons["OK"].tap()
    }

    // MARK: Helpers

    private func openSettings() {
        app.buttons["settingsButton"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
    }

    private func closeSettings() {
        app.navigationBars["Settings"].buttons["Done"].tap()
    }

    /// Lists load lazily: scrolls down until `element` is on screen.
    @discardableResult
    private func scrollTo(_ element: XCUIElement) -> Bool {
        for _ in 0..<6 {
            if element.waitForExistence(timeout: 2) && element.isHittable { return true }
            app.swipeUp()
        }
        return element.exists && element.isHittable
    }

    /// Swipes a category in Settings and taps one of its actions.
    private func swipe(category: String, action: String) {
        let text = app.staticTexts[category]
        XCTAssertTrue(scrollTo(text), "\(category) should be listed")
        text.swipeLeft()
        app.buttons[action].firstMatch.tap()
    }

    /// An exercise row on the Exercises tab.
    private func row(_ name: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    }

    private func shot(_ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }
}
