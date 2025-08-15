/* global self, caches, clients */
const APP_CACHE   = 'tv-shell-v1';
const MEDIA_CACHE = 'tv-media-v1';

const APP_SHELL = [
  '/',             // admin redirect bo'lsa ham foyda
  // ixtiyoriy: offline fallback sahifa bo'lsa, shu yerga qo'shing
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then(c => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== APP_CACHE && k !== MEDIA_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Media URL aniqlash
function isMedia(url) { return url.pathname.startsWith('/uploads/'); }
function isImage(url) { return /\.(png|jpe?g|gif|webp|avif|svg)$/.test(url.pathname); }
function isVideo(url) { return /\.(mp4|webm|avi|mov|wmv)$/.test(url.pathname); }

// Range so'rovi bormi?
function getRange(request) {
  const value = request.headers.get('range');
  if (!value) return null;
  const m = value.match(/bytes=(\d+)-(\d+)?/);
  if (!m) return null;
  const start = Number(m[1]);
  const end   = m[2] ? Number(m[2]) : undefined;
  return { start, end };
}

// MEDIA so'rovlari
async function handleMediaRequest(event) {
  const req = event.request;
  const url = new URL(req.url);
  const range = getRange(req);
  const cache = await caches.open(MEDIA_CACHE);

  // 1) Range bilan kelgan VIDEO
  if (range && isVideo(url)) {
    // Avval to'liq fayl keshi bormi?
    const fullKey = new Request(url.origin + url.pathname, { method: 'GET' });
    const cachedFull = await cache.match(fullKey);

    if (cachedFull) {
      const blob = await cachedFull.blob();
      const size = blob.size;

      const start = range.start;
      const end = Math.min(range.end ?? (size - 1), size - 1);
      if (isNaN(start) || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }

      const slice = blob.slice(start, end + 1);
      const headers = new Headers(cachedFull.headers);
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String((end - start) + 1));
      headers.set('Accept-Ranges', 'bytes');

      return new Response(slice, { status: 206, headers });
    }

    // Keshlanmagan bo'lsa: tarmoqdan 206 qaytaramiz va parallel ravishda to'liq faylni kechga tushiramiz
    const netResp = await fetch(req);
    event.waitUntil((async () => {
      try {
        const fullResp = await fetch(fullKey); // to'liq 200 yuklab, keshlash
        if (fullResp.ok) await cache.put(fullKey, fullResp.clone());
      } catch {}
    })());
    return netResp;
  }

  // 2) RASM yoki Range-siz VIDEO: cache-first
  const match = await cache.match(req, { ignoreSearch: true }) ||
                await cache.match(url.origin + url.pathname);

  if (match) return match;

  const net = await fetch(req);
  if (net.ok && (isImage(url) || isVideo(url))) {
    // Range-siz bo'lsa shuni saqlaymiz (200 bo'lishi mumkin)
    // Agar server 206 qaytargan bo'lsa, to'liq variantni ham parallel keshga qo'shamiz
    try {
      await cache.put(url.origin + url.pathname, net.clone());
    } catch {}
  }
  return net;
}

// HTML navigatsiya: network-first, offline fallback – keshdagi eng yaqin nusxa
async function networkFirst(request) {
  try {
    const net = await fetch(request);
    const cache = await caches.open(APP_CACHE);
    cache.put(request, net.clone());
    return net;
  } catch {
    const cache = await caches.open(APP_CACHE);
    const match = await cache.match(request, { ignoreSearch: true });
    if (match) return match;
    return new Response('<h1>Offline</h1>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isMedia(url)) {
    event.respondWith(handleMediaRequest(event));
    return;
  }

  // Navigatsiya (masalan, /tv/:id)
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Boshqa so'rovlar default
});

// TV sahifasidan keladigan "precache" xabari – shu TV'ga biriktirilgan media fayllarni oldindan yuklash
self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type === 'PRECACHE_TV' && data.tvId) {
    try {
      const resp = await fetch(`/api/tv/${data.tvId}/media`, { cache: 'no-store' });
      if (!resp.ok) return;
      const json = await resp.json();
      const cache = await caches.open(MEDIA_CACHE);

      // Faqat assignedMedia'ni keshlaymiz
      const files = (json.assignedMedia || []).map(m => `/uploads/${m.filename}`);
      for (const file of files) {
        try {
          // to'liq faylni keshga tushirish (keyinchalik Range offline dilimlashga yordam beradi)
          const r = await fetch(file);
          if (r.ok) await cache.put(file, r.clone());
        } catch {}
      }
      // Ixtiyoriy: javob qaytarish
      if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: 'PRECACHE_DONE', tvId: data.tvId, count: files.length });
      }
    } catch {}
  }
});
