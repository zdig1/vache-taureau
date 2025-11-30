const STATIC_CACHE = 'static-v1.4';
const DYNAMIC_CACHE = 'dynamic-v1.4';

const staticAssets = [
    '/',
    '/index.html',
    '/style.css',
    '/game.js',
    '/score.js',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.json',
    '/offline.html'
];

self.addEventListener('install', (event) => {
    console.log('📦 Installation SW');
    event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(staticAssets)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    console.log('🔄 Activation SW');
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => {
        if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
            console.log('🗑️ Suppression:', key);
            return caches.delete(key);
        }
    }))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') 
        return;
    

    const url = new URL(event.request.url);

    // Ignorer certaines URLs
    if (url.protocol === 'chrome-extension:' || url.hostname === 'gitlab.com') {
        return;
    }

    if (staticAssets.some(asset => url.pathname.endsWith(asset))) {
        event.respondWith(serveStatic(event.request));
    } else if (event.request.mode === 'navigate') {
        event.respondWith(servePage(event.request));
    } else {
        event.respondWith(serveDynamic(event.request));
    }
});

async function serveStatic(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) 
        return cached;
    

    try {
        const response = await fetch(request);
        if (response.ok) 
            cache.put(request, response.clone());
        
        return response;
    } catch {
        return caches.match('/offline.html');
    }}

async function servePage(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return caches.match('/offline.html');
    }}

async function serveDynamic(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cached = await cache.match(request);

    try {
        const response = await fetch(request);
        if (response.ok) 
            cache.put(request, response.clone());
        
        return response;
    } catch {
        return cached || new Response('Hors ligne', {status: 408});
    }}
