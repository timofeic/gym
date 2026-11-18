import GoogleSignIn
import SwiftUI

@main
struct GymApp: App {
    @State private var auth = Auth()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
                .task { await auth.restore() }
        }
    }
}
