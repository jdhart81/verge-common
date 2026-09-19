import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import CoreTransferable

private struct EvidencePhotoTransfer: Transferable {
    let prepared: PreparedEvidenceFile
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            EvidencePhotoTransfer(prepared: try PreparedEvidenceFile.imageFile(received.file))
        }
    }
}

@MainActor final class EvidenceQueueStore: ObservableObject {
    @Published private(set) var items: [EvidenceItem] = []
    @Published private(set) var busy = false
    @Published var message: String?
    private var repository: EvidenceQueueRepository?
    init() { reload() }
    func reload() {
        guard !busy else { return }
        do {
            var directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("prepared-evidence", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            var values = URLResourceValues(); values.isExcludedFromBackup = true; try directory.setResourceValues(values)
            repository = try EvidenceQueueRepository(file: directory.appendingPathComponent("queue.json"))
            items = repository!.items; message = nil
        } catch { repository = nil; items = []; message = "The protected evidence queue could not be opened. It has not been replaced. Unlock this device and reload. \(error.localizedDescription)" }
    }
    private func ready() throws -> EvidenceQueueRepository { guard let repository else { throw EvidenceQueueError.invalid }; return repository }
    func save(_ item: EvidenceItem) throws { guard !busy else { throw EvidenceQueueError.pending }; let repo = try ready(); try repo.add(item); items = repo.items }
    func removeLocal(_ item: EvidenceItem, owner: String) {
        guard !busy else { return }
        do { let repo = try ready(); try repo.remove(item.id, owner: owner); items = repo.items; message = nil }
        catch { message = error.localizedDescription }
    }
    func eraseAllLocal() {
        guard !busy else { return }
        do { let repo = try ready(); try repo.eraseAllLocal(); items = repo.items; message = "Local prepared copies and receipts removed. This does not delete submitted co-op evidence or your selected originals." }
        catch { message = error.localizedDescription }
    }
    private func current(_ account: DeviceAccount, _ session: UUID) throws {
        guard account.connected, account.sessionID == session else { throw EvidenceQueueError.owner }
    }
    func send(_ id: UUID, account: DeviceAccount, discard: Bool = false) async {
        guard !busy else { return }; busy = true; message = nil
        defer { busy = false; items = repository?.items ?? [] }
        let session = account.sessionID
        do {
            let repo = try ready(), client = try account.evidenceClient()
            let user = try await client.identity(); try current(account, session)
            var item = try repo.item(id, owner: user.id)
            if discard {
                if item.phase == .prepared || item.phase == .expired { try repo.remove(id, owner: user.id); return }
                guard item.phase != .submitting && item.phase != .complete else { throw EvidenceQueueError.pending }
                item = try repo.update(id, owner: user.id) { $0.cancelRequested = true }
            }
            if item.phase == .prepared || item.phase == .uploading {
                item = try repo.beginUpload(id, owner: user.id)
                let asset: EvidenceAsset
                do { asset = try await client.upload(item) }
                catch WorkspaceError.conflict {
                    _ = try repo.update(id, owner: user.id) { $0.phase = .expired }
                    throw EvidenceQueueError.expired
                }
                item = try repo.uploaded(id, owner: user.id, asset: asset)
                try current(account, session)
            }
            if item.cancelRequested {
                guard item.phase == .uploaded || item.phase == .review || item.phase == .discarding, let asset = item.asset else { throw EvidenceQueueError.pending }
                item = try repo.update(id, owner: user.id) { $0.phase = .discarding }
                try current(account, session); try await client.discard(asset)
                try repo.remove(id, owner: user.id); message = "The unattached server upload and its local prepared copy were discarded. Your selected original file is unchanged."; return
            }
            guard item.phase != .review else { throw WorkspaceError.conflict }
            if item.phase == .complete { return }
            let earlierOutcomeUncertain = item.phase == .submitting
            item = try repo.beginSubmission(id, owner: user.id)
            try current(account, session)
            do {
                _ = try await account.client().submit(item.command())
                // Commit the server receipt and erase prepared bytes in one atomic update.
                // Even a concurrent sign-out retains this result under the original owner.
                try repo.complete(id, owner: user.id)
                message = "Submitted for steward review. The prepared copy was removed from this device; your selected original file is unchanged."
            } catch WorkspaceError.conflict {
                _ = try repo.update(id, owner: user.id) { $0.phase = .review }
                throw WorkspaceError.conflict
            } catch let error as WorkspaceError {
                switch error {
                case .unauthorized, .denied, .inactive, .rejected:
                    try repo.submissionRejected(id, owner: user.id, earlierOutcomeUncertain: earlierOutcomeUncertain)
                default: break
                }
                throw error
            }
        } catch { message = error.localizedDescription }
    }
    func renew(_ id: UUID, owner: String) {
        guard !busy else { return }
        do {
            let repo = try ready()
            _ = try repo.update(id, owner: owner) {
                guard $0.phase == .expired else { throw EvidenceQueueError.pending }
                $0.uploadID = UUID().uuidString.lowercased(); $0.requestID = UUID().uuidString.lowercased()
                $0.phase = .prepared; $0.cancelRequested = false; $0.asset = nil
            }
            items = repo.items; message = "A new attempt is prepared. Review its details and choose Send when ready."
        } catch { message = error.localizedDescription }
    }
    func review(_ id: UUID, account: DeviceAccount) async {
        guard !busy else { return }; busy = true; message = nil
        defer { busy = false; items = repository?.items ?? [] }
        let session = account.sessionID
        do {
            let client = try account.evidenceClient(), repo = try ready()
            let user = try await client.identity(); try current(account, session)
            let item = try repo.item(id, owner: user.id)
            guard item.phase == .review else { throw EvidenceQueueError.pending }
            let latest = try await account.client().detail(item.workspaceID); try current(account, session)
            guard latest.state.visibility != "archived", latest.state.projects.contains(where: { $0.id == item.projectID && $0.status != "cancelled" }) else { throw WorkspaceError.rejected("This project is no longer available for submission. You can discard its unattached file.") }
            _ = try repo.update(id, owner: user.id) { $0.version = latest.version; $0.phase = .uploaded }
            message = "Latest co-op access and project availability checked. Review the prepared details, then choose Send to confirm."
        } catch { message = error.localizedDescription }
    }
}

struct EvidenceComposer: View {
    @EnvironmentObject var account: DeviceAccount
    @EnvironmentObject var queue: EvidenceQueueStore
    @Environment(\.dismiss) private var dismiss
    let workspace: WorkspaceView
    let ownerID: String
    @State private var projectID = ""
    @State private var title = ""
    @State private var method = ""
    @State private var period = ""
    @State private var notes = ""
    @State private var prepared: PreparedEvidenceFile?
    @State private var photo: PhotosPickerItem?
    @State private var importing = false
    @State private var preparing = false
    @State private var message: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Destination") {
                    Text(workspace.state.name)
                    Picker("Project", selection: $projectID) {
                        Text("Choose a project").tag("")
                        ForEach(workspace.state.projects.filter { $0.status != "cancelled" }) { Text($0.name).tag($0.id) }
                    }
                    Text("Only this signed-in account can resume the prepared item. Nothing is sent when you save it.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Evidence details") {
                    TextField("Title", text: $title); TextField("Method", text: $method)
                    TextField("Period covered", text: $period)
                    TextField("Notes for the steward", text: $notes, axis: .vertical).lineLimit(3...8)
                    Text("Title up to 160 characters, method 200, period 80 and notes 2,000. All fields are required.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Choose an existing file") {
                    PhotosPicker("Choose a photo", selection: $photo, matching: .images, preferredItemEncoding: .current)
                    Button("Choose an image, PDF or text file") { importing = true }
                    Text("Photos become JPEGs with a maximum edge of 2,048 pixels; image metadata, including location, is removed. Files must finish under 4 MB. PDF and text contents are unchanged: check them for personal details before saving.").font(.caption).foregroundStyle(.secondary)
                    if preparing { ProgressView("Preparing private copy…") }
                    if let prepared {
                        if prepared.contentType.hasPrefix("image/"), let image = UIImage(data: prepared.bytes) {
                            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 220).accessibilityLabel("Prepared photo preview")
                        }
                        Text("\(prepared.filename) · \(ByteCountFormatter.string(fromByteCount: Int64(prepared.bytes.count), countStyle: .file))")
                        Text("Your selected original remains where you chose it. The app stores only this prepared copy.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let message { Text(message).foregroundStyle(.red) }
                Button("Save to private queue") { save() }.disabled(preparing || prepared == nil || projectID.isEmpty || queue.busy)
            }.disabled(preparing)
                .navigationTitle("Prepare evidence")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(preparing) } }
                .fileImporter(isPresented: $importing, allowedContentTypes: [.image, .pdf, .plainText]) { result in
                    do {
                        let url = try result.get(); let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
                        prepared = try PreparedEvidenceFile.read(url); message = nil
                    } catch { message = error.localizedDescription }
                }
                .onChange(of: photo) { _, chosen in
                    guard let chosen else { return }; preparing = true; message = nil
                    Task {
                        defer { preparing = false; photo = nil }
                        do {
                            guard let received = try await chosen.loadTransferable(type: EvidencePhotoTransfer.self) else { throw EvidenceQueueError.invalid }
                            prepared = received.prepared
                        } catch { message = error.localizedDescription }
                    }
                }
                .onChange(of: account.sessionID) { _, _ in dismiss() }
        }
    }
    private func save() {
        do {
            guard account.userID == ownerID, account.connected else { throw EvidenceQueueError.owner }
            guard let prepared, let project = workspace.state.projects.first(where: { $0.id == projectID }) else { throw EvidenceQueueError.invalid }
            try queue.save(EvidenceItem(ownerID: ownerID, workspace: workspace, project: project, title: title, method: method, period: period, notes: notes, filename: prepared.filename, contentType: prepared.contentType, bytes: prepared.bytes))
            dismiss()
        } catch { message = error.localizedDescription }
    }
}

