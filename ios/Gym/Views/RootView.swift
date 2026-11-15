import AuthenticationServices
import GymCore
import SwiftUI

struct RootView: View {
    @Environment(Auth.self) private var auth

    var body: some View {
        if let session = auth.session {
            MainTabs(model: AppModel(
                store: GymStore(config: auth.config, accessToken: session.accessToken, userId: session.user.id),
                user: session.user
            ), voice: VoiceCoach(service: auth.service, accessToken: session.accessToken))
            .id(session.accessToken)
        } else {
            SignInView()
        }
    }
}

struct SignInView: View {
    @Environment(Auth.self) private var auth
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "dumbbell.fill").font(.system(size: 64)).foregroundStyle(.tint)
            Text("Gym").font(.largeTitle.bold())
            Text("Log workouts, track progress, and talk to your coach.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)
            Spacer()
            VStack(spacing: 12) {
                SignInWithAppleButton(.signIn) { request in
                    auth.prepareAppleRequest(request)
                } onCompletion: { result in
                    Task { await auth.finishAppleSignIn(result) }
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 50)
                .accessibilityIdentifier("signInApple")

                if auth.canUseGoogle {
                    Button { Task { await auth.signInWithGoogle() } } label: {
                        Label("Sign in with Google", systemImage: "person.crop.circle")
                            .font(.title3.weight(.medium))
                            .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.bordered).tint(.primary)
                    .buttonBorderShape(.roundedRectangle(radius: 8))
                    .accessibilityIdentifier("signInGoogle")
                }
                if auth.canUseDevSignIn {
                    Button("Dev sign-in") { Task { await auth.devSignIn() } }
                        .buttonStyle(.bordered).controlSize(.large)
                        .accessibilityIdentifier("signInDev")
                }
            }
            .disabled(auth.isWorking)
            if auth.isWorking { ProgressView() }
            if let error = auth.error {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
                    .accessibilityIdentifier("signInError")
            }
        }
        .padding(24)
    }
}

struct MainTabs: View {
    @State var model: AppModel
    @State var voice: VoiceCoach
    @State private var showSettings = false

    var body: some View {
        TabView {
            screen { HomeView() }.tabItem { Label("Home", systemImage: "house") }
            screen { ProgressScreen() }.tabItem { Label("Progress", systemImage: "chart.xyaxis.line") }
            screen { ExercisesView() }.tabItem { Label("Exercises", systemImage: "dumbbell") }
            screen { CoachView() }.tabItem { Label("Coach", systemImage: "waveform") }
        }
        .task {
            voice.onMessage = { [model] message in
                if case .dataChanged(let kind) = message { Task { await model.reload(kind) } }
            }
            await model.loadAll()
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .alert("Something went wrong", isPresented: .init(
            get: { model.error != nil }, set: { if !$0 { model.error = nil } })
        ) { Button("OK") {} } message: { Text(model.error ?? "") }
        // Last, so the sheet and alert above get the model too.
        .environment(model)
        .environment(voice)
    }

    private func screen<V: View>(@ViewBuilder _ content: () -> V) -> some View {
        NavigationStack {
            content()
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showSettings = true } label: { Image(systemName: "person.crop.circle") }
                            .accessibilityLabel("Settings")
                            .accessibilityIdentifier("settingsButton")
                    }
                }
        }
        .environment(model)
        .environment(voice)
    }
}

/// Toggle chips for filtering or picking categories.
struct CategoryChips: View {
    let categories: [GymCore.Category]
    @Binding var selected: Set<String>

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categories) { c in
                    let on = selected.contains(c.name)
                    Button {
                        if on { selected.remove(c.name) } else { selected.insert(c.name) }
                    } label: {
                        Text(c.name).font(.subheadline)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(on ? Color.accentColor : Color(.secondarySystemBackground), in: Capsule())
                            .foregroundStyle(on ? Color.white : Color.primary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }
}

extension Double {
    /// "60", "62.5"
    var kg: String { formatted(.number.precision(.fractionLength(0...1))) }
}
