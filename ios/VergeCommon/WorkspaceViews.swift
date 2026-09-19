import SwiftUI

@MainActor final class DeviceAccount: ObservableObject {
    @Published private(set) var connected = false
    @Published private(set) var workspaces: [WorkspaceSummary] = []
    @Published private(set) var loading = false
    @Published var message: String?
    @Published private(set) var pendingRecovery: NativeAccountSession?
    @Published private(set) var displayName: String?
    @Published private(set) var userID: String?
    @Published private(set) var accountDeleted = false
    private var token: String?
    private let tokenStore: DeviceTokenStore
    private var operationID: UUID?
    @Published private(set) var sessionID = UUID()
    init(tokenStore: DeviceTokenStore = KeychainDeviceTokenStore()) {
        self.tokenStore = tokenStore
        do { token = try tokenStore.load(); connected = token != nil }
        catch { message = error.localizedDescription }
    }
    func client() throws -> WorkspaceClient {
        guard let token else { throw WorkspaceError.unauthorized }
        return WorkspaceClient(token: token)
    }
    func evidenceClient() throws -> EvidenceClient {
        guard let token else { throw WorkspaceError.unauthorized }
        return EvidenceClient(token: token)
    }
    private func begin() -> UUID? {
        guard !loading else { return nil }
        let operation = UUID(); operationID = operation; loading = true; message = nil
        return operation
    }
    private func finish(_ operation: UUID) {
        if operationID == operation { operationID = nil; loading = false }
    }
    private func install(_ credential: String, name: String? = nil, userID: String? = nil, list: [WorkspaceSummary] = []) throws {
        try tokenStore.save(credential)
        token = credential; sessionID = UUID(); connected = true; workspaces = list
        displayName = name; self.userID = userID; pendingRecovery = nil; accountDeleted = false
    }
    func authenticate(_ action: NativeAccountAction, username: String, displayName: String, password: String, recoveryCode: String) async {
        guard !connected, pendingRecovery == nil, let operation = begin() else { return }
        defer { finish(operation) }
        do {
            let result = try await NativeAccountClient().authenticate(action, username: username, displayName: displayName, password: password, recoveryCode: recoveryCode)
            guard operationID == operation else { return }
            if result.recoveryCode != nil { pendingRecovery = result }
            else { try install(result.token, name: result.user.displayName, userID: result.user.id); finish(operation); await refresh() }
        } catch { if operationID == operation { message = error.localizedDescription } }
    }
    func confirmRecoverySaved() {
        guard !loading, let result = pendingRecovery else { return }
        do { try install(result.token, name: result.user.displayName, userID: result.user.id); message = nil }
        catch { message = error.localizedDescription }
    }
    func connect(_ input: String) async {
        guard !connected, pendingRecovery == nil, let operation = begin() else { return }
        defer { finish(operation) }
        do {
            let credential = try DeviceCredential.validate(input)
            let identity = try await EvidenceClient(token: credential).identity()
            let list = try await WorkspaceClient(token: credential).list()
            guard operationID == operation else { return }
            try install(credential, name: identity.displayName, userID: identity.id, list: list)
        } catch { if operationID == operation { message = error.localizedDescription } }
    }
    func refresh() async {
        guard connected, let operation = begin() else { return }
        let current = sessionID
        defer { finish(operation) }
        do {
            let identity = try await evidenceClient().identity()
            let list = try await client().list()
            guard operationID == operation, current == sessionID else { return }
            workspaces = list; userID = identity.id; displayName = identity.displayName
        } catch {
            guard operationID == operation, current == sessionID else { return }
            workspaces = []; message = error.localizedDescription
        }
    }
    func signOut() async {
        guard let token, let operation = begin() else { return }
        defer { finish(operation) }
        do {
            try await NativeAccountClient().logout(token: token)
            guard operationID == operation else { return }
            disconnect()
        } catch { if operationID == operation { message = "Sign-out was not confirmed. Retry when connected, or remove this device’s saved sign-in below. \(error.localizedDescription)" } }
    }
    func deleteAccount(password: String, confirmation: String) async -> Bool {
        guard let token, let operation = begin() else { return false }
        defer { finish(operation) }
        do {
            try await NativeAccountClient().delete(token: token, password: password, confirmation: confirmation)
            guard operationID == operation else { return false }
            disconnect(); accountDeleted = true
            return true
        } catch { if operationID == operation { message = error.localizedDescription }; return false }
    }
    func disconnect() {
        operationID = nil; loading = false; sessionID = UUID()
        token = nil; connected = false; workspaces = []; message = nil; pendingRecovery = nil; displayName = nil; userID = nil
        do { try tokenStore.remove() }
        catch { message = "This session is disconnected, but the saved sign-in could not be removed. Unlock the device, tap Remove saved sign-in again, and revoke device access on the website. Your local journal is preserved." }
    }
}

