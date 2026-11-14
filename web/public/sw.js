// Surco abre sin señal con lo último que vio.
// HTML y API: red primero, caché si no hay señal. Archivos con huella y fuentes: caché primero.
const V = 'surco-2'
const FUENTES = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const c = await caches.open(V)
  // el HTML trae los nombres con huella de lo que hace falta para arrancar: se guardan desde ya
  const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text()).catch(() => '')
  const pedazos = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
  await c.addAll(['/', '/manifest.webmanifest', '/icono.svg', '/icono-192.png', ...pedazos]).catch(() => {})
  self.skipWaiting()
})()))

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())))

const guardar = (req, res) => { if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(V).then((k) => k.put(req, c)) } return res }

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  if (FUENTES.includes(u.hostname) || (u.origin === location.origin && u.pathname.startsWith('/assets/'))) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => guardar(e.request, res))))
    return
  }
  if (u.origin !== location.origin) return
  e.respondWith(fetch(e.request)
    .then((res) => (u.pathname === '/' || u.pathname.startsWith('/api/lugar') || /\.(png|svg|webmanifest)$/.test(u.pathname)) ? guardar(e.request, res) : res)
    .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/') : Response.error()))))
})
