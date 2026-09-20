import Foundation

enum ReplyPhase: String, Codable { case prepared, submitting, review, rejected, complete }
enum ReplyQueueError: Error, LocalizedError {
    case invalid, capacity, owner, reloadRequired, pending
    var errorDescription: String? {
        switch self {
        case .invalid: return "The saved reply could not be read safely. Existing local records have been kept."
        case .capacity: return "Keep at most 20 saved replies and receipts. Remove completed receipts before preparing more."
        case .owner: return "Verify the same account that prepared this reply before opening or sending it."
        case .reloadRequired: return "The last local save could not be confirmed. Reload the protected reply queue before continuing."
        case .pending: return "A reply is already waiting for this discussion. Resume that reply before composing another."
        }
    }
}
struct QueuedReply: Codable, Identifiable, Equatable {
    let id: UUID
    let ownerID: String
    let workspaceID: String
    let updateID: String
    let requestID: String
    private(set) var text: String?
    private(set) var version: Int
    private(set) var phase: ReplyPhase
    private(set) var completedAt: Date?

    init(ownerID: String, updateID: String, text: String, workspace: WorkspaceView) throws {
        let command = try WorkspaceCommand.reply(updateID, text: text, workspace: workspace)
        id = UUID(); self.ownerID = ownerID; workspaceID = workspace.state.id; self.updateID = updateID
        requestID = command.requestId; self.text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        version = workspace.version; phase = .prepared
        try validate()
    }
    func validate() throws {
        for value in [ownerID, workspaceID, updateID] {
            guard !value.isEmpty, value.utf8.count <= 200 else { throw ReplyQueueError.invalid }
        }
        guard version >= 0, UUID(uuidString: requestID) != nil, requestID == requestID.lowercased() else { throw ReplyQueueError.invalid }
        if phase == .complete {
            guard text == nil, completedAt != nil else { throw ReplyQueueError.invalid }
        } else {
            guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  text.utf16.count <= 2000, completedAt == nil else { throw ReplyQueueError.invalid }
        }
    }
    func requireOwner(_ owner: String) throws { guard owner == ownerID else { throw ReplyQueueError.owner } }
    func command() throws -> WorkspaceCommand {
        guard phase == .submitting, let text else { throw ReplyQueueError.invalid }
        return WorkspaceCommand(id: workspaceID, version: version, op: "post_comment", payload: ["updateId": .text(updateID), "text": .text(text)], requestId: requestID)
    }
    mutating func begin() throws {
        guard phase == .prepared || phase == .submitting else { throw ReplyQueueError.pending }
        phase = .submitting
    }
    mutating func requireReview() throws {
        guard phase == .submitting else { throw ReplyQueueError.invalid }; phase = .review
    }
    mutating func rejectSubmission(earlierOutcomeUncertain: Bool) throws {
        guard phase == .submitting else { throw ReplyQueueError.invalid }
        // A rejection of a retry cannot disprove an earlier accepted write.
        // Only a first attempt's definite rejection permits a replacement.
        if !earlierOutcomeUncertain { phase = .rejected }
    }
    mutating func review(_ workspace: WorkspaceView) throws {
        guard phase == .review, workspace.state.id == workspaceID, let text else { throw ReplyQueueError.invalid }
        _ = try WorkspaceCommand.reply(updateID, text: text, workspace: workspace, requestID: requestID)
        version = workspace.version; phase = .prepared
    }
    mutating func complete(now: Date = Date()) throws {
        guard phase == .submitting else { throw ReplyQueueError.invalid }
        phase = .complete; completedAt = now; text = nil
    }
}
private struct ReplyQueueFile: Codable { var version = 1; var items: [QueuedReply] }

