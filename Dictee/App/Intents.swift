import AppIntents

/// À mettre sur le bouton Action : 1er appui = démarre, 2e appui = arrête et renvoie le texte.
/// `AudioRecordingIntent` (iOS 18) permet de démarrer le micro sans ouvrir l'app.
struct ToggleDictationIntent: AudioRecordingIntent {
    static var title: LocalizedStringResource = "Dicter (démarrer / arrêter)"
    static var description = IntentDescription("Démarre la dictée ; au 2e appel, arrête, transcrit, nettoie et copie le texte.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let engine = DictationEngine.shared
        if engine.isRecording {
            let text = await engine.stop()
            return .result(value: text)
        } else {
            try engine.start()
            return .result(value: "")
        }
    }
}

struct DicteeShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: ToggleDictationIntent(),
                    phrases: ["Dicter avec \(.applicationName)", "Démarrer \(.applicationName)"],
                    shortTitle: "Dicter", systemImageName: "mic.fill")
    }
}
