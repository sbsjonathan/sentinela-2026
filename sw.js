const CACHE_NAME = 'sentinela-offline-v2';
const EXCLUDED_PATHS = ['/save/', '/worker/'];

function isExcluded(pathname) {
    return EXCLUDED_PATHS.some((prefix) => pathname.includes(prefix));
}

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (isExcluded(url.pathname)) {
        event.respondWith(
            fetch(request).catch(async () => {
                const fallback = await caches.match(request, { ignoreSearch: true });
                return fallback || Response.error();
            })
        );
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) {
            return cached;
        }

        try {
            const network = await fetch(request);
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, network.clone());
            return network;
        } catch (error) {
            if (request.mode === 'navigate') {
                const homeFallback = await caches.match(new URL('index.html', self.registration.scope).toString(), { ignoreSearch: true })
                    || await caches.match('index.html', { ignoreSearch: true })
                    || await caches.match('/', { ignoreSearch: true });
                if (homeFallback) return homeFallback;
            }

            return Response.error();
        }
    })());
});