/// Exact reply content and request identity are saved before transmission. Any
/// writer error blocks subsequent access until disk state is opened again.
final class ReplyQueueRepository {
    private var items: [QueuedReply]
    private let file: URL
    private let writer: (Data, URL) throws -> Void
    private var reloadRequired = false
    init(file: URL, writer: @escaping (Data, URL) throws -> Void = EvidenceQueueRepository.atomicWrite) throws {
        self.file = file; self.writer = writer
        do {
            let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
            let data = try handle.read(upToCount: 400_001) ?? Data()
            guard data.count <= 400_000 else { throw ReplyQueueError.capacity }
            let stored = try JSONDecoder().decode(ReplyQueueFile.self, from: data)
            guard stored.version == 1 else { throw ReplyQueueError.invalid }
            try Self.validate(stored.items); items = stored.items
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile { items = [] }
    }
    private static func validate(_ items: [QueuedReply]) throws {
        guard items.count <= 20, Set(items.map(\.id)).count == items.count,
              Set(items.map(\.requestID)).count == items.count else { throw ReplyQueueError.capacity }
        let pending = items.filter { $0.phase != .complete }.map { [$0.ownerID, $0.workspaceID, $0.updateID] }
        guard Set(pending).count == pending.count else { throw ReplyQueueError.pending }
        try items.forEach { try $0.validate() }
    }
    private func commit(_ next: [QueuedReply]) throws {
        guard !reloadRequired else { throw ReplyQueueError.reloadRequired }
        try Self.validate(next)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(ReplyQueueFile(items: next))
        guard data.count <= 400_000 else { throw ReplyQueueError.capacity }
        do { try writer(data, file); items = next }
        catch { reloadRequired = true; throw ReplyQueueError.reloadRequired }
    }
    func replies(owner: String) throws -> [QueuedReply] {
        guard !reloadRequired else { throw ReplyQueueError.reloadRequired }
        return items.filter { $0.ownerID == owner }
    }
    func item(_ id: UUID, owner: String) throws -> QueuedReply {
        guard !reloadRequired else { throw ReplyQueueError.reloadRequired }
        guard let item = items.first(where: { $0.id == id }) else { throw ReplyQueueError.invalid }
        try item.requireOwner(owner); return item
    }
    func save(_ item: QueuedReply, owner: String) throws {
        try item.requireOwner(owner); try commit(items + [item])
    }
    @discardableResult private func update(_ id: UUID, owner: String, change: (inout QueuedReply) throws -> Void) throws -> QueuedReply {
        _ = try item(id, owner: owner)
        var next = items; guard let index = next.firstIndex(where: { $0.id == id }) else { throw ReplyQueueError.invalid }
        try change(&next[index]); try commit(next); return next[index]
    }
    func begin(_ id: UUID, owner: String) throws -> QueuedReply { try update(id, owner: owner) { try $0.begin() } }
    func requireReview(_ id: UUID, owner: String) throws { _ = try update(id, owner: owner) { try $0.requireReview() } }
    func rejectSubmission(_ id: UUID, owner: String, earlierOutcomeUncertain: Bool) throws {
        _ = try update(id, owner: owner) { try $0.rejectSubmission(earlierOutcomeUncertain: earlierOutcomeUncertain) }
    }
    func replaceRejected(_ id: UUID, owner: String, text: String, workspace: WorkspaceView) throws -> QueuedReply {
        let original = try item(id, owner: owner)
        guard original.phase == .rejected, original.workspaceID == workspace.state.id else { throw ReplyQueueError.pending }
        let replacement = try QueuedReply(ownerID: owner, updateID: original.updateID, text: text, workspace: workspace)
        try commit(items.map { $0.id == id ? replacement : $0 })
        return replacement
    }
    func review(_ id: UUID, owner: String, workspace: WorkspaceView) throws { _ = try update(id, owner: owner) { try $0.review(workspace) } }
    func complete(_ id: UUID, owner: String) throws { _ = try update(id, owner: owner) { try $0.complete() } }
    func removeReceipt(_ id: UUID, owner: String) throws {
        guard try item(id, owner: owner).phase == .complete else { throw ReplyQueueError.pending }
        try commit(items.filter { $0.id != id })
    }
    /// The UI requires separate destructive confirmation and explains that this
    /// erases unresolved retry identities without deleting anything online.
    func eraseAllLocal() throws { try commit([]) }
}
