/* Offline support: keeps the app shell (and fonts) so the dashboard opens without signal.
   Live data is not cached here; the page keeps its own copy of the last readings and
   shows how old they are. Bump CACHE when shipping changes to the shell files. */
const CACHE = 'aurora-shell-v2';
const FONTS = 'aurora-fonts-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      // Network first so updates arrive; fall back to the cached page when offline.
      e.respondWith(
        fetch(req)
          .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
          .catch(() => caches.match('./index.html'))
      );
      return;
    }
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; })))
    );
  }
  // Everything else (NOAA, AuroraWatch, Open-Meteo) goes straight to the network.
});
