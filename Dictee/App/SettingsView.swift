import SwiftUI

struct SettingsView: View {
    @State private var apiKey = Settings.apiKey
    @State private var model = Settings.claudeModel
    @State private var cleanup = Settings.cleanupEnabled
    @State private var language = Settings.language
    @State private var whisper = Settings.whisperModel
    @State private var status = ""
    @State private var downloading = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Transcription (locale)") {
                    Picker("Langue", selection: $language) {
                        Text("Français").tag("fr"); Text("English").tag("en"); Text("Auto").tag("auto")
                    }
                    Picker("Modèle", selection: $whisper) {
                        Text("Large v3 turbo (632 Mo, recommandé)").tag("openai_whisper-large-v3-v20240930_turbo_632MB")
                        Text("Small (216 Mo, plus léger)").tag("openai_whisper-small_216MB")
                    }
                    Button(downloading ? "Téléchargement…" : "Télécharger / préparer le modèle") {
                        Settings.whisperModel = whisper
                        downloading = true; status = ""
                        Task {
                            do { _ = try await DictationEngine.loadWhisper(); status = "Modèle prêt ✅" }
                            catch { status = "Erreur : \(error.localizedDescription)" }
                            downloading = false
                        }
                    }.disabled(downloading)
                    if !status.isEmpty { Text(status).font(.footnote) }
                }
                Section("Nettoyage par Claude") {
                    Toggle("Activer", isOn: $cleanup)
                    SecureField("Clé API Anthropic (sk-ant-…)", text: $apiKey)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Modèle", text: $model)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                }
                Section("Raccourci") {
                    Text("Réglages iPhone › Bouton Action › Raccourci › choisis « Dicter (démarrer / arrêter) ». 1er appui = démarre, 2e = arrête et copie le texte.")
                        .font(.footnote)
                }
            }
            .navigationTitle("Réglages")
            .onChange(of: apiKey) { _, v in Settings.apiKey = v }
            .onChange(of: model) { _, v in Settings.claudeModel = v }
            .onChange(of: cleanup) { _, v in Settings.cleanupEnabled = v }
            .onChange(of: language) { _, v in Settings.language = v }
            .onChange(of: whisper) { _, v in Settings.whisperModel = v }
        }
    }
}