struct EvidenceQueueView: View {
    @State private var confirmingErase = false
    @EnvironmentObject var account: DeviceAccount
    @EnvironmentObject var queue: EvidenceQueueStore
    var body: some View {
        List {
            Section {
                Text("Prepared copies are protected on this device and excluded from device backups. Nothing uploads in the background. Send only after checking the destination and contents.")
                Text("After a lost connection, Retry checks the same upload and submission. A changed co-op requires review. An unresolved submission must be retried before cancellation.").font(.caption).foregroundStyle(.secondary)
            }
            if let owner = account.userID {
                let visible = queue.items.filter { $0.ownerID == owner }
                if visible.isEmpty { Text("No prepared evidence for this account. Choose a co-op and tap Prepare a photo or evidence file.") }
                ForEach(visible) { item in
                    NavigationLink { EvidenceQueueDetail(id: item.id) } label: {
                        VStack(alignment: .leading) { Text(item.title); Text("\(item.workspaceName) · \(item.projectName)").font(.caption); Text(evidenceStatus(item)).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            } else { Text("Connect to verify your account before opening its private evidence queue."); Button("Verify account") { Task { await account.refresh() } } }
            if let message = queue.message { Text(message).foregroundStyle(.secondary) }
            Button("Reload protected queue") { queue.reload() }.disabled(queue.busy)
            Section("This device") {
                Button("Erase all local evidence copies and receipts", role: .destructive) { confirmingErase = true }.disabled(queue.busy)
                Text("Available after sign-out or account deletion. This removes every account’s prepared copies on this device. It does not send requests or erase online evidence.").font(.caption).foregroundStyle(.secondary)
            }
        }.navigationTitle("Evidence queue")
            .confirmationDialog("Erase all local evidence copies and receipts?", isPresented: $confirmingErase, titleVisibility: .visible) {
                Button("Erase all local copies", role: .destructive) { queue.eraseAllLocal() }
            } message: { Text("This cannot be undone. Unconfirmed retry records are lost. Submitted evidence remains in its co-op; unattached server uploads expire after 24 hours. Your selected original files remain unchanged.") }
    }
}
private func evidenceStatus(_ item: EvidenceItem) -> String {
    if item.cancelRequested { return "Cancellation needs confirmation" }
    switch item.phase {
    case .prepared: return "Saved locally · not sent"
    case .uploading: return "Upload outcome needs confirmation"
    case .uploaded: return "Uploaded · awaiting submission"
    case .submitting: return "Submission outcome needs confirmation"
    case .review: return "Co-op changed · review required"
    case .discarding: return "Discard outcome needs confirmation"
    case .complete: return "Submitted for steward review"
    case .expired: return "Upload attempt expired or rejected"
    }
}
struct EvidenceQueueDetail: View {
    @EnvironmentObject var account: DeviceAccount
    @EnvironmentObject var queue: EvidenceQueueStore
    @Environment(\.dismiss) private var dismiss
    let id: UUID
    @State private var confirmingDiscard = false
    @State private var confirmingRenewal = false
    var body: some View {
        Form {
            if let owner = account.userID, let item = queue.items.first(where: { $0.id == id && $0.ownerID == owner }) {
                Section("Review before sending") {
                    Text(item.workspaceName).font(.headline); Text(item.projectName)
                    Text(item.title); LabeledContent("Method", value: item.method); LabeledContent("Period", value: item.period); Text(item.notes)
                    if let bytes = item.bytes, item.contentType.hasPrefix("image/"), let image = UIImage(data: bytes) {
                        Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 260).accessibilityLabel("Prepared photo preview")
                    }
                    Text(item.filename).font(.caption); Text(evidenceStatus(item)).font(.headline)
                    Link("Review current co-op", destination: CommunityService.coopPage("workspace/", id: item.workspaceID))
                }
                if item.phase == .complete {
                    Section("Submission receipt") {
                        Text("Saved for steward review. This does not approve evidence or create carbon credits.")
                        Text("Request: \(item.requestID)").font(.caption).textSelection(.enabled)
                        if let asset = item.asset { Text("File: \(asset.id)").font(.caption).textSelection(.enabled) }
                        Button("Remove local receipt", role: .destructive) { confirmingDiscard = true }
                    }
                } else {
                    if item.phase == .expired {
                        Text("The server rejected this saved upload attempt. Review the co-op first. You can keep these exact prepared bytes and explicitly start a new attempt.").font(.caption)
                        Button("Prepare a new upload attempt") { confirmingRenewal = true }.disabled(queue.busy)
                    } else if item.phase == .review && !item.cancelRequested {
                        Button("Check latest co-op before confirming") { Task { await queue.review(id, account: account) } }.disabled(queue.busy)
                    } else {
                        Button(item.cancelRequested ? "Retry cancellation" : item.phase == .prepared ? "Send evidence for review" : "Retry the same request") { Task { await queue.send(id, account: account) } }.disabled(queue.busy)
                    }
                    Button(item.phase == .prepared || item.phase == .expired ? "Delete prepared copy" : "Cancel and discard unattached upload", role: .destructive) { confirmingDiscard = true }.disabled(queue.busy || item.phase == .submitting)
                    if item.phase == .submitting { Text("Retry first to confirm whether the evidence was attached. An attached file cannot be discarded here.").font(.caption) }
                }
                if queue.busy { ProgressView("Checking and saving…") }
                if let message = queue.message { Text(message).foregroundStyle(.secondary) }
            } else { Text("This item is unavailable for the current account.") }
        }.navigationTitle("Prepared evidence")
            .confirmationDialog("Remove this prepared copy?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                Button("Confirm removal", role: .destructive) {
                    guard let owner = account.userID, let item = queue.items.first(where: { $0.id == id && $0.ownerID == owner }) else { return }
                    if item.phase == .prepared || item.phase == .complete || item.phase == .expired { queue.removeLocal(item, owner: owner); if !queue.items.contains(where: { $0.id == id }) { dismiss() } }
                    else { Task { await queue.send(id, account: account, discard: true) } }
                }
            } message: { Text("Your selected original file remains unchanged. Submitted evidence remains in the co-op. Cancellation of a pending upload must be confirmed online.") }
            .confirmationDialog("Prepare a new upload attempt?", isPresented: $confirmingRenewal, titleVisibility: .visible) {
                Button("Prepare new attempt") { if let owner = account.userID { queue.renew(id, owner: owner) } }
            } message: { Text("Only use this after the previous attempt was rejected. The same prepared file will get a new retry identity. Nothing sends until you choose Send.") }
            .onChange(of: account.sessionID) { _, _ in dismiss() }
    }
}
