import SwiftData
import SwiftUI

@main
struct DicteeApp: App {
    var body: some Scene {
        WindowGroup {
            TabView {
                HistoryView().tabItem { Label("Historique", systemImage: "clock") }
                SettingsView().tabItem { Label("Réglages", systemImage: "gearshape") }
            }
        }
        .modelContainer(Store.container)
    }
}
