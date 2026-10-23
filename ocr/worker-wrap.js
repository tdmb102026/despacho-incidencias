// Los artifacts no sirven archivos .gz: el idioma se publica con otro nombre y aquí se redirige.
const nativeFetch = self.fetch.bind(self);
self.fetch = (url, opts) => nativeFetch(String(url).replace(/spa\.traineddata\.gz$/, "spa.traineddata.gz.wasm"), opts);
importScripts("worker.min.js");
