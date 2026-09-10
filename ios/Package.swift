// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "VergeFieldCore", platforms: [.macOS(.v12), .iOS(.v17)], products: [.library(name: "VergeFieldCore", targets: ["VergeFieldCore"])], targets: [
    .target(name: "VergeFieldCore", path: "VergeCommon", exclude: ["VergeCommonApp.swift", "Assets.xcassets"], sources: ["FieldDraft.swift"]),
    .testTarget(name: "VergeFieldCoreTests", dependencies: ["VergeFieldCore"], path: "CoreTests")
])
