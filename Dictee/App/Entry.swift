import Foundation
import SwiftData

@Model
final class Entry {
    var date: Date
    var duration: Double
    var raw: String
    var cleaned: String

    init(date: Date = .now, duration: Double, raw: String, cleaned: String) {
        self.date = date
        self.duration = duration
        self.raw = raw
        self.cleaned = cleaned
    }
}

enum Store {
    static let container: ModelContainer = {
        try! ModelContainer(for: Entry.self)
    }()
}
