// Surco: la app abre sin señal con lo último que vio. HTML y API: red primero; archivos con huella: caché primero.
const V = 'surco-1'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return
  const conHuella = u.pathname.startsWith('/assets/')
  if (conHuella) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const c = res.clone(); caches.open(V).then((k) => k.put(e.request, c)); return res })))
    return
  }
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && (u.pathname === '/' || u.pathname.startsWith('/api/lugar') || /\.(png|svg|webmanifest)$/.test(u.pathname))) {
      const c = res.clone(); caches.open(V).then((k) => k.put(e.request, c))
    }
    return res
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))))
})
