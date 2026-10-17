import SwiftData
import SwiftUI

struct HistoryView: View {
    @Environment(\.modelContext) private var ctx
    @Query(sort: \Entry.date, order: .reverse) private var entries: [Entry]
    @State private var search = ""
    @State private var testing = false

    private var filtered: [Entry] {
        search.isEmpty ? entries : entries.filter { $0.cleaned.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(filtered) { e in
                    NavigationLink {
                        DetailView(entry: e)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(e.date.formatted(date: .abbreviated, time: .standard))
                                .font(.caption).foregroundStyle(.secondary)
                            Text(e.cleaned).lineLimit(3)
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button { UIPasteboard.general.string = e.cleaned } label: { Label("Copier", systemImage: "doc.on.doc") }
                    }
                }
                .onDelete { idx in idx.map { filtered[$0] }.forEach(ctx.delete) }
            }
            .searchable(text: $search)
            .overlay { if entries.isEmpty { ContentUnavailableView("Aucune dictée", systemImage: "mic", description: Text("Appuie sur le bouton Action.")) } }
            .navigationTitle("Dictée")
            .toolbar {
                // Test dans l'app (sans raccourci)
                Button(testing ? "Arrêter" : "Tester", systemImage: testing ? "stop.circle.fill" : "mic.circle") {
                    Task {
                        if DictationEngine.shared.isRecording { _ = await DictationEngine.shared.stop(); testing = false }
                        else { try? DictationEngine.shared.start(); testing = true }
                    }
                }
            }
        }
    }
}

struct DetailView: View {
    let entry: Entry
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(entry.date.formatted(date: .complete, time: .standard)).font(.caption).foregroundStyle(.secondary)
                Text(entry.cleaned).textSelection(.enabled)
                Divider()
                Text("Transcription brute").font(.caption).foregroundStyle(.secondary)
                Text(entry.raw).font(.callout).foregroundStyle(.secondary).textSelection(.enabled)
            }.padding()
        }
        .toolbar { Button("Copier", systemImage: "doc.on.doc") { UIPasteboard.general.string = entry.cleaned } }
        .navigationBarTitleDisplayMode(.inline)
    }
}
