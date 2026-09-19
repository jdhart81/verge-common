import Foundation
import Security

enum PublicReportKind: String, Codable { case coop, project, update, event, general }
enum PublicSafetyError: Error, LocalizedError {
    case invalid, capacity
    var errorDescription: String? {
        switch self {
        case .invalid: return "The saved hidden-co-op list could not be opened. It has not been replaced. Unlock this device and try Reload hidden co-ops."
        case .capacity: return "Your hidden-co-op list is full. Unhide an old entry before adding another."
        }
    }
}
struct HiddenPublicCoop: Codable, Identifiable, Equatable {
    let id: String
    let name: String
}
struct PublicSafety {
    static let supportEmail = "justin@viridisconservation.com"
    static func validIdentifier(_ id: String) -> Bool {
        !id.isEmpty && id.utf8.count <= 128 && id.unicodeScalars.allSatisfy { (33...126).contains($0.value) }
    }
    static func reportURL(coopID: String, kind: PublicReportKind, itemID: String? = nil) -> URL? {
        guard validIdentifier(coopID), kind == .coop || itemID.map(validIdentifier) == true else { return nil }
        var parts = URLComponents()
        parts.scheme = "mailto"; parts.path = supportEmail
        // Only public identifiers are prefilled. Never include body text, credentials or private membership identifiers.
        let record = kind == .coop ? "" : "\nPublic \(kind.rawValue) ID: \(itemID!)"
        parts.queryItems = [URLQueryItem(name: "subject", value: "VergeCommon public-content concern"), URLQueryItem(name: "body", value: "Public co-op ID: \(coopID)\(record)\n\nPlease describe your concern below. Do not include passwords, recovery codes or unnecessary personal details.\n")]
        return parts.url
    }
    static func visible(_ coops: [PublicCoop], hidden: [HiddenPublicCoop]) -> [PublicCoop] {
        let ids = Set(hidden.map(\.id))
        return coops.filter { !ids.contains($0.id) }
    }
}

