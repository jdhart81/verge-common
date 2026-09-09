/* No application data, pages, credentials or API responses are cached. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin) return;
  // Authentication and file downloads must always retain their normal behavior.
  if (!['/', '/network', '/workspace', '/app'].includes(url.pathname.replace(/\/$/, '') || '/')) return;
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reconnect · Verge Common</title><style>body{font:18px/1.6 system-ui;background:#f7f9f6;color:#142d24;margin:10vh auto;padding:24px;max-width:480px}a{display:inline-block;padding:12px 20px;background:#17513b;color:white;border-radius:8px}</style><h1>You’re offline</h1><p>Reconnect to open your co-ops and save changes. Private records are not stored for offline access.</p><a href="/network/">Try again</a></html>`, {status:503, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
