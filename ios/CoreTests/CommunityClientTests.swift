import XCTest
@testable import VergeFieldCore
final class CommunityStub: URLProtocol {
    static var data = Data()
    static var requestSeen: URLRequest?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requestSeen = request
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
final class CommunityClientTests: XCTestCase {
    func fixture() throws -> Data { try Data(contentsOf: Bundle.module.url(forResource: "community", withExtension: "json", subdirectory: "Fixtures")!) }
    func testSharedBackendContract() throws {
        let page = try CommunityClient.decode(fixture(), status: 200, mimeType: "application/json")
        XCTAssertEqual(page.coops[0].projects.count,1); XCTAssertEqual(page.coops[0].updates[0].text,"Fixture field visit 🌱")
        XCTAssertEqual(page.coops[0].events[0].title,"Fixture walk")
    }
    func testAccessRestrictionsAreNotEmptySuccess() throws {
        for code in [301,302,401,403] {
            XCTAssertThrowsError(try CommunityClient.decode(Data(), status: code, mimeType: "text/html")) { XCTAssertTrue($0 is CommunityError) }
        }
    }
    func testMalformedAndOversizedDataRejected() {
        XCTAssertThrowsError(try CommunityClient.decode(Data("<html>Login</html>".utf8), status:200, mimeType:"text/html"))
        XCTAssertThrowsError(try CommunityClient.decode(Data("{}".utf8), status:200, mimeType:"application/json"))
        XCTAssertThrowsError(try CommunityClient.decode(Data(repeating:32,count:8_000_001), status:200, mimeType:"application/json"))
    }
    func testNativeRequestUsesSharedServiceWithoutCredentials() async throws {
        CommunityStub.data = try fixture()
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [CommunityStub.self]
        let page = try await CommunityClient().recent(configuration:configuration)
        XCTAssertEqual(page.coops.count,1)
        let request = try XCTUnwrap(CommunityStub.requestSeen)
        XCTAssertEqual(request.url?.host, CommunityService.origin.host)
        XCTAssertEqual(request.url?.path,"/api/network"); XCTAssertEqual(request.url?.query,"limit=20")
        XCTAssertNil(request.value(forHTTPHeaderField:"Authorization")); XCTAssertNil(request.value(forHTTPHeaderField:"Cookie"))
    }
    func testSearchAndTieCursorStayInEncodedQueryWithoutCredentials() async throws {
        CommunityStub.data = try fixture()
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [CommunityStub.self]
        _ = try await CommunityClient().recent(query: "  river & meadow  ", before: 20, beforeId: "coop-b", configuration: configuration)
        let request = try XCTUnwrap(CommunityStub.requestSeen)
        let query = try XCTUnwrap(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(query, [URLQueryItem(name: "limit", value: "20"), URLQueryItem(name: "q", value: "river & meadow"), URLQueryItem(name: "before", value: "20"), URLQueryItem(name: "beforeId", value: "coop-b")])
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization")); XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
    }
    func testResultsDeduplicateMovingCommunitiesAndRejectStuckPagination() throws {
        let coop = try CommunityClient.decode(fixture(), status: 200, mimeType: "application/json").coops[0]
        var results = CommunityResults()
        results.replace(CommunityPage(coops: [coop], next: 20, nextId: "b"))
        try results.append(CommunityPage(coops: [coop], next: 20, nextId: "a"))
        XCTAssertEqual(results.coops.count, 1)
        XCTAssertThrowsError(try results.append(CommunityPage(coops: [coop], next: 20, nextId: "a")))
        XCTAssertEqual(results.nextId, "a")
        try results.append(CommunityPage(coops: [], next: nil, nextId: nil))
        XCTAssertNil(results.next)
    }
    func testInvalidPageCursorsDoNotBecomeEmptySuccess() throws {
        for object in ["{\"coops\":[],\"next\":20}", "{\"coops\":[],\"next\":null,\"nextId\":\"x\"}"] {
            XCTAssertThrowsError(try CommunityClient.decode(Data(object.utf8), status: 200, mimeType: "application/json"))
        }
        let emptyPortion = try CommunityClient.decode(Data("{\"coops\":[],\"next\":20,\"nextId\":\"x\"}".utf8), status: 200, mimeType: "application/json")
        XCTAssertEqual(emptyPortion.nextId, "x")
    }
    func testCoopLinksEncodeIdentifiers() {
        let url = CommunityService.coopPage("network/",id:"a&next=evil")
        XCTAssertEqual(URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.count,1)
        XCTAssertEqual(URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first, URLQueryItem(name: "coop", value: "a&next=evil"))
        XCTAssertEqual(CommunityService.coopPage("workspace/", id: "coop-a").absoluteString, "https://vergecommon.com/workspace/?coop=coop-a")
        XCTAssertEqual(CommunityService.page("api/workspaces", id: "coop-a").absoluteString, "https://vergecommon.com/api/workspaces?id=coop-a")
    }
}
