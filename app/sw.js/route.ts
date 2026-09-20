/**
 * Service worker disajikan dari route handler supaya bisa ikut deployment Next.js
 * tanpa file statis terpisah.
 *
 * Strategi:
 * - Request non-GET, mutasi /api/*, dan permintaan dengan Range diabaikan.
 * - Navigasi: network-first, fallback ke cache lalu halaman /offline.
 * - Aset build (_next/static, ikon, gambar): cache-first karena namanya sudah ter-hash.
 * - Menu publik (GET /api/orders?action=getMenu): network-first dengan fallback cache
 *   agar digital menu tetap tampil saat koneksi restoran putus.
 */
const SW = `
const VERSION = 'kastriva-v6';
const SHELL = VERSION + '-shell';
const ASSETS = VERSION + '-assets';
const MENU_CACHE = VERSION + '-menu';
const OFFLINE_URL = '/offline';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isCacheableAsset(url) {
  return url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/icons/')
    || url.pathname.startsWith('/brand/')
    || url.pathname === '/favicon.png'
    || url.pathname === '/manifest.webmanifest';
}

function isPublicMenu(url) {
  return url.pathname === '/api/orders' && url.search.indexOf('action=getMenu') !== -1;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;
  // Data transaksional tidak boleh disajikan dari cache: kasir harus melihat kondisi terbaru.
  if (url.pathname.startsWith('/api/') && !isPublicMenu(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match(OFFLINE_URL).then(offline =>
            offline || new Response('Offline', {status: 503, headers: {'Content-Type': 'text/plain'}})
          ))
        )
    );
    return;
  }

  if (isPublicMenu(url)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(MENU_CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached =>
          cached || new Response(JSON.stringify({ok: false, error: 'Offline: menu belum pernah dimuat'}), {
            status: 503,
            headers: {'Content-Type': 'application/json'}
          })
        ))
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(ASSETS).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
`;

export const dynamic = "force-static";

export async function GET() {
  return new Response(SW.trim(), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/"
    }
  });
}
