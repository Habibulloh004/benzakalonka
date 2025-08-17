/* tv-sw.js — scope: /tv  */
/* Maqsad: /admin/upload POST’lariga TEGMASLIK, /tv va /uploads rasmlarini keshlash */

const SW_VERSION   = 'v4-2025-08-16';
const APP_CACHE    = `tv-app-${SW_VERSION}`;
const STATIC_CACHE = `tv-static-${SW_VERSION}`;
const IMAGE_CACHE  = `tv-images-${SW_VERSION}`;

// Minimal shell (ixtiyoriy)
const APP_SHELL = [
  // '/tv/',             // agar asosiy /tv sahifani offline ko'rsatmoqchi bo'lsangiz, oching
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APP_CACHE);
    if (APP_SHELL.length) await c.addAll(APP_SHELL);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([APP_CACHE, STATIC_CACHE, IMAGE_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* -------- helpers -------- */
const IMG_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const VID_RE = /\.(mp4|webm|avi|mov|wmv)$/i;

function shouldBypass(req) {
  const url = new URL(req.url);

  // ❌ SW faqat GET’ni ushlaydi
  if (req.method !== 'GET') return true;

  // ❌ Admin’ni umuman ushlamaymiz (shu jumladan /admin/upload)
  if (url.pathname.startsWith('/admin')) return true;

  // ❌ Range so'rovlarini ham ushlamaymiz (videolarga aralashmaslik)
  if (req.headers.get('range')) return true;

  return false;
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    try { cache.put(req, res.clone()); } catch {}
  }
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  const netPromise = fetch(req).then(res => {
    if (res && res.ok) try { cache.put(req, res.clone()); } catch {}
    return res;
  }).catch(() => cached || Response.error());
  return cached || netPromise;
}

async function networkFirstNav(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(APP_CACHE);
    try { cache.put(req, res.clone()); } catch {}
    return res;
  } catch {
    const cache = await caches.open(APP_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return new Response('<h1>Offline</h1>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' }
    });
  }
}

/* -------- fetch handler -------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Hech narsa ushlamaslik kerak bo'lsa -> return (brauzerga qoldiramiz)
  if (shouldBypass(req)) return;

  // Faqat o'z domenimizdagi resurslar
  if (url.origin !== self.location.origin) return;

  // /uploads — rasm: cache-first; video: network-only
  if (url.pathname.startsWith('/uploads/')) {
    if (IMG_RE.test(url.pathname)) {
      event.respondWith(cacheFirst(req, IMAGE_CACHE));
      return;
    }
    if (VID_RE.test(url.pathname)) {
      // Videolarga aralashmaymiz — Nginx/Node Range bilan ishlaydi
      event.respondWith(fetch(req));
      return;
    }
  }

  // /tv ichidagi static (css/js/img) — stale-while-revalidate
  if (url.pathname.startsWith('/tv')) {
    if (IMG_RE.test(url.pathname) || /\.(css|js|woff2?)$/i.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
      return;
    }
  }

  // Navigatsiya (SPA yo'q bo'lsa ham) — network-first
  if (req.mode === 'navigate' && url.pathname.startsWith('/tv')) {
    event.respondWith(networkFirstNav(req));
    return;
  }

  // Boshqalar: default (hech narsa qilmaymiz)
});

/* -------- /tv sahifasidan oldindan keshlash xabari --------
   Katta videolarni ataylab keshga OLMAYMIZ (RAM/Quota muammolari).
   Faqat rasm fayllarni keshlaymiz. */
self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type === 'PRECACHE_TV' && data.tvId) {
    try {
      const resp = await fetch(`/api/tv/${data.tvId}/media`, { cache: 'no-store' });
      if (!resp.ok) return;
      const json = await resp.json();
      const cache = await caches.open(IMAGE_CACHE);

      const files = (json.assignedMedia || [])
        .map(m => `/uploads/${m.filename}`)
        .filter(p => IMG_RE.test(p)); // faqat rasm

      for (const file of files) {
        try {
          const r = await fetch(file, { cache: 'no-store' });
          if (r.ok) await cache.put(file, r.clone());
        } catch {}
      }

      if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: 'PRECACHE_DONE', tvId: data.tvId, count: files.length });
      }
    } catch {}
  }
});
