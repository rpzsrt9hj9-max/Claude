import ActivityKit
import AVFoundation
import Foundation
import SwiftData
import UIKit
import WhisperKit

/// Enregistre le micro en continu, transcrit par morceaux (~30 s, coupés sur un silence)
/// pendant que tu parles, donc l'arrêt est quasi instantané même après une longue dictée.
final class DictationEngine: @unchecked Sendable {
    static let shared = DictationEngine()

    private let lock = NSLock()
    private var samples: [Float] = []
    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?
    private let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!

    private(set) var isRecording = false
    private var startedAt = Date()
    private var activity: Activity<DictationAttributes>?
    private var whisperTask: Task<WhisperKit?, Never>?
    private var transcript: Task<String, Never> = Task { "" }
    private var speechDetected = false

    // MARK: Modèle

    static func loadWhisper() async throws -> WhisperKit {
        let cfg = WhisperKitConfig(model: Settings.whisperModel, verbose: false, prewarm: true, load: true, download: true)
        return try await WhisperKit(cfg)
    }

    // MARK: Start / Stop

    func start() throws {
        guard !isRecording else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)

        lock.lock(); samples = []; speechDetected = false; lock.unlock()
        transcript = Task { "" }
        whisperTask = Task { try? await Self.loadWhisper() }

        let input = engine.inputNode
        let fmt = input.outputFormat(forBus: 0)
        converter = AVAudioConverter(from: fmt, to: target)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: fmt) { [weak self] buf, _ in
            self?.consume(buf)
        }
        engine.prepare()
        try engine.start()

        isRecording = true
        startedAt = Date()
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] n in
            guard let self, self.isRecording,
                  let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
            try? AVAudioSession.sharedInstance().setActive(true)
            try? self.engine.start()
        }

        let attrs = DictationAttributes(startedAt: startedAt)
        activity = try? Activity.request(attributes: attrs,
                                         content: .init(state: .init(status: "Dictée en cours…"), staleDate: nil))
    }

    /// Arrête, finalise la transcription, nettoie via Claude, enregistre dans l'historique.
    func stop() async -> String {
        guard isRecording else { return "" }
        isRecording = false
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        let duration = Date().timeIntervalSince(startedAt)

        await activity?.update(.init(state: .init(status: "Transcription…"), staleDate: nil))

        lock.lock(); let tail = samples; samples = []; lock.unlock()
        schedule(chunk: tail)
        let raw = (await transcript.value).trimmingCharacters(in: .whitespacesAndNewlines)

        var cleaned = raw
        if Settings.cleanupEnabled, !raw.isEmpty {
            await activity?.update(.init(state: .init(status: "Nettoyage…"), staleDate: nil))
            if let c = try? await ClaudeCleaner.clean(raw) { cleaned = c }
        }

        if !cleaned.isEmpty {
            await MainActor.run {
                UIPasteboard.general.string = cleaned
                let ctx = ModelContext(Store.container)
                ctx.insert(Entry(duration: duration, raw: raw, cleaned: cleaned))
                try? ctx.save()
            }
        }
        await activity?.end(.init(state: .init(status: "Terminé"), staleDate: nil), dismissalPolicy: .immediate)
        activity = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        return cleaned
    }

    // MARK: Capture + découpage

    private func consume(_ buf: AVAudioPCMBuffer) {
        guard let converter else { return }
        let ratio = target.sampleRate / buf.format.sampleRate
        let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: cap) else { return }
        var fed = false
        converter.convert(to: out, error: nil) { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true; status.pointee = .haveData; return buf
        }
        guard let ch = out.floatChannelData?[0] else { return }
        let new = Array(UnsafeBufferPointer(start: ch, count: Int(out.frameLength)))

        lock.lock()
        samples.append(contentsOf: new)
        var chunk: [Float]?
        if samples.count >= 28 * 16000 {
            // coupe au point le plus silencieux des 6 dernières secondes
            let win = 3200, step = 1600
            var best = samples.count, bestE = Float.greatestFiniteMagnitude
            var i = samples.count - 6 * 16000
            while i + win <= samples.count {
                var e: Float = 0
                for j in i..<(i + win) { e += samples[j] * samples[j] }
                if e < bestE { bestE = e; best = i + win / 2 }
                i += step
            }
            chunk = Array(samples[0..<best])
            samples.removeFirst(best)
        }
        lock.unlock()
        if let chunk { schedule(chunk: chunk) }
    }

    private func schedule(chunk: [Float]) {
        let rms = sqrt(chunk.reduce(0) { $0 + $1 * $1 } / Float(max(chunk.count, 1)))
        guard chunk.count > 8000, rms > 0.002 else { return }  // ignore le silence (évite les hallucinations)
        let previous = transcript
        let whisper = whisperTask
        transcript = Task {
            let before = await previous.value
            guard let kit = await whisper?.value else { return before }
            let lang = Settings.language
            let opts = DecodingOptions(task: .transcribe,
                                       language: lang == "auto" ? nil : lang,
                                       temperature: 0,
                                       skipSpecialTokens: true,
                                       withoutTimestamps: true,
                                       detectLanguage: lang == "auto",
                                       chunkingStrategy: .vad)
            let res = (try? await kit.transcribe(audioArray: chunk, decodeOptions: opts)) ?? []
            let text = res.map(\.text).joined(separator: " ").trimmingCharacters(in: .whitespaces)
            return before.isEmpty ? text : before + " " + text
        }
    }
}
