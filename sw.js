// carlottaemichele · funziona anche senza rete.
// Sito e dati: prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
// Foto, mappe e librerie: la copia salvata subito, aggiornata in background.
const V = 'cem-1';
const SHELL = `${V}-sito`, DATA = `${V}-dati`, MEDIA = `${V}-media`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './assets/icon.svg'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(V)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') { const home = await cache.match('./'); if (home) return home; }
    throw err;
  }
}
async function staleWhileRevalidate(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(async (res) => {
    if (res.ok || res.type === 'opaque') {
      await cache.put(req, res.clone());
      if (max) { const keys = await cache.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - max))) cache.delete(k); }
    }
    return res;
  }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) return e.respondWith(networkFirst(req, SHELL));
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.pathname.includes('/storage/v1/object/public/')) return e.respondWith(staleWhileRevalidate(req, MEDIA, 600));
    if (url.pathname.startsWith('/rest/v1/')) return e.respondWith(networkFirst(req, DATA));
    return;
  }
  if (/(^|\.)(openfreemap\.org|arcgisonline\.com|opentopomap\.org|jsdelivr\.net|wikimedia\.org|wikipedia\.org)$/.test(url.hostname)) {
    return e.respondWith(staleWhileRevalidate(req, MEDIA, 1500));
  }
});
