# Public droplet website

`npm ci && npm run build:public` on Node 22.13+ produces `dist-public/`:
a prerendered homepage and hydrated device-local planner at `/demo/`.
It deliberately excludes the shared application, identity, private APIs,
Cloudflare D1/R2, and service worker. Local plans stay in the visitor's browser.

The Caddyfile serves these static files from `/srv/site`, redirects HTTP to
HTTPS and www to the apex domain, and denies private application routes.
Caddy's `/data` and `/config` must be persistent volumes for certificate renewal.
Mount the build read-only and use a restart policy. Do not expose the development
server or mount repository credentials into the public server.

## Deployment receipt — 2026-09-19

- Domain: https://vergecommon.com/ and https://vergecommon.com/demo/
- Dedicated DigitalOcean droplet: codex-keen-forge-bf65, ID 601953476,
  159.203.171.164. Separate from viridis-conservation.
- Namecheap @ and www A records point to this IP; existing email settings retained.
- Release directory: `/opt/vergecommon/releases/20260919-public`.
- Container: `vergecommon-web`, restart policy `unless-stopped`.
- Image: `caddy@sha256:de23def33b17fb5d1290b0f6c2add1d70780e52341896c00a4c8a2a2fe9d355e`.
- Persistent volumes: `vergecommon-caddy-data`, `vergecommon-caddy-config`.
- Checks: 61 unit tests, TypeScript, public build, live HTTPS 200, planner save/add/reload,
  www canonical redirect, HTTP HTTPS redirect, private API/workspace 404.

For later updates, build and upload a new dated release directory; retain the
previous directory. Recreate the same container with the new read-only release
mounts and the same certificate volumes. Rollback uses the prior mounts and image.
This first deployment has no earlier website release to restore; stopping the
container removes public service without deleting its files or certificate data.

Shared accounts, co-op collaboration, nonprofit reviews and carbon preparation
are not enabled on this public site. They require production identity and storage
migration plus hosted end-to-end verification before deployment. Actual credit
issuance and payments remain external processes. The stdio agent MCP is distributed
in the repository; this static host does not run a remote MCP endpoint.
