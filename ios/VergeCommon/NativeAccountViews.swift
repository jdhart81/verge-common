import SwiftUI

private enum AccountFormMode: String, CaseIterable, Identifiable {
    case login = "Sign in", register = "Create account", recover = "Recover account"
    var id: String { rawValue }
    var action: NativeAccountAction {
        switch self { case .login: return .login; case .register: return .register; case .recover: return .recover }
    }
}

struct NativeSignInForm: View {
    @EnvironmentObject var account: DeviceAccount
    @State private var mode = AccountFormMode.login
    @State private var username = ""
    @State private var displayName = ""
    @State private var password = ""
    @State private var recoveryCode = ""
    @State private var pastedToken = ""
    var body: some View {
        Section("Join your conservation community") {
            Text("Sign in to see your co-ops and share field observations. You can use Discover and your local field journal without an account.")
            Picker("Account action", selection: $mode) {
                ForEach(AccountFormMode.allCases) { Text($0.rawValue).tag($0) }
            }.disabled(account.loading)
            TextField("Username", text: $username)
                .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                .disabled(account.loading)
            if mode == .register {
                Text("Choose 3–40 letters, numbers, underscores or hyphens. Start with a letter or number.").font(.caption).foregroundStyle(.secondary)
                TextField("Display name", text: $displayName).textContentType(.nickname).disabled(account.loading)
                Text("Your co-op members see your display name. Use a name you are comfortable sharing.").font(.caption).foregroundStyle(.secondary)
            }
            if mode == .recover {
                SecureField("Saved recovery code", text: $recoveryCode).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(account.loading)
                Text("Recovery replaces your password and recovery code and signs out existing sessions and devices. You’ll need to save the new recovery code.").font(.caption).foregroundStyle(.secondary)
            }
            SecureField(mode == .recover ? "New password" : "Password", text: $password)
                .textContentType(mode == .login ? .password : .newPassword)
                .textInputAutocapitalization(.never).autocorrectionDisabled().disabled(account.loading)
            if mode != .login {
                Text("Use 12–128 characters. Save your password and the recovery code shown next in a password manager. There is no email password reset.").font(.caption).foregroundStyle(.secondary)
            }
            Button(mode.rawValue) {
                let action = mode.action, secret = password, code = recoveryCode
                password = ""; recoveryCode = ""
                Task { await account.authenticate(action, username: username, displayName: displayName, password: secret, recoveryCode: code) }
            }.disabled(account.loading || username.isEmpty || password.isEmpty || (mode == .register && displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) || (mode == .recover && recoveryCode.isEmpty))
            Text("Your password is sent securely to VergeCommon for this request and is not saved by this app. Device access is kept in this device’s protected Keychain.").font(.caption).foregroundStyle(.secondary)
        }
        Section {
            DisclosureGroup("Advanced: use a device token") {
                Text("If you already created an app:read or app:write token in your website account, you can connect it here.").font(.caption)
                SecureField("Personal device token", text: $pastedToken).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(account.loading)
                Button("Connect device token") {
                    let input = pastedToken; pastedToken = ""
                    Task { await account.connect(input) }
                }.disabled(pastedToken.isEmpty || account.loading)
                Link("Manage website account", destination: CommunityService.page("account"))
            }
        }
        .onChange(of: mode) { _, _ in password = ""; recoveryCode = ""; account.message = nil }
        .onDisappear { password = ""; recoveryCode = ""; pastedToken = "" }
    }
}

struct RecoveryCodeNotice: View {
    @EnvironmentObject var account: DeviceAccount
    @Environment(\.scenePhase) private var scenePhase
    let session: NativeAccountSession
    @State private var saved = false
    var body: some View {
        Section("Save your recovery code") {
            Text("Your account is ready, \(session.user.displayName). Before continuing, save this code somewhere private, such as a password manager.")
            if scenePhase == .active {
                Text(session.recoveryCode ?? "").font(.system(.body, design: .monospaced))
                    .textSelection(.enabled).privacySensitive().accessibilityLabel("Recovery code: \(session.recoveryCode ?? "")")
            } else { Text("Recovery code hidden while the app is inactive.") }
            Text("This code is shown only now. It lets you replace a forgotten password. If you recovered your account, it replaces your previous code. Keep it secret.").font(.caption).foregroundStyle(.secondary)
            Toggle("I have saved my recovery code", isOn: $saved)
            Button("Continue to my co-ops") { account.confirmRecoverySaved() }.disabled(!saved || account.loading)
        }
    }
}

struct DeleteAccountForm: View {
    @EnvironmentObject var account: DeviceAccount
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirmation = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("Permanently delete your account") {
                    Text("This deletes your account and your authored personal content, revokes all sign-ins and removes your co-op memberships. Shared governance and numeric records may remain with your identity fields removed. Other members’ own content is separate. Review the privacy page for the deletion and backup policy.")
                    Text("If you are the founder of a co-op with other active members, first hand over stewardship to another active member on the website.")
                    Link("Review your co-ops", destination: CommunityService.page("workspace/"))
                    Link("Privacy and deletion policy", destination: CommunityService.page("privacy/"))
                }
                Section("Your local journal is separate") {
                    Text("Your drafts on this device and any exported copies are kept. After deleting your account, you can remove local drafts in Journal tools. Exports and device backups must be managed separately.")
                }
                Section("Confirm deletion") {
                    SecureField("Current password", text: $password).textContentType(.password).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(account.loading)
                    TextField("Type DELETE", text: $confirmation).textInputAutocapitalization(.characters).autocorrectionDisabled().disabled(account.loading)
                    if let message = account.message { Text(message).foregroundStyle(.red) }
                    Button("Permanently delete account", role: .destructive) {
                        let secret = password, typed = confirmation; password = ""
                        Task { if await account.deleteAccount(password: secret, confirmation: typed) { dismiss() } }
                    }.disabled(account.loading || password.isEmpty || confirmation != "DELETE")
                    if account.loading { ProgressView("Deleting account…") }
                }
            }.navigationTitle("Delete account")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(account.loading) } }
                .interactiveDismissDisabled(account.loading)
                .onDisappear { password = ""; confirmation = "" }
        }
    }
}
