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
    case invalid, unsupported, capacity
    var errorDescription: String? {
        switch self {
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
        guard drafts.count <= 1000 else { throw DraftError.capacity }
        _ = try drafts.map { try $0.validated() }
        let data = try JSONEncoder().encode(self)
        guard data.count <= 10_000_000 else { throw DraftError.capacity }
        return data
    }
}
