import ActivityKit
import Foundation

struct DictationAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var status: String
    }
    var startedAt: Date
}
