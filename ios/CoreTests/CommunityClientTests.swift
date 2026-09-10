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
        XCTAssertEqual(request.url?.path,"/api/network"); XCTAssertEqual(request.url?.query,"limit=5")
        XCTAssertNil(request.value(forHTTPHeaderField:"Authorization")); XCTAssertNil(request.value(forHTTPHeaderField:"Cookie"))
    }
    func testCoopLinksEncodeIdentifiers() {
        let url = CommunityService.page("network/",id:"a&next=evil")
        XCTAssertEqual(URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.count,1)
    }
}
