import GymCore
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(Auth.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var newName = ""
    @State private var renaming: GymCore.Category?
    @State private var renameTo = ""
    @State private var toDelete: GymCore.Category?
    @AppStorage(VoiceCoachSetting.key) private var voiceCoachOn = false
    @State private var deleteStep = 0
    @State private var deleting = false
    @State private var accountError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    LabeledContent("Signed in as", value: model.user.name ?? model.user.email)
                    Button("Sign out", role: .destructive) { auth.signOut() }
                        .accessibilityIdentifier("signOut")
                }

                Section {
                    Toggle("Voice coach in the app", isOn: $voiceCoachOn)
                        .accessibilityIdentifier("voiceCoachToggle")
                } header: {
                    Text("Coach")
                } footer: {
                    Text("Off: the Coach tab shows how to use Gym in Claude or ChatGPT. On: talk to Gym's own coach in the Coach tab. It asks for the microphone when you start.")
                }

                if let client = accountClient {
                    ConnectedAppsSection(client: client)
                }
                Section {
                    ForEach(model.categories) { c in
                        Text(c.name)
                            .swipeActions {
                                Button(role: .destructive) { toDelete = c } label: { Label("Delete", systemImage: "trash") }
                                Button { renaming = c; renameTo = c.name } label: { Label("Rename", systemImage: "pencil") }
                            }
                    }
                    HStack {
                        TextField("New category", text: $newName)
                        Button("Add") {
                            let name = newName
                            newName = ""
                            Task { await model.change(.categories) { try await model.store.addCategory(name) } }
                        }
                        .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty
                                  || model.categories.contains { $0.name.caseInsensitiveCompare(newName.trimmingCharacters(in: .whitespaces)) == .orderedSame })
                    }
                } header: {
                    Text("Categories")
                } footer: {
                    Text("Renaming or deleting a category updates every exercise that uses it.")
                }

                Section("Privacy") {
                    Link(destination: auth.config.serviceURL.appending(path: "privacy")) {
                        Label("Privacy policy", systemImage: "hand.raised")
                    }
                    .accessibilityIdentifier("privacyPolicy")
                    Button(role: .destructive) { deleteStep = 1 } label: {
                        if deleting {
                            HStack { Text("Deleting account…"); Spacer(); ProgressView() }
                        } else {
                            Label("Delete account", systemImage: "trash")
                        }
                    }
                    .disabled(deleting || accountClient == nil)
                    .accessibilityIdentifier("deleteAccount")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .alert("Rename category", isPresented: .init(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("Name", text: $renameTo)
                Button("Rename") {
                    guard let c = renaming else { return }
                    let to = renameTo.trimmingCharacters(in: .whitespaces)
                    guard !to.isEmpty, to != c.name else { return }
                    Task { await model.change(.categories) { try await model.store.changeCategory(c, to: to) } }
                }
                Button("Cancel", role: .cancel) {}
            }
            .confirmationDialog("Delete \(toDelete?.name ?? "")?", isPresented: .init(
                get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), titleVisibility: .visible
            ) {
                Button("Delete category", role: .destructive) {
                    guard let c = toDelete else { return }
                    Task { await model.change(.categories) { try await model.store.changeCategory(c, to: nil) } }
                }
            } message: { Text("It will be removed from every exercise that uses it.") }
            .alert("Delete your account?", isPresented: .init(get: { deleteStep == 1 }, set: { if !$0 && deleteStep == 1 { deleteStep = 0 } })) {
                Button("Continue", role: .destructive) { deleteStep = 2 }
                    .accessibilityIdentifier("deleteAccountContinue")
                Button("Cancel", role: .cancel) { deleteStep = 0 }
            } message: {
                Text("This deletes your workouts, exercises and categories, and disconnects Claude and ChatGPT.")
            }
            .alert("Are you sure?", isPresented: .init(get: { deleteStep == 2 }, set: { if !$0 && deleteStep == 2 { deleteStep = 0 } })) {
                Button("Delete my account", role: .destructive) {
                    deleteStep = 0
                    Task { await deleteAccount() }
                }
                .accessibilityIdentifier("deleteAccountConfirm")
                Button("Keep my account", role: .cancel) { deleteStep = 0 }
            } message: {
                Text("This can't be undone.")
            }
            .alert("Couldn't delete your account", isPresented: .init(get: { accountError != nil }, set: { if !$0 { accountError = nil } })) {
                Button("OK") {}
            } message: { Text(accountError ?? "") }
        }
    }

    private var accountClient: AccountClient? {
        guard let token = auth.session?.accessToken else { return nil }
        return AccountClient.make(config: auth.config, accessToken: token)
    }

    private func deleteAccount() async {
        guard let client = accountClient else { return }
        deleting = true
        defer { deleting = false }
        do {
            try await client.deleteAccount()
            await RestTimerEngine.shared.cancel()
            dismiss()
            auth.signOut()
        } catch {
            accountError = error.localizedDescription
        }
    }
}

