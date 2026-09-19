import Foundation

// One deployment for native API requests and browser handoffs. Self-hosters change this URL.
enum CommunityService {
    static let origin = URL(string: "https://vergecommon.com")!
    static func page(_ path: String, id: String? = nil, fragment: String? = nil) -> URL {
        var url = URLComponents(url: origin.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if let id { url.queryItems = [URLQueryItem(name: "id", value: id)] }
        url.fragment = fragment
        return url.url!
    }
    // Browser co-op selection uses `coop`; API record requests use `id`.
    static func coopPage(_ path: String, id: String) -> URL {
        var url = URLComponents(url: page(path), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "coop", value: id)]
        return url.url!
    }
}
struct CommunityPage: Decodable {
    let coops: [PublicCoop]
    let next: Int64?
    let nextId: String?
}
struct CommunityResults {
    private(set) var coops: [PublicCoop] = []
    private(set) var next: Int64?
    private(set) var nextId: String?
    mutating func replace(_ page: CommunityPage) {
        coops = page.coops; next = page.next; nextId = page.nextId
    }
    mutating func append(_ page: CommunityPage) throws {
        // Refuse a cursor that cannot advance. Tied timestamps must advance by ID.
        if let old = next, let new = page.next {
            guard new < old || (new == old && nextId != nil && page.nextId != nil && page.nextId! < nextId!) else { throw CommunityError.invalid }
        }
        var ids = Set(coops.map(\.id))
        coops.append(contentsOf: page.coops.filter { ids.insert($0.id).inserted })
        next = page.next; nextId = page.nextId
    }
}
struct PublicCoop: Decodable, Identifiable {
    let id: String
    let name: String
    let region: String
    let country: String
    let summary: String
    let memberCount: Int
    let projects: [PublicProject]
    let updates: [PublicUpdate]
    let events: [PublicEvent]
}
struct PublicProject: Decodable, Identifiable {
    let id: String
    let name: String
    let summary: String
    let status: String
}
struct PublicUpdate: Decodable, Identifiable {
    let id: String
    let projectId: String
    let text: String
    let createdAt: Double
}
struct PublicEvent: Decodable, Identifiable {
    let id: String
    let projectId: String
    let title: String
    let summary: String
    let startsAt: Double
    let endsAt: Double
    let timeZone: String
    let status: String
}
enum CommunityError: Error, LocalizedError {
    case restricted, unavailable, invalid, oversized
    var errorDescription: String? {
        switch self {
        case .restricted: return "This community service requires access. Open the website to check availability, or connect your device in My co-ops."
        case .unavailable: return "The community service is unavailable. Try again later."
        case .invalid: return "The service did not return a supported community response."
        case .oversized: return "The community response is too large. Open the website to browse it."
        }
    }
}
final class CommunityRedirectPolicy: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
struct CommunityClient {
    static let maximumBytes = 8_000_000
    static func decode(_ data: Data, status: Int, mimeType: String?) throws -> CommunityPage {
        if status == 401 || status == 403 || (300..<400).contains(status) { throw CommunityError.restricted }
        guard status == 200 else { throw CommunityError.unavailable }
        guard mimeType?.lowercased() == "application/json" else { throw CommunityError.invalid }
        guard data.count <= maximumBytes else { throw CommunityError.oversized }
        let page = try JSONDecoder().decode(CommunityPage.self, from: data)
        guard page.coops.count <= 30, Set(page.coops.map(\.id)).count == page.coops.count,
              page.next.map({ $0 >= 0 && (!page.coops.isEmpty || page.nextId != nil) }) ?? (page.nextId == nil),
              page.nextId.map(PublicSafety.validIdentifier) ?? true else { throw CommunityError.invalid }
        return page
    }
    func recent(query: String = "", before: Int64? = nil, beforeId: String? = nil, configuration: URLSessionConfiguration = .ephemeral) async throws -> CommunityPage {
        configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 20; configuration.timeoutIntervalForResource = 30
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        var endpoint = URLComponents(url: CommunityService.page("api/network"), resolvingAgainstBaseURL: false)!
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard search.utf16.count <= 160, !search.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              before.map({ $0 >= 0 }) ?? (beforeId == nil), beforeId.map(PublicSafety.validIdentifier) ?? true else { throw CommunityError.invalid }
        endpoint.queryItems = [URLQueryItem(name: "limit", value: "20")]
        if !search.isEmpty { endpoint.queryItems!.append(URLQueryItem(name: "q", value: search)) }
        if let before { endpoint.queryItems!.append(URLQueryItem(name: "before", value: String(before))) }
        if let beforeId { endpoint.queryItems!.append(URLQueryItem(name: "beforeId", value: beforeId)) }
        var request = URLRequest(url: endpoint.url!)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (bytes, response) = try await session.bytes(for: request, delegate: CommunityRedirectPolicy())
        guard let http = response as? HTTPURLResponse else { throw CommunityError.invalid }
        if http.statusCode != 200 { return try Self.decode(Data(), status: http.statusCode, mimeType: http.mimeType) }
        guard http.expectedContentLength <= Int64(Self.maximumBytes) else { throw CommunityError.oversized }
        var data = Data()
        for try await byte in bytes {
            guard data.count < Self.maximumBytes else { throw CommunityError.oversized }
            data.append(byte)
        }
        return try Self.decode(data, status: http.statusCode, mimeType: http.mimeType)
    }
}
