const CACHE_NAME = 'vproj-20261101-v2-core';
const CORE_ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png', './LICENSE.txt'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('vproj-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(resp => {
      const copy = resp.clone(); caches.open(CACHE_NAME).then(c => c.put('./index.html', copy)); return resp;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(resp => {
    if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
    return resp;
  })));
});
