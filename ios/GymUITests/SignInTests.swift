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

    /// The Google client ids come from the committed config (App.xcconfig,
    /// and Release.xcconfig for TestFlight), so the button must show.
    func testGoogleButtonShowsUnderApple() {
        let google = app.buttons["signInGoogle"]
        XCTAssertTrue(google.waitForExistence(timeout: 10), "Sign in with Google should show")
        XCTAssertTrue(google.isHittable)
        XCTAssertTrue(google.label.contains("Google"), "Label was \(google.label)")
        XCTAssertLessThan(appleButton.frame.maxY, google.frame.minY, "Apple should sit above Google")
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Sign-in screen with Google"
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
        // Apple's sheet, or on a simulator with no Apple Account its
        // "Sign in to your Apple Account" alert, is drawn by the system.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let systemUI = springboard.alerts.matching(NSPredicate(format: "label CONTAINS[c] 'Apple'")).firstMatch
        let appleSheet = springboard.otherElements.matching(NSPredicate(format: "label CONTAINS[c] 'Apple'")).firstMatch
        let message = app.staticTexts["signInError"]
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline, !message.exists, !appleSheet.exists, !systemUI.exists { usleep(250_000) }
        XCTAssertTrue(message.exists || appleSheet.exists || systemUI.exists, "Expected Apple's sheet or an explanation")
        if systemUI.exists, systemUI.buttons["Close"].exists { systemUI.buttons["Close"].tap() }
    }
}
