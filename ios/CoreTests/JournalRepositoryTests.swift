import XCTest
@testable import VergeFieldCore
final class JournalRepositoryTests: XCTestCase {
    func temporary(_ work: (URL) throws -> Void) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try work(directory.appendingPathComponent("journal.json"))
    }
    func draft() -> FieldDraft { FieldDraft(place: "Creek", date: "2026-09-09", method: "Walked bank", finding: "Two saplings") }
    func testSaveEditDeleteAcrossReopens() throws {
        try temporary { file in
            let repo = try JournalRepository(file: file); var note = draft()
            try repo.save(note); XCTAssertEqual(try JournalRepository(file: file).drafts, [note])
            note.finding = "Three saplings"; try repo.save(note)
            let reopened = try JournalRepository(file: file); XCTAssertEqual(reopened.drafts, [note])
            try reopened.remove(note.id); XCTAssertTrue(try JournalRepository(file: file).drafts.isEmpty)
        }
    }
    func testWriteFailurePreservesMemoryAndDisk() throws {
        try temporary { file in
            let note = draft(); try JournalRepository(file: file).save(note)
            let original = try Data(contentsOf: file)
            let failing = try JournalRepository(file: file, writer: { _,_ in throw CocoaError(.fileWriteOutOfSpace) })
            var edited = note; edited.finding = "Changed"
            XCTAssertThrowsError(try failing.save(edited))
            XCTAssertEqual(failing.drafts, [note]); XCTAssertEqual(try Data(contentsOf: file), original)
        }
    }
    func testCorruptFileIsNeverReset() throws {
        try temporary { file in
            let bytes = Data("truncated journal".utf8); try bytes.write(to: file)
            XCTAssertThrowsError(try JournalRepository(file: file)); XCTAssertEqual(try Data(contentsOf: file), bytes)
        }
    }
    func testBackupRestoresAndRepeatedImportIsIdempotent() throws {
        try temporary { file in
            let repo = try JournalRepository(file: file); let note = draft(); try repo.save(note)
            let backup = try JournalFile.read(repo.backup()); try repo.remove(note.id)
            XCTAssertEqual(try repo.merge(backup), 1); XCTAssertEqual(try repo.merge(backup), 0)
            XCTAssertEqual(try JournalRepository(file: file).drafts, [note])
        }
    }
    func testConflictRollsBackWholeImport() throws {
        try temporary { file in
            let repo = try JournalRepository(file: file); let note = draft(); try repo.save(note)
            var conflict = note; conflict.finding = "Different"
            XCTAssertThrowsError(try repo.merge([draft(), conflict]))
            XCTAssertEqual(repo.drafts, [note]); XCTAssertEqual(try JournalRepository(file: file).drafts, [note])
        }
    }
    func testInvalidImportDoesNotWrite() throws {
        try temporary { file in
            let repo = try JournalRepository(file: file); var invalid = draft(); invalid.date = "2026-02-30"
            XCTAssertThrowsError(try repo.merge([draft(), invalid])); XCTAssertTrue(repo.drafts.isEmpty)
            XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
        }
    }
}
