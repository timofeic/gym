import Foundation

/// Messages the voice coach sends to the app over LiveKit data packets.
/// See docs/native-architecture.md.
public enum CoachMessage: Equatable, Sendable {
    public enum DataKind: String, Sendable { case workouts, exercises, categories }
    case dataChanged(DataKind)
    case restTimer(seconds: Int)

    public static let dataChangedTopic = "gym.data-changed"
    public static let restTimerTopic = "gym.rest-timer"

    public static func parse(topic: String, payload: Data) -> CoachMessage? {
        guard let obj = (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any] else { return nil }
        switch topic {
        case dataChangedTopic:
            return (obj["kind"] as? String).flatMap(DataKind.init(rawValue:)).map(CoachMessage.dataChanged)
        case restTimerTopic:
            guard let s = (obj["seconds"] as? NSNumber)?.intValue, (1...3600).contains(s) else { return nil }
            return .restTimer(seconds: s)
        default:
            return nil
        }
    }
}
