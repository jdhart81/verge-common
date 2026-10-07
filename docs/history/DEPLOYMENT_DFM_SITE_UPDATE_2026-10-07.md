# DFM native old-growth update — deployed 7 October 2026 UTC

**Deployed and verified after owner approval to accept the reviewed source's `nativeShareMin` count of two.** The final site container started at `2026-10-07T10:59:22.776086939Z` (06:59:22 EDT) and became healthy before all required verification passed. This receipt covers both stopped attempts and the subsequent approved successful retry. Nothing has been pushed to GitHub.

The approved preflight reused the same image, again confirmed complete HostConfig equality for both control and candidate, observed both healthy at the 30-second sample, saved diagnostics, and passed hero=1, native section=1, nativeShareMin=2. It then removed the test containers and swapped only the live site. Final HostConfig exactly equals the baseline. Rollback was ready but not required.

Final server evidence: `/opt/vergecommon/deployments/20261007T105835Z-dfm-native-retry`. Final running tag: `dendriticforest-site:20261007T021656Z-dfm-site`; image ID: `sha256:7a39958c68e14dd7d37e63b8617bc5ef38ec03b4f44ccef344bde4eeee220bd6`.

```text
/               200
/unbroken/      200
/data-format/   200
/robots.txt     200
/sitemap.xml    200
/styles.css     200
/favicon.svg    200
/healthz        200
missing         404
Keep the woods working: 1
Old growth of the place's own species: 1
Cut the woods: 0
<code>stand_origin</code>: 2
www /unbroken/ location: https://dendriticforest.com/unbroken/
Published ports: none
ReadonlyRootfs CapDrop Memory PidsLimit: true [ALL] 134217728 64
DFM error-level proxy logs: 0
```

Public CSP equals the baseline: `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`. A separate check from the operator machine confirmed the new hero, absence of the old hero, and VergeCommon status=ok.

## Corrected first-attempt finding

The first report incorrectly attributed exit 1 to a 60-second health gate. Retained `next-home.html` and `next-data.html` prove the script passed the health gate and fetched both pages, because those files are written only after the health assertion and upstream health check. The hero and native-section counts are both one; `grep -c '<code>nativeShareMin</code>' next-data.html` returns **2**, causing exit 1 before the success marker. Candidate health/nginx logs were lost in that attempt's cleanup, so its exact Docker health timing cannot be reconstructed. The count failure is now verified; a startup failure was not established.

## Release evidence

| Item | Value |
| --- | --- |
| Reviewed source | `4bb9773ec7c05a29a60406204b5c225e91d608cc`, merged hdfm-framework PR #47 |
| Required PR checks | `dfm-core`, `site`, `workspace`, `research-implementation`: success |
| Candidate tag, reused without rebuilding | `dendriticforest-site:20261007T021656Z-dfm-site` |
| Candidate image ID | `sha256:7a39958c68e14dd7d37e63b8617bc5ef38ec03b4f44ccef344bde4eeee220bd6` |
| PREV, retained rollback tag | `dendriticforest-site:20261004T224012Z-dfm-site` |
| PREV image ID | `sha256:749ecdf0aa655c902680ff7331a0b57a6f77cb8c03a9cf2099a06c7fc34dde16` |
| PREV source checkout | `e27dbe4e4e24d0d6288333e74623b354cba0763e` |
| First server evidence | `/opt/vergecommon/deployments/20261007T021656Z-dfm-site` |
| Retry server evidence | `/opt/vergecommon/deployments/20261007T101541Z-dfm-native-retry` |

First build used `umask 022`, exact detached approved checkout, and verified native section, hero and dfm-core version 0.3.0. Build results: **19 tests, 18 passed, 1 expected schema skip, 0 failed**. The retry verified and reused the exact candidate image ID.

## Diagnostic retry

The live HostConfig was recorded before testing. Control and candidate ran with:

```text
--network vergecommon --restart unless-stopped
--read-only --tmpfs /tmp --tmpfs /var/cache/nginx
--cap-drop ALL --security-opt no-new-privileges
--memory 128m --pids-limit 64
(no published port)
```

