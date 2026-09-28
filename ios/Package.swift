// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "VergeFieldCore", platforms: [.macOS(.v12), .iOS(.v17)], products: [.library(name: "VergeFieldCore", targets: ["VergeFieldCore"])], targets: [
    .target(name: "VergeFieldCore", path: "VergeCommon", exclude: ["VergeCommonApp.swift", "WorkspaceViews.swift", "NativeAccountViews.swift", "PublicSafetyViews.swift", "EvidenceViews.swift", "DiscussionViews.swift", "Assets.xcassets"], sources: ["FieldDraft.swift", "CommunityAPI.swift", "WorkspaceAPI.swift", "NativeAccountAPI.swift", "PublicSafety.swift", "EvidenceQueue.swift", "EvidencePreparation.swift", "DiscussionQueue.swift"]),
    .testTarget(name: "VergeFieldCoreTests", dependencies: ["VergeFieldCore"], path: "CoreTests", resources: [.copy("Fixtures")])
])
