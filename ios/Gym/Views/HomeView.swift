import Charts
import GymCore
import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var editor: WorkoutEditor.Mode?
    @State private var toDelete: Workout?
    @State private var timer = RestTimerEngine.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        List {
            if timer.state != nil {
                Section { RestTimerBanner() }
            }
            Section("This week") {
                Chart(model.weekPerDay) { day in
                    BarMark(x: .value("Day", day.label), y: .value("Workouts", day.workouts))
                        .foregroundStyle(Color.accentColor.gradient)
                        .cornerRadius(4)
                }
                .chartYAxis { AxisMarks(values: .automatic(desiredCount: 3)) }
                .frame(height: 140)
                .accessibilityIdentifier("weekChart")

                Button { editor = .new } label: {
                    Label("Log workout", systemImage: "plus.circle.fill").font(.headline)
                }
                .accessibilityIdentifier("logWorkout")
            }

            Section {
                if model.weeklySets.isEmpty {
                    Text("No sets yet this week.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.weeklySets, id: \.category) { item in
                        HStack {
                            Text(item.category)
                            Spacer()
                            Gauge(value: Double(min(item.sets, 20)), in: 0...20) { EmptyView() }
                                currentValueLabel: { Text("\(item.sets)") }
                                .gaugeStyle(.accessoryCircularCapacity)
                                .tint(item.sets >= 10 ? .green : .accentColor)
                                .scaleEffect(0.7)
                                .frame(width: 44, height: 44)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(item.category): \(item.sets) sets")
                    }
                }
            } header: {
                Text("Sets per muscle this week")
            } footer: {
                Text("Aim for 10 to 20 hard sets per muscle each week.")
            }

            Section("Recent workouts") {
                if model.recent.isEmpty && model.loaded {
                    Text("No workouts yet. Log one, or ask the coach.").foregroundStyle(.secondary)
                }
                ForEach(model.recent) { workout in
                    WorkoutRow(workout: workout)
                        .contentShape(Rectangle())
                        .onTapGesture { editor = .edit(workout) }
                        .swipeActions {
                            Button(role: .destructive) { toDelete = workout } label: { Label("Delete", systemImage: "trash") }
                            Button { editor = .copy(workout) } label: { Label("Repeat", systemImage: "doc.on.doc") }
                                .tint(.blue)
                        }
                        .contextMenu {
                            Button { editor = .copy(workout) } label: { Label("Repeat today", systemImage: "doc.on.doc") }
                            Button { editor = .edit(workout) } label: { Label("Edit", systemImage: "pencil") }
                            Button(role: .destructive) { toDelete = workout } label: { Label("Delete", systemImage: "trash") }
                        }
                }
            }
        }
        .navigationTitle("Overview")
        .refreshable { await model.loadAll() }
        // A set logged with Siri while Gym was in the background shows on return.
        .onChange(of: scenePhase) { old, new in
            if old == .background && new != .background { Task { await model.reload(.workouts) } }
        }
        .sheet(item: $editor) { WorkoutEditor(mode: $0) }
        .confirmationDialog("Delete this workout?", isPresented: .init(
            get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), titleVisibility: .visible
        ) {
            Button("Delete workout", role: .destructive) {
                guard let w = toDelete else { return }
                Task { await model.change(.workouts) { try await model.store.deleteWorkout(w) } }
            }
        } message: { Text("This can't be undone.") }
    }
}

struct WorkoutRow: View {
    let workout: Workout

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(workout.date.formatted(.dateTime.weekday(.wide).day().month().hour().minute()))
                .font(.headline)
            ForEach(workout.entries) { e in
                Text("\(e.name): \(e.sets) × \(e.reps) @ \(e.weight.kg) kg")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .accessibilityIdentifier("workoutRow")
    }
}

struct WorkoutEditor: View {
    enum Mode: Identifiable {
        case new, copy(Workout), edit(Workout)
        var id: String {
            switch self {
            case .new: "new"
            case .copy(let w): "copy-\(w.id)"
            case .edit(let w): "edit-\(w.id)"
            }
        }
    }

    let mode: Mode
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var entries: [WorkoutEntry] = []
    @State private var date = Date()
    @State private var picking = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                if case .edit = mode {
                    DatePicker("When", selection: $date)
                }
                Section {
                    ForEach($entries) { $entry in EntryEditor(entry: $entry) }
                        .onDelete { entries.remove(atOffsets: $0) }
                    Button { picking = true } label: { Label("Add exercise", systemImage: "plus") }
                        .accessibilityIdentifier("addExercise")
                } header: {
                    Text("Exercises")
                } footer: {
                    if entries.isEmpty { Text("Add at least one exercise.") }
                }
                Section {
                    RestTimerBanner()
                    StartRestButton()
                } header: {
                    Text("Rest between sets")
                } footer: {
                    Text("Keeps counting if you leave the app. You'll get a notification when it's done.")
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(entries.isEmpty || saving)
                        .accessibilityIdentifier("saveWorkout")
                }
            }
            .sheet(isPresented: $picking) {
                ExercisePicker(exclude: Set(entries.map(\.exerciseId))) { entries.append(WorkoutEntry(from: $0)) }
            }
            .onAppear(perform: load)
        }
    }

    private var title: String {
        switch mode { case .new: "Log workout"; case .copy: "Repeat workout"; case .edit: "Edit workout" }
    }

    private func load() {
        guard entries.isEmpty else { return }
        switch mode {
        case .new: break
        case .copy(let w): entries = w.entries
        case .edit(let w): entries = w.entries; date = w.date
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let ok = await model.change(.workouts) {
            switch mode {
            case .new, .copy: try await model.store.addWorkout(entries: entries)
            case .edit(var w):
                w.date = date
                w.entries = entries
                try await model.store.updateWorkout(w)
            }
        }
        if ok { dismiss() }
    }
}

struct EntryEditor: View {
    @Binding var entry: WorkoutEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(entry.name).font(.headline)
            Stepper("Sets: \(entry.sets)", value: $entry.sets, in: Limits.sets)
            Stepper("Reps: \(entry.reps)", value: $entry.reps, in: Limits.reps)
            Stepper(value: $entry.weight, in: Limits.weight, step: 2.5) {
                HStack {
                    Text("Weight")
                    TextField("kg", value: $entry.weight, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 70)
                    Text("kg").foregroundStyle(.secondary)
                }
            }
            .onChange(of: entry.weight) { _, w in
                if !Limits.weight.contains(w) { entry = Limits.clamp(entry) }
            }
        }
        .padding(.vertical, 4)
    }
}

struct ExercisePicker: View {
    let exclude: Set<UUID>
    let onPick: (Exercise) -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    var body: some View {
        NavigationStack {
            List(Library.filter(model.exercises.filter { !exclude.contains($0.id) }, search: search, categories: [])) { ex in
                Button {
                    onPick(ex)
                    dismiss()
                } label: {
                    VStack(alignment: .leading) {
                        Text(ex.name)
                        Text("\(ex.sets) × \(ex.reps) @ \(ex.weight.kg) kg").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search exercises")
            .navigationTitle("Add exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
