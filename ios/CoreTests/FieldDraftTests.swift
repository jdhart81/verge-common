import XCTest
@testable import VergeFieldCore
final class FieldDraftTests: XCTestCase {
    func example() -> FieldDraft { FieldDraft(place: "River bank", date: "2026-09-09", method: "Walked a 20 m transect", finding: "Three young trees; species uncertain") }
    func testJournalRoundTrip() throws { let draft = example(); XCTAssertEqual(try JournalFile.read(JournalFile(drafts: [draft]).data()), [draft]) }
    func testInvalidDatesAndReferences() { var d = example(); d.date = "2026-02-30"; XCTAssertThrowsError(try d.validated()); d = example(); d.reference = "https://user:secret@example.com"; XCTAssertThrowsError(try d.validated()) }
    func testUnknownVersionAndDuplicateIDs() throws {
        let d = example(); XCTAssertThrowsError(try JournalFile.read(JSONEncoder().encode(JournalFile(version: 2, drafts: [d]))))
        XCTAssertThrowsError(try JournalFile.read(JSONEncoder().encode(JournalFile(drafts: [d,d]))))
    }
    func testExportSchema() throws { let object = try JSONSerialization.jsonObject(with: FieldExport(example()).data()) as! [String: Any]; XCTAssertEqual(object["format"] as? String, "verge-field-draft"); XCTAssertEqual(object["version"] as? Int, 1) }
    func testUTF16LimitMatchesWebsite() { var d = example(); d.place = String(repeating: "🌱", count: 101); XCTAssertThrowsError(try d.validated()) }
    func testCorruptionRejected() { XCTAssertThrowsError(try JournalFile.read(Data("broken".utf8))) }
    func testCalendarZoneAndDaylightSavingRoundTrip() throws {
        var draft = example(); draft.timeZone = "America/New_York"; draft.date = "2026-03-08"
        XCTAssertEqual(try draft.validated().observationDay, ISO8601DateFormatter().date(from: "2026-03-08T05:00:00Z"))
        draft.date = "2026-03-09"
        XCTAssertEqual(try draft.validated().observationDay, ISO8601DateFormatter().date(from: "2026-03-09T04:00:00Z"))
        draft.timeZone = "Pacific/Apia"; draft.date = "2011-12-30"
        XCTAssertThrowsError(try draft.validated(), "A calendar date skipped by a time-zone change is not a valid local day")
        draft = example(); draft.timeZone = "Made/Up"
        XCTAssertThrowsError(try draft.validated())
    }
    func testTodayUsesGregorianCalendarInTheChosenZone() {
        let instant = ISO8601DateFormatter().date(from: "2026-09-19T16:00:00Z")!
        XCTAssertEqual(FieldDraft.today(now: instant, timeZone: TimeZone(identifier: "Asia/Tokyo")!), "2026-09-20")
        XCTAssertEqual(FieldDraft.today(now: instant, timeZone: TimeZone(identifier: "America/Los_Angeles")!), "2026-09-19")
    }
}