struct MyCoops: View {
    @EnvironmentObject var account: DeviceAccount
    @State private var deletingAccount = false
    var body: some View {
        NavigationStack {
            List {
                if let pending = account.pendingRecovery {
                    RecoveryCodeNotice(session: pending)
                } else if account.connected {
                    Section("Your account") {
                        Text(account.displayName.map { "Signed in as \($0)." } ?? "You’re signed in on this device.")
                        Button("Sign out") { Task { await account.signOut() } }.disabled(account.loading)
                        Text("Sign-out revokes this device’s access and clears its saved sign-in. Your local field journal and prepared evidence stay on this device.").font(.caption).foregroundStyle(.secondary)
                        DisclosureGroup("Device access") {
                            Button("Remove saved sign-in", role: .destructive) { account.disconnect() }
                            Text("Use this if you are offline. It does not revoke copies of the sign-in credential; revoke those from your website account.").font(.caption).foregroundStyle(.secondary)
                            Link("Manage device access", destination: CommunityService.page("account"))
                        }
                    }
                } else {
                    if account.accountDeleted {
                        Section("Account deleted") {
                            Text("Your online account has been deleted. Your local field journal is still on this device. Delete its drafts separately in Journal tools if you want to remove them too. Prepared evidence is also retained privately, but the deleted account can no longer resume it. Use Evidence queue to erase all local copies if you want to remove them.")
                        }
                    }
                    NativeSignInForm()
                }
                if account.loading { ProgressView("Working…") }
                if let message = account.message { Section { Text(message).foregroundStyle(.red) } }
                Section("Prepared evidence") {
                    NavigationLink("Evidence queue") { EvidenceQueueView() }
                    Text("Files stay on this device until you choose Send. No background uploads.").font(.caption).foregroundStyle(.secondary)
                }
                if account.connected {
                    Section("Your co-ops") {
                        if account.workspaces.isEmpty && !account.loading {
                            Text("No co-ops to show. Start one or accept an invitation on the website.").foregroundStyle(.secondary)
                        }
                        ForEach(account.workspaces) { workspace in
                            NavigationLink { PrivateWorkspace(id: workspace.id) } label: {
                                VStack(alignment: .leading) { Text(workspace.name); Text(workspace.region).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                        Link("Start or join a co-op", destination: CommunityService.page("workspace/"))
                    }
                }
                Section("Privacy and support") {
                    Link("Privacy and your records", destination: CommunityService.page("privacy/"))
                    Link("Get support", destination: CommunityService.page("support/"))
                    Link("Email support", destination: URL(string: "mailto:justin@viridisconservation.com")!)
                    if account.connected {
                        Button("Delete account", role: .destructive) { account.message = nil; deletingAccount = true }.disabled(account.loading)
                        Text("Account deletion is permanent. It is separate from deleting your local field journal and exported copies.").font(.caption).foregroundStyle(.secondary)
                    }
                    if !account.connected && account.pendingRecovery == nil {
                        Button("Remove saved sign-in", role: .destructive) { account.disconnect() }.disabled(account.loading)
                    }
                }
            }.navigationTitle("My co-ops")
                .refreshable { await account.refresh() }
                .task(id: account.sessionID) { await account.refresh() }
                .sheet(isPresented: $deletingAccount) { DeleteAccountForm() }
        }.id(account.sessionID)
    }
}

struct PrivateWorkspace: View {
    @EnvironmentObject var account: DeviceAccount
    let id: String
    @State private var workspace: WorkspaceView?
    @State private var loading = false
    @State private var message: String?
    @State private var composing = false
    @State private var submittingDraft = false
    @State private var preparingEvidence = false
    @State private var safetyAction: MemberSafetyAction?
    @State private var operatorReporting = false
    var body: some View {
        List {
            if loading { ProgressView("Loading co-op…") }
            if let message { Section { Text(message).foregroundStyle(.red) } }
            if let workspace, account.connected {
                Section {
                    Text(workspace.state.summary)
                    Text("Your role: \(workspace.role)").font(.caption).foregroundStyle(.secondary)
                    Link("Open complete workspace", destination: CommunityService.coopPage("workspace/", id: id))
                }
                if workspace.state.visibility != "archived" {
                    Section("Participate") {
                        Button("Post an update to members") { composing = true }.disabled(workspace.state.projects.isEmpty)
                        Button("Submit a field journal draft") { submittingDraft = true }
                        Button("Prepare a photo or evidence file") { preparingEvidence = true }.disabled(account.userID == nil || workspace.state.projects.isEmpty)
                        NavigationLink("Open evidence queue") { EvidenceQueueView() }
                        Text("Submitted observations need steward review. Nothing is uploaded automatically.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("Projects") {
                    ForEach(workspace.state.projects) { project in
                        VStack(alignment: .leading) { Text(project.name).font(.headline); Text(project.summary); Text(project.status).font(.caption).foregroundStyle(.secondary) }
                    }
                }
                Section("Member updates") {
                    if workspace.state.visibleUpdates.isEmpty { Text("No updates to show.").foregroundStyle(.secondary) }
                    ForEach(workspace.state.visibleUpdates) { update in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(update.text)
                            Text(update.author).font(.caption).foregroundStyle(.secondary)
                            Text(Date(timeIntervalSince1970: update.createdAt / 1000), style: .date).font(.caption).foregroundStyle(.secondary)
                            if workspace.state.visibility != "archived" {
                                Button("Report update") { safetyAction = MemberSafetyAction(targetId: update.id, name: update.author, isReport: true) }
                                    .buttonStyle(.borderless)
                                    .accessibilityLabel("Report update by \(update.author)")
                            }
                        }
                    }
                }
                Section("Member safety") {
                    Text("Blocking hides social updates between you and a member in this co-op and stops replies and event responses between you. It does not remove shared governance or land records, or prevent access to public pages.").font(.caption).foregroundStyle(.secondary)
                    if workspace.state.visibility != "archived" {
                        DisclosureGroup("Block a member") {
                            ForEach(workspace.state.blockableMembers) { member in
                                Button("Block \(member.name)") { safetyAction = MemberSafetyAction(targetId: member.id, name: member.name, isReport: false, blocked: true) }
                            }
                        }
                        ForEach((workspace.state.blocks ?? []).compactMap { block -> MemberSafetyAction? in
                            guard let memberId = block.memberId else { return nil }
                            return MemberSafetyAction(targetId: memberId, name: block.name, isReport: false, blocked: false)
                        }) { action in
                            Button("Unblock \(action.name)") { safetyAction = action }
                        }
                    }
                    Link("Safety help and contact", destination: CommunityService.page("support/"))
                    Button("Report a concern to the project operator") { operatorReporting = true }
                    Text("Use this separate route for complaints about a steward or concerns you cannot safely raise within this co-op.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Tasks") {
                    ForEach(workspace.state.tasks) { task in
                        VStack(alignment: .leading) { Text(task.title); Text(task.status).font(.caption).foregroundStyle(.secondary) }
                    }
                    Text("Manage tasks, invitations, reviews and financial records in the full website workspace.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Observation review") {
                    if workspace.state.observations.isEmpty { Text("No observations available to you yet.").foregroundStyle(.secondary) }
                    ForEach(workspace.state.observations) { observation in
                        VStack(alignment: .leading) { Text(observation.finding)
                            if let day = observation.observedDate { Text([day, observation.observedTimeZone].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary) }
                            Text(observation.status).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
            Button("Refresh workspace") { Task { await refresh() } }.disabled(loading)
        }.navigationTitle(workspace?.state.name ?? "Co-op")
            .task { await refresh() }.refreshable { await refresh() }
            .onChange(of: account.connected) { _, connected in if !connected { workspace = nil; composing = false; submittingDraft = false; safetyAction = nil } }
            .sheet(isPresented: $composing) {
                if let workspace { MemberPostComposer(workspace: workspace) { self.workspace = $0 } }
            }
            .sheet(isPresented: $preparingEvidence) {
                if let workspace, let owner = account.userID { EvidenceComposer(workspace: workspace, ownerID: owner) }
            }
            .sheet(isPresented: $submittingDraft) {
                if let workspace { FieldSubmission(workspace: workspace) { self.workspace = $0 } }
            }
            .sheet(item: $safetyAction) { action in
                if let workspace { MemberSafetyForm(workspace: workspace, action: action) { self.workspace = $0 } }
            }
            .sheet(isPresented: $operatorReporting) { SafetyReportForm(kind: .general, coopId: id, targetId: nil) }
    }
    private func refresh() async {
        guard !loading else { return }
        loading = true; message = nil
        let current = account.sessionID
        defer { loading = false }
        do {
            let latest = try await account.client().detail(id)
            guard account.connected, account.sessionID == current else { return }
            workspace = latest
        } catch { guard account.connected, account.sessionID == current else { return }; workspace = nil; message = error.localizedDescription }
    }
}

struct MemberSafetyAction: Identifiable {
    var id: String { "\(isReport ? "report" : blocked ? "block" : "unblock")-\(targetId)" }
    let targetId: String
    let name: String
    let isReport: Bool
    var blocked = true
    var title: String { isReport ? "Report update" : blocked ? "Block member" : "Unblock member" }
}

struct MemberSafetyForm: View {
    @EnvironmentObject var account: DeviceAccount
    @Environment(\.dismiss) private var dismiss
    @State var workspace: WorkspaceView
    let action: MemberSafetyAction
    var saved: (WorkspaceView) -> Void
    @State private var reason = ""
    @State private var pending: WorkspaceCommand?
    @State private var sending = false
    @State private var message: String?
    @State private var conflict = false
    @State private var complete = false
    var body: some View {
        NavigationStack {
            Form {
                if complete {
                    Text(action.isReport ? "Your report was saved for the co-op stewards. It is visible to you and the stewards. Reporting does not automatically remove the update." : action.blocked ? "This member is blocked in this co-op. Your social feed has been updated." : "Your block has been removed. The other member’s own block, if any, still applies.")
                    Button("Done") { dismiss() }
                } else {
                    Section {
                        Text(action.isReport ? "Report the update by \(action.name)." : "\(action.blocked ? "Block" : "Unblock") \(action.name) in \(workspace.state.name)?")
                        if action.isReport {
                            TextField("Describe the concern", text: $reason, axis: .vertical).lineLimit(4...10).disabled(pending != nil)
                            Text("Up to 2,000 characters. Do not include passwords, access tokens, private addresses or unnecessary personal details.").font(.caption).foregroundStyle(.secondary)
                        } else {
                            Text("This affects social interaction in this co-op. Shared project, governance and land records remain available under existing permissions. Public pages can still be viewed.").font(.caption).foregroundStyle(.secondary)
                        }
                        Text("Your account must have permission to participate in this co-op.").font(.caption).foregroundStyle(.secondary)
                    }
                    if let message { Text(message).foregroundStyle(.red) }
                    if conflict {
                        Button("Refresh before confirming again") { Task { await resolveConflict() } }.disabled(sending)
                    } else {
                        Button(pending == nil ? action.title : "Retry the same request") { Task { await submit() } }
                            .disabled(sending || (action.isReport && (reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || reason.utf16.count > 2000)))
                    }
                    if sending { ProgressView("Saving…") }
                    if pending != nil { Text("If the connection fails, keep this form open to retry the same request safely.").font(.caption) }
                }
            }.navigationTitle(action.title)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(sending) } }
                .interactiveDismissDisabled(sending)
        }
    }
    private func submit() async {
        sending = true; message = nil
        let session = account.sessionID
        defer { sending = false }
        do {
            if pending == nil {
                if action.isReport {
                    pending = try WorkspaceCommand.reportUpdate(action.targetId, reason: reason, workspace: workspace)
                } else {
                    pending = try WorkspaceCommand.memberBlock(action.targetId, blocked: action.blocked, workspace: workspace)
                }
            }
            let updated = try await account.client().submit(pending!)
            guard account.connected, account.sessionID == session else { return }
            workspace = updated; saved(updated); complete = true
        } catch WorkspaceError.conflict { guard account.connected, account.sessionID == session else { return }; conflict = true; message = WorkspaceError.conflict.localizedDescription }
        catch { guard account.connected, account.sessionID == session else { return }; message = error.localizedDescription }
    }
    private func resolveConflict() async {
        sending = true
        let session = account.sessionID
        defer { sending = false }
        do {
            let latest = try await account.client().detail(workspace.state.id)
            guard account.connected, account.sessionID == session else { return }
            workspace = latest; pending?.version = latest.version; conflict = false
            message = "The co-op is refreshed. Review the action, then confirm again."
        } catch { guard account.connected, account.sessionID == session else { return }; message = error.localizedDescription }
    }
}

struct MemberPostComposer: View {
    @EnvironmentObject var account: DeviceAccount
    @Environment(\.dismiss) private var dismiss
    @State var workspace: WorkspaceView
    var saved: (WorkspaceView) -> Void
    @State private var projectId = ""
    @State private var text = ""
    @State private var pending: WorkspaceCommand?
    @State private var sending = false
    @State private var message: String?
    @State private var conflict = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Share with co-op members") {
                    Picker("Project", selection: $projectId) {
                        Text("Choose a project").tag("")
                        ForEach(workspace.state.projects) { Text($0.name).tag($0.id) }
                    }.disabled(pending != nil)
                    TextField("Your update", text: $text, axis: .vertical).lineLimit(5...12).disabled(pending != nil)
                    Text("Up to 2,000 characters. This update is shared with members; public publishing uses the website.").font(.caption)
                }
                if let message { Section { Text(message).foregroundStyle(.red) } }
                if conflict {
                    Button("Refresh before confirming again") { Task { await resolveConflict() } }.disabled(sending)
                } else {
                    Button(pending == nil ? "Post to members" : "Retry the same update") { Task { await submit() } }
                        .disabled(sending || projectId.isEmpty || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.utf16.count > 2000)
                }
                if sending { ProgressView("Saving…") }
                if pending != nil { Text("This request is retained for a safe retry. Closing this form after a connection failure may leave an update already saved on the server; check your co-op before composing it again.").font(.caption) }
            }.navigationTitle("Member update")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(sending) } }
                .interactiveDismissDisabled(sending)
        }
    }
    private func submit() async {
        sending = true; message = nil
        let session = account.sessionID
        defer { sending = false }
        if pending == nil { pending = WorkspaceCommand(id: workspace.state.id, version: workspace.version, op: "post_update", payload: ["projectId": .text(projectId), "text": .text(text), "visibility": .text("members")]) }
        do {
            let updated = try await account.client().submit(pending!)
            guard account.connected, account.sessionID == session else { return }
            saved(updated); dismiss()
        }
        catch WorkspaceError.conflict { guard account.connected, account.sessionID == session else { return }; conflict = true; message = WorkspaceError.conflict.localizedDescription }
        catch { guard account.connected, account.sessionID == session else { return }; message = error.localizedDescription }
    }
    private func resolveConflict() async {
        sending = true; defer { sending = false }
        let session = account.sessionID
        do {
            let latest = try await account.client().detail(workspace.state.id)
            guard account.connected, account.sessionID == session else { return }
            workspace = latest; pending?.version = workspace.version; conflict = false; message = "The workspace is refreshed. Check your project and update, then confirm again."
        }
        catch { guard account.connected, account.sessionID == session else { return }; message = error.localizedDescription }
    }
}

struct FieldSubmission: View {
    @EnvironmentObject var account: DeviceAccount
    @EnvironmentObject var journal: JournalStore
    @Environment(\.dismiss) private var dismiss
    @State var workspace: WorkspaceView
    var saved: (WorkspaceView) -> Void
    @State private var draftId = ""
    @State private var parcelId = ""
    @State private var pending: WorkspaceCommand?
    @State private var sending = false
    @State private var message: String?
    @State private var conflict = false
    @State private var submitted = false
    private var draft: FieldDraft? { journal.drafts.first { $0.id.uuidString == draftId } }
    var body: some View {
        NavigationStack {
            Form {
                if submitted {
                    Section("Submitted for review") { Text("The observation is saved in this co-op for steward review. Your local journal draft is preserved. Submission does not verify a conservation outcome."); Button("Done") { dismiss() } }
                } else {
                    Section("Choose the records") {
                        Picker("Local field draft", selection: $draftId) {
                            Text("Choose a draft").tag("")
                            ForEach(journal.drafts) { Text("\($0.place) · \($0.date)").tag($0.id.uuidString) }
                        }.disabled(pending != nil)
                        Picker("Co-op parcel", selection: $parcelId) {
                            Text("Choose a reviewed parcel").tag("")
                            ForEach(workspace.state.parcels.filter(\.acceptsObservation)) { Text($0.name).tag($0.id) }
                        }.disabled(pending != nil)
                        Text("Only your accessible parcels with a reviewed current boundary are listed. A steward can review boundaries on the website.").font(.caption)
                    }
                    if let draft {
                        Section("Review before sending") { Text("Place: \(draft.place)"); Text("Date: \(draft.date)"); Text("Time zone: \(draft.timeZone ?? "UTC (original draft)")").font(.caption).foregroundStyle(.secondary); Text(draft.method); Text(draft.finding); if !draft.reference.isEmpty { Text(draft.reference) }
                            Text("The selected parcel associates this observation with land. Check that it matches your visit. Sending uploads the date, method, finding and reference to your co-op.").font(.caption) }
                    }
                    if let message { Section { Text(message).foregroundStyle(.red) } }
                    if conflict {
                        Button("Refresh before confirming again") { Task { await resolveConflict() } }.disabled(sending)
                    } else {
                        Button(pending == nil ? "Submit observation for steward review" : "Retry the same submission") { Task { await submit() } }.disabled(sending || draft == nil || parcelId.isEmpty)
                    }
                    if sending { ProgressView("Submitting…") }
                    Text("Your draft remains on this device. A repeat of the exact same note for this parcel and boundary is checked against the original submission, even after restarting the app. Edit the note only when you intend a new observation.").font(.caption).foregroundStyle(.secondary)
                }
            }.navigationTitle("Submit field draft")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(sending) } }
                .interactiveDismissDisabled(sending)
        }
    }
    private func submit() async {
        sending = true; message = nil
        let session = account.sessionID
        defer { sending = false }
        do {
            if pending == nil {
                guard let draft, let parcel = workspace.state.parcels.first(where: { $0.id == parcelId }) else { throw WorkspaceError.invalid }
                pending = try WorkspaceCommand.observation(draft, workspace: workspace, parcel: parcel)
            }
            let updated = try await account.client().submit(pending!)
            guard account.connected, account.sessionID == session else { return }
            saved(updated); submitted = true
        } catch WorkspaceError.conflict { guard account.connected, account.sessionID == session else { return }; conflict = true; message = WorkspaceError.conflict.localizedDescription }
        catch { guard account.connected, account.sessionID == session else { return }; message = error.localizedDescription }
    }
    private func resolveConflict() async {
        sending = true; defer { sending = false }
        let session = account.sessionID
        do {
            let latest = try await account.client().detail(workspace.state.id)
            guard account.connected, account.sessionID == session else { return }
            workspace = latest
            // Revalidate the current parcel boundary and fields before a fresh confirmation.
            pending = nil; conflict = false; message = "The workspace is refreshed. Review the selected parcel and draft before submitting again."
        } catch { guard account.connected, account.sessionID == session else { return }; message = error.localizedDescription }
    }
}
