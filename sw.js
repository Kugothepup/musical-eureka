/* Offline support: keeps the app shell (and fonts) so the dashboard opens without signal.
   Live data is not cached here; the page keeps its own copy of the last readings and
   shows how old they are. Bump CACHE when shipping changes to the shell files. */
const CACHE = 'aurora-shell-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './fonts/poppins-latin-400-normal.woff2', './fonts/poppins-latin-500-normal.woff2', './fonts/poppins-latin-600-normal.woff2',
  './fonts/poppins-latin-ext-400-normal.woff2', './fonts/poppins-latin-ext-500-normal.woff2', './fonts/poppins-latin-ext-600-normal.woff2'];
const SLOW_MS = 3500;   // on weak signal, show the saved page after this long rather than a blank screen

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // NOAA, AuroraWatch and Open-Meteo go straight to the network

  if (req.mode === 'navigate') {
    // Network first so updates arrive. Only a real copy of the page is saved: not an error page, and not a
    // Wi-Fi sign-in page that a campsite or hotel network redirects to.
    const net = fetch(req);
    e.waitUntil(net.then(res => {
      if (!res.ok || res.type !== 'basic' || res.redirected) return;
      const copy = res.clone();
      return caches.open(CACHE).then(c => c.put('./index.html', copy));
    }).catch(() => {}));
    e.respondWith(caches.match('./index.html').then(saved => {
      if (!saved) return net;
      const slow = new Promise(resolve => setTimeout(resolve, SLOW_MS, saved));
      return Promise.race([net.then(res => res.ok || res.type === 'opaqueredirect' ? res : saved, () => saved), slow]);
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
