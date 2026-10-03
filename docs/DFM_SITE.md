# dendriticforest.com on the VergeCommon server

The Dendritic Forest Management site and the Unbroken Woods campaign run on this server as a small static container next to VergeCommon. They share nothing with the VergeCommon app except the Caddy proxy and the private `vergecommon` Docker network: no data mounts, no secrets, no database.

| Name | Serves |
| --- | --- |
| dendriticforest.com | Site container `dendriticforest-site:8080` (unprivileged nginx, static files only) |
| www.dendriticforest.com | Permanent redirect to dendriticforest.com |

Source: `apps/site` in [jdhart81/hdfm-framework](https://github.com/jdhart81/hdfm-framework). CI there builds the image and checks the home page, the campaign page, the CSP header and 404 handling.

## Order matters

1. DNS first. Caddy requests certificates as soon as a name appears in the Caddyfile; without DNS it retries and logs failures.
2. Then the container, so Caddy has an upstream.
3. Then the Caddyfile. Restarting the proxy briefly interrupts vergecommon.com, so pick a quiet time and keep the prior file for rollback.

## 1. DNS (registrar)

Point both names at the same addresses as vergecommon.com:

```sh
dig +short A vergecommon.com
dig +short AAAA vergecommon.com
```

Create `A` (and `AAAA` if vergecommon.com has one) records for `dendriticforest.com` and `www.dendriticforest.com`. Wait until `dig +short A dendriticforest.com` and `dig +short A www.dendriticforest.com` both return the server address.

At Namecheap: Domain List → dendriticforest.com → Manage → Advanced DNS. Delete the parking records it creates (a `CNAME` for `www` to `parkingpage.namecheap.com` and a `URL Redirect` for `@`), then add `A` records for host `@` and host `www` with the server address and TTL Automatic. A leftover parking record makes Caddy's certificate request fail.

## 2. Build and start the site container (on the server)

```sh
REL=$(date -u +%Y%m%dT%H%M%SZ)-dfm-site
REF=main   # or a reviewed commit SHA
sudo git clone --depth 1 --branch "$REF" https://github.com/jdhart81/hdfm-framework "/opt/vergecommon/releases/$REL"
cd "/opt/vergecommon/releases/$REL/apps/site"
sudo docker build -t "dendriticforest-site:$REL" .

sudo docker run -d --name dendriticforest-site \
  --network vergecommon --restart unless-stopped \
  --read-only --tmpfs /tmp --tmpfs /var/cache/nginx \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 128m --pids-limit 64 \
  "dendriticforest-site:$REL"

# Reachable from the proxy, not from the internet (no -p flag):
sudo docker exec vergecommon-web wget -qO- http://dendriticforest-site:8080/healthz
```

The container publishes no host port. Only Caddy reaches it over the private network.

## 3. Update the Caddyfile and restart the proxy

The release Caddyfile in `self-hosted/Caddyfile` contains the three blocks above. Find the bind-mounted file on the host, keep a copy, validate, then replace it:

```sh
sudo docker inspect vergecommon-web --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
CADDYFILE=/path/from/the/line/ending/in/etc/caddy/Caddyfile
sudo cp "$CADDYFILE" "/opt/vergecommon/releases/$REL/Caddyfile.before"
sudo docker run --rm -v "$PWD/Caddyfile.new:/etc/caddy/Caddyfile:ro" \
  "$(sudo docker inspect vergecommon-web --format '{{.Config.Image}}')" caddy validate --config /etc/caddy/Caddyfile
sudo cp Caddyfile.new "$CADDYFILE"
sudo docker restart vergecommon-web   # admin API is off, so a restart loads the file
```

`Caddyfile.new` is the reviewed `self-hosted/Caddyfile` from the VergeCommon release being deployed. Do not hand-edit the live file.

## 4. Verify

```sh
curl -fsS https://vergecommon.com/healthz                     # VergeCommon first
curl -sSI https://dendriticforest.com/ | head -n 12           # 200, HSTS, CSP
curl -sSI https://www.dendriticforest.com/ | grep -i location # -> https://dendriticforest.com/
curl -s -o /dev/null -w '%{http_code}\n' https://dendriticforest.com/missing   # 404
```

Record the image tag, source commit, Caddyfile checksum before and after, and these results in a deployment receipt under `docs/history/`.

## Updating the site

Build a new tagged image as in step 2, then swap the container:

```sh
sudo docker rm -f dendriticforest-site
sudo docker run -d --name dendriticforest-site ... "dendriticforest-site:$REL"   # same flags as step 2
```

The site is static, so the swap takes seconds and does not touch VergeCommon. Caddy does not need a restart.

## Rollback

- Site content: run the previous `dendriticforest-site:<tag>` image.
- Proxy: copy `Caddyfile.before` back to `$CADDYFILE` and `docker restart vergecommon-web`.
- Remove entirely: `docker rm -f dendriticforest-site`, restore the prior Caddyfile, restart the proxy. VergeCommon is unaffected.

## Adding another name later

If a campaign domain (for example unbrokenwoods.org) or dendriticforest.org is registered later, point its DNS here first, then add a redirect block to the Caddyfile through a reviewed change:

```
unbrokenwoods.org, www.unbrokenwoods.org {
    redir https://dendriticforest.com/unbroken/ permanent
}
```

Never add a name to the Caddyfile before its DNS points at this server.
