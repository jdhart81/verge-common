import SwiftUI

@MainActor final class ReplyQueueStore: ObservableObject {
    @Published private(set) var items: [QueuedReply] = []
    @Published private(set) var busy = false
    @Published private(set) var message: String?
    @Published private(set) var inaccessibleWorkspaces: Set<String> = []
    private var repository: ReplyQueueRepository?
    private var verifiedSession: UUID?
    private var verifiedOwner: String?
    init() { reload() }
    func lock() { verifiedSession = nil; verifiedOwner = nil; items = []; message = nil }
    func confirmAccess(_ workspaceID: String) { inaccessibleWorkspaces.remove(workspaceID) }
    func accessFailure(_ error: Error, workspaceID: String) {
        if (error as? WorkspaceError)?.requiresAccessRefresh == true { inaccessibleWorkspaces.insert(workspaceID) }
    }
    func isVerified(_ account: DeviceAccount) -> Bool {
        account.connected && verifiedSession == account.sessionID && verifiedOwner == account.userID
    }
    func reload() {
        guard !busy else { return }; lock()
        do {
            var directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("member-replies", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            var values = URLResourceValues(); values.isExcludedFromBackup = true; try directory.setResourceValues(values)
            repository = try ReplyQueueRepository(file: directory.appendingPathComponent("queue.json"))
        } catch { repository = nil; message = "The protected reply queue could not be opened. It has not been replaced. Unlock this device and reload. \(error.localizedDescription)" }
    }
    private func ready() throws -> ReplyQueueRepository { guard let repository else { throw ReplyQueueError.invalid }; return repository }
    private func current(_ account: DeviceAccount, session: UUID) throws {
        guard account.connected, session == account.sessionID else { throw ReplyQueueError.owner }
    }
    private func verify(_ account: DeviceAccount, session: UUID) async throws -> String {
        let user = try await account.evidenceClient().identity()
        try current(account, session: session)
        guard account.userID == user.id else { throw ReplyQueueError.owner }
        return user.id
    }
    private func publish(_ repo: ReplyQueueRepository, owner: String, session: UUID, account: DeviceAccount) throws {
        try current(account, session: session)
        items = try repo.replies(owner: owner); verifiedOwner = owner; verifiedSession = session
    }
    func open(account: DeviceAccount) async {
        guard !busy else { return }; busy = true; message = nil
        let session = account.sessionID
        defer { busy = false }
        do { let owner = try await verify(account, session: session); try publish(ready(), owner: owner, session: session, account: account) }
        catch { lock(); if account.sessionID == session { message = error.localizedDescription } }
    }
    func send(workspace: WorkspaceView, updateID: String, text: String, pendingID: UUID?, account: DeviceAccount) async -> WorkspaceView? {
        guard !busy else { return nil }; busy = true; message = nil
        let session = account.sessionID
        var checkedOwner: String?
        defer { busy = false }
        do {
            let repo = try ready(), owner = try await verify(account, session: session)
            checkedOwner = owner
            var item: QueuedReply
            if let pendingID {
                item = try repo.item(pendingID, owner: owner)
                guard item.workspaceID == workspace.state.id, item.updateID == updateID else { throw ReplyQueueError.invalid }
                if item.phase == .rejected { item = try repo.replaceRejected(item.id, owner: owner, text: text, workspace: workspace) }
            } else {
                item = try QueuedReply(ownerID: owner, updateID: updateID, text: text, workspace: workspace)
                try repo.save(item, owner: owner)
            }
            let earlierOutcomeUncertain = item.phase == .submitting
            item = try repo.begin(item.id, owner: owner)
            try current(account, session: session)
            do {
                let updated = try await account.client().submit(item.command())
                // A confirmed receipt is saved under the original owner even
                // if sign-out occurs while the server response is in flight.
                do {
                    try repo.complete(item.id, owner: owner)
                    try publish(repo, owner: owner, session: session, account: account)
                    message = "Reply saved for co-op members. The local reply text was removed; its receipt remains."
                } catch {
                    lock()
                    if account.sessionID == session {
                        message = "Your reply was confirmed online, but its local receipt needs reconciliation. Reload the protected queue before continuing. Do not compose the same reply again."
                    }
                }
                try current(account, session: session)
                return updated
            } catch WorkspaceError.conflict {
                try repo.requireReview(item.id, owner: owner)
                throw WorkspaceError.conflict
            } catch let error as WorkspaceError {
                if case .rejected = error { try repo.rejectSubmission(item.id, owner: owner, earlierOutcomeUncertain: earlierOutcomeUncertain) }
                throw error
            }
        } catch {
            // Denied and failed retries never clear a possibly accepted reply.
            if account.sessionID == session {
                accessFailure(error, workspaceID: workspace.state.id)
                if let repo = repository, let owner = checkedOwner {
                    do { try publish(repo, owner: owner, session: session, account: account) } catch { lock() }
                } else { lock() }
                message = error.localizedDescription
            } else { lock() }
            return nil
        }
    }
    func review(_ item: QueuedReply, account: DeviceAccount) async -> WorkspaceView? {
        guard !busy else { return nil }; busy = true; message = nil
        let session = account.sessionID
        defer { busy = false }
        do {
            let repo = try ready(), owner = try await verify(account, session: session)
            _ = try repo.item(item.id, owner: owner)
            let latest = try await account.client().detail(item.workspaceID); try current(account, session: session)
            try repo.review(item.id, owner: owner, workspace: latest)
            try publish(repo, owner: owner, session: session, account: account)
            message = "Discussion refreshed. Review your reply, then choose Send again."
            return latest
        } catch {
            lock()
            if account.sessionID == session { accessFailure(error, workspaceID: item.workspaceID); message = error.localizedDescription }
            return nil
        }
    }
    func removeReceipt(_ item: QueuedReply, account: DeviceAccount) {
        guard !busy, isVerified(account), let owner = verifiedOwner else { return }
        do { let repo = try ready(); try repo.removeReceipt(item.id, owner: owner); items = try repo.replies(owner: owner); message = nil }
        catch { lock(); message = error.localizedDescription }
    }
    func eraseAllLocal() {
        guard !busy else { return }
        do { try ready().eraseAllLocal(); lock(); message = "Local replies and receipts removed. Nothing online was deleted." }
        catch { lock(); message = error.localizedDescription }
    }
}

struct MemberDiscussion: View {
    @EnvironmentObject var account: DeviceAccount
    @EnvironmentObject var queue: ReplyQueueStore
    let workspaceID: String
    let updateID: String
    var saved: (WorkspaceView) -> Void = { _ in }
    var accessLost: () -> Void = {}
    @State private var workspace: WorkspaceView?
    @State private var text = ""
    @State private var loading = false
    @State private var message: String?
    @State private var reporting: MemberSafetyAction?
    private var update: MemberUpdate? { workspace?.state.visibleUpdates.first { $0.id == updateID } }
    private var pending: QueuedReply? {
        guard queue.isVerified(account) else { return nil }
        return queue.items.first { $0.workspaceID == workspaceID && $0.updateID == updateID && $0.phase != .complete }
    }
    var body: some View {
        List {
            if loading { ProgressView("Refreshing discussion…") }
            if let message { Text(message).foregroundStyle(.red) }
            if let workspace, account.connected, !queue.inaccessibleWorkspaces.contains(workspaceID), let update {
                Section("Member discussion") {
                    Text(update.text)
                    Text(update.author).font(.caption).foregroundStyle(.secondary)
                    Text("Replies are shared with co-op members. Refresh to check for new replies.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Replies") {
                    let comments = workspace.state.visibleComments(for: updateID)
                    if comments.isEmpty { Text("No replies to show yet.").foregroundStyle(.secondary) }
                    ForEach(comments) { comment in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(comment.text)
                            Text(comment.isYou == true ? "\(comment.author) · You" : comment.author).font(.caption).foregroundStyle(.secondary)
                            Text(Date(timeIntervalSince1970: comment.createdAt / 1000), style: .date).font(.caption).foregroundStyle(.secondary)
                            Button("Report reply") { reporting = MemberSafetyAction(targetId: comment.id, name: comment.author, isReport: true, reportKind: "comment") }
                                .buttonStyle(.borderless).accessibilityLabel("Report reply by \(comment.author)")
                        }
                    }
                }
                if let pending {
                    Section("Your saved reply") {
                        if pending.phase == .rejected {
                            TextField("Correct your reply", text: $text, axis: .vertical).lineLimit(3...10).disabled(queue.busy)
                            Text("The first attempt was explicitly rejected. Edit this reply, then send a new request. Other saved replies and receipts remain intact.").font(.caption).foregroundStyle(.secondary)
                        } else {
                            Text(pending.text ?? "")
                            Text("Saved privately on this device. A lost response may mean it is already posted. Retry preserves the original request and will not intentionally create another reply.").font(.caption).foregroundStyle(.secondary)
                        }
                        if pending.phase == .review {
                            Button("Refresh before confirming again") { Task { if let latest = await queue.review(pending, account: account) { self.workspace = latest; saved(latest) } } }.disabled(queue.busy || loading)
                        } else {
                            Button(pending.phase == .rejected ? "Send corrected reply" : pending.phase == .prepared ? "Send saved reply" : "Retry the same reply") { Task { await send(workspace, pending: pending) } }
                                .disabled(queue.busy || loading || (pending.phase == .rejected && (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.utf16.count > 2000)))
                        }
                    }
                } else if workspace.canParticipate {
                    Section("Reply to members") {
                        TextField("Your reply", text: $text, axis: .vertical).lineLimit(3...10)
                        Text("Up to 2,000 characters. Keep private addresses, credentials and land documents in their dedicated forms.").font(.caption).foregroundStyle(.secondary)
                        Button("Send reply") { Task { await send(workspace, pending: nil) } }
                            .disabled(queue.busy || loading || !queue.isVerified(account) || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.utf16.count > 2000)
                    }
                }
            } else if !loading {
                Text("This discussion is unavailable. Refresh to check your access. Hidden or blocked discussions are not shown.").foregroundStyle(.secondary)
                if pending != nil { Text("Your pending reply is preserved. If this discussion becomes available again, retry it to check the original result.").font(.caption) }
            }
            if queue.busy { ProgressView("Checking saved reply…") }
            if let message = queue.message { Text(message).foregroundStyle(.secondary) }
            if !queue.isVerified(account) {
                Button("Reload protected reply queue") { queue.reload(); Task { await queue.open(account: account) } }.disabled(queue.busy || loading)
            }
            Button("Refresh discussion") { Task { await refresh() } }.disabled(loading || queue.busy)
            NavigationLink("Saved replies and receipts") { ReplyQueueView() }
        }
        .navigationTitle("Discussion")
        .task(id: account.sessionID) {
            workspace = nil; text = ""; await refresh(); await queue.open(account: account)
            if pending?.phase == .rejected { text = pending?.text ?? "" }
        }
        .onChange(of: queue.inaccessibleWorkspaces.contains(workspaceID)) { _, denied in
            if denied { workspace = nil; reporting = nil; message = "Your current access could not be confirmed. Refresh the discussion before continuing."; accessLost() }
        }
        .refreshable { await refresh() }
        .sheet(item: $reporting) { action in
            if let workspace, !queue.inaccessibleWorkspaces.contains(workspaceID) { MemberSafetyForm(workspace: workspace, action: action) { self.workspace = $0; saved($0) } }
        }
    }
    private func refresh() async {
        guard !loading, !queue.busy else { return }; loading = true; message = nil
        let session = account.sessionID
        defer { loading = false }
        do {
            let latest = try await account.client().detail(workspaceID)
            guard account.connected, account.sessionID == session, latest.state.id == workspaceID else { return }
            queue.confirmAccess(workspaceID); workspace = latest; saved(latest)
        } catch {
            guard account.sessionID == session else { return }
            workspace = nil; reporting = nil; queue.accessFailure(error, workspaceID: workspaceID); message = error.localizedDescription
        }
    }
    private func send(_ workspace: WorkspaceView, pending: QueuedReply?) async {
        let session = account.sessionID
        let result = await queue.send(workspace: workspace, updateID: updateID, text: text, pendingID: pending?.id, account: account)
        guard account.connected, account.sessionID == session else { return }
        if let updated = result {
            self.workspace = updated; text = ""; saved(updated)
        } else if self.pending?.phase == .rejected {
            text = self.pending?.text ?? ""
        }
    }
}

struct ReplyQueueView: View {
    @EnvironmentObject var account: DeviceAccount
    @EnvironmentObject var queue: ReplyQueueStore
    @State private var confirmingErase = false
    var body: some View {
        List {
            Section {
                Text("Replies are saved privately before sending, with their original retry identity. Nothing sends in the background. Saved text is removed after a confirmed reply; receipts are kept until you remove them.")
                Text("This queue is excluded from device backups and journal exports. Verify your account online to see its replies.").font(.caption).foregroundStyle(.secondary)
            }
            if queue.busy { ProgressView("Checking access…") }
            if let message = queue.message { Text(message).foregroundStyle(.secondary) }
            if queue.isVerified(account) {
                if queue.items.isEmpty { Text("No saved replies or receipts.").foregroundStyle(.secondary) }
                ForEach(queue.items) { item in
                    Section {
                        Text(account.workspaces.first { $0.id == item.workspaceID }?.name ?? "Co-op no longer listed").font(.headline)
                        if item.phase == .complete {
                            Text("Reply confirmed")
                            if let at = item.completedAt { Text(at, style: .date).font(.caption) }
                            Button("Remove local receipt", role: .destructive) { queue.removeReceipt(item, account: account) }.disabled(queue.busy)
                        } else {
                            Text(item.text ?? "").lineLimit(3)
                            Text(item.phase == .submitting ? "Awaiting confirmation" : item.phase == .review ? "Discussion changed; review required" : item.phase == .rejected ? "Reply rejected; correction available" : "Ready for explicit send").font(.caption).foregroundStyle(.secondary)
                            NavigationLink("Open discussion and resume reply") { MemberDiscussion(workspaceID: item.workspaceID, updateID: item.updateID) }
                        }
                    }
                }
            }
            if account.connected { Button("Verify account and refresh replies") { Task { await queue.open(account: account) } }.disabled(queue.busy) }
            Button("Reload protected reply queue") { queue.reload(); if account.connected { Task { await queue.open(account: account) } } }.disabled(queue.busy)
            Section("Remove local copies") {
                Button("Erase all local replies and receipts", role: .destructive) { confirmingErase = true }.disabled(queue.busy)
                Text("Works after sign-out or account deletion. It removes every account’s local replies and retry information on this device, without deleting posted replies.").font(.caption).foregroundStyle(.secondary)
            }
        }.navigationTitle("Saved replies")
            .task(id: account.sessionID) { if account.connected { await queue.open(account: account) } }
            .alert("Erase all local replies and receipts?", isPresented: $confirmingErase) {
                Button("Erase local copies", role: .destructive) { queue.eraseAllLocal() }
                Button("Cancel", role: .cancel) {}
            } message: { Text("Unconfirmed replies may already be posted. Erasing their retry information can make a later new reply duplicate an earlier one. Nothing online will be deleted.") }
    }
}
