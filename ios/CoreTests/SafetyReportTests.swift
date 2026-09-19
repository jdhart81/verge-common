import XCTest
@testable import VergeFieldCore

final class SafetyReportStub: URLProtocol {
    static var data = Data()
    static var status = 201
    static var mime = "application/json"
    static var requestSeen: URLRequest?
    static var bodySeen = Data()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requestSeen = request
        Self.bodySeen = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                Self.bodySeen.append(contentsOf: buffer.prefix(count))
            }
        }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: ["Content-Type": Self.mime])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.data); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
final class SafetyReportTests: XCTestCase {
    func draft() throws -> SafetyReportDraft {
        try SafetyReportDraft(kind: .project, coopId: "coop-a", targetId: "project-a", category: "privacy", reason: "This synthetic project contains a private phone number.")
    }
    func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [SafetyReportStub.self]
        return configuration
    }
    func testReportValidationPreventsEmptyContextAndInvalidReceipts() throws {
        let first = try draft(), second = try draft()
        XCTAssertNotEqual(first.receipt, second.receipt)
        XCTAssertTrue(SafetyReportDraft.validReceipt(first.receipt))
        XCTAssertEqual(first.requestId, first.requestId.lowercased())
        let uppercase = try SafetyReportDraft(kind: .general, coopId: nil, targetId: nil, category: "access", reason: first.reason, requestId: "01234567-89AB-4CDE-8FAB-0123456789AB")
        XCTAssertEqual(uppercase.requestId, "01234567-89ab-4cde-8fab-0123456789ab")
        XCTAssertThrowsError(try SafetyReportDraft(kind: .project, coopId: "coop-a", targetId: nil, category: "privacy", reason: first.reason))
        XCTAssertThrowsError(try SafetyReportDraft(kind: .general, coopId: nil, targetId: nil, category: "wrong", reason: first.reason))
        XCTAssertThrowsError(try SafetyReportDraft(kind: .general, coopId: nil, targetId: nil, category: "other", reason: "Too short"))
        XCTAssertThrowsError(try SafetyReportDraft(kind: .general, coopId: nil, targetId: nil, category: "other", reason: String(repeating: "a", count: 4001)))
        XCTAssertThrowsError(try SafetyReportDraft(kind: .general, coopId: nil, targetId: nil, category: "other", reason: first.reason, receipt: String(repeating: "X", count: 64)))
        _ = try SafetyReportDraft(kind: .general, coopId: nil, targetId: nil, category: "access", reason: first.reason)
    }
    func testProtectedReceiptReopensWithoutReasonAndFailurePreservesPreviousState() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        let first = try draft(), second = try draft()
        let repository = try SafetyReceiptRepository(file: file)
        try repository.save(SafetyReportReceipt(first)); try repository.save(SafetyReportReceipt(first))
        XCTAssertEqual(repository.receipts.count, 1)
        let data = try Data(contentsOf: file)
        XCTAssertFalse(String(decoding: data, as: UTF8.self).contains(first.reason))
        let reopened = try SafetyReceiptRepository(file: file)
        XCTAssertEqual(reopened.receipts, repository.receipts)
        let failing = try SafetyReceiptRepository(file: file, writer: { _, _ in throw CocoaError(.fileWriteOutOfSpace) })
        XCTAssertThrowsError(try failing.save(SafetyReportReceipt(second)))
        XCTAssertThrowsError(try failing.remove(first.requestId))
        XCTAssertEqual(try Data(contentsOf: file), data)
        try reopened.remove(first.requestId)
        XCTAssertTrue(try SafetyReceiptRepository(file: file).receipts.isEmpty)
    }
    func testSubmissionAndStatusUseCanonicalPOSTWithStableReceiptAndNoCookies() async throws {
        let draft = try draft()
        SafetyReportStub.status = 201; SafetyReportStub.mime = "application/json"
        SafetyReportStub.data = Data("{\"id\":\"\(draft.requestId)\",\"receipt\":\"\(draft.receipt)\",\"status\":\"received\"}".utf8)
        let client = SafetyReportClient()
        _ = try await client.submit(draft, configuration: configuration())
        let first = try XCTUnwrap(SafetyReportStub.requestSeen)
        let firstBody = SafetyReportStub.bodySeen
        _ = try await client.submit(draft, configuration: configuration())
        XCTAssertEqual(firstBody, SafetyReportStub.bodySeen)
        XCTAssertFalse(firstBody.isEmpty)
        XCTAssertEqual(first.url?.absoluteString, "https://vergecommon.com/api/safety-reports")
        XCTAssertEqual(first.httpMethod, "POST")
        XCTAssertEqual(first.value(forHTTPHeaderField: "Origin"), "https://vergecommon.com")
        XCTAssertNil(first.value(forHTTPHeaderField: "Authorization")); XCTAssertNil(first.value(forHTTPHeaderField: "Cookie"))
        SafetyReportStub.status = 200
        SafetyReportStub.data = Data("{\"id\":\"\(draft.requestId)\",\"status\":\"reviewing\",\"updatedAt\":1234}".utf8)
        let status = try await client.status(SafetyReportReceipt(draft), configuration: configuration())
        XCTAssertEqual(status.status, "reviewing")
        let request = try XCTUnwrap(SafetyReportStub.requestSeen)
        XCTAssertEqual(request.url?.absoluteString, "https://vergecommon.com/api/safety-reports/status")
        XCTAssertNil(request.url?.query, "Private lookup receipt must never be in a URL")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: SafetyReportStub.bodySeen) as? [String: String])
        XCTAssertEqual(body, ["id": draft.requestId, "receipt": draft.receipt])
    }
    func testBadResponsesAndMismatchedReceiptIDsNeverReportSuccess() async throws {
        let draft = try draft()
        for (status, mime, data) in [
            (302, "application/json", Data()),
            (429, "application/json", Data()),
            (200, "text/html", Data("Login".utf8)),
            (200, "application/json", Data(repeating: 32, count: 32_001)),
            (200, "application/json", Data("{\"id\":\"wrong\",\"status\":\"received\"}".utf8)),
            (200, "application/json", Data("{\"id\":\"\(draft.requestId)\",\"status\":\"unrecognized\"}".utf8)),
        ] {
            SafetyReportStub.status = status; SafetyReportStub.mime = mime; SafetyReportStub.data = data
            do { _ = try await SafetyReportClient().submit(draft, configuration: configuration()); XCTFail("Must fail") }
            catch { }
        }
    }
}
