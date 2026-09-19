import XCTest
@testable import VergeFieldCore

final class NativeAccountClientTests: XCTestCase {
    private let password = "a-synthetic-test-password"
    private let token = "synthetic-device-token-not-a-secret"
    private let recovery = "synthetic-recovery-code-not-a-secret"
    private func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [WorkspaceStub.self]
        return configuration
    }
    private func response(recoveryCode: String? = nil, expiry: Double = Date().addingTimeInterval(3600).timeIntervalSince1970 * 1000) throws -> Data {
        var response: [String: Any] = ["user": ["id": "synthetic-user", "username": "native_tester", "displayName": "Native tester"], "token": token, "expiresAt": expiry]
        if let recoveryCode { response["recoveryCode"] = recoveryCode }
        return try JSONSerialization.data(withJSONObject: response)
    }
    private func payload(_ request: URLRequest) throws -> [String: String] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: String])
    }
    func testRegistrationSendsOnlyExplicitAccountFieldsToCanonicalHTTPS() throws {
        let request = try NativeAccountClient.request(.register, username: "  Native_Tester  ", displayName: " Native tester ", password: password, recoveryCode: recovery, token: token)
        XCTAssertEqual(request.url?.absoluteString, "https://vergecommon.com/auth/native/register")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://vergecommon.com")
        XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
        XCTAssertEqual(try payload(request), ["username": "native_tester", "displayName": "Native tester", "password": password])
    }
    func testRecoveryPreservesPasswordAndSendsNoDisplayName() throws {
        let request = try NativeAccountClient.request(.recover, username: "native_tester", displayName: "ignored", password: "  password-spaces-are-intentional  ", recoveryCode: " \(recovery)\n")
        XCTAssertEqual(request.url?.path, "/auth/native/recover")
        XCTAssertEqual(try payload(request), ["username": "native_tester", "password": "  password-spaces-are-intentional  ", "recoveryCode": recovery])
    }
    func testAccountInputValidationMatchesServerBounds() throws {
        for username in ["a", "a b", "-start", "😀tester", String(repeating: "x", count: 41)] {
            XCTAssertThrowsError(try NativeAccountClient.request(.login, username: username, password: password))
        }
        for password in ["short", String(repeating: "a", count: 129), String(repeating: "😀", count: 65)] {
            XCTAssertThrowsError(try NativeAccountClient.request(.register, username: "native_tester", displayName: "Tester", password: password))
        }
        for displayName in [" \n ", String(repeating: "x", count: 81)] {
            XCTAssertThrowsError(try NativeAccountClient.request(.register, username: "native_tester", displayName: displayName, password: password))
        }
        for code in ["", "short", recovery + "\r\nInjected: value", String(repeating: "a", count: 257)] {
            XCTAssertThrowsError(try NativeAccountClient.request(.recover, username: "native_tester", password: password, recoveryCode: code))
        }
    }
    func testDeletionNeedsExactConfirmationAndValidBearerAndPassword() throws {
        for confirmation in ["", "delete", "DELETE "] {
            XCTAssertThrowsError(try NativeAccountClient.request(.delete, password: password, token: token, confirmation: confirmation))
        }
        XCTAssertThrowsError(try NativeAccountClient.request(.delete, password: password, confirmation: "DELETE"))
        XCTAssertThrowsError(try NativeAccountClient.request(.delete, password: "short", token: token, confirmation: "DELETE"))
        let request = try NativeAccountClient.request(.delete, password: password, token: token, confirmation: "DELETE")
        XCTAssertEqual(request.url?.path, "/auth/native/delete")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(token)")
        XCTAssertEqual(try payload(request), ["password": password, "confirmation": "DELETE"])
    }
    func testLogoutDoesNotSendPasswordOrRecoveryAndRejectsHeaderInjection() throws {
        let request = try NativeAccountClient.request(.logout, username: "ignored", password: password, recoveryCode: recovery, token: token)
        XCTAssertEqual(try payload(request), [:])
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(token)")
        XCTAssertThrowsError(try NativeAccountClient.request(.logout, token: token + "\r\nX-Injected: yes"))
    }
    func testLoginDecodesNativeSessionWithoutBrowserCookies() async throws {
        WorkspaceStub.status = 200; WorkspaceStub.data = try response()
        let session = try await NativeAccountClient().authenticate(.login, username: "native_tester", password: password, configuration: configuration())
        XCTAssertEqual(session.user.username, "native_tester")
        XCTAssertEqual(session.token, token)
        XCTAssertNil(session.recoveryCode)
        XCTAssertEqual(WorkspaceStub.requestSeen?.url?.absoluteString, "https://vergecommon.com/auth/native/login")
        XCTAssertNil(WorkspaceStub.requestSeen?.value(forHTTPHeaderField: "Cookie"))
    }
    func testRegistrationAndRecoveryRequireNewRecoveryCode() async throws {
        for action in [NativeAccountAction.register, .recover] {
            WorkspaceStub.status = 201; WorkspaceStub.data = try response(recoveryCode: recovery)
            let session = try await NativeAccountClient().authenticate(action, username: "native_tester", displayName: "Tester", password: password, recoveryCode: recovery, configuration: configuration())
            XCTAssertEqual(session.recoveryCode, recovery)
            WorkspaceStub.data = try response()
            do {
                _ = try await NativeAccountClient().authenticate(action, username: "native_tester", displayName: "Tester", password: password, recoveryCode: recovery, configuration: configuration())
                XCTFail("A new recovery code must be shown before continuing")
            } catch {}
        }
    }
    func testExpiredSessionIsNotAcceptedAsSignedIn() async throws {
        WorkspaceStub.status = 200; WorkspaceStub.data = try response(expiry: 1)
        do { _ = try await NativeAccountClient().authenticate(.login, username: "native_tester", password: password, configuration: configuration()); XCTFail("Must reject expired access") } catch {}
    }
    func testDeletionRequiresExplicitServerConfirmation() async throws {
        WorkspaceStub.status = 200
        for response in ["{}", "{\"ok\":false,\"deleted\":true}", "{\"ok\":true}", "{\"ok\":true,\"deleted\":false}"] {
            WorkspaceStub.data = Data(response.utf8)
            do { try await NativeAccountClient().delete(token: token, password: password, confirmation: "DELETE", configuration: configuration()); XCTFail("Must not report deletion") } catch {}
        }
        WorkspaceStub.data = Data("{\"ok\":true,\"deleted\":true}".utf8)
        try await NativeAccountClient().delete(token: token, password: password, confirmation: "DELETE", configuration: configuration())
        WorkspaceStub.data = Data("{\"ok\":true}".utf8)
        try await NativeAccountClient().logout(token: token, configuration: configuration())
    }
    func testAccountErrorsStayActionableAndNonJSONRedirectsAreRejected() throws {
        for status in [400, 401, 403, 409, 429, 503] {
            XCTAssertThrowsError(try NativeAccountClient.decode(NativeAccountSession.self, data: Data("{\"error\":\"Transfer stewardship before deleting.\"}".utf8), status: status, mimeType: "application/json")) { error in
                XCTAssertEqual(error.localizedDescription, "Transfer stewardship before deleting.")
            }
        }
        for status in [301, 302, 307, 308, 500] {
            XCTAssertThrowsError(try NativeAccountClient.decode(NativeAccountSession.self, data: response(), status: status, mimeType: "application/json"))
        }
        XCTAssertThrowsError(try NativeAccountClient.decode(NativeAccountSession.self, data: Data("<html>Login</html>".utf8), status: 200, mimeType: "text/html"))
        XCTAssertThrowsError(try NativeAccountClient.decode(NativeAccountSession.self, data: Data(repeating: 32, count: 65_537), status: 200, mimeType: "application/json"))
    }
}
