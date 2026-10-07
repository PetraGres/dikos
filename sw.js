// Offline cache. Při změně souborů zvyš číslo verze.
const CACHE = 'nehtik-v1';
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'logic.js', 'config.js',
  'manifest.webmanifest', 'icon.svg', 'data/dikos_nail_guide.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Nejdřív síť (aby se projevily úpravy dat), bez sítě cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
