import Foundation
import ImageIO
import UniformTypeIdentifiers

struct PreparedEvidenceFile {
    let bytes: Data
    let filename: String
    let contentType: String
    static let maximumSourceBytes = 20 * 1024 * 1024
    /// Rebuild image pixels with normalized orientation. Source metadata is never copied.
    static func image(_ data: Data) throws -> PreparedEvidenceFile {
        guard !data.isEmpty, data.count <= maximumSourceBytes,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 2048, kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { throw EvidenceQueueError.invalid }
        for quality in [0.85, 0.65, 0.45] {
            let result = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(result, UTType.jpeg.identifier as CFString, 1, nil) else { throw EvidenceQueueError.invalid }
            CGImageDestinationAddImage(destination, thumbnail, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { throw EvidenceQueueError.invalid }
            if result.length <= EvidenceItem.maximumBytes { return PreparedEvidenceFile(bytes: result as Data, filename: "field-evidence.jpg", contentType: "image/jpeg") }
        }
        throw EvidenceQueueError.capacity
    }
    static func document(_ data: Data, type: UTType) throws -> PreparedEvidenceFile {
        guard !data.isEmpty, data.count <= EvidenceItem.maximumBytes else { throw EvidenceQueueError.capacity }
        if type.conforms(to: .pdf), data.starts(with: Data("%PDF-".utf8)) { return .init(bytes: data, filename: "field-evidence.pdf", contentType: "application/pdf") }
        if type.conforms(to: .plainText), String(data: data, encoding: .utf8) != nil { return .init(bytes: data, filename: "field-evidence.txt", contentType: "text/plain") }
        throw EvidenceQueueError.invalid
    }
    private static func boundedSource(_ url: URL) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        let data = try handle.read(upToCount: maximumSourceBytes + 1) ?? Data()
        guard data.count <= maximumSourceBytes else { throw EvidenceQueueError.capacity }
        return data
    }
    /// Photo picker transfers are files so their full untrusted size is never
    /// loaded into memory before the source limit is checked.
    static func imageFile(_ url: URL) throws -> PreparedEvidenceFile {
        try image(boundedSource(url))
    }
    static func read(_ url: URL) throws -> PreparedEvidenceFile {
        let type = try url.resourceValues(forKeys: [.contentTypeKey]).contentType
        guard let type else { throw EvidenceQueueError.invalid }
        let data = try boundedSource(url)
        return try type.conforms(to: .image) ? image(data) : document(data, type: type)
    }
}
