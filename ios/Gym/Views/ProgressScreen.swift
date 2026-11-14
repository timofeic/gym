import Charts
import GymCore
import SwiftUI

struct ProgressScreen: View {
    @Environment(AppModel.self) private var model
    @State private var minWorkouts = 2
    @State private var search = ""
    @State private var categories: Set<String> = []

    private var items: [Stats.ExerciseProgress] {
        let needle = search.lowercased()
        return Stats.progress(model.history, minWorkouts: minWorkouts).filter {
            (needle.isEmpty || $0.name.lowercased().contains(needle)) &&
            (categories.isEmpty || !categories.isDisjoint(with: $0.categories))
        }
    }

    var body: some View {
        List {
            Section {
                Stepper("At least \(minWorkouts) workouts", value: $minWorkouts, in: 2...50)
                CategoryChips(categories: model.categories, selected: $categories)
            }
            if items.isEmpty {
                Text(model.history.isEmpty ? "Log a few workouts to see progress." : "No exercises match.")
                    .foregroundStyle(.secondary)
            }
            ForEach(items) { item in
                Section(item.name) {
                    Chart {
                        ForEach(item.points) { p in
                            LineMark(x: .value("Date", p.date), y: .value("Weight", p.weight))
                                .foregroundStyle(by: .value("Measure", "Weight (kg)"))
                                .symbol(.circle)
                            LineMark(x: .value("Date", p.date), y: .value("Reps", p.reps))
                                .foregroundStyle(by: .value("Measure", "Reps"))
                                .symbol(.square)
                        }
                    }
                    .chartLegend(position: .bottom)
                    .frame(height: 200)
                    .accessibilityIdentifier("progressChart")
                    if let last = item.points.last, let first = item.points.first {
                        Text("\(first.weight.kg) kg → \(last.weight.kg) kg over \(item.points.count) workouts")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .searchable(text: $search, prompt: "Search exercises")
        .navigationTitle("Progress")
        .refreshable { await model.reload(.workouts) }
    }
}
