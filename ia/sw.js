// Guarda la app con IA en el celular para que abra rápido (leer fotos sí necesita internet).
// Los archivos se bajan sin la caché del navegador, y cada script lleva ?v= para que cada versión traiga el suyo.
const CACHE = "despacho-ia-v1";
const FILES = ["./", "index.html", "manifest.webmanifest", "claude-sdk.js?v=1", "ia.js?v=1", "fallas.js?v=1", "../datos/fallas.js?v=29", "../icons/icon-192.png", "../icons/icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("despacho-ia-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // La página: primero la red (para recibir mejoras), si no hay señal la guardada. El resto: lo guardado.
  if (e.request.mode === "navigate") e.respondWith(fetch(e.request).then(r => { caches.open(CACHE).then(c => c.put("index.html", r.clone())); return r; }).catch(() => caches.match("index.html")));
  else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
