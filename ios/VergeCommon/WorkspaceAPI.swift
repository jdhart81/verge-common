import Foundation
import Security
import CryptoKit

/// Personal device credentials never enter UserDefaults, exports, logs, or journal files.
protocol DeviceTokenStore {
    func load() throws -> String?
    func save(_ token: String) throws
    func remove() throws
}
enum DeviceTokenError: Error, LocalizedError {
    case unavailable, invalid
    var errorDescription: String? {
        switch self {
        case .unavailable: return "The device keychain is unavailable. Unlock your device and try again."
        case .invalid: return "Paste a personal device token from your VergeCommon account."
        }
    }
}
struct KeychainDeviceTokenStore: DeviceTokenStore {
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "org.vergecommon.app.device-token",
         kSecAttrAccount as String: CommunityService.origin.absoluteString]
    }
    func load() throws -> String? {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else { throw DeviceTokenError.unavailable }
        return token
    }
    func save(_ token: String) throws {
        let credential = try DeviceCredential.validate(token)
        let values: [String: Any] = [kSecValueData as String: Data(credential.utf8),
                                    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let update = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if update == errSecSuccess { return }
        guard update == errSecItemNotFound else { throw DeviceTokenError.unavailable }
        var item = query
        values.forEach { item[$0.key] = $0.value }
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw DeviceTokenError.unavailable }
    }
    func remove() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw DeviceTokenError.unavailable }
    }
}
enum DeviceCredential {
    static func validate(_ input: String) throws -> String {
        let token = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (20...2048).contains(token.utf8.count), token.unicodeScalars.allSatisfy({ (33...126).contains($0.value) }) else { throw DeviceTokenError.invalid }
        return token
    }
}
struct WorkspaceSummary: Decodable, Identifiable {
    let id: String
    let name: String
    let region: String
    let visibility: String
    let version: Int
}
struct WorkspaceList: Decodable { let workspaces: [WorkspaceSummary] }
struct WorkspaceView: Decodable {
    let state: MemberWorkspace
    let version: Int
    let role: String
}
struct MemberWorkspace: Decodable, Identifiable {
    let id: String
    let name: String
    let summary: String
    let visibility: String
    let projects: [PublicProject]
    let updates: [MemberUpdate]
    let tasks: [MemberTask]
    let parcels: [MemberParcel]
    let observations: [MemberObservation]
    let members: [WorkspaceMember]?
    let blocks: [MemberBlock]?
    var visibleUpdates: [MemberUpdate] { updates.filter(\.isVisible).sorted { $0.createdAt > $1.createdAt } }
    var blockableMembers: [WorkspaceMember] {
        (members ?? []).filter { member in
            !member.isYou && member.status == "active" && !(blocks ?? []).contains(where: { $0.memberId == member.id })
        }
    }
}
struct WorkspaceMember: Decodable, Identifiable {
    let id: String
    let name: String
    let status: String
    let isYou: Bool
}
struct MemberBlock: Decodable {
    let memberId: String?
    let name: String
}
struct MemberUpdate: Decodable, Identifiable {
    let id: String
    let text: String
    let author: String
    let createdAt: Double
    let hidden: Bool
    let blocked: Bool?
    var isVisible: Bool { !hidden && blocked != true }
}
struct MemberTask: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String
}
struct MemberParcel: Decodable, Identifiable {
    let id: String
    let name: String
    let boundaries: [ParcelBoundary]?
    var acceptsObservation: Bool { boundaries?.last?.status == "reviewed" }
}
struct ParcelBoundary: Decodable { let id: String; let status: String }
struct MemberObservation: Decodable, Identifiable {
    let id: String
    let parcelId: String
    let method: String
    let finding: String
    let status: String
    let observedDate: String?
    let observedTimeZone: String?
}
enum WorkspaceError: Error, LocalizedError {
    case unauthorized, denied, inactive(String), conflict, invalid, oversized, unavailable, rejected(String)
    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Your sign-in is missing, expired or revoked. Sign out or remove the saved sign-in in My co-ops, then sign in again."
        case .denied: return "This action is not permitted. Check your co-op membership. If you used an advanced device token, it must allow the requested access."
        case .inactive(let status): return "Your membership is \(status). A steward can check your access on the website."
        case .conflict: return "This co-op changed. Refresh it, review the latest information, and confirm your change again."
        case .invalid: return "The service returned an unsupported response. No local draft was removed."
        case .oversized: return "This co-op is too large to load on this device. Open it on the website."
        case .unavailable: return "Couldn’t reach the community service. Your change may have arrived. Keep this form open and retry to check it safely."
        case .rejected(let message): return message
        }
    }
}
enum CommandValue: Encodable, Equatable {
    case text(String), number(Int64)
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self { case .text(let value): try container.encode(value); case .number(let value): try container.encode(value) }
    }
}
struct WorkspaceCommand: Encodable {
    let id: String
    var version: Int
    let op: String
    let requestId: String
    let payload: [String: CommandValue]
    init(id: String, version: Int, op: String, payload: [String: CommandValue], requestId: String = UUID().uuidString.lowercased()) {
        self.id = id; self.version = version; self.op = op; self.payload = payload; self.requestId = requestId
    }
    static func reportUpdate(_ updateId: String, reason: String, workspace: WorkspaceView) throws -> WorkspaceCommand {
        let text = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.utf16.count <= 2000,
              workspace.state.visibleUpdates.contains(where: { $0.id == updateId }) else {
            throw WorkspaceError.rejected("Choose an available update and explain the concern in up to 2,000 characters.")
        }
        return WorkspaceCommand(id: workspace.state.id, version: workspace.version, op: "report_content", payload: ["kind": .text("update"), "targetId": .text(updateId), "reason": .text(text)])
    }
    static func memberBlock(_ memberId: String, blocked: Bool, workspace: WorkspaceView) throws -> WorkspaceCommand {
        let member = workspace.state.members?.first { $0.id == memberId }
        let existing = workspace.state.blocks?.contains { $0.memberId == memberId } == true
        guard member?.isYou != true,
              (blocked && member?.status == "active") || (!blocked && existing) else {
            throw WorkspaceError.rejected("Choose another active member to block, or one of your existing blocks to remove.")
        }
        return WorkspaceCommand(id: workspace.state.id, version: workspace.version, op: blocked ? "block_member" : "unblock_member", payload: ["id": .text(memberId)])
    }
    static func observation(_ draft: FieldDraft, workspace: WorkspaceView, parcel: MemberParcel, now: Date = Date()) throws -> WorkspaceCommand {
        _ = try draft.validated()
        guard parcel.acceptsObservation, workspace.state.parcels.contains(where: { $0.id == parcel.id }) else { throw WorkspaceError.rejected("Select a parcel with a reviewed current boundary.") }
        guard let date = draft.observationDay, date <= now else { throw WorkspaceError.rejected("Observation dates cannot be in the future in this note’s time zone.") }
        var payload: [String: CommandValue] = ["parcelId": .text(parcel.id), "observedAt": .number(Int64(date.timeIntervalSince1970 * 1000)), "method": .text(draft.method), "finding": .text(draft.finding), "reference": .text(draft.reference)]
        if let timeZone = draft.timeZone {
            payload["observedDate"] = .text(draft.date)
            payload["observedTimeZone"] = .text(timeZone)
        }
        // A repeat of this exact local note/parcel is the same request across app restarts.
        // A changed note or boundary requires a fresh explicit submission.
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        var identity = try encoder.encode(payload)
        identity.append(Data("\n\(draft.id.uuidString)\n\(workspace.state.id)\n\(parcel.boundaries!.last!.id)".utf8))
        let hex = SHA256.hash(data: identity).prefix(16).map { String(format: "%02x", $0) }.joined()
        let chars = Array(hex)
        let requestId = [0..<8,8..<12,12..<16,16..<20,20..<32].map { String(chars[$0]) }.joined(separator: "-")
        return WorkspaceCommand(id: workspace.state.id, version: workspace.version, op: "record_observation", payload: payload, requestId: requestId)
    }
}
struct WorkspaceClient {
    let token: String
    static let maximumBytes = 8_000_000
    static func decode<T: Decodable>(_ type: T.Type, data: Data, status: Int, mimeType: String?) throws -> T {
        if status == 401 || (300..<400).contains(status) { throw WorkspaceError.unauthorized }
        if status == 403 { throw WorkspaceError.denied }
        if status == 409 { throw WorkspaceError.conflict }
        guard data.count <= maximumBytes else { throw WorkspaceError.oversized }
        guard mimeType?.lowercased() == "application/json" else { throw WorkspaceError.invalid }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if status == 400 || status == 404 || status == 413 || status == 429 {
            throw WorkspaceError.rejected((object?["error"] as? String).map { String($0.prefix(2000)) } ?? "The service declined this request. Check your access and try again.")
        }
        guard status == 200 || status == 201 else { throw WorkspaceError.unavailable }
        if let membership = object?["membershipStatus"] as? String { throw WorkspaceError.inactive(String(membership.prefix(50))) }
        do { return try JSONDecoder().decode(type, from: data) }
        catch { throw WorkspaceError.invalid }
    }
    func request(method: String = "GET", id: String? = nil, command: WorkspaceCommand? = nil) throws -> URLRequest {
        let credential = try DeviceCredential.validate(token)
        var request = URLRequest(url: CommunityService.page("api/workspaces", id: id))
        request.httpMethod = method
        request.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let command {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
            request.httpBody = try encoder.encode(command)
        }
        return request
    }
    private func send<T: Decodable>(_ type: T.Type, request: URLRequest, configuration: URLSessionConfiguration) async throws -> T {
        configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 20; configuration.timeoutIntervalForResource = 30
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        do {
            let (bytes, response) = try await session.bytes(for: request, delegate: CommunityRedirectPolicy())
            guard let http = response as? HTTPURLResponse else { throw WorkspaceError.invalid }
            guard http.expectedContentLength <= Int64(Self.maximumBytes) else { throw WorkspaceError.oversized }
            var data = Data()
            for try await byte in bytes {
                guard data.count < Self.maximumBytes else { throw WorkspaceError.oversized }
                data.append(byte)
            }
            return try Self.decode(type, data: data, status: http.statusCode, mimeType: http.mimeType)
        } catch let error as WorkspaceError { throw error }
        catch { throw WorkspaceError.unavailable }
    }
    func list(configuration: URLSessionConfiguration = .ephemeral) async throws -> [WorkspaceSummary] {
        try await send(WorkspaceList.self, request: request(), configuration: configuration).workspaces
    }
    func detail(_ id: String, configuration: URLSessionConfiguration = .ephemeral) async throws -> WorkspaceView {
        try await send(WorkspaceView.self, request: request(id: id), configuration: configuration)
    }
    func submit(_ command: WorkspaceCommand, configuration: URLSessionConfiguration = .ephemeral) async throws -> WorkspaceView {
        try await send(WorkspaceView.self, request: request(method: "POST", command: command), configuration: configuration)
    }
}
