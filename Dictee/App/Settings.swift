import Foundation
import Security

enum Settings {
    static let defaults = UserDefaults.standard

    /// Modèle WhisperKit (téléchargé une fois depuis l'app).
    static var whisperModel: String {
        get { defaults.string(forKey: "whisperModel") ?? "openai_whisper-large-v3-v20240930_turbo_632MB" }
        set { defaults.set(newValue, forKey: "whisperModel") }
    }
    /// "fr", "en"… ou "auto".
    static var language: String {
        get { defaults.string(forKey: "language") ?? "fr" }
        set { defaults.set(newValue, forKey: "language") }
    }
    static var claudeModel: String {
        get { defaults.string(forKey: "claudeModel") ?? "claude-haiku-5-5" }
        set { defaults.set(newValue, forKey: "claudeModel") }
    }
    static var cleanupEnabled: Bool {
        get { defaults.object(forKey: "cleanup") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "cleanup") }
    }

    // Clé API dans le Keychain
    static var apiKey: String {
        get {
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrAccount as String: "anthropic-api-key",
                                    kSecReturnData as String: true]
            var out: AnyObject?
            guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
                  let d = out as? Data else { return "" }
            return String(data: d, encoding: .utf8) ?? ""
        }
        set {
            let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                       kSecAttrAccount as String: "anthropic-api-key"]
            SecItemDelete(base as CFDictionary)
            guard !newValue.isEmpty else { return }
            var add = base
            add[kSecValueData as String] = Data(newValue.utf8)
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
        }
    }
}
