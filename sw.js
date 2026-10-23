// Guarda la app y el lector en el celular para que abra rápido y sin señal.
const CACHE = "despacho-v13";
const FILES = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "ocr/tesseract.min.js", "ocr/worker.min.js", "ocr/worker-wrap.js",
  "ocr/tesseract-core-simd-lstm.wasm.js", "ocr/tesseract-core-lstm.wasm.js", "ocr/lang/spa.traineddata.gz.wasm"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // La página: primero la red (para recibir mejoras), si no hay señal la guardada. El resto: lo guardado.
  if (e.request.mode === "navigate") e.respondWith(fetch(e.request).then(r => { caches.open(CACHE).then(c => c.put("index.html", r.clone())); return r; }).catch(() => caches.match("index.html")));
  else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
