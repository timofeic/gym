import LiveKit
import SwiftUI

struct CoachView: View {
    @Environment(VoiceCoach.self) private var coach

    var body: some View {
        Group {
            if let session = coach.session {
                LiveCoach(session: session)
            } else {
                idle
            }
        }
        .navigationTitle("Coach")
    }

    private var idle: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "waveform.circle.fill").font(.system(size: 88)).foregroundStyle(.tint)
            Text("Talk to your coach").font(.title2.bold())
            VStack(alignment: .leading, spacing: 8) {
                Label("\u{201C}Bench, 3 sets of 8 at 80, then squats 5 by 5 at 100.\u{201D}", systemImage: "square.and.pencil")
                Label("\u{201C}What did I do last Monday?\u{201D}", systemImage: "calendar")
                Label("\u{201C}What should I bench today?\u{201D}", systemImage: "chart.line.uptrend.xyaxis")
                Label("\u{201C}Start a 2 minute rest.\u{201D}", systemImage: "timer")
            }
            .font(.callout).foregroundStyle(.secondary)
            Spacer()
            Button {
                Task { await coach.start() }
            } label: {
                Label(coach.isStarting ? "Connecting…" : "Start talking", systemImage: "mic.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            .disabled(coach.isStarting)
            .accessibilityIdentifier("startCoach")
            if let error = coach.error {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
                    .accessibilityIdentifier("coachError")
            }
        }
        .padding(24)
    }
}

private struct LiveCoach: View {
    @ObservedObject var session: Session
    @Environment(VoiceCoach.self) private var coach

    var body: some View {
        VStack(spacing: 16) {
            StatusOrb(state: session.agent.agentState, failed: session.agent.error != nil)
                .frame(height: 160)
                .padding(.top)

            Text(statusText).font(.headline).accessibilityIdentifier("coachStatus")

            if let ends = coach.restTimerEnds {
                RestTimer(ends: ends) { coach.cancelRestTimer() }
            }

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(session.messages) { message in
                            Bubble(message: message).id(message.id)
                        }
                    }
                    .padding(.horizontal)
                }
                .onChange(of: session.messages.count) {
                    if let last = session.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }

            HStack(spacing: 16) {
                Button { Task { await coach.toggleMic() } } label: {
                    Image(systemName: coach.micOn ? "mic.fill" : "mic.slash.fill").frame(width: 56, height: 56)
                }
                .buttonStyle(.bordered).clipShape(Circle())
                .accessibilityLabel(coach.micOn ? "Mute" : "Unmute")

                Button(role: .destructive) { Task { await coach.end() } } label: {
                    Label("End", systemImage: "phone.down.fill").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent).tint(.red)
                .accessibilityIdentifier("endCoach")
            }
            .padding([.horizontal, .bottom])
        }
    }

    private var statusText: String {
        if let error = session.agent.error { return error.localizedDescription }
        switch session.agent.agentState {
        case .listening: return coach.micOn ? "Listening" : "Muted"
        case .thinking: return "Thinking"
        case .speaking: return "Speaking"
        case .initializing, .idle, nil: return "Getting your coach…"
        }
    }
}

private struct StatusOrb: View {
    let state: AgentState?
    let failed: Bool

    var body: some View {
        TimelineView(.animation) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let pulse: Double = switch state {
            case .speaking: 1 + 0.12 * sin(t * 8)
            case .thinking: 1 + 0.05 * sin(t * 3)
            case .listening: 1 + 0.03 * sin(t * 2)
            default: 1
            }
            Circle()
                .fill(color.gradient)
                .scaleEffect(pulse)
                .shadow(color: color.opacity(0.5), radius: 20)
                .frame(width: 120, height: 120)
        }
        .accessibilityHidden(true)
    }

    private var color: Color {
        if failed { return .red }
        switch state {
        case .speaking: return .accentColor
        case .thinking: return .purple
        case .listening: return .green
        default: return .gray
        }
    }
}

private struct Bubble: View {
    let message: ReceivedMessage

    var body: some View {
        switch message.content {
        case .agentTranscript(let text):
            Text(text).padding(10)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                .frame(maxWidth: .infinity, alignment: .leading)
        case .userTranscript(let text), .userInput(let text):
            Text(text).padding(10)
                .background(Color.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}

private struct RestTimer: View {
    let ends: Date
    let cancel: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(ends.timeIntervalSince(context.date).rounded(.up)))
            HStack {
                Image(systemName: "timer")
                Text(left > 0 ? "Rest \(left / 60):\(String(format: "%02d", left % 60))" : "Rest done")
                    .monospacedDigit().font(.title3.bold())
                Spacer()
                Button("Skip", action: cancel)
            }
            .padding()
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
            .accessibilityIdentifier("restTimer")
        }
    }
}
