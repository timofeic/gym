// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GymCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "GymCore", targets: ["GymCore"])],
    targets: [
        .target(name: "GymCore"),
        .testTarget(name: "GymCoreTests", dependencies: ["GymCore"]),
    ]
)
