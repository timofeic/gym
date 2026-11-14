import GymCore
import SwiftUI

struct ExercisesView: View {
    @Environment(AppModel.self) private var model
    @State private var search = ""
    @State private var categories: Set<String> = []
    @State private var editing: ExerciseEditor.Mode?
    @State private var toDelete: Exercise?

    var body: some View {
        List {
            Section { CategoryChips(categories: model.categories, selected: $categories) }
            ForEach(Library.filter(model.exercises, search: search, categories: categories)) { ex in
                Button { editing = .edit(ex) } label: { ExerciseRow(exercise: ex) }
                    .foregroundStyle(.primary)
                    .swipeActions {
                        if ex.isBuiltIn {
                            // Built-ins can't be deleted, only edited into a personal copy.
                        } else {
                            Button(role: .destructive) { toDelete = ex } label: { Label("Delete", systemImage: "trash") }
                        }
                        if ex.parentExerciseId != nil {
                            Button {
                                Task { await model.change(.exercises) { try await model.store.resetToDefault(ex) } }
                            } label: { Label("Reset", systemImage: "arrow.uturn.backward") }
                            .tint(.orange)
                        }
                    }
            }
        }
        .searchable(text: $search, prompt: "Search exercises")
        .navigationTitle("Exercises")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { editing = .new } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add exercise")
                    .accessibilityIdentifier("newExercise")
            }
        }
        .refreshable { await model.reload(.categories) }
        .sheet(item: $editing) { ExerciseEditor(mode: $0) }
        .confirmationDialog("Delete \(toDelete?.name ?? "")?", isPresented: .init(
            get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                guard let ex = toDelete else { return }
                Task { await model.change(.exercises) { try await model.store.deleteExercise(ex) } }
            }
        }
    }
}

struct ExerciseRow: View {
    let exercise: Exercise
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(exercise.name).font(.body)
                if exercise.parentExerciseId != nil {
                    Text("Edited").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.orange.opacity(0.2), in: Capsule())
                } else if !exercise.isBuiltIn {
                    Text("Yours").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.blue.opacity(0.15), in: Capsule())
                }
            }
            Text("\(exercise.sets) × \(exercise.reps) @ \(exercise.weight.kg) kg · \(exercise.categories.joined(separator: ", "))")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct ExerciseEditor: View {
    enum Mode: Identifiable {
        case new, edit(Exercise)
        var id: String { if case .edit(let e) = self { e.id.uuidString } else { "new" } }
    }

    let mode: Mode
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var draft = Exercise(name: "")
    @State private var picked: Set<String> = []
    @State private var problem: String?
    @State private var started = false

    private var original: Exercise? { if case .edit(let e) = mode { e } else { nil } }

    var body: some View {
        NavigationStack {
            Form {
                if original?.isBuiltIn == true {
                    Text("This is a built-in exercise. Saving makes your own copy; you can reset it later.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                TextField("Name", text: $draft.name).accessibilityIdentifier("exerciseName")
                    .onChange(of: draft.name) { problem = nil }
                // Right under the name, so it's visible without scrolling.
                if let problem { Text(problem).foregroundStyle(.red).accessibilityIdentifier("exerciseProblem") }
                Section("Defaults when logging") {
                    Stepper("Sets: \(draft.sets)", value: $draft.sets, in: Limits.sets)
                    Stepper("Reps: \(draft.reps)", value: $draft.reps, in: Limits.reps)
                    Stepper("Weight: \(draft.weight.kg) kg", value: $draft.weight, in: Limits.weight, step: 2.5)
                }
                Section("Categories") {
                    ForEach(model.categories) { c in
                        Toggle(c.name, isOn: .init(
                            get: { picked.contains(c.name) },
                            set: { if $0 { picked.insert(c.name) } else { picked.remove(c.name) } }))
                    }
                }
            }
            .navigationTitle(original == nil ? "New exercise" : "Edit exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityIdentifier("saveExercise")
                }
            }
            .onAppear {
                guard !started else { return }
                started = true
                if let original { draft = original; picked = Set(original.categories) }
            }
        }
    }

    private func save() async {
        var exercise = draft
        exercise.name = draft.name.trimmingCharacters(in: .whitespaces)
        exercise.categories = model.categories.map(\.name).filter(picked.contains)
        if let clash = ExerciseNames.clash(for: exercise.name, editing: original, in: model.exercises) {
            problem = "An exercise with a similar name already exists: \"\(clash.name)\""
            return
        }
        let ok = await model.change(.exercises) {
            if let original {
                try await model.store.saveEdit(original: original, edited: exercise)
            } else {
                try await model.store.addExercise(exercise)
            }
        }
        if ok { dismiss() }
    }
}
