const CACHE_NAME = 'wildly-cache-v1.0';

const PRECACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './config.json',
    './geo_data.json',
    './data/translations.json',
    './data/universal.json',
    './icons/wildly_icon.svg'
    // './dist/style.css', Aktiver denne når tailwind er bygget
    './lib/leaflet/leaflet.css',
    './lib/leaflet/leaflet.js',
    './lib/leaflet/images/marker-icon.png',
    './lib/leaflet/images/marker-shadow.png',
    './lib/leaflet/images/marker-icon-2x.png'    
];

// INSTALL EVENT: Kører første gang Service Workeren registreres
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Tvinger den nye SW til at tage over med det samme
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
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
                        console.log('[Service Worker] Sletter gammel cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // 1. IGNORÉR KORT-FLISER (OpenStreetMap)
    // Vi vil ikke cache tusindvis af kortbilleder, da det dræber telefonens hukommelse.
    if (requestUrl.hostname.includes('tile.openstreetmap.org')) {
        return; // Falder tilbage til standard browser-adfærd (kræver internet)
    }

    // 2. IGNORÉR API KALD (som IP-gætteriet)
    if (requestUrl.hostname.includes('ipapi.co')) {
        return;
    }

    // 3. STALE-WHILE-REVALIDATE STRATEGI (For alt andet: HTML, JSON, CSS, JS, billeder)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Start netværksanmodningen i baggrunden for at opdatere cachen
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // Tjek om vi fik et gyldigt svar fra nettet
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Fetch fejlede (brugeren er offline) - gør ingenting, vi bruger cachen
                console.log('[Service Worker] Offline: Kunne ikke opdatere', event.request.url);
            });

            // Returnér cachen ØJEBLIKKELIGT hvis vi har den, ellers vent på netværket
            return cachedResponse || fetchPromise;
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CACHE_NEW_REGION') {
        const urlsToCache = event.data.payload;
        
        console.log('[Service Worker] Modtog besked om at cache nye filer:', urlsToCache);
        
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(urlsToCache);
            })
        );
    }
});
