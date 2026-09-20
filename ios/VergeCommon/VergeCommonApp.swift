import SwiftUI
import UniformTypeIdentifiers

@MainActor final class JournalStore: ObservableObject {
    @Published private(set) var drafts: [FieldDraft] = []
    @Published var error: String?
    private var repository: JournalRepository?
    init() { reload() }
    func reload() {
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            repository = try JournalRepository(file: directory.appendingPathComponent("field-journal.json"))
            drafts = repository!.drafts; error = nil
        } catch {
            repository = nil
            self.error = "Your saved journal could not be opened. It has not been replaced. Unlock your device and try Reload journal. \(error.localizedDescription)"
        }
    }
    private func ready() throws -> JournalRepository {
        guard let repository else { throw DraftError.unsupported }; return repository
    }
    func save(_ draft: FieldDraft) throws { let repo = try ready(); try repo.save(draft); drafts = repo.drafts }
    func remove(_ draft: FieldDraft) throws { let repo = try ready(); try repo.remove(draft.id); drafts = repo.drafts }
    func removeAll() throws { let repo = try ready(); try repo.removeAll(); drafts = repo.drafts }
    func backup() throws -> Data { try ready().backup() }
    func restore(_ file: URL) throws -> Int {
        let repo = try ready()
        let count = try repo.merge(JournalRepository.readFile(file))
        drafts = repo.drafts
        return count
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
    @StateObject private var account = DeviceAccount()
    @StateObject private var evidence = EvidenceQueueStore()
    @StateObject private var replies = ReplyQueueStore()
    @StateObject private var safety = PublicSafetyStore()
    @StateObject private var receipts = SafetyReceiptStore()
    var body: some Scene { WindowGroup { JournalHome().environmentObject(store).environmentObject(account).environmentObject(safety).environmentObject(receipts).environmentObject(evidence).environmentObject(replies).tint(Color(red: 0.09, green: 0.32, blue: 0.23)).onChange(of: account.sessionID) { _, _ in replies.lock() } } }
}
struct JournalHome: View {
    @EnvironmentObject var store: JournalStore
    @State private var editor: FieldDraft?
    @State private var removing: FieldDraft?
    @State private var export = DraftDocument()
    @State private var exporting = false
    @State private var importing = false
    @State private var removingAll = false
    @State private var exportName = "verge-field-draft"
    @State private var reporting = false
    var body: some View {
        TabView {
            CommunityDiscovery().tabItem { Label("Discover", systemImage: "globe") }
            MyCoops().tabItem { Label("My co-ops", systemImage: "person.3") }
            NavigationStack {
                List {
                    Section {
                        Text("Keep field observations on this device, even without a connection. Submit a draft from My co-ops or export it for review when you’re ready.")
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
                                Text("Local draft • Check co-op for submission status").font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 5)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button("Delete", role: .destructive) { removing = draft }
                            Button("Export") {
                                do { export = DraftDocument(data: try FieldExport(draft).data()); exportName = "verge-field-draft"; exporting = true }
                                catch { store.error = error.localizedDescription }
                            }.tint(.blue)
                        }
                    }
                }
                .navigationTitle("Field journal")
                .toolbar { Button { editor = FieldDraft(place: "", date: Self.today, method: "", finding: "") } label: { Label("Add observation", systemImage: "plus") } }
                .sheet(item: $editor) { draft in DraftEditor(draft: draft) }
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
                        Link("Discover conservation co-ops", destination: CommunityService.page("network/"))
                        Link("Open my co-op workspace", destination: CommunityService.page("workspace/"))
                        Text("Opens your browser. Sign-in and the site’s access rules apply. Sign in from My co-ops to participate directly in the app.").font(.subheadline).foregroundStyle(.secondary)
                    }
                    Section("Submit a field draft") {
                        Text("In My co-ops, open a co-op and choose Submit a field journal draft. Select the draft and reviewed parcel, check the details, then explicitly submit for steward review.")
                        Text("You can also use the manual export workflow:").font(.subheadline)
                        Text("1. Swipe a journal entry and choose Export. Save the JSON file somewhere private.")
                        Text("2. Open your co-op’s Monitoring page in the browser and select the correct parcel.")
                        Text("3. Import the draft, check its details, then save the observation for steward review.")
                        Text("Exporting does not submit an observation or verify a conservation outcome.").foregroundStyle(.secondary)
                    }
                    Section("Journal backup") {
                        Button("Export all drafts") {
                            do { export = DraftDocument(data: try store.backup()); exportName = "verge-journal-backup"; exporting = true }
                            catch { store.error = error.localizedDescription }
                        }
                        Button("Import journal backup") { importing = true }
                        Button("Reload journal") { store.reload() }
                        Button("Delete all local drafts", role: .destructive) { removingAll = true }.disabled(store.drafts.isEmpty)
                        Text("Import adds missing notes and skips identical copies. Conflicting edits cancel the import. Store backups privately; they contain all your field notes.").font(.subheadline).foregroundStyle(.secondary)
                    }
                    Section("Your records") {
                        Text("Drafts stay in this app’s storage until you export or delete them. Your device backup settings may include this storage. Removing the app may remove its drafts. Exported copies are controlled by the destination you choose.")
                        Text("This version does not collect device location, photographs, analytics or advertising identifiers. It sends member posts, safety reports, block choices or selected draft details only when you confirm them. There is no automatic journal upload or sync.")
                        Link("Privacy and your records", destination: CommunityService.page("privacy/"))
                        Link("Support and safety", destination: CommunityService.page("support/"))
                        Button("Report a concern to the project operator") { reporting = true }
                        NavigationLink("Report receipts") { SafetyReportHistory() }
                        Link("Manage website account", destination: CommunityService.page("account"))
                        Link("Open-source project", destination: URL(string: "https://github.com/jdhart81/verge-common")!)
                    }
                }.navigationTitle("Support & tools")
            }.tabItem { Label("Support", systemImage: "gearshape") }
        }
                .fileExporter(isPresented: $exporting, document: export, contentType: .json, defaultFilename: exportName) { result in
                    if case .failure(let error) = result { store.error = error.localizedDescription }
                }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            do {
                let url = try result.get()
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                let count = try store.restore(url)
                store.error = "Imported \(count) new draft(s). Existing notes were preserved."
            } catch { store.error = error.localizedDescription }
        }
        .confirmationDialog("Delete all local drafts from this device? This cannot be undone. Export a backup first if you want to keep them.", isPresented: $removingAll, titleVisibility: .visible) {
            Button("Delete all local drafts", role: .destructive) {
                do { try store.removeAll() } catch { store.error = error.localizedDescription }
            }
        } message: { Text("This does not delete submitted co-op records, exported files or copies in device backups.") }
        .alert("Journal", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) { Button("OK") { store.error = nil } } message: { Text(store.error ?? "") }
        .sheet(isPresented: $reporting) { SafetyReportForm(kind: .general, coopId: nil, targetId: nil) }
    }
    static var today: String { FieldDraft.today() }
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
                    DatePicker("Observation date", selection: Binding(get: { draft.observationDay ?? Date() }, set: { draft.date = FieldDraft.dateFormatter(in: draft.observationTimeZone).string(from: $0) }), displayedComponents: .date)
                        .environment(\.timeZone, draft.observationTimeZone)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    Text("Time zone: \(draft.timeZone ?? "UTC (original draft)"). The date stays with this note when you travel.").font(.caption).foregroundStyle(.secondary)
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

