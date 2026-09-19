import XCTest
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
@testable import VergeFieldCore

final class EvidenceQueueTests: XCTestCase {
    let owner = "account-a"
    let token = "synthetic-device-token-not-a-secret"
    func item(bytes: Data = Data("synthetic private field record".utf8)) throws -> EvidenceItem {
        let data = Data("""
        {"state":{"id":"519a82aa-4a28-4d9e-b31a-fd4f4d285d99","name":"Synthetic co-op","summary":"Local test","visibility":"private","projects":[{"id":"project-a","name":"Meadow","summary":"Local","status":"active"}],"updates":[],"tasks":[],"parcels":[],"observations":[]},"version":4,"role":"member"}
        """.utf8)
        let workspace = try JSONDecoder().decode(WorkspaceView.self, from: data)
        return try EvidenceItem(ownerID: owner, workspace: workspace, project: workspace.state.projects[0], title: "Meadow survey", method: "Field visit", period: "September 2026", notes: "Synthetic test evidence, not a real parcel.", filename: "field-evidence.txt", contentType: "text/plain", bytes: bytes)
    }
    func file() throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory.appendingPathComponent("queue.json")
    }
    func asset(_ item: EvidenceItem) -> EvidenceAsset { .init(id: "3b75c88d-e53d-44f9-a814-0d5b490557ab", filename: item.filename, sha256: item.sha256) }
    func testInterruptedUploadPersistsExactMultipartAndNeverStoresCredentials() throws {
        let file = try file(), repo = try EvidenceQueueRepository(file: file), draft = try item()
        try repo.add(draft)
        let pending = try repo.beginUpload(draft.id, owner: owner)
        let request = try EvidenceClient(token: token).uploadRequest(pending)
        let restored = try EvidenceQueueRepository(file: file).item(draft.id, owner: owner)
        let retried = try EvidenceClient(token: "another-valid-device-token-same-account").uploadRequest(restored)
        XCTAssertEqual(request.url, retried.url); XCTAssertEqual(request.httpBody, retried.httpBody)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), retried.value(forHTTPHeaderField: "Content-Type"))
        XCTAssertEqual(restored.phase, .uploading); XCTAssertEqual(restored.bytes, draft.bytes)
        XCTAssertFalse(String(data: try Data(contentsOf: file), encoding: .utf8)!.contains(token))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://vergecommon.com")
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
    }
    func testLostSubmissionRestoresSameCommandAndRefusesPrematureDeletion() throws {
        let file = try file(), repo = try EvidenceQueueRepository(file: file), draft = try item()
        try repo.add(draft); _ = try repo.beginUpload(draft.id, owner: owner); _ = try repo.uploaded(draft.id, owner: owner, asset: asset(draft))
        let pending = try repo.beginSubmission(draft.id, owner: owner)
        let restored = try EvidenceQueueRepository(file: file)
        let repeated = try restored.beginSubmission(draft.id, owner: owner)
        let client = WorkspaceClient(token: token)
        XCTAssertEqual(try client.request(method: "POST", command: pending.command()).httpBody, try client.request(method: "POST", command: repeated.command()).httpBody)
        XCTAssertThrowsError(try restored.remove(draft.id, owner: owner))
        XCTAssertThrowsError(try restored.item(draft.id, owner: "account-b"))
        XCTAssertThrowsError(try restored.beginSubmission(draft.id, owner: "account-b"))
        XCTAssertEqual(restored.items[0].bytes, draft.bytes)
    }
    func testDurableCompletionDropsBytesOnlyWithReceiptAndWriteFailureKeepsRetry() throws {
        let file = try file(), repo = try EvidenceQueueRepository(file: file), draft = try item()
        try repo.add(draft); _ = try repo.beginUpload(draft.id, owner: owner); _ = try repo.uploaded(draft.id, owner: owner, asset: asset(draft)); _ = try repo.beginSubmission(draft.id, owner: owner)
        let failing = try EvidenceQueueRepository(file: file, writer: { _, _ in throw CocoaError(.fileWriteOutOfSpace) })
        XCTAssertThrowsError(try failing.complete(draft.id, owner: owner))
        XCTAssertEqual(failing.items[0].phase, .submitting); XCTAssertNotNil(failing.items[0].bytes)
        let reopen = try EvidenceQueueRepository(file: file); try reopen.complete(draft.id, owner: owner)
        let completed = try EvidenceQueueRepository(file: file).item(draft.id, owner: owner)
        XCTAssertEqual(completed.phase, .complete); XCTAssertNil(completed.bytes); XCTAssertNotNil(completed.completedAt)
        XCTAssertEqual(completed.requestID, draft.requestID); XCTAssertEqual(completed.asset?.id, asset(draft).id)
    }
    func testCorruptionSizeCapacityAndHashMismatchPreserveExistingFile() throws {
        let file = try file(), repo = try EvidenceQueueRepository(file: file)
        for _ in 0..<10 { try repo.add(item()) }
        let previous = try Data(contentsOf: file)
        XCTAssertThrowsError(try repo.add(item())); XCTAssertEqual(try Data(contentsOf: file), previous)
        XCTAssertThrowsError(try item(bytes: Data())); XCTAssertThrowsError(try item(bytes: Data(count: EvidenceItem.maximumBytes + 1)))
        var object = try JSONSerialization.jsonObject(with: previous) as! [String: Any]
        var items = object["items"] as! [[String: Any]]; items[0]["bytes"] = Data("changed".utf8).base64EncodedString(); object["items"] = items
        let corrupt = try JSONSerialization.data(withJSONObject: object); try corrupt.write(to: file)
        XCTAssertThrowsError(try EvidenceQueueRepository(file: file)); XCTAssertEqual(try Data(contentsOf: file), corrupt)
    }
    func testDiscardIntentAndConflictReviewPersistAcrossRestart() throws {
        let file = try file(), repo = try EvidenceQueueRepository(file: file), draft = try item()
        try repo.add(draft); _ = try repo.beginUpload(draft.id, owner: owner)
        _ = try repo.update(draft.id, owner: owner) { $0.cancelRequested = true }
        let restored = try EvidenceQueueRepository(file: file)
        XCTAssertTrue(restored.items[0].cancelRequested)
        _ = try restored.uploaded(draft.id, owner: owner, asset: asset(draft))
        _ = try restored.update(draft.id, owner: owner) { $0.phase = .discarding }
        XCTAssertEqual(try EvidenceQueueRepository(file: file).items[0].phase, .discarding)
        try restored.remove(draft.id, owner: owner)
        XCTAssertTrue(try EvidenceQueueRepository(file: file).items.isEmpty)
    }
    func testUploadReceiptCannotReplaceBytesOrDestination() throws {
        let repo = try EvidenceQueueRepository(file: file()), draft = try item()
        try repo.add(draft); _ = try repo.beginUpload(draft.id, owner: owner)
        XCTAssertThrowsError(try repo.uploaded(draft.id, owner: owner, asset: .init(id: UUID().uuidString, filename: "someone-else.txt", sha256: draft.sha256)))
        XCTAssertEqual(repo.items[0].phase, .uploading)
        let query = URLComponents(url: try EvidenceClient(token: token).uploadRequest(draft).url!, resolvingAgainstBaseURL: false)!.queryItems!
        XCTAssertEqual(query.first(where: { $0.name == "workspace" })?.value, draft.workspaceID)
        XCTAssertEqual(query.first(where: { $0.name == "uploadId" })?.value, draft.uploadID)
        XCTAssertEqual(try EvidenceClient(token: token).identityRequest().url?.absoluteString, "https://vergecommon.com/auth/native/me")
        XCTAssertThrowsError(try EvidenceClient(token: "bad\r\nheader").uploadRequest(draft))
    }
    func testImageReencodingRemovesGPSAndCapsPixels() throws {
        let context = try XCTUnwrap(CGContext(data: nil, width: 3000, height: 1000, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.setFillColor(CGColor(red: 0.1, green: 0.5, blue: 0.2, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: 3000, height: 1000))
        let pixels = try XCTUnwrap(context.makeImage()), source = NSMutableData()
        let output = try XCTUnwrap(CGImageDestinationCreateWithData(source, UTType.jpeg.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(output, pixels, [kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 40.0, kCGImagePropertyGPSLongitude: -72.0], kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFArtist: "Synthetic identity"]] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(output))
        let prepared = try PreparedEvidenceFile.image(source as Data)
        let decoded = try XCTUnwrap(CGImageSourceCreateWithData(prepared.bytes as CFData, nil))
        let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(decoded, 0, nil) as? [CFString: Any])
        XCTAssertNil(properties[kCGImagePropertyGPSDictionary]); XCTAssertNil((properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any])?[kCGImagePropertyTIFFArtist])
        XCTAssertEqual(properties[kCGImagePropertyPixelWidth] as? Int, 2048)
        XCTAssertLessThanOrEqual(prepared.bytes.count, EvidenceItem.maximumBytes)
        XCTAssertEqual(prepared.contentType, "image/jpeg")
        XCTAssertThrowsError(try PreparedEvidenceFile.image(Data("not a photo".utf8)))
        XCTAssertThrowsError(try PreparedEvidenceFile.document(Data("not a pdf".utf8), type: .pdf))
    }
    func testUnauthorizedRevokedAndConflictResponsesStayErrors() {
        for status in [401, 403, 409, 302] {
            XCTAssertThrowsError(try WorkspaceClient.decode(EvidenceAsset.self, data: Data("{}".utf8), status: status, mimeType: "application/json"))
        }
    }
    func testNetworkIdentityAndUploadConfirmCanonicalBearerRequestAndMatchingReceipt() async throws {
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [WorkspaceStub.self]
        WorkspaceStub.status = 200
        WorkspaceStub.data = Data("{\"user\":{\"id\":\"account-a\",\"username\":\"synthetic\",\"displayName\":\"Synthetic\"}}".utf8)
        let client = EvidenceClient(token: token)
        let identity = try await client.identity(configuration: configuration)
        XCTAssertEqual(identity.id, owner)
        XCTAssertEqual(WorkspaceStub.requestSeen?.value(forHTTPHeaderField: "Authorization"), "Bearer \(token)")
        XCTAssertNil(WorkspaceStub.requestSeen?.value(forHTTPHeaderField: "Cookie"))
        let draft = try item(); WorkspaceStub.status = 201; WorkspaceStub.data = try JSONEncoder().encode(asset(draft))
        let configuration2 = URLSessionConfiguration.ephemeral; configuration2.protocolClasses = [WorkspaceStub.self]
        let uploaded = try await client.upload(draft, configuration: configuration2)
        XCTAssertEqual(uploaded, asset(draft))
        WorkspaceStub.data = try JSONEncoder().encode(EvidenceAsset(id: asset(draft).id, filename: draft.filename, sha256: String(repeating: "0", count: 64)))
        let configuration3 = URLSessionConfiguration.ephemeral; configuration3.protocolClasses = [WorkspaceStub.self]
        do { _ = try await client.upload(draft, configuration: configuration3); XCTFail("Mismatched receipt accepted") }
        catch WorkspaceError.invalid { }
    }

    func testExplicitEraseAfterAccountDeletionIsAtomicAndDoesNotRequireAccountToken() throws {
        let file = try file(), repo = try EvidenceQueueRepository(file: file), draft = try item()
        try repo.add(draft); _ = try repo.beginUpload(draft.id, owner: owner)
        let failing = try EvidenceQueueRepository(file: file, writer: { _, _ in throw CocoaError(.fileWriteOutOfSpace) })
        XCTAssertThrowsError(try failing.eraseAllLocal())
        XCTAssertEqual(try EvidenceQueueRepository(file: file).items.count, 1)
        try repo.eraseAllLocal()
        XCTAssertTrue(try EvidenceQueueRepository(file: file).items.isEmpty)
    }

    func testWriterFailureAfterPublicationRequiresReloadBeforeAnyFurtherMutation() throws {
        let file = try file(), original = try EvidenceQueueRepository(file: file), draft = try item()
        try original.add(draft)
        let uncertain = try EvidenceQueueRepository(file: file, writer: { data, url in
            try EvidenceQueueRepository.atomicWrite(data, url)
            throw CocoaError(.fileWriteNoPermission)
        })
        XCTAssertThrowsError(try uncertain.beginUpload(draft.id, owner: owner))
        XCTAssertEqual(uncertain.items[0].phase, .prepared, "failed commit must not publish a partial in-memory transition")
        let durable = try Data(contentsOf: file)
        XCTAssertEqual(try EvidenceQueueRepository(file: file).items[0].phase, .uploading)
        XCTAssertThrowsError(try uncertain.remove(draft.id, owner: owner))
        XCTAssertThrowsError(try uncertain.eraseAllLocal())
        XCTAssertThrowsError(try uncertain.add(item()))
        XCTAssertEqual(try Data(contentsOf: file), durable, "a stale in-memory snapshot must not overwrite the newer durable retry identity")
        let restored = try EvidenceQueueRepository(file: file)
        XCTAssertEqual(try restored.beginUpload(draft.id, owner: owner).uploadID, draft.uploadID)
    }

    func testPhotoFileInputRejectsOversizedSourceBeforeImageDecodingAndNeverModifiesOriginal() throws {
        let file = try file()
        XCTAssertTrue(FileManager.default.createFile(atPath: file.path, contents: Data("synthetic sparse oversized input".utf8)))
        let handle = try FileHandle(forWritingTo: file)
        try handle.truncate(atOffset: UInt64(PreparedEvidenceFile.maximumSourceBytes + 1)); try handle.close()
        XCTAssertThrowsError(try PreparedEvidenceFile.imageFile(file)) { error in
            guard case EvidenceQueueError.capacity = error else { return XCTFail("the source size guard must run before image decoding") }
        }
        let size = try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber
        XCTAssertEqual(size?.intValue, PreparedEvidenceFile.maximumSourceBytes + 1)
        try Data("not an image".utf8).write(to: file)
        XCTAssertThrowsError(try PreparedEvidenceFile.imageFile(file))
        XCTAssertEqual(try Data(contentsOf: file), Data("not an image".utf8))
    }

    func testDeniedRetryCannotMakeAnEarlierUncertainSubmissionDiscardable() throws {
        let file = try file(), repo = try EvidenceQueueRepository(file: file), draft = try item()
        try repo.add(draft); _ = try repo.beginUpload(draft.id, owner: owner)
        _ = try repo.uploaded(draft.id, owner: owner, asset: asset(draft))
        _ = try repo.beginSubmission(draft.id, owner: owner)
        try repo.submissionRejected(draft.id, owner: owner, earlierOutcomeUncertain: true)
        let restored = try EvidenceQueueRepository(file: file)
        XCTAssertEqual(restored.items[0].phase, .submitting)
        XCTAssertEqual(restored.items[0].requestID, draft.requestID)
        XCTAssertThrowsError(try restored.remove(draft.id, owner: owner))
        try restored.submissionRejected(draft.id, owner: owner, earlierOutcomeUncertain: false)
        XCTAssertEqual(restored.items[0].phase, .uploaded, "a definitive first-attempt rejection still allows confirmed cleanup")
    }

}
