const CACHE_NAME = 'wildly-cache-v1.1.6';

    // './dist/style.css', Aktiver denne når tailwind er bygget
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './config.json',
    './geo_data.json',
    './data/translations.json',
    './data/universal.json',
    './icons/wildly_logo.svg',
    './lib/leaflet/leaflet.css',
    './lib/leaflet/leaflet.js',
	'./lib/leaflet/leaflet-image.js',
    './lib/leaflet/pouchdb.js',
    './lib/leaflet/PouchDBCached.js',
    './lib/leaflet/images/marker-icon.png',
    './lib/leaflet/images/marker-shadow.png',
    './lib/leaflet/images/marker-icon-2x.png'    
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Pre-caching assets');
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Ignorer eksterne API'er og kortfliser
    if (requestUrl.hostname.includes('tile.openstreetmap.org') || requestUrl.hostname.includes('ipapi.co')) {
        return;
    }

	if (event.request.url.includes('?cache=')) {
	    return; // Lad PouchDB plugin'et om at styre denne anmodning
	}
	
	// Tjek om anmodningen handler om Leaflet-ikonerne
    if (requestUrl.pathname.includes('marker-icon') || requestUrl.pathname.includes('marker-shadow')) {
        const cleanUrl = requestUrl.origin + requestUrl.pathname;
        const cleanRequest = new Request(cleanUrl, {
            method: event.request.method,
            headers: event.request.headers,
            mode: 'cors', // Vigtigt for canvas/leaflet-image
            credentials: event.request.credentials,
            redirect: event.request.redirect
        });

        event.respondWith(
            // Tjek først om vi allerede har den rene fil i cachen
            caches.match(cleanRequest).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                // Hvis ikke, hent den rene URL fra netværket og (valgfrit) gem den i cachen
                return fetch(cleanRequest).then((networkResponse) => {
                    return networkResponse;
                });
            })
        );
        
        return; 
    }
	
    if (requestUrl.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    return networkResponse;
                })
                .catch(() => caches.match(event.request)) // Fallback til cache hvis offline
        );
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Returner fra cache, men opdater i baggrunden (Stale-while-revalidate)
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            });
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CACHE_NEW_REGION') {
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(event.data.payload);
            })
        );
    }
});
