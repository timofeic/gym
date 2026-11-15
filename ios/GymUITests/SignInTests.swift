import XCTest

/// The sign-in screen. Real Apple and Google sign-in need a person at the
/// sheet, so these check the screen and the dev sign-in path; the server side
/// of Apple and Google is covered in gym-app/lib/native/*.test.ts.
/// Before running: gym-app/scripts/localdb/localdb.sh reset, then the sign-in
/// service (gym-app/scripts/dev-native.sh) on the port in Local.xcconfig.
final class SignInTests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-resetSession"]
        app.launch()
    }

    private var appleButton: XCUIElement { app.buttons["signInApple"] }

    func testAppleButtonShowsAboveTheOtherOptions() {
        XCTAssertTrue(appleButton.waitForExistence(timeout: 10), "Sign in with Apple should show on a fresh start")
        XCTAssertTrue(appleButton.isHittable)
        XCTAssertTrue(appleButton.label.localizedCaseInsensitiveContains("Apple"), "Label was \(appleButton.label)")

        for id in ["signInGoogle", "signInDev"] where app.buttons[id].exists {
            XCTAssertLessThan(appleButton.frame.maxY, app.buttons[id].frame.minY, "Apple should sit above \(id)")
        }
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Sign-in screen"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testDevSignInStillLandsOnOverview() {
        XCTAssertTrue(appleButton.waitForExistence(timeout: 10))
        let dev = app.buttons["signInDev"]
        XCTAssertTrue(dev.waitForExistence(timeout: 5), "Dev sign-in should show when DEV_LOGIN_EMAIL is set")
        dev.tap()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 15), "Should land on Overview")
        XCTAssertFalse(appleButton.exists, "The sign-in screen should be gone")
    }

    func testStaysSignedInAfterRelaunch() {
        app.buttons["signInDev"].tap()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 15))
        app.terminate()
        app.launchArguments = []
        app.launch()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 15), "Should still be signed in")
    }

    /// Tapping Apple either opens Apple's sheet or, where Apple sign-in can't
    /// run (a simulator without iCloud, a build without the capability),
    /// says so on screen instead of doing nothing.
    func testTappingAppleOpensApplesSheetOrExplains() {
        XCTAssertTrue(appleButton.waitForExistence(timeout: 10))
        appleButton.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let appleSheet = springboard.otherElements.matching(NSPredicate(format: "label CONTAINS[c] 'Apple'")).firstMatch
        let message = app.staticTexts["signInError"]
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline, !message.exists, !appleSheet.exists { usleep(250_000) }
        XCTAssertTrue(message.exists || appleSheet.exists, "Expected Apple's sheet or an explanation")
    }
}
