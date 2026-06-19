// sw.js — FlowLab Service Worker
// Cache strategy:
//   /api/* → Network First (never cache auth'd serverless responses)
//   everything else → Cache First with network fallback

const CACHE_NAME = 'flowlab-v2';

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
  // Pinned CDN libraries — unpkg sends CORS headers so these cache as
  // normal (non-opaque) responses, not opaque responses.
  'https://unpkg.com/compromise@14.14.0/builds/compromise.min.js',
  'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

// ── Install: precache all static assets ──────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
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
    // API calls require connectivity by design — return a meaningful offline error
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
    // Cache successful GET responses
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Fallback: serve root index for navigation requests (SPA-style)
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}
