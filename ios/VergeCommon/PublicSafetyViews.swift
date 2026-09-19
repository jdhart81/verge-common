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
    @State private var reporting = false
    var body: some View {
        Button(label) { reporting = true }
            .font(.subheadline)
            .accessibilityHint("Describe a concern for the project operator. Nothing is sent until you confirm.")
            .sheet(isPresented: $reporting) { SafetyReportForm(kind: kind, coopId: coopID, targetId: itemID) }
    }
}

@MainActor final class SafetyReceiptStore: ObservableObject {
    @Published private(set) var receipts: [SafetyReportReceipt] = []
    @Published private(set) var error: String?
    private var repository: SafetyReceiptRepository?
    init() { reload() }
    func reload() {
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            repository = try SafetyReceiptRepository(file: directory.appendingPathComponent("safety-report-receipts.json"))
            receipts = repository!.receipts; error = nil
        } catch { repository = nil; self.error = SafetyReportError.storage.localizedDescription }
    }
    func save(_ draft: SafetyReportDraft) throws {
        guard let repository else { throw SafetyReportError.storage }
        try repository.save(SafetyReportReceipt(draft)); receipts = repository.receipts; error = nil
    }
    func remove(_ id: String) {
        do {
            guard let repository else { throw SafetyReportError.storage }
            try repository.remove(id); receipts = repository.receipts; error = nil
        } catch { self.error = SafetyReportError.storage.localizedDescription }
    }
}

struct SafetyReportForm: View {
    @EnvironmentObject private var receipts: SafetyReceiptStore
    @Environment(\.dismiss) private var dismiss
    let kind: PublicReportKind
    let coopId: String?
    let targetId: String?
    @State private var category = "other"
    @State private var reason = ""
    @State private var pending: SafetyReportDraft?
    @State private var sending = false
    @State private var complete = false
    @State private var message: String?
    @State private var closing = false
    private var contextPrefix: String { kind == .general && coopId != nil ? "Co-op ID: \(coopId!)\n\n" : "" }
    private var concernLength: Int {
        let text = reason.hasPrefix(contextPrefix) ? String(reason.dropFirst(contextPrefix.count)) : reason
        return text.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count
    }
    init(kind: PublicReportKind, coopId: String?, targetId: String?) {
        self.kind = kind; self.coopId = coopId; self.targetId = targetId
        _reason = State(initialValue: kind == .general && coopId != nil ? "Co-op ID: \(coopId!)\n\n" : "")
    }
    var body: some View {
        NavigationStack {
            Form {
                if complete {
                    Section("Report received") {
                        Text("The project operator received your report. A receipt is saved on this device; check its status in Support → Report receipts. Reporting does not automatically remove content.")
                        Button("Done") { dismiss() }
                    }
                } else {
                    Section {
                        Text("Send a concern directly to the VergeCommon operator, including concerns about a co-op’s steward. You do not need an email app or a co-op account.")
                        Text("This report is separate from reports sent to co-op stewards. Your reason goes to the operator, not the reported person. This is not an emergency service.").font(.caption).foregroundStyle(.secondary)
                    }
                    Section("Concern") {
                        if !contextPrefix.isEmpty { Text("This co-op’s identifier is included below so the operator can locate your concern. Review the text before sending; no private co-op records are attached.").font(.caption).foregroundStyle(.secondary) }
                        Picker("Category", selection: $category) {
                            Text("Harmful content or conduct").tag("abuse")
                            Text("Privacy or personal information").tag("privacy")
                            Text("Access or stewardship").tag("access")
                            Text("Other").tag("other")
                        }.disabled(pending != nil)
                        TextField("Describe what happened and where", text: $reason, axis: .vertical)
                            .lineLimit(6...14).disabled(pending != nil)
                        Text("20–4,000 characters. Include enough context to locate the concern. Do not include passwords, recovery codes, unnecessary personal details or emergency requests.").font(.caption).foregroundStyle(.secondary)
                    }
                    Section {
                        Text("The app saves only a private lookup receipt and date on this device, separate from your account and journal. Anyone with that receipt can check the report’s general status. Your report text is sent only after you choose Send.").font(.caption)
                        if let message { Text(message).foregroundStyle(.red) }
                        if let error = receipts.error { Text(error).foregroundStyle(.red); Button("Reload receipts") { receipts.reload() }.disabled(sending) }
                        Button(pending == nil ? "Send report to project operator" : "Retry the same report") { Task { await submit() } }
                            .disabled(sending || concernLength < 20 || reason.utf16.count > 4000)
                        if sending { ProgressView("Sending report…") }
                    }
                }
            }
            .navigationTitle("Report a concern")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { if pending != nil && !complete { closing = true } else { dismiss() } }.disabled(sending) } }
            .interactiveDismissDisabled(sending || (pending != nil && !complete))
            .confirmationDialog("Close this report?", isPresented: $closing, titleVisibility: .visible) {
                Button("Close form", role: .destructive) { dismiss() }
            } message: { Text("The report may already have arrived. Check Report receipts before sending another. Closing discards the unsaved text and exact retry request; it does not withdraw a report.") }
        }
    }
    private func submit() async {
        sending = true; message = nil; defer { sending = false }
        do {
            if pending == nil { pending = try SafetyReportDraft(kind: kind, coopId: kind == .general ? nil : coopId, targetId: targetId, category: category, reason: reason) }
            // Save lookup access first: a lost response must not strand an accepted report.
            try receipts.save(pending!)
            _ = try await SafetyReportClient().submit(pending!)
            complete = true
        } catch { message = (error as? SafetyReportError)?.localizedDescription ?? SafetyReportError.unavailable.localizedDescription }
    }
}

struct SafetyReportHistory: View {
    @EnvironmentObject private var receipts: SafetyReceiptStore
    @State private var removing: SafetyReportReceipt?
    var body: some View {
        List {
            Section {
                Text("Receipts stay on this device across sign-in changes. They contain no report text. Checking a receipt retrieves only the operator’s general status; it does not send a new report.")
            }
            if let error = receipts.error { Section { Text(error).foregroundStyle(.red); Button("Reload receipts") { receipts.reload() } } }
            if receipts.receipts.isEmpty { Text("No report receipts saved on this device.").foregroundStyle(.secondary) }
            ForEach(receipts.receipts) { receipt in
                SafetyReportReceiptRow(receipt: receipt)
                    .swipeActions(allowsFullSwipe: false) { Button("Remove receipt", role: .destructive) { removing = receipt } }
            }
        }.navigationTitle("Report receipts")
            .confirmationDialog("Remove this receipt from the device?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
                Button("Remove receipt", role: .destructive) { if let removing { receipts.remove(removing.id) }; removing = nil }
            } message: { Text("You will lose the ability to check this report from the app. Removing a receipt does not withdraw or delete the report held by the operator.") }
    }
}
private struct SafetyReportReceiptRow: View {
    let receipt: SafetyReportReceipt
    @State private var loading = false
    @State private var status: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(receipt.createdAt, format: .dateTime).font(.headline)
            Text("Report \(receipt.id.prefix(8))").font(.caption).foregroundStyle(.secondary)
            if let status { Text(status).font(.subheadline) }
            Button("Check report status") { Task {
                loading = true; defer { loading = false }
                do { status = try await SafetyReportClient().status(receipt).description }
                catch { status = "Status could not be confirmed. The report may not have arrived or may no longer be retained. Try again or contact support before submitting a duplicate." }
            } }.disabled(loading)
            if loading { ProgressView("Checking status…") }
        }.padding(.vertical, 5)
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
