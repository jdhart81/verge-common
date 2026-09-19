import Foundation

enum NativeAccountAction: String { case login, register, recover, logout, delete }

struct NativeAccountUser: Decodable {
    let id: String
    let username: String
    let displayName: String
}
struct NativeAccountSession: Decodable {
    let user: NativeAccountUser
    let token: String
    let expiresAt: Double
    let recoveryCode: String?
}
struct NativeAccountCompletion: Decodable {
    let ok: Bool
    let deleted: Bool?
}
enum NativeAccountError: Error, LocalizedError {
    case invalid, unavailable, rejected(String)
    var errorDescription: String? {
        switch self {
        case .invalid: return "The account service returned an unsupported response. Please try again or use the website."
        case .unavailable: return "Couldn’t reach your account. If you were creating an account, try signing in before registering again. If password recovery lost its connection, try signing in with your new password."
        case .rejected(let message): return message
        }
    }
}

/// Account secrets are sent only to the canonical HTTPS origin, never cookies, caches or redirects.
struct NativeAccountClient {
    static let maximumBytes = 65_536
    static func request(_ action: NativeAccountAction, username: String = "", displayName: String = "", password: String = "", recoveryCode: String = "", token: String? = nil, confirmation: String = "") throws -> URLRequest {
        var payload: [String: String] = [:]
        if action == .login || action == .register || action == .recover {
            let name = username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard name.range(of: "^[a-z0-9][a-z0-9_-]{2,39}$", options: .regularExpression) != nil else {
                throw NativeAccountError.rejected("Use a username of 3–40 letters, numbers, underscores or hyphens, starting with a letter or number.")
            }
            payload["username"] = name
        }
        if action != .logout {
            guard (12...128).contains(password.utf16.count) else { throw NativeAccountError.rejected("Use a password of 12 to 128 characters.") }
            payload["password"] = password
        }
        if action == .register {
            let display = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !display.isEmpty, display.utf16.count <= 80 else { throw NativeAccountError.rejected("Enter a display name of 1 to 80 characters.") }
            payload["displayName"] = display
        }
        if action == .recover {
            let code = recoveryCode.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (20...256).contains(code.utf8.count), code.unicodeScalars.allSatisfy({ (33...126).contains($0.value) }) else {
                throw NativeAccountError.rejected("Enter the recovery code you saved when creating or recovering your account.")
            }
            payload["recoveryCode"] = code
        }
        if action == .delete {
            guard confirmation == "DELETE" else { throw NativeAccountError.rejected("Type DELETE to confirm permanent account deletion.") }
            payload["confirmation"] = confirmation
        }
        let url = CommunityService.page("auth/native/\(action.rawValue)")
        guard url.scheme == "https", url.host == CommunityService.origin.host else { throw NativeAccountError.invalid }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(CommunityService.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if action == .logout || action == .delete {
            guard let token else { throw WorkspaceError.unauthorized }
            request.setValue("Bearer \(try DeviceCredential.validate(token))", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONEncoder().encode(payload)
        return request
    }
    static func decode<T: Decodable>(_ type: T.Type, data: Data, status: Int, mimeType: String?) throws -> T {
        guard data.count <= maximumBytes, mimeType?.lowercased() == "application/json", !(300..<400).contains(status) else { throw NativeAccountError.invalid }
        if (400..<500).contains(status) || status == 503 {
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let message = (object?["error"] as? String).map { String($0.prefix(1000)) }
            throw NativeAccountError.rejected(message ?? "The account service declined this request. Check your details and try again.")
        }
        guard status == 200 || status == 201 else { throw NativeAccountError.unavailable }
        do { return try JSONDecoder().decode(type, from: data) }
        catch { throw NativeAccountError.invalid }
    }
    private func send<T: Decodable>(_ type: T.Type, request: URLRequest, configuration: URLSessionConfiguration) async throws -> T {
        configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 20; configuration.timeoutIntervalForResource = 30
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        do {
            let (bytes, response) = try await session.bytes(for: request, delegate: CommunityRedirectPolicy())
            guard let http = response as? HTTPURLResponse, http.expectedContentLength <= Int64(Self.maximumBytes) else { throw NativeAccountError.invalid }
            var data = Data()
            for try await byte in bytes {
                guard data.count < Self.maximumBytes else { throw NativeAccountError.invalid }
                data.append(byte)
            }
            return try Self.decode(type, data: data, status: http.statusCode, mimeType: http.mimeType)
        } catch let error as NativeAccountError { throw error }
        catch { throw NativeAccountError.unavailable }
    }
    func authenticate(_ action: NativeAccountAction, username: String, displayName: String = "", password: String, recoveryCode: String = "", configuration: URLSessionConfiguration = .ephemeral) async throws -> NativeAccountSession {
        guard action == .login || action == .register || action == .recover else { throw NativeAccountError.invalid }
        let request = try Self.request(action, username: username, displayName: displayName, password: password, recoveryCode: recoveryCode)
        let result = try await send(NativeAccountSession.self, request: request, configuration: configuration)
        _ = try DeviceCredential.validate(result.token)
        guard !result.user.id.isEmpty, !result.user.username.isEmpty, !result.user.displayName.isEmpty,
              result.expiresAt.isFinite, result.expiresAt > Date().timeIntervalSince1970 * 1000 else { throw NativeAccountError.invalid }
        if action != .login {
            guard let code = result.recoveryCode, !code.isEmpty, code.utf8.count <= 256 else { throw NativeAccountError.invalid }
        }
        return result
    }
    func logout(token: String, configuration: URLSessionConfiguration = .ephemeral) async throws {
        let result = try await send(NativeAccountCompletion.self, request: Self.request(.logout, token: token), configuration: configuration)
        guard result.ok else { throw NativeAccountError.invalid }
    }
    func delete(token: String, password: String, confirmation: String, configuration: URLSessionConfiguration = .ephemeral) async throws {
        let result = try await send(NativeAccountCompletion.self, request: Self.request(.delete, password: password, token: token, confirmation: confirmation), configuration: configuration)
        guard result.ok, result.deleted == true else { throw NativeAccountError.invalid }
    }
}
