import UIKit
import LiveKit
import SwiftUI

struct CoachView: View {
    @Environment(VoiceCoach.self) private var coach
    @AppStorage(VoiceCoachSetting.key) private var voiceCoachOn = false

    var body: some View {
        Group {
            if let session = coach.session {
                LiveCoach(session: session)
            } else if voiceCoachOn {
                idle
            } else {
                ConnectorGuide()
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
            RestTimerBanner()
            Button {
                Task { await coach.start() }
            } label: {
                Label(coach.isStarting ? "Connecting…" : "Start talking", systemImage: "mic.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            .disabled(coach.isStarting)
            .accessibilityIdentifier("startCoach")
            Text("Gym asks for the microphone when you start, so the coach can hear you.")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            if let error = coach.error {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
                    .accessibilityIdentifier("coachError")
            }
        }
        .padding(24)
    }
}

/// The default Coach tab: how to use the gym from your own Claude or ChatGPT
/// app, which includes their voice modes.
struct ConnectorGuide: View {
    @Environment(Auth.self) private var auth
    @State private var copied = false

    private var connectorURL: String { auth.config.serviceURL.appending(path: "api/mcp").absoluteString }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: "bubble.left.and.text.bubble.right.fill")
                        .font(.system(size: 44)).foregroundStyle(.tint)
                    Text("Coach in Claude or ChatGPT").font(.title2.bold())
                    Text("Add Gym to the Claude or ChatGPT app you already use. Then ask about your training, log sets, or talk it through in voice mode.")
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
            }

            Section {
                Text(connectorURL)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
                    .accessibilityIdentifier("connectorURL")
                Button {
                    UIPasteboard.general.string = connectorURL
                    copied = true
                    Task { try? await Task.sleep(for: .seconds(2)); copied = false }
                } label: {
                    Label(copied ? "Copied" : "Copy link", systemImage: copied ? "checkmark" : "doc.on.doc")
                }
                .accessibilityIdentifier("copyConnectorURL")
            } header: {
                Text("Connector link")
            }

            Section("In Claude") {
                Step(n: 1, text: "On claude.ai or the Claude desktop app, open Settings, then Connectors.")
                Step(n: 2, text: "Choose Add custom connector, name it Gym and paste the link.")
                Step(n: 3, text: "Sign in to Gym and tap Allow.")
                Step(n: 4, text: "It now works in the Claude iPhone app too, including voice mode.")
            }

            Section("In ChatGPT") {
                Step(n: 1, text: "In ChatGPT settings, open Apps and Connectors, then Advanced, and turn on Developer mode.")
                Step(n: 2, text: "Create a connector, name it Gym and paste the link.")
                Step(n: 3, text: "Sign in to Gym and tap Allow.")
            }

            Section("Try asking") {
                Label("\u{201C}What did I do last Monday?\u{201D}", systemImage: "calendar")
                Label("\u{201C}Log bench, 3 sets of 8 at 80.\u{201D}", systemImage: "square.and.pencil")
                Label("\u{201C}How many leg sets this week?\u{201D}", systemImage: "chart.bar")
            }
            .font(.callout)

            Section {
                Text("To stop an app reading your workouts, revoke it in Settings under Connected apps. Prefer to talk in this app? Turn on Voice coach in the app in Settings.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("connectorGuide")
    }
}

private struct Step: View {
    let n: Int
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(n)").font(.callout.bold()).foregroundStyle(.white)
                .frame(width: 24, height: 24).background(Color.accentColor, in: Circle())
            Text(text)
        }
        .accessibilityElement(children: .combine)
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

            RestTimerBanner().padding(.horizontal)

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
