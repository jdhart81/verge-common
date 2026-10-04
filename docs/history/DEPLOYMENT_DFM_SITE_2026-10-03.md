# DFM public-site deployment preflight — 3 October 2026 EDT

**Blocked; not deployed.** Public DNS failed the mandatory stop condition before any SSH connection or production mutation. The observation window was 4 October 2026 UTC (3 October EDT). This receipt follows the release-evidence and verification structure of `DEPLOYMENT_V090_2026-09-29.md`; it is a failed-preflight receipt, not evidence of a completed deployment.

## Intended behavior and scope

The approved change was a static `dendriticforest-site` container on the private `vergecommon` network and exactly the two additive Caddy blocks in [DFM_SITE.md](../DFM_SITE.md), sections 2–4. The VergeCommon app, its image, environment, volumes and data were to remain untouched. No app release, Woodland flag enablement, DNS/firewall change or secret change was authorized in this deployment.

No SSH session was opened. No release directory, image, container, Caddy backup or replacement was created on the server. No container was restarted, rebuilt, modified or removed. No production configuration or data was changed. Rollback was unnecessary because the proxy was never touched.

## Release evidence

| Item | Observed result |
| --- | --- |
| Reviewed DFM source | [hdfm-framework PR #42](https://github.com/jdhart81/hdfm-framework/pull/42), merged to `main`; selected candidate SHA `7c91e6d2a82155878091469125e6f33dba4a7f62`, also the observed `main` HEAD |
| Site origin at candidate SHA | `apps/site/site.config.json`: `"origin": "https://dendriticforest.com"` |
| Merged proxy runbook | [verge-common PR #38](https://github.com/jdhart81/verge-common/pull/38), merged to `main`; runbook read from `2415424a8a8a341e642451a08e8ff838dc4535f7` |
| Release directory | Not created; planned location `/opt/vergecommon/releases/<UTC timestamp>-dfm-site` |
| Image tag and ID | Unavailable: no Docker build or deployment attempted |
| Dockerfile's 12 site tests | Not run: build blocked by DNS |
| Running Caddy image/digest | Not inspected; no SSH connection |
| Caddyfile before/after SHA-256 and diff | Unavailable: live file not accessed or changed; no `Caddyfile.before` created |
| Production health baseline | HTTP success; `status=ok`, `version=0.9.0`, `commit=6089e6a` |
| Production health after proxy restart | Not applicable: proxy never restarted |
| Production health at end | HTTP success; same JSON as baseline, reproduced below |

## DNS preflight — stop condition failed

The required IPv4 answer for **each** name was exactly `159.203.171.164`, with no parking CNAME. Both public resolvers disagreed. Labelled repeat observations were captured immediately before the source/runbook timestamp `2026-10-04T00:45:17Z`.

```text
dig +short A dendriticforest.com @1.1.1.1
162.255.119.130

dig +short A www.dendriticforest.com @1.1.1.1
parkingpage.namecheap.com.
parking.d.parity.domains.
2.59.170.19
104.219.250.36

dig +short A dendriticforest.com @8.8.8.8
162.255.119.130

dig +short A www.dendriticforest.com @8.8.8.8
parkingpage.namecheap.com.
parking.d.parity.domains.
104.219.250.36
2.59.170.19

dig +short AAAA dendriticforest.com @1.1.1.1
(no answers)

dig +short AAAA vergecommon.com @1.1.1.1
(no answers)
```

The AAAA condition passed for this observation, but it does not override the failed IPv4/parking checks. The stated readiness assumption that both A records already resolve to the droplet was contradicted by live evidence.

The domain owner must fix Namecheap Advanced DNS: delete the parking CNAME for `www` and URL redirect for `@`, then add A records for both `@` and `www` pointing to `159.203.171.164`. No registrar settings were changed during this attempt. Deployment remains stopped until both `1.1.1.1` and `8.8.8.8` return exactly the approved address for both names.

## VergeCommon health evidence

The baseline, a repeat during preflight, and the end check at **2026-10-04T00:47:14Z** all completed successfully:

```text
curl -fsS https://vergecommon.com/healthz
{"status":"ok","service":"vergecommon","version":"0.9.0","commit":"6089e6a"}
```

This confirms public health for the observed stopped attempt. Container image/environment/volume fingerprints were not inspected, and post-restart health was not tested because no restart occurred.

## Required deployment verifications not performed

Every check below was intentionally withheld after the DNS stop condition; there is no output or passing claim for it.

| Verification | Result |
| --- | --- |
| Build from the pinned source SHA; record image ID | Not run |
| Site health becomes `healthy` | Not run; no container started |
| Proxy `wget http://dendriticforest-site:8080/healthz` returns `ok` | Not run |
| Inspect live Caddy bind mount/image and preserve `Caddyfile.before` | Not run |
| Guard rejecting an existing `dendriticforest` block | Not run |
| Append exact runbook blocks; diff contains only additions | Not run |
| Validate candidate with the running Caddy image before copying | Not run |
| Copy in place; in-container SHA-256 equals candidate | Not run |
| Restart only proxy; recheck VergeCommon within 60 seconds | Not run |
| HTTPS `/` returns 200, HSTS, CSP `script-src 'none'`, `X-Frame-Options: DENY`, and no Server header | Not run |
| Routes `/`, `/unbroken/`, `/data-format/`, `/robots.txt`, `/sitemap.xml`, `/styles.css`, `/favicon.svg`, `/healthz` all return 200 | Not run |
| `/missing` returns 404 and exactly one robots `noindex` tag | Not run |
| `https://www.dendriticforest.com/unbroken/` redirects to `https://dendriticforest.com/unbroken/` | Not run |
| `http://dendriticforest.com/` redirects to `https://dendriticforest.com/` | Not run |
| Home canonical is `https://dendriticforest.com/`; at least one VergeCommon link | Not run |
| `robots.txt` advertises `https://dendriticforest.com/sitemap.xml` | Not run |
| Publicly trusted TLS certificate issuer, subject and dates | Not inspected; no certificate receipt available |
| `docker port dendriticforest-site` is empty | Not run |
| Container inspection: read-only, cap-drop ALL, no-new-privileges, 134217728 bytes memory, 64 PIDs, private network | Not run; no inspection excerpt available |
| Caddy logs contain no DFM certificate errors | Not inspected |
| Production monitor (`uptime.yml`, `full: true`) | Not dispatched; no run link, because deployment stopped in preflight |
| `node scripts/launch-gate.mjs`, 0 fail | Not run for this stopped attempt; the v0.9.0 receipt is historical evidence only |
| Optional browsers at 375px/1366px for `/`, `/unbroken/`, `/data-format/`: console/CSP/overflow | Not run |

The intended container flags, not an actual inspection result, were:

```text
--network vergecommon --restart unless-stopped
--read-only --tmpfs /tmp --tmpfs /var/cache/nginx
--cap-drop ALL --security-opt no-new-privileges
--memory 128m --pids-limit 64
(no published host port)
```

## Invariant disposition and recovery

| Invariant | Disposition for this attempt |
| --- | --- |
| I1 VergeCommon stays healthy and app untouched | Public baseline/end health passed. No app/container actions taken. Post-restart and Docker fingerprints not exercised. |
| I2 Additive proxy change only | Not exercised: no live Caddyfile access/change. |
| I3 Validate before load | Not exercised: no candidate constructed or loaded. |
| I4 Site private-network restrictions | Not exercised: no site deployed. |
| I5 Reviewed source only | Candidate SHA and origin verified on merged `main`; build/deployment not exercised. |
| I6 DNS before proxy | **Failed readiness; stop rule honored.** Both resolvers show incorrect IPv4 answers and a parking CNAME. No proxy blocks added. |
| I7 Reversible | No mutation to roll back. Backup/rollback execution not exercised. |
| I8 Scope | Preserved: no production, DNS, firewall, secret, flag or other-container changes. |

The only plan deviation was stopping before build/deployment because DNS was not ready. Documentation records the blocked attempt without claiming a live DFM release. Intended DFM URLs remain unverified: `https://dendriticforest.com/`, `/unbroken/`, `/data-format/`. The observed healthy application is [VergeCommon](https://vergecommon.com/healthz).