enum SafetyReportError: Error, LocalizedError {
    case invalid, unavailable, storage, capacity
    var errorDescription: String? {
        switch self {
        case .invalid: return "Describe the concern in 20–4,000 characters and choose a category. Do not include passwords, recovery codes or unnecessary personal details."
        case .unavailable: return "The reporting service could not confirm your request. Keep this form open to retry the same report, or check its saved receipt."
        case .storage: return "Report receipts could not be saved on this device. Unlock it and try again. Existing receipts have been preserved."
        case .capacity: return "This device has 200 saved report receipts. Remove an old receipt before sending another report."
        }
    }
}
struct SafetyReportDraft: Encodable {
    let requestId: String
    let receipt: String
    let kind: PublicReportKind
    let coopId: String?
    let targetId: String?
    let category: String
    let reason: String
    init(kind: PublicReportKind, coopId: String?, targetId: String?, category: String, reason: String, requestId: String = UUID().uuidString, receipt: String? = nil) throws {
        let reason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard UUID(uuidString: requestId) != nil, reason.utf16.count >= 20, reason.utf16.count <= 4000,
              ["abuse", "privacy", "access", "other"].contains(category),
              (kind == .general || coopId != nil), coopId.map(PublicSafety.validIdentifier) ?? true,
              (kind == .coop || kind == .general || targetId != nil), targetId.map(PublicSafety.validIdentifier) ?? true else { throw SafetyReportError.invalid }
        let secret: String
        if let receipt { secret = receipt }
        else {
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw SafetyReportError.storage }
            secret = bytes.map { String(format: "%02x", $0) }.joined()
        }
        guard Self.validReceipt(secret) else { throw SafetyReportError.invalid }
        self.requestId = requestId.lowercased(); self.receipt = secret; self.kind = kind; self.coopId = coopId; self.targetId = targetId; self.category = category; self.reason = reason
    }
    static func validReceipt(_ value: String) -> Bool { value.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) } }
}
struct SafetyReportReceipt: Codable, Identifiable, Equatable {
    let id: String
    let receipt: String
    let createdAt: Date
    init(_ draft: SafetyReportDraft, now: Date = Date()) { id = draft.requestId; receipt = draft.receipt; createdAt = now }
}
struct SafetyReportStatus: Decodable {
    let id: String
    let status: String
    let updatedAt: Double?
    var description: String {
        switch status {
        case "received": return "Received by the project operator"
        case "reviewing": return "Under operator review"
        case "closed": return "Review closed"
        case "action_taken": return "Reviewed; action taken"
        default: return "Status unavailable"
        }
    }
}
final class SafetyReceiptRepository {
    private(set) var receipts: [SafetyReportReceipt]
    private let file: URL
    private let writer: (Data, URL) throws -> Void
    init(file: URL, writer: @escaping (Data, URL) throws -> Void = JournalRepository.atomicWrite) throws {
        self.file = file; self.writer = writer
        do {
            let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
            let data = try handle.read(upToCount: 1_000_001) ?? Data()
            guard data.count <= 1_000_000 else { throw SafetyReportError.storage }
            receipts = try JSONDecoder().decode([SafetyReportReceipt].self, from: data)
            try Self.validate(receipts)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile { receipts = [] }
    }
    private static func validate(_ receipts: [SafetyReportReceipt]) throws {
        guard receipts.count <= 200 else { throw SafetyReportError.capacity }
        guard Set(receipts.map(\.id)).count == receipts.count,
              receipts.allSatisfy({ UUID(uuidString: $0.id) != nil && SafetyReportDraft.validReceipt($0.receipt) && $0.createdAt.timeIntervalSince1970.isFinite }) else { throw SafetyReportError.storage }
    }
    private func commit(_ next: [SafetyReportReceipt]) throws {
        try Self.validate(next)
        try writer(JSONEncoder().encode(next), file); receipts = next
    }
    func save(_ receipt: SafetyReportReceipt) throws {
        if let previous = receipts.first(where: { $0.id == receipt.id }) {
            guard previous.receipt == receipt.receipt else { throw SafetyReportError.storage }
            return
        }
        try commit([receipt] + receipts)
    }
    func remove(_ id: String) throws { try commit(receipts.filter { $0.id != id }) }
}
struct SafetyReportClient {
    func submit(_ draft: SafetyReportDraft, configuration: URLSessionConfiguration = .ephemeral) async throws -> SafetyReportStatus {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let result = try await send(path: "api/safety-reports", data: encoder.encode(draft), configuration: configuration)
        guard result.id == draft.requestId else { throw SafetyReportError.unavailable }
        return result
    }
    func status(_ receipt: SafetyReportReceipt, configuration: URLSessionConfiguration = .ephemeral) async throws -> SafetyReportStatus {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(["id": receipt.id, "receipt": receipt.receipt])
        let result = try await send(path: "api/safety-reports/status", data: data, configuration: configuration)
        guard result.id == receipt.id else { throw SafetyReportError.unavailable }
        return result
    }
    private func send(path: String, data: Data, configuration: URLSessionConfiguration) async throws -> SafetyReportStatus {
        configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 20; configuration.timeoutIntervalForResource = 30
        let session = URLSession(configuration: configuration); defer { session.invalidateAndCancel() }
        var request = URLRequest(url: CommunityService.page(path)); request.httpMethod = "POST"; request.httpBody = data
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(CommunityService.origin.absoluteString, forHTTPHeaderField: "Origin")
        let (bytes, response) = try await session.bytes(for: request, delegate: CommunityRedirectPolicy())
        guard let http = response as? HTTPURLResponse, [200, 201].contains(http.statusCode), http.mimeType == "application/json", http.expectedContentLength <= 32_000 else { throw SafetyReportError.unavailable }
        var result = Data()
        for try await byte in bytes { guard result.count < 32_000 else { throw SafetyReportError.unavailable }; result.append(byte) }
        let decoded = try JSONDecoder().decode(SafetyReportStatus.self, from: result)
        guard ["received", "reviewing", "closed", "action_taken"].contains(decoded.status) else { throw SafetyReportError.unavailable }
        return decoded
    }
}

/// Local display preferences, shared across account switches on this device. They are not user blocks.
final class HiddenCoopRepository {
    private(set) var hidden: [HiddenPublicCoop]
    private let file: URL
    private let writer: (Data, URL) throws -> Void
    init(file: URL, writer: @escaping (Data, URL) throws -> Void = JournalRepository.atomicWrite) throws {
        self.file = file; self.writer = writer
        do {
            let handle = try FileHandle(forReadingFrom: file)
            defer { try? handle.close() }
            let data = try handle.read(upToCount: 1_000_001) ?? Data()
            guard data.count <= 1_000_000 else { throw PublicSafetyError.invalid }
            hidden = try JSONDecoder().decode([HiddenPublicCoop].self, from: data)
            try Self.validate(hidden)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile { hidden = [] }
    }
    private static func validate(_ hidden: [HiddenPublicCoop]) throws {
        guard hidden.count <= 1000 else { throw PublicSafetyError.capacity }
        guard Set(hidden.map(\.id)).count == hidden.count,
              hidden.allSatisfy({ PublicSafety.validIdentifier($0.id) && !$0.name.isEmpty && $0.name.utf16.count <= 160 }) else { throw PublicSafetyError.invalid }
    }
    private func commit(_ next: [HiddenPublicCoop]) throws {
        try Self.validate(next)
        let data = try JSONEncoder().encode(next)
        guard data.count <= 1_000_000 else { throw PublicSafetyError.capacity }
        try writer(data, file); hidden = next
    }
    func hide(_ coop: PublicCoop) throws {
        guard !hidden.contains(where: { $0.id == coop.id }) else { return }
        try commit(hidden + [HiddenPublicCoop(id: coop.id, name: coop.name)])
    }
    func unhide(_ id: String) throws { try commit(hidden.filter { $0.id != id }) }
}
