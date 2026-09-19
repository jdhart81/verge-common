import SwiftUI

@MainActor final class PublicSafetyStore: ObservableObject {
    @Published private(set) var hidden: [HiddenPublicCoop] = []
    @Published private(set) var error: String?
    private var repository: HiddenCoopRepository?
    init() { reload() }
    func reload() {
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            repository = try HiddenCoopRepository(file: directory.appendingPathComponent("hidden-public-coops.json"))
            hidden = repository!.hidden; error = nil
        } catch { repository = nil; self.error = PublicSafetyError.invalid.localizedDescription }
    }
    func hide(_ coop: PublicCoop) -> Bool {
        do {
            guard let repository else { throw PublicSafetyError.invalid }
            try repository.hide(coop); hidden = repository.hidden; error = nil
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func unhide(_ id: String) {
        do {
            guard let repository else { throw PublicSafetyError.invalid }
            try repository.unhide(id); hidden = repository.hidden; error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct PublicReportLink: View {
    let coopID: String
    let kind: PublicReportKind
    let itemID: String?
    var label: String { "Report this \(kind == .coop ? "co-op" : kind.rawValue)" }
    var body: some View {
        if let url = PublicSafety.reportURL(coopID: coopID, kind: kind, itemID: itemID) {
            Link(label, destination: url)
                .font(.subheadline)
                .accessibilityHint("Opens an email draft with this public item’s identifiers. Review and send it yourself.")
        }
    }
}

struct HiddenCoopsView: View {
    @EnvironmentObject var safety: PublicSafetyStore
    var body: some View {
        List {
            Section {
                Text("Hidden co-ops stay out of Discover on this device, including after you sign out or change accounts. This does not block a member, leave a co-op or change its public website.")
                Text("Use member blocking inside My co-ops to restrict social interaction with a member.").font(.caption).foregroundStyle(.secondary)
            }
            if let error = safety.error { Section { Text(error).foregroundStyle(.red); Button("Reload hidden co-ops") { safety.reload() } } }
            Section("Hidden on this device") {
                if safety.hidden.isEmpty { Text("No co-ops hidden.").foregroundStyle(.secondary) }
                ForEach(safety.hidden) { coop in
                    VStack(alignment: .leading) {
                        Text(coop.name).font(.headline)
                        Button("Show in Discover") { safety.unhide(coop.id) }
                            .accessibilityLabel("Show \(coop.name) in Discover")
                    }
                }
            }
        }.navigationTitle("Hidden co-ops")
    }
}
