import XCTest
@testable import VergeFieldCore

final class DiscussionTests: XCTestCase {
    let owner = "account-a"
    let token = "synthetic-personal-device-token"
    func workspace(version: Int = 4, visibility: String = "private", role: String = "member", updateHidden: Bool = false) throws -> WorkspaceView {
        try JSONDecoder().decode(WorkspaceView.self, from: Data("""
        {"state":{"id":"coop-a","name":"Synthetic co-op","summary":"Local test","visibility":"\(visibility)","projects":[],"updates":[
          {"id":"post-a","text":"Coordinate our field visit","author":"Maya","createdAt":1,"hidden":\(updateHidden)},
          {"id":"blocked-post","text":"Moderation only","author":"Hidden member","createdAt":2,"hidden":false,"blocked":true},
          {"id":"hidden-post","text":"Moderation only","author":"Maya","createdAt":3,"hidden":true}
        ],"comments":[
          {"id":"reply-b","updateId":"post-a","text":"Later","author":"Theo","createdAt":20,"hidden":false,"isYou":true,"blocked":false},
          {"id":"reply-a","updateId":"post-a","text":"First","author":"Nadia","createdAt":10,"hidden":false},
          {"id":"blocked","updateId":"post-a","text":"Moderation only","author":"Other","createdAt":11,"hidden":false,"blocked":true},
          {"id":"hidden","updateId":"post-a","text":"Moderation only","author":"Other","createdAt":12,"hidden":true},
          {"id":"parent-blocked","updateId":"blocked-post","text":"Unavailable parent","author":"Nadia","createdAt":13,"hidden":false},
          {"id":"parent-hidden","updateId":"hidden-post","text":"Unavailable parent","author":"Nadia","createdAt":14,"hidden":false},
          {"id":"orphan","updateId":"missing","text":"Missing parent","author":"Nadia","createdAt":15,"hidden":false}
        ],"tasks":[],"parcels":[],"observations":[]},"version":\(version),"role":"\(role)"}
        """.utf8))
    }
    func item() throws -> QueuedReply { try QueuedReply(ownerID: owner, updateID: "post-a", text: "  I can help with the survey.  ", workspace: workspace()) }
    func file() throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory.appendingPathComponent("replies.json")
    }
    func testMemberDiscussionFiltersHiddenBlockedAndUnavailableParentsInStewardProjection() throws {
        let state = try workspace(role: "steward").state
        XCTAssertEqual(state.comments?.count, 7)
        XCTAssertEqual(state.visibleComments(for: "post-a").map(\.id), ["reply-a", "reply-b"])
        XCTAssertEqual(state.visibleComments(for: "post-a").last?.isYou, true)
        for parent in ["hidden-post", "blocked-post", "missing"] { XCTAssertTrue(state.visibleComments(for: parent).isEmpty) }
        XCTAssertTrue(try workspace(updateHidden: true).state.visibleComments(for: "post-a").isEmpty)
    }
    func testLegacyWorkspaceWithoutCommentsRemainsReadable() throws {
        let data = Data("""
        {"state":{"id":"old","name":"Old","summary":"Old response","visibility":"private","projects":[],"updates":[],"tasks":[],"parcels":[],"observations":[]},"version":0,"role":"member"}
        """.utf8)
        let legacy = try JSONDecoder().decode(WorkspaceView.self, from: data)
        XCTAssertNil(legacy.state.comments); XCTAssertTrue(legacy.state.visibleComments(for: "unknown").isEmpty)
    }
    func testReplyAndReportCommandsRejectUnavailableTargetsAndEnforceServerTextBounds() throws {
        let workspace = try workspace()
        let command = try WorkspaceCommand.reply("post-a", text: "  I can help  ", workspace: workspace)
        XCTAssertEqual(command.op, "post_comment")
        XCTAssertEqual(command.payload, ["updateId": .text("post-a"), "text": .text("I can help")])
        for id in ["blocked-post", "hidden-post", "unknown"] { XCTAssertThrowsError(try WorkspaceCommand.reply(id, text: "Reply", workspace: workspace)) }
        for text in [" \n", String(repeating: "a", count: 2001), String(repeating: "🌱", count: 1001)] { XCTAssertThrowsError(try WorkspaceCommand.reply("post-a", text: text, workspace: workspace)) }
        XCTAssertThrowsError(try WorkspaceCommand.reply("post-a", text: "Reply", workspace: self.workspace(visibility: "archived")))
        XCTAssertThrowsError(try WorkspaceCommand.reply("post-a", text: "Reply", workspace: self.workspace(role: "pending")))
        let report = try WorkspaceCommand.reportComment("reply-a", reason: "  Personal details  ", workspace: workspace)
        XCTAssertEqual(report.payload, ["kind": .text("comment"), "targetId": .text("reply-a"), "reason": .text("Personal details")])
        for id in ["blocked", "hidden", "parent-blocked", "parent-hidden", "orphan"] { XCTAssertThrowsError(try WorkspaceCommand.reportComment(id, reason: "Concern", workspace: workspace)) }
    }
    func testProtectedReopenPreservesExactBodyAndSeparatesAccounts() throws {
        let file = try file(), repo = try ReplyQueueRepository(file: file), item = try item()
        try repo.save(item, owner: owner)
        let first = try repo.begin(item.id, owner: owner)
        let request = try WorkspaceClient(token: token).request(method: "POST", command: first.command())
        let reopened = try ReplyQueueRepository(file: file)
        let repeated = try reopened.begin(item.id, owner: owner)
        XCTAssertEqual(try WorkspaceClient(token: "replacement-token-same-owner").request(method: "POST", command: repeated.command()).httpBody, request.httpBody)
        XCTAssertEqual(repeated.text, "I can help with the survey.")
        XCTAssertFalse(String(data: try Data(contentsOf: file), encoding: .utf8)!.contains(token))
        XCTAssertTrue(try reopened.replies(owner: "account-b").isEmpty)
        XCTAssertThrowsError(try reopened.item(item.id, owner: "account-b"))
        XCTAssertThrowsError(try reopened.begin(item.id, owner: "account-b"))
        XCTAssertThrowsError(try reopened.removeReceipt(item.id, owner: owner))
        XCTAssertThrowsError(try reopened.save(self.item(), owner: owner))
    }
    func testCompletionFailurePreservesRetryAndSuccessfulReceiptRemovesText() throws {
        let file = try file(), item = try item(), repo = try ReplyQueueRepository(file: file)
        try repo.save(item, owner: owner); _ = try repo.begin(item.id, owner: owner)
        let failing = try ReplyQueueRepository(file: file, writer: { _, _ in throw CocoaError(.fileWriteOutOfSpace) })
        XCTAssertThrowsError(try failing.complete(item.id, owner: owner))
        XCTAssertThrowsError(try failing.replies(owner: owner))
        let reopened = try ReplyQueueRepository(file: file)
        XCTAssertEqual(try reopened.item(item.id, owner: owner).phase, .submitting)
        try reopened.complete(item.id, owner: owner)
        let complete = try ReplyQueueRepository(file: file).item(item.id, owner: owner)
        XCTAssertEqual(complete.phase, .complete); XCTAssertNil(complete.text); XCTAssertNotNil(complete.completedAt)
        XCTAssertEqual(complete.requestID, item.requestID)
        XCTAssertFalse(String(data: try Data(contentsOf: file), encoding: .utf8)!.contains("I can help"))
        try reopened.removeReceipt(item.id, owner: owner)
        XCTAssertTrue(try reopened.replies(owner: owner).isEmpty)
    }
    func testWriterErrorAfterRenameBlocksStaleMutationUntilReopen() throws {
        let file = try file(), item = try item(), repo = try ReplyQueueRepository(file: file)
        try repo.save(item, owner: owner)
        let uncertain = try ReplyQueueRepository(file: file, writer: { data, file in
            try EvidenceQueueRepository.atomicWrite(data, file)
            throw CocoaError(.fileWriteNoPermission)
        })
        XCTAssertThrowsError(try uncertain.begin(item.id, owner: owner))
        let persisted = try Data(contentsOf: file)
        XCTAssertThrowsError(try uncertain.begin(item.id, owner: owner))
        XCTAssertThrowsError(try uncertain.eraseAllLocal())
        XCTAssertEqual(try Data(contentsOf: file), persisted)
        XCTAssertEqual(try ReplyQueueRepository(file: file).item(item.id, owner: owner).phase, .submitting)
    }
    func testConflictRefreshRequiresCurrentVisibleParentAndKeepsConfirmedPayload() throws {
        let repo = try ReplyQueueRepository(file: file()), item = try item()
        try repo.save(item, owner: owner); _ = try repo.begin(item.id, owner: owner)
        try repo.requireReview(item.id, owner: owner)
        XCTAssertThrowsError(try repo.begin(item.id, owner: owner))
        XCTAssertThrowsError(try repo.review(item.id, owner: owner, workspace: workspace(version: 9, updateHidden: true)))
        XCTAssertThrowsError(try repo.review(item.id, owner: owner, workspace: workspace(version: 9, visibility: "archived")))
        XCTAssertEqual(try repo.item(item.id, owner: owner).version, 4)
        try repo.review(item.id, owner: owner, workspace: workspace(version: 9))
        let reviewed = try repo.item(item.id, owner: owner)
        XCTAssertEqual(reviewed.phase, .prepared); XCTAssertEqual(reviewed.version, 9)
        XCTAssertEqual(reviewed.requestID, item.requestID); XCTAssertEqual(reviewed.text, item.text)
    }
    func testDeniedAndUncertainNetworkResponsesCannotBecomeAReplyReceipt() async throws {
        let file = try file(), repo = try ReplyQueueRepository(file: file), item = try item()
        try repo.save(item, owner: owner)
        let client = WorkspaceClient(token: token)
        let original = try client.request(method: "POST", command: repo.begin(item.id, owner: owner).command()).httpBody
        for status in [500, 401, 403, 409] {
            WorkspaceStub.status = status; WorkspaceStub.data = Data("{\"error\":\"Unavailable\"}".utf8)
            let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [WorkspaceStub.self]
            do { _ = try await client.submit(repo.item(item.id, owner: owner).command(), configuration: config); XCTFail("Must reject") }
            catch { XCTAssertTrue(error is WorkspaceError) }
            let restored = try ReplyQueueRepository(file: file).item(item.id, owner: owner)
            XCTAssertEqual(restored.phase, .submitting)
            XCTAssertEqual(try client.request(method: "POST", command: restored.command()).httpBody, original)
        }
    }
    func testMismatchedWorkspaceSuccessCannotConfirmReply() async throws {
        WorkspaceStub.status = 200
        WorkspaceStub.data = Data("""
        {"state":{"id":"another-coop","name":"Wrong","summary":"Test","visibility":"private","projects":[],"updates":[],"tasks":[],"parcels":[],"observations":[]},"version":1,"role":"member"}
        """.utf8)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [WorkspaceStub.self]
        do { _ = try await WorkspaceClient(token: token).submit(WorkspaceCommand.reply("post-a", text: "Reply", workspace: workspace()), configuration: config); XCTFail("Must reject mismatched co-op") }
        catch { guard case WorkspaceError.invalid = error else { return XCTFail("Unexpected error") } }
    }
    func testCorruptReplyQueueIsPreservedAndNotSilentlyReset() throws {
        let file = try file(), data = Data("{broken".utf8)
        try data.write(to: file)
        XCTAssertThrowsError(try ReplyQueueRepository(file: file))
        XCTAssertEqual(try Data(contentsOf: file), data)
    }
    func testDefiniteRejectionAllowsOnlyTargetedReplacementAndPreservesOtherAccounts() throws {
        let file = try file(), repo = try ReplyQueueRepository(file: file), item = try item()
        let other = try QueuedReply(ownerID: "account-b", updateID: "post-a", text: "Other account's pending reply", workspace: workspace())
        try repo.save(item, owner: owner); try repo.save(other, owner: "account-b")
        _ = try repo.begin(item.id, owner: owner)
        try repo.rejectSubmission(item.id, owner: owner, earlierOutcomeUncertain: false)
        let reopened = try ReplyQueueRepository(file: file)
        XCTAssertEqual(try reopened.item(item.id, owner: owner).phase, .rejected)
        XCTAssertThrowsError(try reopened.replaceRejected(item.id, owner: "account-b", text: "Changed", workspace: workspace()))
        XCTAssertThrowsError(try reopened.replaceRejected(item.id, owner: owner, text: " ", workspace: workspace()))
        XCTAssertThrowsError(try reopened.replaceRejected(item.id, owner: owner, text: "Corrected", workspace: workspace(updateHidden: true)))
        let replacement = try reopened.replaceRejected(item.id, owner: owner, text: "Corrected field visit reply", workspace: workspace(version: 9))
        XCTAssertNotEqual(replacement.requestID, item.requestID)
        XCTAssertEqual(replacement.phase, .prepared); XCTAssertEqual(replacement.version, 9)
        XCTAssertEqual(replacement.text, "Corrected field visit reply")
        XCTAssertEqual(try reopened.replies(owner: owner).count, 1)
        XCTAssertEqual(try reopened.item(other.id, owner: "account-b"), other)
        XCTAssertThrowsError(try reopened.item(item.id, owner: owner))
    }
    func testDeniedRetryCannotUnlockReplacementOfEarlierUncertainReply() throws {
        let file = try file(), repo = try ReplyQueueRepository(file: file), item = try item()
        try repo.save(item, owner: owner)
        let first = try repo.begin(item.id, owner: owner)
        let body = try WorkspaceClient(token: token).request(method: "POST", command: first.command()).httpBody
        try repo.rejectSubmission(item.id, owner: owner, earlierOutcomeUncertain: true)
        let reopened = try ReplyQueueRepository(file: file)
        XCTAssertEqual(try reopened.item(item.id, owner: owner).phase, .submitting)
        XCTAssertThrowsError(try reopened.replaceRejected(item.id, owner: owner, text: "Changed", workspace: workspace()))
        XCTAssertEqual(try WorkspaceClient(token: token).request(method: "POST", command: reopened.item(item.id, owner: owner).command()).httpBody, body)
    }
    func testRejectedReplacementWriteFailurePreservesOriginalReplyUntilReload() throws {
        let file = try file(), repo = try ReplyQueueRepository(file: file), item = try item()
        try repo.save(item, owner: owner); _ = try repo.begin(item.id, owner: owner)
        try repo.rejectSubmission(item.id, owner: owner, earlierOutcomeUncertain: false)
        let before = try Data(contentsOf: file)
        let failing = try ReplyQueueRepository(file: file, writer: { _, _ in throw CocoaError(.fileWriteOutOfSpace) })
        XCTAssertThrowsError(try failing.replaceRejected(item.id, owner: owner, text: "Changed", workspace: workspace()))
        XCTAssertThrowsError(try failing.replies(owner: owner))
        XCTAssertEqual(try Data(contentsOf: file), before)
        XCTAssertEqual(try ReplyQueueRepository(file: file).item(item.id, owner: owner).phase, .rejected)
    }
    func testAccessRevocationAndInactiveMembershipRequirePrivateViewRefresh() {
        for status in [401, 403] {
            do { _ = try WorkspaceClient.decode(WorkspaceView.self, data: Data("{}".utf8), status: status, mimeType: "application/json"); XCTFail("Must reject") }
            catch { XCTAssertTrue((error as? WorkspaceError)?.requiresAccessRefresh == true) }
        }
        do { _ = try WorkspaceClient.decode(WorkspaceView.self, data: Data("{\"membershipStatus\":\"removed\"}".utf8), status: 200, mimeType: "application/json"); XCTFail("Must reject") }
        catch { XCTAssertTrue((error as? WorkspaceError)?.requiresAccessRefresh == true) }
        XCTAssertFalse(WorkspaceError.conflict.requiresAccessRefresh)
        XCTAssertFalse(WorkspaceError.unavailable.requiresAccessRefresh)
        XCTAssertFalse(WorkspaceError.rejected("Edit this reply").requiresAccessRefresh)
    }
}
