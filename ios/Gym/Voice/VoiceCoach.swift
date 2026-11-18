import AVFAudio
import Foundation
import GymCore
import LiveKit

/// The in-app voice coach (opt-in, see `VoiceCoachSetting`). Gets a LiveKit pass from the gym service,
/// joins the room (which brings the "gym-coach" agent in), and listens for the
/// agent's data messages so the screens stay current.
@MainActor @Observable
final class VoiceCoach {
    private(set) var session: Session?
    private(set) var isStarting = false
    private(set) var micOn = true
    var error: String?
    var onMessage: (@MainActor (CoachMessage) -> Void)?

    private let service: GymService
    private let accessToken: String
    private var listener: DataListener?

    init(service: GymService, accessToken: String) {
        self.service = service
        self.accessToken = accessToken
    }

    func start() async {
        guard session == nil, !isStarting else { return }
        isStarting = true
        error = nil
        defer { isStarting = false }
        // The microphone is only asked for here, when the coach starts.
        guard await Self.microphoneAllowed() else {
            error = "Gym can't use the microphone. Turn it on in the Settings app under Gym, then try again."
            return
        }
        do {
            let pass = try await service.voicePass(accessToken: accessToken)
            guard let url = URL(string: pass.serverUrl) else {
                throw GymService.ServiceError(message: "The voice server address is wrong.")
            }
            let session = Session(tokenSource: LiteralTokenSource(
                serverURL: url, participantToken: pass.participantToken, roomName: pass.roomName))
            let listener = DataListener { [weak self] message in self?.handle(message) }
            session.room.add(delegate: listener)
            self.listener = listener
            self.session = session
            micOn = true
            await session.start()
            if let e = session.error { throw e }
        } catch {
            self.error = error.localizedDescription
            await end()
        }
    }

    func end() async {
        if let session { await session.end() }
        session = nil
        listener = nil
    }

    func toggleMic() async {
        guard let room = session?.room else { return }
        do {
            try await room.localParticipant.setMicrophone(enabled: !micOn)
            micOn.toggle()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func handle(_ message: CoachMessage) {
        if case .restTimer(let seconds) = message {
            // Same timer as the workout screen and Siri, so it keeps going
            // in the background and notifies when done.
            Task { try? await RestTimerEngine.shared.start(seconds: seconds) }
        }
        onMessage?(message)
    }

    private static func microphoneAllowed() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return true
        case .denied: return false
        default: return await AVAudioApplication.requestRecordPermission()
        }
    }
}

/// "Voice coach in the app" in Settings. Off by default: most people talk to
/// the gym through their own Claude or ChatGPT app instead.
enum VoiceCoachSetting {
    static let key = "voiceCoachEnabled"
}

/// Receives LiveKit data packets off the main thread and hands parsed
/// coach messages back on it.
private final class DataListener: NSObject, RoomDelegate, @unchecked Sendable {
    private let deliver: @MainActor (CoachMessage) -> Void

    init(deliver: @escaping @MainActor (CoachMessage) -> Void) {
        self.deliver = deliver
    }

    func room(_ room: Room, participant: RemoteParticipant?, didReceiveData data: Data, forTopic topic: String, encryptionType: EncryptionType) {
        guard let message = CoachMessage.parse(topic: topic, payload: data) else { return }
        let deliver = self.deliver
        Task { @MainActor in deliver(message) }
    }
}
