# Security

This early shared application has server-side membership/role checks, origin checks on writes, optimistic concurrency, request replay protection, private attachment downloads, and independent-review requirements. These controls have automated tests; the project has not received an independent security audit.

## Authentication boundary

Production Sites dispatch owns sign-in and strips incoming identity headers. The application trusts only that deployment boundary. A self-hosted deployment MUST supply a trusted authentication gateway that strips caller-provided `oai-authenticated-user-*` headers, verifies sessions, and injects authenticated identities. Never expose the bare Worker behind an untrusted proxy or the development sign-in server on a public network.

No application-owned OAuth/password stack, bank credential storage, or payment execution exists. A steward-reviewed external receipt is not cryptographic authentication from a financial provider or carbon registry.

## File and data handling

Files are limited to 4 MB and downloaded as attachments. File types are restricted, but files are not malware-scanned; recipients should handle external documents accordingly. Uploaded bytes are hashed. Database and object-store operators can modify storage: linked application audit hashes are not tamper-proof notarization.

The initial aggregate limits and per-co-op checks are not a large-scale anti-abuse system. Do not admit untrusted high-volume traffic without operational capacity, monitoring, and rate-limit review. Signed-in users can request membership only; that does not grant private access.

## Reporting

Use GitHub private vulnerability reporting if enabled. Otherwise open an issue requesting a private contact without disclosing sensitive details. Do not post secrets, exploit details, exact private locations, or participant records in public issues. The current main branch is maintained without a guaranteed response time.
