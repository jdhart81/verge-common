import Foundation

struct FieldDraft: Codable, Identifiable, Equatable {
    var id = UUID()
    var place: String
    var date: String
    var method: String
    var finding: String
    var reference: String = ""

    func validated() throws -> FieldDraft {
        func check(_ value: String, _ max: Int, required: Bool = true) throws {
            if value.utf16.count > max || (required && value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { throw DraftError.invalid }
        }
        try check(place, 200); try check(method, 1000); try check(finding, 2000); try check(reference, 500, required: false)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
        guard let day = formatter.date(from: date), formatter.string(from: day) == date else { throw DraftError.invalid }
        if !reference.isEmpty {
            guard let url = URLComponents(string: reference), url.scheme == "https", let host = url.host, !host.isEmpty,
                  url.user == nil, url.password == nil else { throw DraftError.invalid }
        }
        return self
    }
}
enum DraftError: Error, LocalizedError {
    case invalid, unsupported, capacity, conflict
    var errorDescription: String? {
        switch self {
        case .conflict: return "A backup note has the same ID as an edited note on this device. Nothing was imported. Keep both backups and resolve the difference before retrying."
        case .invalid: return "Check the date, text limits, and HTTPS reference. All observation fields except reference are required."
        case .unsupported: return "This journal could not be read. Existing data has been preserved."
        case .capacity: return "The journal is full. Export and remove older drafts before adding more."
        }
    }
}
struct FieldExport: Codable {
    let format: String
    let version: Int
    let draft: FieldDraft
    init(_ draft: FieldDraft) { format = "verge-field-draft"; version = 1; self.draft = draft }
    func data() throws -> Data { let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; return try encoder.encode(self) }
}
struct JournalFile: Codable {
    var version = 1
    var drafts: [FieldDraft]
    static func read(_ data: Data) throws -> [FieldDraft] {
        guard data.count <= 10_000_000 else { throw DraftError.capacity }
        let file = try JSONDecoder().decode(Self.self, from: data)
        guard file.version == 1, file.drafts.count <= 1000, Set(file.drafts.map(\.id)).count == file.drafts.count else { throw DraftError.unsupported }
        return try file.drafts.map { try $0.validated() }
    }
    func data() throws -> Data {
        guard version == 1, Set(drafts.map(\.id)).count == drafts.count else { throw DraftError.unsupported }
        guard drafts.count <= 1000 else { throw DraftError.capacity }
        _ = try drafts.map { try $0.validated() }
        let data = try JSONEncoder().encode(self)
        guard data.count <= 10_000_000 else { throw DraftError.capacity }
        return data
    }
}

/// Owns disk state. Publish changes only after a successful atomic write.
final class JournalRepository {
    private(set) var drafts: [FieldDraft]
    private let file: URL
    private let writer: (Data, URL) throws -> Void
    init(file: URL, writer: @escaping (Data, URL) throws -> Void = JournalRepository.atomicWrite) throws {
        self.file = file; self.writer = writer
        do { drafts = try Self.readFile(file) }
        catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile { drafts = [] }
    }
    static func readFile(_ file: URL) throws -> [FieldDraft] {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: 10_000_001) ?? Data()
        return try JournalFile.read(data)
    }
    static func atomicWrite(_ data: Data, _ file: URL) throws {
        #if os(iOS)
        try data.write(to: file, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: file, options: [.atomic])
        #endif
    }
    func save(_ draft: FieldDraft) throws {
        var next = drafts
        if let index = next.firstIndex(where: { $0.id == draft.id }) { next[index] = try draft.validated() }
        else { next.insert(try draft.validated(), at: 0) }
        try commit(next)
    }
    func remove(_ id: UUID) throws { try commit(drafts.filter { $0.id != id }) }
    func merge(_ incoming: [FieldDraft]) throws -> Int {
        // A conflict rejects the entire import; no silent replacement of edited notes.
        var next = drafts
        for draft in incoming {
            _ = try draft.validated()
            if let existing = next.first(where: { $0.id == draft.id }) {
                guard existing == draft else { throw DraftError.conflict }
            } else { next.append(draft) }
        }
        let added = next.count - drafts.count
        if added > 0 { try commit(next) }
        return added
    }
    func backup() throws -> Data { try JournalFile(drafts: drafts).data() }
    private func commit(_ next: [FieldDraft]) throws {
        let data = try JournalFile(drafts: next).data()
        try writer(data, file)
        drafts = next
    }
}
