# Security

VergeCommon has server-side membership/role checks, authenticated request boundaries, same-origin browser writes, optimistic concurrency, request replay protection, private attachment downloads, and independent-review requirements. These controls have automated coverage. The project has not received an independent security audit.

## Authentication boundary

The self-hosted runtime includes a Node gateway for username/password accounts, recovery codes, browser sessions, and scoped personal device/agent tokens. Passwords use salted scrypt hashes; session secrets, recovery codes and personal tokens are stored as hashes. Browser sessions expire after seven days; personal tokens expire after 90 days and can be revoked from `/account`. Password change or successful recovery revokes earlier sessions and personal tokens. Account closure removes login access while retaining shared co-op records.

The gateway strips supplied identity/forwarding headers and injects verified identity into a loopback-only application listener. Only the gateway may reach that listener. Cookie-authenticated mutations require the canonical `Origin`. Native bearer requests can omit `Origin` after token verification; a supplied foreign origin is still rejected. `app:read`/`app:write` and `mcp:read`/`mcp:write` are distinct scope families. Membership and steward permissions remain enforced by the shared domain service; possession of a token cannot elevate the account's role.

The hosted MCP accepts bearer tokens, not browser cookies. Every request has an isolated MCP server/transport context. Its write allowlist excludes membership changes, public publishing and legal/financial approvals. See [MCP boundaries](mcp/README.md). Native tokens are stored in Keychain with device-only, unlocked-device access; native clients refuse redirects and do not persist private API responses in a URL cache.

The original Cloudflare/Sites path remains supported. Its production dispatcher owns sign-in and must strip incoming `oai-authenticated-user-*` headers before supplying trusted identity. Never expose a bare application listener behind an untrusted proxy, publish the development identity fixture, or mix the two runtime configurations.

Self-hosted account registration does not verify email, legal identity, land ownership or nonprofit affiliation. Email reset, MFA and OAuth are not implemented. Recovery requires the username and one-time recovery code; the replacement code must be saved privately. There is no unattended account-recovery bypass. Operators should never request passwords, recovery codes or tokens in issues, prompts, logs or support tickets.

## File and data handling

Files are limited to 4 MB and downloaded as attachments. File types are restricted, but files are not malware-scanned. Uploaded bytes are hashed. Self-hosted evidence paths reject traversal and symbolic links, and files remain outside the public asset directory. The application uses a local SQLite database with private filesystem permissions, WAL, full synchronous writes and atomic version checks. Operators must secure the host, volumes and backup destinations; the database and evidence files are not application-level encrypted at rest.

Database and object-store operators can modify storage. Linked application audit hashes preserve application history relationships; they are not tamper-proof notarization. Boundary area/overlap checks and steward-reviewed consent do not authenticate land title, a legal instrument, bank settlement or registry custody. There is no bank credential storage or payment execution.

The gateway provides persisted request/auth rate limiting, body/time limits and security headers. Those controls and the initial per-co-op record limits are not a large-scale anti-abuse system. Operate one application process per local SQLite store; review monitoring, capacity and incident response before expanding enrollment. Signed-in users may request membership, but a request alone never grants private access.

## Recovery and operations

Use [the operator guide](self-hosted/README.md) for backup creation, hash verification, isolated restore checks, incident response and retention procedures. A same-host backup does not protect against host loss. A functioning schedule, encrypted offsite destination, independently held recovery keys and a successful recovery rehearsal are operator responsibilities; adding scripts to the repository does not establish them.

Do not log authorization headers, cookies, password/recovery values, private response bodies, uploaded documents or precise private locations. Preserve sanitized incident evidence and revoke compromised sessions/tokens before reopening access. Account closure is not deletion of shared histories or existing backups; apply the operator's published retention policy across every copy.

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/jdhart81/verge-common/security/advisories/new), enabled for this repository. Reports go privately to repository maintainers. If GitHub reporting is unavailable, contact **justin@viridisconservation.com** privately. Do not post secrets, exploit details, exact private locations, or participant records in public issues. Do not email live credentials. The current main branch is maintained without a guaranteed response time.