Complete JSON HostConfig comparisons, canonicalized by key order only, were **identical** for both test containers. Both diff files are empty. No configuration field was excluded from the comparisons.

```text
2026-10-07T10:15:43Z elapsed=0s dfm-control health=starting upstream=ok
2026-10-07T10:15:43Z elapsed=0s dendriticforest-site-next health=starting upstream=ok
2026-10-07T10:16:15Z elapsed=30s dfm-control health=healthy upstream=ok
2026-10-07T10:16:15Z elapsed=30s dendriticforest-site-next health=healthy upstream=ok

Keep the woods working: 1
id="native": 1
<code>nativeShareMin</code>: 2 (expected 1: FAIL)
```

Both containers' logs, `.State`, HostConfig and diffs were saved before removal, on the server and locally. The candidate's first Docker healthcheck exited 0 with `ok`; no OOM or state error was recorded. The nginx entrypoint's notice that it cannot modify the read-only default configuration did not prevent startup or successful healthchecks.

The two `nativeShareMin` matches are present in the exact approved source: the projections table and the explanatory paragraph. Retained first-attempt and retry outputs match. This is a source-versus-check expectation mismatch, not evidence of a runtime flag failure. No source alteration or relaxed assertion was applied.

## Protected production values

Before and end health for both attempts:

```json
{"status":"ok","service":"vergecommon","version":"0.10.0","commit":"914793054eb8e1b0e86a833d30a40db5acb0e204"}
```

| Value | Before and after, identical |
| --- | --- |
| Proxy StartedAt | `2026-10-04T01:15:52.174616873Z` |
| Caddyfile SHA-256 | `0e5cd755a2264b65d5b110c1a7d77f62be46e8e6eaf2a9cc8c2c273f51a13504` |
| Live Caddyfile | `/opt/vergecommon/releases/20260919-app/self-hosted/Caddyfile` |

App container ID, image and start time also remained identical. During the two stopped attempts PREV was never removed and remained healthy. The approved final retry replaced that container; its image remains available for rollback. First-attempt preservation verification returned 200 for `/`, `/unbroken/`, `/data-format/`, `/robots.txt`, `/sitemap.xml`, `/styles.css`, `/favicon.svg`, `/healthz`, and 404 for `/missing`; unchanged CSP and no published site port. These are checks of the old release, not new-release acceptance.

## Rules and disposition

| Rule | Result |
| --- | --- |
| S1 VergeCommon healthy | PASS: both attempts' baseline/end health ok |
| S2 No proxy change | PASS: checksum and StartedAt identical |
| S3 Approved candidate only | PASS: exact retained image reused; no rebuild |
| S4 Exact live HostConfig | PASS: both test containers' complete configurations identical |
| S5 Preserve evidence | PASS on retry: both logs/state/diffs saved before removal; first attempt lost runtime diagnostics |
| S6 Restore PREV on post-swap failure | PASS: rollback handler armed, predecessor image retained; no failing post-swap check and no restoration required |
| S7 Scope | PASS: no proxy, Caddyfile, DNS, firewall, secret, VergeCommon app or feature-flag changes |

**Deployment acceptance: PASS on the final approved retry; S1–S7 passed.** The proxy StartedAt/checksum and VergeCommon app identity/image/start time stayed unchanged across the successful swap. Baseline and end VergeCommon health both returned the identical JSON above. The final container's health/state/logs, exact HostConfig comparisons and verification outputs are retained locally and on the server.

Deviation: the first report misidentified a content-count failure as a health failure; retained first-attempt HTML and script ordering corrected that diagnosis. Justin subsequently explicitly approved accepting the reviewed source's actual count of two, and the next preflight/swap succeeded with that single expected-count amendment. No source or runtime configuration modification, rebuild, proxy restart, DNS/firewall/secret/app/feature-flag change or GitHub publication occurred. Browser checks at 375/1366 px and actual rollback execution were not performed. This receipt remains unpublished pending separate publication approval.
