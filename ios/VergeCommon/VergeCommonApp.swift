import SwiftUI
import UniformTypeIdentifiers

@MainActor final class JournalStore: ObservableObject {
    @Published private(set) var drafts: [FieldDraft] = []
    @Published var error: String?
    private var writable = true
    private var file: URL?
    init() {
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            file = directory.appendingPathComponent("field-journal.json")
            if let file, FileManager.default.fileExists(atPath: file.path) { drafts = try JournalFile.read(Data(contentsOf: file)) }
        } catch { writable = false; self.error = "Your saved journal could not be opened. It has not been replaced. \(error.localizedDescription)" }
    }
    func save(_ draft: FieldDraft) throws {
        var next = drafts
        if let index = next.firstIndex(where: { $0.id == draft.id }) { next[index] = try draft.validated() }
        else { next.insert(try draft.validated(), at: 0) }
        try persist(next)
    }
    func remove(_ draft: FieldDraft) throws { try persist(drafts.filter { $0.id != draft.id }) }
    private func persist(_ next: [FieldDraft]) throws {
        guard writable, let file else { throw DraftError.unsupported }
        let data = try JournalFile(drafts: next).data()
        try data.write(to: file, options: [.atomic, .completeFileProtection])
        drafts = next
    }
}
struct DraftDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data = Data()) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
@main struct VergeCommonApp: App {
    @StateObject private var store = JournalStore()
    var body: some Scene { WindowGroup { JournalHome().environmentObject(store).tint(Color(red: 0.09, green: 0.32, blue: 0.23)) } }
}
struct JournalHome: View {
    @EnvironmentObject var store: JournalStore
    @State private var editor: FieldDraft?
    @State private var removing: FieldDraft?
    @State private var export = DraftDocument()
    @State private var exporting = false
    var body: some View {
        TabView {
            NavigationStack {
                List {
                    Section {
                        Text("Keep field observations on this device, even without a connection. Export a draft when you’re ready for your co-op to review it.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    if store.drafts.isEmpty {
                        ContentUnavailableView("Your first field visit", systemImage: "leaf", description: Text("Add a place, describe how you checked it, and record what you found."))
                    }
                    ForEach(store.drafts) { draft in
                        Button { editor = draft } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(draft.place).font(.headline).foregroundStyle(.primary)
                                Text(draft.date).font(.subheadline).foregroundStyle(.secondary)
                                Text(draft.finding).lineLimit(2).foregroundStyle(.secondary)
                                Text("Saved on this device • Not submitted").font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 5)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button("Delete", role: .destructive) { removing = draft }
                            Button("Export") {
                                do { export = DraftDocument(data: try FieldExport(draft).data()); exporting = true }
                                catch { store.error = error.localizedDescription }
                            }.tint(.blue)
                        }
                    }
                }
                .navigationTitle("Field journal")
                .toolbar { Button { editor = FieldDraft(place: "", date: Self.today, method: "", finding: "") } label: { Label("Add observation", systemImage: "plus") } }
                .sheet(item: $editor) { draft in DraftEditor(draft: draft) }
                .fileExporter(isPresented: $exporting, document: export, contentType: .json, defaultFilename: "verge-field-draft") { result in
                    if case .failure(let error) = result { store.error = error.localizedDescription }
                }
                .confirmationDialog("Delete this local draft? Export a copy first if you need to keep it.", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
                    Button("Delete draft", role: .destructive) {
                        if let draft = removing { do { try store.remove(draft) } catch { store.error = error.localizedDescription } }
                        removing = nil
                    }
                }
            }.tabItem { Label("Journal", systemImage: "leaf") }
            NavigationStack {
                List {
                    Section("Your community") {
                        Link("Discover conservation co-ops", destination: URL(string: "https://verge-common-community.jdhart.chatgpt.site/network/")!)
                        Link("Open my co-op workspace", destination: URL(string: "https://verge-common-community.jdhart.chatgpt.site/workspace/")!)
                        Text("Opens your browser. Sign-in and the site’s access rules apply. The hosted pilot currently has restricted access.").font(.subheadline).foregroundStyle(.secondary)
                    }
                    Section("Submit a field draft") {
                        Text("1. Swipe a journal entry and choose Export. Save the JSON file somewhere private.")
                        Text("2. Open your co-op’s Monitoring page in the browser and select the correct parcel.")
                        Text("3. Import the draft, check its details, then save the observation for steward review.")
                        Text("Exporting does not submit an observation or verify a conservation outcome.").foregroundStyle(.secondary)
                    }
                    Section("Your records") {
                        Text("Drafts stay in this app’s storage until you export or delete them. Your device backup settings may include this storage. Removing the app may remove its drafts. Exported copies are controlled by the destination you choose.")
                        Text("This version does not collect location, photographs, analytics or advertising identifiers. There is no automatic upload or sync.")
                        Link("Open-source project", destination: URL(string: "https://github.com/jdhart81/verge-common")!)
                    }
                }.navigationTitle("Community")
            }.tabItem { Label("Community", systemImage: "person.3") }
        }
        .alert("Journal", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) { Button("OK") { store.error = nil } } message: { Text(store.error ?? "") }
    }
    static var today: String { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date()) }
}
struct DraftEditor: View {
    @EnvironmentObject var store: JournalStore
    @Environment(\.dismiss) private var dismiss
    @State var draft: FieldDraft
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Place and date") {
                    TextField("Place name (up to 200 characters)", text: $draft.place)
                    TextField("Date: YYYY-MM-DD", text: $draft.date).keyboardType(.numbersAndPunctuation)
                }
                Section("How did you check?") { TextField("Method, sampling locations and units", text: $draft.method, axis: .vertical).lineLimit(3...8); Text("Up to 1,000 characters").font(.caption) }
                Section("What did you find?") { TextField("Findings, measurements and uncertainty", text: $draft.finding, axis: .vertical).lineLimit(5...12); Text("Up to 2,000 characters").font(.caption) }
                Section("Optional reference") { TextField("https://…", text: $draft.reference).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled() }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section { Text("Save keeps a draft on this device. A co-op steward must review any submitted observation.").font(.subheadline) }
            }.navigationTitle("Field observation")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Save") { do { try store.save(draft); dismiss() } catch { self.error = error.localizedDescription } } }
                }
                .interactiveDismissDisabled()
        }
    }
}