/// Apps that can read and log workouts through the Gym connector.
private struct ConnectedAppsSection: View {
    let client: AccountClient
    @State private var state: LoadState = .loading
    @State private var toRevoke: ConnectedApp?
    @State private var error: String?

    enum LoadState: Equatable {
        case loading, loaded(AccountClient.Connections), failed(String)
    }

    var body: some View {
        Section {
            switch state {
            case .loading:
                HStack { Text("Loading…").foregroundStyle(.secondary); Spacer(); ProgressView() }
            case .failed(let message):
                Text(message).foregroundStyle(.secondary).accessibilityIdentifier("connectedAppsMessage")
                Button("Try again") { Task { await load() } }
            case .loaded(.notAvailable):
                Text("Apps you connect, like Claude or ChatGPT, will show here.")
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("connectedAppsMessage")
            case .loaded(.apps(let apps)) where apps.isEmpty:
                Text("No apps connected. See the Coach tab to add Gym to Claude or ChatGPT.")
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("connectedAppsMessage")
            case .loaded(.apps(let apps)):
                ForEach(apps) { app in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(app.clientName)
                            Text(detail(app)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Revoke", role: .destructive) { toRevoke = app }
                            .buttonStyle(.borderless)
                            .accessibilityIdentifier("revoke-\(app.clientName)")
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("connectedApp-\(app.clientName)")
                }
            }
        } header: {
            Text("Connected apps")
        } footer: {
            Text("Revoking stops that app reading or logging your workouts.")
        }
        .task { await load() }
        .confirmationDialog("Revoke \(toRevoke?.clientName ?? "")?", isPresented: .init(
            get: { toRevoke != nil }, set: { if !$0 { toRevoke = nil } }), titleVisibility: .visible
        ) {
            Button("Revoke access", role: .destructive) {
                guard let app = toRevoke else { return }
                Task { await revoke(app) }
            }
            .accessibilityIdentifier("confirmRevoke")
        } message: { Text("It won't be able to see your workouts until you connect it again.") }
        .alert("Couldn't revoke", isPresented: .init(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") {}
        } message: { Text(error ?? "") }
    }

    private func detail(_ app: ConnectedApp) -> String {
        let connected = "Connected \(app.createdAt.formatted(.dateTime.day().month()))"
        guard let used = app.lastUsedAt else { return connected + ", not used yet" }
        return connected + ", last used \(used.formatted(.relative(presentation: .named)))"
    }

    private func load() async {
        do { state = .loaded(try await client.connections()) } catch { state = .failed(error.localizedDescription) }
    }

    private func revoke(_ app: ConnectedApp) async {
        do {
            try await client.revoke(app)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension AccountClient {
    /// UI tests launch with GYM_STUB_ACCOUNT=1 to use a pretend service, since
    /// the connections API may not be deployed yet.
    @MainActor static func make(config: AppConfig, accessToken: String) -> AccountClient {
        if ProcessInfo.processInfo.environment["GYM_STUB_ACCOUNT"] == "1" {
            return AccountClient(baseURL: config.serviceURL, accessToken: accessToken, transport: stub.transport)
        }
        return AccountClient(baseURL: config.serviceURL, accessToken: accessToken)
    }

    @MainActor private static let stub = StubAccountService()
}
