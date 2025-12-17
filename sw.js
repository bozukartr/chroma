const CACHE_NAME = 'chroma-duel-v1';
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
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
