// Service Worker: cachea la interfaz para que abra sin conexión.
// Si cambias archivos, sube el número de VERSION para forzar la actualización.
const VERSION = 'v2';
const CACHE = `pokedex-${VERSION}`;

const ARCHIVOS_LOCALES = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// Librerías externas que la app necesita para abrir sin Internet
const ARCHIVOS_CDN = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ARCHIVOS_LOCALES);
    // Las librerías externas se guardan una por una; si alguna falla no se rompe la instalación
    await Promise.all(ARCHIVOS_CDN.map(async (url) => {
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
      } catch (_) {
        try { await cache.put(url, await fetch(new Request(url, { mode: 'no-cors' }))); } catch (_) {}
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n.startsWith('pokedex-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // La PokéAPI siempre va a la red (la app guarda lo que necesita en localStorage)
  if (url.hostname === 'pokeapi.co') return;

  // Stale-while-revalidate: responde con caché y actualiza en segundo plano
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const enCache = await cache.match(req);
    const red = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (enCache) return enCache;
    const res = await red;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  })());
});
