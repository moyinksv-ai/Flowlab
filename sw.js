// sw.js — FlowLab Service Worker
// Cache strategy:
//   /api/* → Network First (never cache auth'd serverless responses)
//   everything else → Cache First with network fallback

// Bump version any time you deploy breaking changes to clear old caches.
const CACHE_NAME = 'flowlab-v3';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/dashboard.html',
  '/artist.html',
  '/session.html',
  '/app.js',
  '/genres.js',
  '/nlp.js',
  '/auth.js',
  '/supabase.js',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Pinned CDN libraries via jsDelivr (production-grade CDN, CORS enabled)
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/compromise@14.14.0/builds/compromise.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
];

// ── Install: precache all static assets ──────────────────────
// Each URL is cached individually so a single CDN blip does not
// abort the entire install and leave users with a broken cache.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          fetch(url).then(res => {
            if (res.ok) return cache.put(url, res);
          }).catch(err => {
            console.warn('[SW] Failed to precache:', url, err.message);
          })
        )
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) console.warn(`[SW] ${failed} precache entries failed — app may fall back to network.`);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete ALL old caches ──────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: route by request type ─────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network First for all /api/ calls — never serve stale auth responses
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache First for everything else
  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Offline — AI transform requires an internet connection.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}
