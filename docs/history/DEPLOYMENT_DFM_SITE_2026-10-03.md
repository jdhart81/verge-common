# DFM public-site deployment — 3 October 2026 EDT

**Deployed 4 October 2026 at 01:15:56 UTC (3 October at 21:15:56 EDT).** The static Dendritic Forest Management site is live beside the existing VergeCommon v0.9.0 application. Only the new site container and the two approved additive Caddy blocks were deployed. No VergeCommon app release occurred.

## Delivered behavior

- [Dendritic Forest Management](https://dendriticforest.com/) homepage, [Unbroken Woods](https://dendriticforest.com/unbroken/) campaign, and [Landscape Package data format](https://dendriticforest.com/data-format/) documentation.
- Private-network-only static nginx upstream, with hardened runtime limits and no application data/secret mounts or published host port.
- HTTPS, trusted certificate, exact `www`/HTTP redirects, restrictive CSP, and the required security headers.
- VergeCommon remains `status=ok`, version `0.9.0`, commit `6089e6a`; its app identity, image, start time, environment, mount configuration and host configuration are unchanged.

## Release evidence

| Item | Result |
| --- | --- |
| Reviewed source | [hdfm-framework PR #42](https://github.com/jdhart81/hdfm-framework/pull/42), merged to `main`; exact source SHA `7c91e6d2a82155878091469125e6f33dba4a7f62`, also the observed main HEAD |
| Site configuration | At that SHA, `apps/site/site.config.json` has `"origin": "https://dendriticforest.com"` |
| Runbook | [verge-common PR #38](https://github.com/jdhart81/verge-common/pull/38), merged; `docs/DFM_SITE.md` sections 2–4 at `2415424a8a8a341e642451a08e8ff838dc4535f7` |
| Release directory | `/opt/vergecommon/releases/20261004T010959Z-dfm-site` |
| Server receipts | `/opt/vergecommon/deployments/20261004T010959Z-dfm-site` |
| Image tag | `dendriticforest-site:20261004T010959Z-dfm-site` |
| Immutable image ID | `sha256:da02c2c9e224a07543043982bb3a0a5d68e67a726f2d8b00c523a9f73f0cadc0` |
| Build | `docker build -t "dendriticforest-site:20261004T010959Z-dfm-site" apps/site`; reviewed Dockerfile's **12 tests passed, 0 failed** |
| Caddy image digest | `caddy@sha256:de23def33b17fb5d1290b0f6c2add1d70780e52341896c00a4c8a2a2fe9d355e`; same image used for candidate validation and the running proxy |
| Live Caddyfile bind source | `/opt/vergecommon/releases/20260919-app/self-hosted/Caddyfile` |
| Caddyfile before SHA-256 | `baabc8147b0dea04896fbdcba9d13f25104a198de50d4f0edf5ce331419bbed1` |
| Caddyfile after SHA-256 | `0e5cd755a2264b65d5b110c1a7d77f62be46e8e6eaf2a9cc8c2c273f51a13504` |
| Backup | `Caddyfile.before` retained in the release directory; original checksum verified again after deployment |
| In-container Caddyfile SHA-256 | `0e5cd755a2264b65d5b110c1a7d77f62be46e8e6eaf2a9cc8c2c273f51a13504`; matches the candidate and live host file |
| Candidate validation | `Valid configuration`; exit 0, with the running proxy's exact image before copy/load |
| Source control for this receipt | Signed-off documentation commits; no app/schema/dependency changes |

The clone was explicitly checked out detached at the recorded SHA before building; it was not left on a moving branch. Caddyfile replacement used **cp, never mv**, preserving the single-file bind mount. The repository's `self-hosted/Caddyfile` was never copied over the live file.

The Dockerfile test output was:

```text
# tests 12
# suites 0
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## DNS and explicitly approved scope amendment

The first preflight stopped before SSH because both resolvers returned `162.255.119.130` for the apex and `parkingpage.namecheap.com` for `www`. No production changes occurred during that stopped attempt. This file's original failed-preflight receipt remains in its Git history.

The owner subsequently explicitly approved replacing the parking CNAME and apex URL redirect with A records for `@` and `www`, both `159.203.171.164`, TTL Automatic. This **amended the original “do not change DNS” constraint** for precisely those records. Both saved records were verified after reloading Namecheap. No nameserver, DNSSEC, mail, firewall, secret or other-domain setting was changed.

Before proxy loading, at `2026-10-04T01:15:48.668660+00:00`, all required public IPv4 answers were exactly the droplet address, with no CNAME:

```text
dig +short A dendriticforest.com @1.1.1.1
159.203.171.164

dig +short A www.dendriticforest.com @1.1.1.1
159.203.171.164

dig +short A dendriticforest.com @8.8.8.8
159.203.171.164

dig +short A www.dendriticforest.com @8.8.8.8
159.203.171.164

dig +short AAAA dendriticforest.com @1.1.1.1
(no answers)

dig +short AAAA vergecommon.com @1.1.1.1
(no answers)
```

## Additive proxy change and recovery

The running proxy's bind-mounted file was copied to `Caddyfile.before`. The guard `! grep -q dendriticforest Caddyfile.before` passed; no existing DFM block was merged or rewritten. Candidate bytes equal the original bytes plus **exactly** the runbook blocks. `diff -u` contained no removed lines; below is the same diff with zero context to keep the receipt limited to added configuration:

```diff
--- Caddyfile.before
+++ Caddyfile.new
@@ -18,0 +19,14 @@
+
+# Dendritic Forest Management site (jdhart81/hdfm-framework apps/site); see verge-common docs/DFM_SITE.md.
+www.dendriticforest.com {
+    redir https://dendriticforest.com{uri} permanent
+}
+dendriticforest.com {
+    encode zstd gzip
+    header {
+        Strict-Transport-Security "max-age=31536000"
+        X-Frame-Options DENY
+        -Server
+    }
+    reverse_proxy dendriticforest-site:8080
+}
```

Validation returned `Valid configuration`. Caddy also reported a formatting warning at line 2 of the preserved original file; no formatting rewrite was applied because the required diff is additive only. After copy, the in-container hash matched. **Only `vergecommon-web` restarted.** VergeCommon health passed **4.659 seconds** after restart, within the 60-second requirement.

A failure handler was ready to restore `Caddyfile.before` with cp, restart only the proxy, and recheck health. No proxy rollback was required. Rollback remains:

```sh
cp /opt/vergecommon/releases/20261004T010959Z-dfm-site/Caddyfile.before /opt/vergecommon/releases/20260919-app/self-hosted/Caddyfile
docker restart vergecommon-web
curl -fsS https://vergecommon.com/healthz
```

Removing the site alone requires restoring the prior proxy file first, or restoring a working site container before leaving the DFM blocks active. No fault-injection outage or rollback restart was performed merely to test recovery.

## Container restrictions and upstream health

The deployed flags were exactly the runbook's:

```text
--name dendriticforest-site
--network vergecommon --restart unless-stopped
--read-only --tmpfs /tmp --tmpfs /var/cache/nginx
--cap-drop ALL --security-opt no-new-privileges
--memory 128m --pids-limit 64
(no -p / no published host port)
```

The tmpfs paths above are **container paths**, not additional host mounts. No bind mount or app data volume is attached to the site.

```text
docker inspect --format '{{.State.Health.Status}}' dendriticforest-site
healthy

docker exec vergecommon-web wget -qO- http://dendriticforest-site:8080/healthz
ok

docker port dendriticforest-site
(no output)

docker inspect dendriticforest-site --format '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.Memory}} {{.HostConfig.PidsLimit}}'
true [ALL] 134217728 64

SecurityOpt: [no-new-privileges]
Network: [vergecommon]
RestartPolicy: unless-stopped
Bind mounts: []
HostConfig.Tmpfs: [/tmp, /var/cache/nginx]
Mounts: []
```

Filtered proxy log inspection (`docker logs vergecommon-web --since 10m`, error level and DFM name) returned **0 matching lines**, including no DFM certificate errors.

## Public verification outputs

The homepage headers were:

```text
HTTP/2 200
accept-ranges: bytes
alt-svc: h3=":443"; ma=2592000
content-security-policy: default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
content-type: text/html; charset=utf-8
date: Sun, 04 Oct 2026 01:17:18 GMT
etag: "6ac1a7e1-2627"
last-modified: Sun, 04 Oct 2026 01:12:01 GMT
permissions-policy: geolocation=(), camera=(), microphone=()
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=31536000
via: 1.1 Caddy
x-content-type-options: nosniff
x-frame-options: DENY
content-length: 9767
```

These establish 200, HSTS, CSP with `script-src 'none'`, `X-Frame-Options: DENY`, and **no Server header on the HTTPS site response**. The redirect-only responses contain Caddy's Server header, as shown below; the runbook's two blocks were preserved exactly.

All requested routes:

```text
/               200
/unbroken/      200
/data-format/   200
/robots.txt     200
/sitemap.xml    200
/styles.css     200
/favicon.svg    200
/healthz        200
```

Additional checks:

```text
https://dendriticforest.com/healthz
ok

https://dendriticforest.com/missing HTTP status
404

Count of name="robots" content="noindex" on /missing
1

HEAD https://www.dendriticforest.com/unbroken/
HTTP/2 301
alt-svc: h3=":443"; ma=2592000
location: https://dendriticforest.com/unbroken/
server: Caddy
date: Sun, 04 Oct 2026 01:17:19 GMT

HEAD http://dendriticforest.com/
HTTP/1.1 308 Permanent Redirect
Connection: close
Location: https://dendriticforest.com/
Server: Caddy
Date: Sun, 04 Oct 2026 01:17:19 GMT

Home canonical link
<link rel="canonical" href="https://dendriticforest.com/">

Count of href="https://vergecommon.com/" on home
2

robots.txt
User-agent: *
Allow: /
Sitemap: https://dendriticforest.com/sitemap.xml
```

The publicly trusted certificate, inspected with normal SNI and OpenSSL chain verification, was:

```text
issuer=C=US, O=Let's Encrypt, CN=YE1
subject=CN=dendriticforest.com
notBefore=Oct  4 00:17:24 2026 GMT
notAfter=Jan  2 00:17:23 2027 GMT
Verify return code: 0 (ok)
```

Normal curl certificate verification also succeeded; no insecure option or certificate-warning bypass was used.

## VergeCommon unchanged, health and monitor

The before/end application fingerprints matched exactly (mount entries canonicalized by destination):

| Field | Same before and after |
| --- | --- |
| id | `84ca3302794102607f89eb8562ad5f03d21a6c23e4b72cd0ea581801025e7c03` |
| image | `sha256:fb7a0158883db5e2ff02f67ccb4e6a7b11a5c96d9c20d553fcbd59d8345bcc27` |
| startedAt | `2026-09-30T01:36:11.141200724Z` |
| restartCount | `0` |
| envSha256 | `595f280bd1555a885149a7fdf5d826d45e6fcc15de9d0afb1ab8a3b5a03af4ef` |
| mountsSha256 | `175cce3518be8ff1cf035c70ac0a4756c1e290e4f61f5a0ae107f03665dc10f7` |
| hostConfigSha256 | `6f0e8798178472c84ac6ed3519890c52e2fd1303ff08761458936bb30299542c` |

All other pre-existing container identities, images, start times, restart counts and running/stopped states matched their baseline. No existing container other than the proxy was restarted, rebuilt, removed or modified. Environment values and data contents were neither logged nor copied; only non-secret fingerprints were retained. `VERGE_WOODLAND_DFM=1` was absent and remained disabled.

The first safety comparison after the build stopped on a false positive: Docker emits its mount array in varying order. Twenty read-only samples produced three ordering hashes but one canonical configuration hash, and the exact original fingerprint was reproduced. The original baseline was retained unchanged; a separate canonical comparison receipt was added before proceeding. App identity/image/start time/environment/host configuration did not change. No app intervention or proxy rollback was needed to resolve this checker issue.

```text
Baseline (2026-10-04T01:11:49.549029+00:00)
{"status":"ok","service":"vergecommon","version":"0.9.0","commit":"6089e6a"}

After proxy restart (2026-10-04T01:15:56.540632+00:00, 4.659 seconds)
{"status":"ok","service":"vergecommon","version":"0.9.0","commit":"6089e6a"}

End (2026-10-04T01:21:42.104056+00:00)
{"status":"ok","service":"vergecommon","version":"0.9.0","commit":"6089e6a"}
```

The local public launch gate, with `--origin https://vergecommon.com --expect-commit 6089e6a`, reported:

```text
24 pass · 0 fail · 9 manual · 0 skipped
```

This matches the machine-check result in the v0.9.0 receipt. The manually dispatched [full Production monitor run 37167608994](https://github.com/jdhart81/verge-common/actions/runs/37167608994) **passed**, including Health check, Full launch gate and Update alerts. Its health output was the same JSON above, and its full gate also reported `24 pass · 0 fail · 9 manual · 0 skipped`. A successful monitor is not evidence that an outage notification was delivered.

## Optional live browser checks

Installed Chrome verified all three pages at both requested viewport widths:

| Route | Viewport | Content/scroll width | Site console errors or CSP violations | Horizontal overflow |
| --- | --- | --- | --- | --- |
| / | 375 px | 360 / 360 px | 0 | None |
| /unbroken/ | 375 px | 360 / 360 px | 0 | None |
| /data-format/ | 375 px | 360 / 360 px | 0 | None |
| / | 1366 px | 1351 / 1351 px | 0 | None |
| /unbroken/ | 1366 px | 1351 / 1351 px | 0 | None |
| /data-format/ | 1366 px | 1351 / 1351 px | 0 | None |

The 15 px difference is Chrome's vertical scrollbar. The existing MetaMask extension emitted unrelated warnings; they were attributed to its `chrome-extension` source, not site errors/CSP failures, and the extension was not changed. Browser viewport overrides were reset afterward. No interactive app or logged-in user workflow was exercised by these static-page checks.

- [375 px live homepage](../review/dfm-site-deployment/home-375.jpg)
- [1366 px live homepage](../review/dfm-site-deployment/home-1366.jpg)

## Invariants and remaining qualification

| Invariant | Result |
| --- | --- |
| I1 VergeCommon stays healthy | **PASS.** Before, within 60 seconds of proxy restart, and end health all ok; app fingerprints unchanged. |
| I2 Additive proxy change only | **PASS.** Live original plus exactly the two runbook blocks; no removed lines, repository replacement or formatting rewrite. |
| I3 Validate before load | **PASS.** Candidate validated with the running proxy image before copy/restart. |
| I4 Private-network-only site | **PASS.** Empty published ports, read-only, cap-drop ALL, no-new-privileges, 128 MiB, 64 PIDs, vergecommon network, tmpfs only. |
| I5 Reviewed source only | **PASS.** Exact merged main SHA and correct origin verified before build; image ID recorded; all 12 build tests pass. |
| I6 DNS before proxy | **PASS on resumed deployment.** Both names correct on both public resolvers before load; original failed preflight honored the stop rule. |
| I7 Reversible | **PASS.** Original Caddyfile retained and hash-verified; rollback handler ready. No actual proxy rollback/fault injection performed. |
| I8 Scope | **PASS with explicit amendment.** Only the approved site/proxy deployment plus the subsequently approved two-record Namecheap repair. No app release, flag, firewall, secret or other-container change. |

Deviations were the explicitly approved DNS repair and canonicalization of the safety check's unordered mount array; neither changed the planned live app/proxy scope. Recovery execution under a real outage, physical-device/browser accessibility, independent ecological validation, account sign-in and real co-op workflows were not tested in this static-site deployment. The launch gate's nine manual qualification items remain manual. No production database, member records, personal data or secrets are included in this receipt.
