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
    func safetyWorkspace() throws -> WorkspaceView {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(detailJSON.utf8)) as? [String: Any])
        var state = try XCTUnwrap(object["state"] as? [String: Any])
        let updates: [[String: Any]] = [
            ["id": "legacy", "text": "Visible update", "author": "Alex", "createdAt": 1, "hidden": false],
            ["id": "blocked", "text": "Steward moderation record", "author": "Blair", "createdAt": 3, "hidden": false, "blocked": true],
            ["id": "hidden", "text": "Hidden moderation record", "author": "Alex", "createdAt": 2, "hidden": true, "blocked": false],
        ]
        let members: [[String: Any]] = [
            ["id": "member-self", "name": "You", "status": "active", "isYou": true],
            ["id": "member-alex", "name": "Alex", "status": "active", "isYou": false],
            ["id": "member-blair", "name": "Blair", "status": "active", "isYou": false],
            ["id": "member-pending", "name": "Pending", "status": "pending", "isYou": false],
        ]
        state["blocks"] = [
            ["memberId": "member-blair", "name": "Blair"],
            ["memberId": "member-former", "name": "Former member"],
        ]
        state["updates"] = updates
        state["members"] = members
        object["state"] = state
        return try WorkspaceClient.decode(WorkspaceView.self, data: JSONSerialization.data(withJSONObject: object), status: 200, mimeType: "application/json")
    }
    func testBlockedAndHiddenUpdatesStayOutOfNativeFeedIncludingStewardPayloads() throws {
        let state = try safetyWorkspace().state
        XCTAssertEqual(state.updates.count, 3)
        XCTAssertEqual(state.visibleUpdates.map(\.id), ["legacy"])
        XCTAssertEqual(state.blockableMembers.map(\.id), ["member-alex"])
        let legacy = try workspace().state
        XCTAssertNil(legacy.members)
        XCTAssertNil(legacy.blocks)
        XCTAssertTrue(legacy.blockableMembers.isEmpty)
    }
    func testSafetyCommandsUseMembershipIDsAndValidateTargets() throws {
        let workspace = try safetyWorkspace()
        let block = try WorkspaceCommand.memberBlock("member-alex", blocked: true, workspace: workspace)
        XCTAssertEqual(block.op, "block_member")
        XCTAssertEqual(block.payload, ["id": .text("member-alex")])
        XCTAssertEqual(block.version, workspace.version)
        let client = WorkspaceClient(token: token)
        XCTAssertEqual(try client.request(method: "POST", command: block).httpBody, try client.request(method: "POST", command: block).httpBody)
        let unblock = try WorkspaceCommand.memberBlock("member-former", blocked: false, workspace: workspace)
        XCTAssertEqual(unblock.op, "unblock_member")
        XCTAssertEqual(unblock.payload["id"], .text("member-former"))
        XCTAssertThrowsError(try WorkspaceCommand.memberBlock("member-self", blocked: true, workspace: workspace))
        XCTAssertThrowsError(try WorkspaceCommand.memberBlock("member-pending", blocked: true, workspace: workspace))
        XCTAssertThrowsError(try WorkspaceCommand.memberBlock("unknown", blocked: true, workspace: workspace))
        XCTAssertThrowsError(try WorkspaceCommand.memberBlock("member-alex", blocked: false, workspace: workspace))
        let report = try WorkspaceCommand.reportUpdate("legacy", reason: "  Contains personal details  ", workspace: workspace)
        XCTAssertEqual(report.op, "report_content")
        XCTAssertEqual(report.payload, ["kind": .text("update"), "targetId": .text("legacy"), "reason": .text("Contains personal details")])
        XCTAssertThrowsError(try WorkspaceCommand.reportUpdate("blocked", reason: "Concern", workspace: workspace))
        XCTAssertThrowsError(try WorkspaceCommand.reportUpdate("legacy", reason: " \n ", workspace: workspace))
        XCTAssertThrowsError(try WorkspaceCommand.reportUpdate("legacy", reason: String(repeating: "a", count: 2001), workspace: workspace))
    }
    func testAccountClosureLinkUsesCanonicalOriginAndDirectFragment() {
        XCTAssertEqual(CommunityService.page("account", fragment: "close-account").absoluteString, "https://vergecommon.com/account#close-account")
    }
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
