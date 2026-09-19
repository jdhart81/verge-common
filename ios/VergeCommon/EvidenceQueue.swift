import Foundation
import CryptoKit

struct EvidenceAsset: Codable, Equatable {
    let id: String
    let filename: String
    let sha256: String
}
enum EvidencePhase: String, Codable { case prepared, uploading, uploaded, submitting, review, discarding, complete, expired }
enum EvidenceQueueError: Error, LocalizedError {
    case invalid, capacity, owner, missing, pending, expired, reloadRequired
    var errorDescription: String? {
        switch self {
        case .invalid: return "This evidence could not be read safely. Existing local records have been kept."
        case .capacity: return "Keep at most 10 prepared files of up to 4 MB each. Remove completed receipts or cancel older items before adding more."
        case .owner: return "Sign in to the same account that prepared this evidence to continue or confirm any pending upload or submission."
        case .missing: return "This prepared evidence is no longer available. Reload the queue."
        case .pending: return "The previous submission may have arrived. Retry it to confirm its outcome before discarding this file."
        case .expired: return "This upload attempt has expired or conflicts with the server. Keep the local copy and review the co-op before preparing a new attempt."
        case .reloadRequired: return "The last local save could not be confirmed. Reload the protected evidence queue before retrying or removing an item. Existing files have been kept."
        }
    }
}
struct EvidenceItem: Codable, Identifiable, Equatable {
    let id: UUID
    let ownerID: String
    let workspaceID: String
    let workspaceName: String
    let projectID: String
    let projectName: String
    let title: String
    let method: String
    let period: String
    let notes: String
    let filename: String
    let contentType: String
    let sha256: String
    var bytes: Data?
    var uploadID: String
    var requestID: String
    var version: Int
    var phase: EvidencePhase = .prepared
    var asset: EvidenceAsset?
    var completedAt: Date?
    var cancelRequested = false
    static let maximumBytes = 4 * 1024 * 1024
    static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    init(ownerID: String, workspace: WorkspaceView, project: PublicProject, title: String, method: String, period: String, notes: String, filename: String, contentType: String, bytes: Data) throws {
        id = UUID(); self.ownerID = ownerID; workspaceID = workspace.state.id; workspaceName = workspace.state.name
        projectID = project.id; projectName = project.name
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines); self.method = method.trimmingCharacters(in: .whitespacesAndNewlines)
        self.period = period.trimmingCharacters(in: .whitespacesAndNewlines); self.notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        self.filename = filename; self.contentType = contentType; self.bytes = bytes; sha256 = Self.hash(bytes)
        uploadID = UUID().uuidString.lowercased(); requestID = UUID().uuidString.lowercased(); version = workspace.version
        guard workspace.state.visibility != "archived", project.status != "cancelled", workspace.state.projects.contains(where: { $0.id == project.id }) else { throw EvidenceQueueError.invalid }
        try validate()
    }
    func validate() throws {
        for (text, maximum) in [(ownerID, 200), (workspaceID, 100), (workspaceName, 200), (projectID, 100), (projectName, 200), (title, 160), (method, 200), (period, 80), (notes, 2000)] {
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= maximum else { throw EvidenceQueueError.invalid }
        }
        guard UUID(uuidString: uploadID) != nil, uploadID == uploadID.lowercased(), UUID(uuidString: requestID) != nil, requestID == requestID.lowercased(), version >= 0,
              filename.range(of: "^[a-zA-Z0-9._-]{1,100}$", options: .regularExpression) != nil,
              ["image/jpeg", "image/png", "application/pdf", "text/plain"].contains(contentType), sha256.count == 64 else { throw EvidenceQueueError.invalid }
        if let bytes { guard !bytes.isEmpty, bytes.count <= Self.maximumBytes, Self.hash(bytes) == sha256 else { throw EvidenceQueueError.invalid } }
        else if phase != .complete { throw EvidenceQueueError.invalid }
        if [.uploaded, .submitting, .review, .discarding, .complete].contains(phase) {
            guard let asset, UUID(uuidString: asset.id) != nil, asset.sha256 == sha256, asset.filename == filename else { throw EvidenceQueueError.invalid }
        }
        if phase == .complete { guard completedAt != nil else { throw EvidenceQueueError.invalid } }
    }
    func requireOwner(_ owner: String) throws { guard owner == ownerID else { throw EvidenceQueueError.owner } }
    func command() throws -> WorkspaceCommand {
        guard let asset else { throw EvidenceQueueError.invalid }
        return WorkspaceCommand(id: workspaceID, version: version, op: "submit_evidence", payload: ["projectId": .text(projectID), "title": .text(title), "method": .text(method), "period": .text(period), "notes": .text(notes), "assetId": .text(asset.id)], requestId: requestID)
    }
}
private struct EvidenceQueueFile: Codable { var version = 1; var items: [EvidenceItem] }
/// All retry identities and exact prepared bytes commit together, before transmission.
/// Corrupt files and failed writes never reset or publish partially changed state.
final class EvidenceQueueRepository {
    private(set) var items: [EvidenceItem]
    private let file: URL
    private let writer: (Data, URL) throws -> Void
    private var reloadRequired = false
    init(file: URL, writer: @escaping (Data, URL) throws -> Void = EvidenceQueueRepository.atomicWrite) throws {
        self.file = file; self.writer = writer
        do {
            let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
            let data = try handle.read(upToCount: 58_000_001) ?? Data()
            guard data.count <= 58_000_000 else { throw EvidenceQueueError.capacity }
            let stored = try JSONDecoder().decode(EvidenceQueueFile.self, from: data)
            guard stored.version == 1 else { throw EvidenceQueueError.invalid }
            try Self.validate(stored.items); items = stored.items
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile { items = [] }
    }
    static func atomicWrite(_ data: Data, _ file: URL) throws {
        #if os(iOS)
        try data.write(to: file, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: file, options: [.atomic])
        #endif
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
    private static func validate(_ items: [EvidenceItem]) throws {
        guard items.count <= 10, Set(items.map(\.id)).count == items.count,
              Set(items.map(\.uploadID)).count == items.count, Set(items.map(\.requestID)).count == items.count else { throw EvidenceQueueError.capacity }
        try items.forEach { try $0.validate() }
    }
    private func commit(_ next: [EvidenceItem]) throws {
        guard !reloadRequired else { throw EvidenceQueueError.reloadRequired }
        try Self.validate(next)
        let data = try JSONEncoder().encode(EvidenceQueueFile(items: next))
        guard data.count <= 58_000_000 else { throw EvidenceQueueError.capacity }
        do { try writer(data, file); items = next }
        catch {
            // A writer may fail after its atomic rename (for example while
            // applying attributes). Never overwrite that newer durable phase
            // with a second mutation based on this older in-memory snapshot.
            reloadRequired = true
            throw EvidenceQueueError.reloadRequired
        }
    }
    func eraseAllLocal() throws { try commit([]) }
    func add(_ item: EvidenceItem) throws { guard !items.contains(where: { $0.id == item.id }) else { throw EvidenceQueueError.invalid }; try commit(items + [item]) }
    func item(_ id: UUID, owner: String) throws -> EvidenceItem {
        guard !reloadRequired else { throw EvidenceQueueError.reloadRequired }
        guard let item = items.first(where: { $0.id == id }) else { throw EvidenceQueueError.missing }
        try item.requireOwner(owner); return item
    }
    @discardableResult func update(_ id: UUID, owner: String, change: (inout EvidenceItem) throws -> Void) throws -> EvidenceItem {
        var next = items; guard let index = next.firstIndex(where: { $0.id == id }) else { throw EvidenceQueueError.missing }
        try next[index].requireOwner(owner); try change(&next[index]); try commit(next); return next[index]
    }
    func remove(_ id: UUID, owner: String) throws {
        let item = try item(id, owner: owner)
        guard item.phase == .prepared || item.phase == .complete || item.phase == .discarding || item.phase == .expired else { throw EvidenceQueueError.pending }
        try commit(items.filter { $0.id != id })
    }
    func beginUpload(_ id: UUID, owner: String) throws -> EvidenceItem {
        try update(id, owner: owner) { item in
            guard item.phase == .prepared || item.phase == .uploading else { throw EvidenceQueueError.invalid }
            item.phase = .uploading
        }
    }
    func uploaded(_ id: UUID, owner: String, asset: EvidenceAsset) throws -> EvidenceItem {
        try update(id, owner: owner) { item in
            guard item.phase == .uploading, asset.sha256 == item.sha256, asset.filename == item.filename else { throw EvidenceQueueError.invalid }
            item.asset = asset; item.phase = .uploaded
        }
    }
    func beginSubmission(_ id: UUID, owner: String) throws -> EvidenceItem {
        try update(id, owner: owner) { item in
            guard item.phase == .uploaded || item.phase == .submitting else { throw EvidenceQueueError.pending }
            item.phase = .submitting
        }
    }
    func submissionRejected(_ id: UUID, owner: String, earlierOutcomeUncertain: Bool) throws {
        _ = try update(id, owner: owner) { item in
            guard item.phase == .submitting else { throw EvidenceQueueError.invalid }
            // A new attempt's definitive rejection permits cleanup. A denied
            // retry cannot establish whether an earlier timed-out attempt saved.
            if !earlierOutcomeUncertain { item.phase = .uploaded }
        }
    }
    func complete(_ id: UUID, owner: String, now: Date = Date()) throws {
        _ = try update(id, owner: owner) { item in
            guard item.phase == .submitting else { throw EvidenceQueueError.invalid }
            item.phase = .complete; item.completedAt = now; item.bytes = nil
        }
    }
}

struct NativeAccountIdentity: Decodable { let user: NativeAccountUser }
struct EvidenceDiscardResult: Decodable { let discarded: Bool }
struct EvidenceClient {
    let token: String
    static let maximumResponseBytes = 65_536
    private func request(path: String, method: String = "GET", query: [URLQueryItem] = []) throws -> URLRequest {
        var parts = URLComponents(url: CommunityService.page(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query }
        var request = URLRequest(url: parts.url!); request.httpMethod = method; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(try DeviceCredential.validate(token))", forHTTPHeaderField: "Authorization")
        request.setValue(CommunityService.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }
    func identityRequest() throws -> URLRequest { try request(path: "auth/native/me") }
    func uploadRequest(_ item: EvidenceItem) throws -> URLRequest {
        try item.validate(); guard let bytes = item.bytes else { throw EvidenceQueueError.invalid }
        var request = try request(path: "api/files", method: "POST", query: [.init(name: "workspace", value: item.workspaceID), .init(name: "uploadId", value: item.uploadID)])
        let boundary = "VergeCommon-\(item.uploadID)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(item.filename)\"\r\nContent-Type: \(item.contentType)\r\n\r\n".utf8)
        body.append(bytes); body.append(Data("\r\n--\(boundary)--\r\n".utf8)); request.httpBody = body
        return request
    }
    func discardRequest(_ asset: EvidenceAsset) throws -> URLRequest {
        guard UUID(uuidString: asset.id) != nil else { throw EvidenceQueueError.invalid }
        return try request(path: "api/files", method: "DELETE", query: [.init(name: "id", value: asset.id)])
    }
    private func send<T: Decodable>(_ type: T.Type, request: URLRequest, configuration: URLSessionConfiguration) async throws -> T {
        configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil; configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 30; configuration.timeoutIntervalForResource = 60
        let session = URLSession(configuration: configuration); defer { session.invalidateAndCancel() }
        do {
            let (bytes, response) = try await session.bytes(for: request, delegate: CommunityRedirectPolicy())
            guard let http = response as? HTTPURLResponse, http.expectedContentLength <= Int64(Self.maximumResponseBytes) else { throw WorkspaceError.invalid }
            var data = Data(); for try await byte in bytes { guard data.count < Self.maximumResponseBytes else { throw WorkspaceError.invalid }; data.append(byte) }
            return try WorkspaceClient.decode(type, data: data, status: http.statusCode, mimeType: http.mimeType)
        } catch let error as WorkspaceError { throw error }
        catch { throw WorkspaceError.unavailable }
    }
    func identity(configuration: URLSessionConfiguration = .ephemeral) async throws -> NativeAccountUser {
        let user = try await send(NativeAccountIdentity.self, request: identityRequest(), configuration: configuration).user
        guard !user.id.isEmpty, user.id.utf8.count <= 200 else { throw WorkspaceError.invalid }; return user
    }
    func upload(_ item: EvidenceItem, configuration: URLSessionConfiguration = .ephemeral) async throws -> EvidenceAsset {
        let asset = try await send(EvidenceAsset.self, request: uploadRequest(item), configuration: configuration)
        guard UUID(uuidString: asset.id) != nil, asset.sha256 == item.sha256, asset.filename == item.filename else { throw WorkspaceError.invalid }
        return asset
    }
    func discard(_ asset: EvidenceAsset, configuration: URLSessionConfiguration = .ephemeral) async throws {
        let response = try await send(EvidenceDiscardResult.self, request: discardRequest(asset), configuration: configuration)
        guard response.discarded else { throw WorkspaceError.invalid }
    }
}
