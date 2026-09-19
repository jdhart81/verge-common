import XCTest
@testable import VergeFieldCore

final class PublicSafetyTests: XCTestCase {
    private func coop(_ id: String, name: String = "Synthetic co-op") -> PublicCoop {
        PublicCoop(id: id, name: name, region: "Test region", country: "US", summary: "Synthetic", memberCount: 2, projects: [], updates: [], events: [])
    }
    private func temporary(_ work: (URL) throws -> Void) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try work(directory.appendingPathComponent("hidden.json"))
    }
    func testReportDraftIncludesOnlyPublicIdentifiersAndFixedRecipient() throws {
        let url = try XCTUnwrap(PublicSafety.reportURL(coopID: "coop&next=other", kind: .update, itemID: "update?x=1&y=2"))
        let parts = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
        XCTAssertEqual(parts.scheme, "mailto")
        XCTAssertEqual(parts.path, "justin@viridisconservation.com")
        XCTAssertEqual(parts.queryItems?.count, 2)
        XCTAssertEqual(parts.queryItems?.first?.name, "subject")
        XCTAssertEqual(parts.queryItems?.first?.value, "VergeCommon public-content concern")
        let body = try XCTUnwrap(parts.queryItems?.last?.value)
        XCTAssertTrue(body.hasPrefix("Public co-op ID: coop&next=other\nPublic update ID: update?x=1&y=2\n"))
        XCTAssertFalse(url.absoluteString.contains("\n"))
        XCTAssertFalse(url.absoluteString.contains("&next=other"))
    }
    func testEveryPublicContentKindHasAnItemSpecificReportAndInvalidIDsAreRejected() throws {
        for kind in [PublicReportKind.project, .update, .event] {
            XCTAssertNil(PublicSafety.reportURL(coopID: "coop-a", kind: kind))
            let url = try XCTUnwrap(PublicSafety.reportURL(coopID: "coop-a", kind: kind, itemID: "item-a"))
            XCTAssertTrue(URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!.last!.value!.contains("Public \(kind.rawValue) ID: item-a"))
        }
        let page = try XCTUnwrap(PublicSafety.reportURL(coopID: "coop-a", kind: .coop))
        XCTAssertFalse(URLComponents(url: page, resolvingAgainstBaseURL: false)!.queryItems!.last!.value!.contains("Public update"))
        for invalid in ["", "coop\r\nBcc: attacker@example.org", String(repeating: "x", count: 129), "with space"] {
            XCTAssertNil(PublicSafety.reportURL(coopID: invalid, kind: .coop))
            XCTAssertNil(PublicSafety.reportURL(coopID: "coop-a", kind: .update, itemID: invalid))
        }
    }
    func testHiddenCoopsStayOutOfDiscoveryAndCanBeShownAfterRelaunch() throws {
        try temporary { file in
            let first = coop("coop-a"), second = coop("coop-b")
            let repository = try HiddenCoopRepository(file: file)
            try repository.hide(first); try repository.hide(first)
            XCTAssertEqual(repository.hidden.count, 1)
            XCTAssertEqual(PublicSafety.visible([first, second], hidden: repository.hidden).map(\.id), ["coop-b"])
            let reopened = try HiddenCoopRepository(file: file)
            XCTAssertEqual(reopened.hidden, [HiddenPublicCoop(id: "coop-a", name: first.name)])
            try reopened.unhide("coop-a")
            XCTAssertEqual(PublicSafety.visible([first, second], hidden: try HiddenCoopRepository(file: file).hidden).map(\.id), ["coop-a", "coop-b"])
        }
    }
    func testFailedHideOrUnhidePreservesPriorPreferences() throws {
        try temporary { file in
            let repository = try HiddenCoopRepository(file: file)
            try repository.hide(coop("coop-a"))
            let original = try Data(contentsOf: file)
            let failing = try HiddenCoopRepository(file: file, writer: { _, _ in throw CocoaError(.fileWriteOutOfSpace) })
            XCTAssertThrowsError(try failing.hide(coop("coop-b")))
            XCTAssertThrowsError(try failing.unhide("coop-a"))
            XCTAssertEqual(failing.hidden.map(\.id), ["coop-a"])
            XCTAssertEqual(try Data(contentsOf: file), original)
        }
    }
    func testCorruptOrDuplicateHiddenPreferencesAreNotOverwritten() throws {
        try temporary { file in
            for data in [Data("not-json".utf8), try JSONEncoder().encode([HiddenPublicCoop(id: "coop-a", name: "A"), HiddenPublicCoop(id: "coop-a", name: "B")])] {
                try data.write(to: file)
                XCTAssertThrowsError(try HiddenCoopRepository(file: file))
                XCTAssertEqual(try Data(contentsOf: file), data)
            }
        }
    }
}
