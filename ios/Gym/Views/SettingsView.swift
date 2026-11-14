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

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    LabeledContent("Signed in as", value: model.user.name ?? model.user.email)
                    Button("Sign out", role: .destructive) { auth.signOut() }
                        .accessibilityIdentifier("signOut")
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
        }
    }
}