@MainActor final class CommunityModel: ObservableObject {
    @Published private var results = CommunityResults()
    @Published var loading = false
    @Published var message: String?
    @Published var loaded = false
    private var query = ""
    private var generation = UUID()
    private var failedNextPage = false
    var coops: [PublicCoop] { results.coops }
    var hasMore: Bool { results.next != nil }
    func refresh(query: String? = nil) async {
        if let query, query != self.query {
            self.query = query; results = CommunityResults(); loaded = false
        }
        let generation = UUID(); self.generation = generation
        loading = true; message = nil
        failedNextPage = false
        defer { if self.generation == generation { loading = false } }
        do {
            let page = try await CommunityClient().recent(query: self.query)
            guard self.generation == generation, !Task.isCancelled else { return }
            results.replace(page); loaded = true
        }
        catch {
            guard self.generation == generation, !Task.isCancelled else { return }
            message = (error as? CommunityError)?.localizedDescription ?? "Couldn’t load communities. Check your connection and try again."
        }
    }
    func loadMore() async {
        guard !loading, let before = results.next else { return }
        let generation = self.generation
        loading = true; message = nil; failedNextPage = true
        defer { if self.generation == generation { loading = false } }
        do {
            let page = try await CommunityClient().recent(query: query, before: before, beforeId: results.nextId)
            guard self.generation == generation, !Task.isCancelled else { return }
            try results.append(page); failedNextPage = false
        } catch {
            guard self.generation == generation, !Task.isCancelled else { return }
            message = "Couldn’t load the next page. Your loaded communities are still available. Try again."
        }
    }
    func retry() async { if failedNextPage { await loadMore() } else { await refresh() } }
}
struct CommunityDiscovery: View {
    @EnvironmentObject var safety: PublicSafetyStore
    @StateObject private var model = CommunityModel()
    @State private var query = ""
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Find people caring for a place. Only information a co-op has made public appears here.").foregroundStyle(.secondary)
                    Link("Open my co-ops in the browser", destination: CommunityService.page("workspace/"))
                }
                Section {
                    NavigationLink("Hidden co-ops on this device") { HiddenCoopsView() }
                    if let error = safety.error { Text(error).foregroundStyle(.red); Button("Reload hidden co-ops") { safety.reload() } }
                }
                if model.loading { ProgressView("Loading communities…") }
                if let message = model.message {
                    Section("Unable to load communities") {
                        Text(message)
                        Button("Try again") { Task { await model.retry() } }.disabled(model.loading)
                        Link("Check access on the website", destination: CommunityService.page("network/"))
                    }
                }
                if model.loaded && model.coops.isEmpty {
                    ContentUnavailableView(model.hasMore ? "No matches in this portion" : query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "No public co-ops yet" : "No matching public co-ops", systemImage: "person.3", description: Text(model.hasMore ? "Load more communities to search the next part of the public directory, or try another name, region or conservation interest." : "Try a co-op name, region or conservation interest. Private co-ops are not listed; use their invitation to join."))
                }
                if model.loaded && !model.coops.isEmpty && PublicSafety.visible(model.coops, hidden: safety.hidden).isEmpty {
                    Text("The loaded co-ops are hidden on this device. Load more communities or open Hidden co-ops to show them again.").foregroundStyle(.secondary)
                }
                ForEach(PublicSafety.visible(model.coops, hidden: safety.hidden)) { coop in
                    NavigationLink {
                        CommunityDetail(coop: coop)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(coop.name).font(.headline)
                            Text(coop.region).font(.subheadline).foregroundStyle(.secondary)
                            Text(coop.summary).lineLimit(3)
                            Text("\(coop.memberCount) members · \(coop.projects.count) public projects").font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 6)
                    }
                }
                if model.loaded {
                    Section {
                        if model.hasMore { Button("Load more communities") { Task { await model.loadMore() } }.disabled(model.loading) }
                        Text("\(model.coops.count) matching public co-ops loaded, ordered by most recently updated. Search checks each portion as you load it. Details reflect the last refresh.").font(.subheadline).foregroundStyle(.secondary)
                        Link("Browse the full network", destination: CommunityService.page("network/")) }
                }
            }
            .navigationTitle("Discover")
            .searchable(text: $query, prompt: "Name, region or conservation interest")
            .refreshable { await model.refresh() }
            .task(id: query) {
                do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
                await model.refresh(query: query)
            }
        }
    }
}
struct CommunityDetail: View {
    @EnvironmentObject var safety: PublicSafetyStore
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingHide = false
    let coop: PublicCoop
    var body: some View {
        List {
            Section { Text(coop.summary); Text([coop.region, coop.country].filter { !$0.isEmpty }.joined(separator: " · ")).foregroundStyle(.secondary)
                Link("Join or participate on the website", destination: CommunityService.coopPage("network/", id: coop.id))
                Text("Join on the website, then sign in from My co-ops to post member updates and submit field observations. Membership, public publishing and RSVPs use the website’s sign-in and permissions.").font(.subheadline).foregroundStyle(.secondary) }
            Section("Public projects") {
                if coop.projects.isEmpty { Text("No public projects shared yet.").foregroundStyle(.secondary) }
                ForEach(coop.projects) { project in VStack(alignment: .leading) { Text(project.name).font(.headline); Text(project.summary); Text(project.status).font(.caption).foregroundStyle(.secondary); PublicReportLink(coopID: coop.id, kind: .project, itemID: project.id) } }
            }
            Section("Community updates") {
                if coop.updates.isEmpty { Text("No public updates shared yet.").foregroundStyle(.secondary) }
                ForEach(coop.updates.sorted { $0.createdAt > $1.createdAt }) { update in
                    VStack(alignment: .leading) { Text(update.text); Text(Date(timeIntervalSince1970: update.createdAt / 1000), style: .date).font(.caption).foregroundStyle(.secondary); PublicReportLink(coopID: coop.id, kind: .update, itemID: update.id) }
                }
            }
            Section("Events") {
                if coop.events.isEmpty { Text("No public events shared yet.").foregroundStyle(.secondary) }
                ForEach(coop.events.sorted { $0.startsAt < $1.startsAt }) { event in
                    VStack(alignment: .leading) { Text(event.title).font(.headline); Text(event.summary)
                        Text(Date(timeIntervalSince1970: event.startsAt / 1000), format: .dateTime).font(.subheadline)
                        Text("Time shown in your device’s time zone · \(event.status)").font(.caption).foregroundStyle(.secondary)
                        PublicReportLink(coopID: coop.id, kind: .event, itemID: event.id) }
                }
            }
            Section("Safety") {
                PublicReportLink(coopID: coop.id, kind: .coop, itemID: nil)
                Text("Reports go directly to the project operator after you describe the concern and confirm Send. Check their status from Support → Report receipts. For other help, contact \(PublicSafety.supportEmail).").font(.caption).foregroundStyle(.secondary)
                Button("Hide this co-op on this device") { confirmingHide = true }
                    .accessibilityHint("Removes this co-op from Discover. You can show it again from Hidden co-ops.")
                Text("Hiding affects Discover on this device only. It does not block an author or change a public website. Member blocking is available inside your co-op workspace.").font(.caption).foregroundStyle(.secondary)
                if let error = safety.error { Text(error).foregroundStyle(.red) }
                Link("Support and reporting help", destination: CommunityService.page("support/"))
            }
        }.navigationTitle(coop.name)
            .confirmationDialog("Hide this co-op from Discover on this device?", isPresented: $confirmingHide, titleVisibility: .visible) {
                Button("Hide co-op") { if safety.hide(coop) { dismiss() } }
            } message: { Text("This does not block members or remove you from a co-op. Show it again from Hidden co-ops whenever you choose.") }
    }
}
