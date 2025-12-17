const CACHE_NAME = 'chroma-duel-v2'; // INCREMENTED VERSION
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './firebase-config.js',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', (e) => {
    // Skip waiting forces the waiting Service Worker to become the active Service Worker
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    // Clean up old caches immediately
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim()) // Become available to all pages
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
