import XCTest
@testable import VergeFieldCore

final class WorkspaceStub: URLProtocol {
    static var data = Data()
    static var status = 200
    static var requestSeen: URLRequest?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requestSeen = request
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
final class WorkspaceClientTests: XCTestCase {
    private let token = "test-device-token-not-a-real-secret"
    private let detailJSON = """
    {"state":{"id":"coop-a","name":"Test co-op","summary":"Synthetic fixture","visibility":"private","projects":[{"id":"project-a","name":"Restoration","summary":"Test project","status":"active"}],"updates":[],"tasks":[],"parcels":[{"id":"parcel-a","name":"North","boundaries":[{"id":"boundary-a","status":"reviewed"}]}],"observations":[]},"version":3,"role":"member"}
    """
    func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [WorkspaceStub.self]
        return configuration
    }
    func workspace() throws -> WorkspaceView { try WorkspaceClient.decode(WorkspaceView.self, data: Data(detailJSON.utf8), status: 200, mimeType: "application/json") }
    func testAuthenticatedListUsesCanonicalHTTPSAndNoCookie() async throws {
        WorkspaceStub.status = 200
        WorkspaceStub.data = Data("{\"workspaces\":[{\"id\":\"coop-a\",\"name\":\"Test\",\"region\":\"Vermont\",\"visibility\":\"private\",\"version\":3}]}".utf8)
        let result = try await WorkspaceClient(token: token).list(configuration: configuration())
        XCTAssertEqual(result.count, 1)
        let request = try XCTUnwrap(WorkspaceStub.requestSeen)
        XCTAssertEqual(request.url?.absoluteString, "https://vergecommon.com/api/workspaces")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(token)")
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
    }
    func testDetailDecodesMemberViewEnvelopeAndParcels() async throws {
        WorkspaceStub.status = 200; WorkspaceStub.data = Data(detailJSON.utf8)
        let result = try await WorkspaceClient(token: token).detail("coop-a", configuration: configuration())
        XCTAssertEqual(result.version, 3)
        XCTAssertEqual(result.state.name, "Test co-op")
        XCTAssertTrue(result.state.parcels[0].acceptsObservation)
        XCTAssertEqual(WorkspaceStub.requestSeen?.url?.query, "id=coop-a")
    }
    func testMutationCarriesVersionAndStableRequestIdentity() async throws {
        let client = WorkspaceClient(token: token)
        let command = WorkspaceCommand(id: "coop-a", version: 3, op: "post_update", payload: ["projectId": .text("project-a"), "text": .text("Field visit complete"), "visibility": .text("members")])
        let first = try client.request(method: "POST", command: command)
        let retry = try client.request(method: "POST", command: command)
        XCTAssertEqual(first.httpBody, retry.httpBody)
        let data = try XCTUnwrap(first.httpBody)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["version"] as? Int, 3)
        XCTAssertEqual(object["requestId"] as? String, command.requestId)
        XCTAssertEqual(first.value(forHTTPHeaderField: "Content-Type"), "application/json")
        WorkspaceStub.status = 200; WorkspaceStub.data = Data(detailJSON.utf8)
        let updated = try await client.submit(command, configuration: configuration())
        XCTAssertEqual(updated.version, 3)
        XCTAssertEqual(WorkspaceStub.requestSeen?.httpMethod, "POST")
    }
    func testInvalidCredentialCannotBecomeHeader() {
        for credential in ["", "short", token + "\r\nInjected: value", "😀" + token] {
            XCTAssertThrowsError(try WorkspaceClient(token: credential).request())
        }
        XCTAssertEqual(try DeviceCredential.validate("  \(token)\n"), token)
    }
    func testDenialsConflictsAndPendingMembershipAreNotEmptySuccess() {
        for status in [301, 302, 401, 403, 409] {
            XCTAssertThrowsError(try WorkspaceClient.decode(WorkspaceView.self, data: Data(detailJSON.utf8), status: status, mimeType: "application/json"))
        }
        XCTAssertThrowsError(try WorkspaceClient.decode(WorkspaceView.self, data: Data("{\"membershipStatus\":\"pending\",\"name\":\"Test\"}".utf8), status: 200, mimeType: "application/json")) { error in
            guard case WorkspaceError.inactive("pending") = error else { return XCTFail("Expected inactive membership") }
        }
    }
    func testUnauthorizedResponseUsesActionableTokenGuidance() async {
        WorkspaceStub.status = 401; WorkspaceStub.data = Data("{}".utf8)
        do { _ = try await WorkspaceClient(token: token).list(configuration: configuration()); XCTFail("Must fail") }
        catch { XCTAssertTrue(error.localizedDescription.contains("expired or revoked")) }
    }
    func testHTMLAndOversizedResponseRejected() {
        XCTAssertThrowsError(try WorkspaceClient.decode(WorkspaceView.self, data: Data("<html>Sign in</html>".utf8), status: 200, mimeType: "text/html"))
        XCTAssertThrowsError(try WorkspaceClient.decode(WorkspaceView.self, data: Data(repeating: 32, count: 8_000_001), status: 200, mimeType: "application/json"))
    }
    func testFieldDraftRequiresReviewedBoundaryAndExplicitParcelMapping() throws {
        let state = try workspace()
        let draft = FieldDraft(place: "North pond", date: "2026-01-12", method: "Transect", finding: "Eight seedlings", reference: "https://example.org/note")
        let command = try WorkspaceCommand.observation(draft, workspace: state, parcel: state.state.parcels[0])
        let retry = try WorkspaceCommand.observation(draft, workspace: state, parcel: state.state.parcels[0])
        XCTAssertEqual(command.requestId, retry.requestId)
        XCTAssertEqual(command.op, "record_observation")
        XCTAssertEqual(command.payload["parcelId"], .text("parcel-a"))
        XCTAssertEqual(command.payload["observedAt"], .number(1768176000000))
        XCTAssertEqual(command.payload["finding"], .text("Eight seedlings"))
        XCTAssertNil(command.payload["place"])
        XCTAssertNotNil(UUID(uuidString: command.requestId))
        var edited = draft; edited.finding = "Nine seedlings"
        XCTAssertNotEqual(try WorkspaceCommand.observation(edited, workspace: state, parcel: state.state.parcels[0]).requestId, command.requestId)
        let unreviewed = MemberParcel(id: "parcel-a", name: "North", boundaries: [ParcelBoundary(id: "boundary-a", status: "submitted")])
        XCTAssertThrowsError(try WorkspaceCommand.observation(draft, workspace: state, parcel: unreviewed))
        var future = draft; future.date = "2099-01-01"
        XCTAssertThrowsError(try WorkspaceCommand.observation(future, workspace: state, parcel: state.state.parcels[0]))
    }
}
