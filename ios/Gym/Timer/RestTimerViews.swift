import GymCore
import SwiftUI

/// The countdown for the shared rest timer. Shows nothing when no rest is running.
struct RestTimerBanner: View {
    @State private var timer = RestTimerEngine.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if let state = timer.state {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let left = state.secondsLeft(at: context.date)
                    HStack(spacing: 12) {
                        Gauge(value: state.progress(at: context.date)) { EmptyView() }
                            .gaugeStyle(.accessoryCircularCapacity)
                            .tint(left == 0 ? .green : .accentColor)
                            .scaleEffect(0.6)
                            .frame(width: 32, height: 32)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(left > 0 ? "Rest" : "Rest done").font(.caption).foregroundStyle(.secondary)
                            Text(left > 0 ? RestTimer.format(seconds: left) : "Next set")
                                .font(.title2.bold()).monospacedDigit()
                                .accessibilityIdentifier("restTimerCountdown")
                        }
                        Spacer()
                        if left > 0 {
                            Button("+30s") { Task { await timer.add(seconds: 30) } }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("restTimerAdd")
                        }
                        Button(left > 0 ? "Skip" : "Done") { Task { await timer.cancel() } }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("restTimerSkip")
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("restTimer")
                }
            }
        }
        .onAppear { timer.refresh() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { timer.refresh() } }
    }
}

/// "Rest 1:30", plus other lengths.
struct StartRestButton: View {
    @State private var timer = RestTimerEngine.shared

    var body: some View {
        HStack {
            Button { start(RestTimer.defaultSeconds) } label: {
                Label("Rest \(RestTimer.format(seconds: RestTimer.defaultSeconds))", systemImage: "timer")
            }
            .buttonStyle(.borderless)
            .accessibilityIdentifier("startRest")
            Spacer()
            Menu {
                ForEach(presets, id: \.self) { seconds in
                    Button(RestTimer.format(seconds: seconds)) { start(seconds) }
                        .accessibilityIdentifier("rest\(seconds)")
                }
            } label: {
                Text("Other length")
            }
            .menuStyle(.button)
            .buttonStyle(.borderless)
            .accessibilityIdentifier("restLengths")
        }
    }

    /// UI tests add a short length with GYM_TEST_REST_SECONDS so they can
    /// wait for the notification.
    private var presets: [Int] {
        let extra = ProcessInfo.processInfo.environment["GYM_TEST_REST_SECONDS"].flatMap(Int.init)
        return (extra.map { [$0] } ?? []) + RestTimer.presets
    }

    private func start(_ seconds: Int) {
        Task { try? await timer.start(seconds: seconds) }
    }
}
