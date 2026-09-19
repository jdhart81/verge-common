import Foundation

enum PublicReportKind: String { case coop, project, update, event }
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
