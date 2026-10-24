# Despacho de Incidencias

App web (PWA) para el celular del CECON: se toma la foto de la incidencia en Gestión de incidencias del ADMS,
la app lee el número, motivo, primario y teléfono dentro del mismo celular (OCR con tesseract.js, sin internet)
y arma el mensaje para el grupo de WhatsApp que corresponde.

Para instalar: abrir el enlace de GitHub Pages en Chrome → menú ⋮ → "Instalar app".

## Versión con IA (carpeta `ia/`)

La misma app, pero las fotos las lee Claude (IA de Anthropic) en vez del OCR del celular: más preciso con la trama de la
pantalla, los decimales y las pestañas INC, pero necesita internet y una clave de API de Anthropic (se pega una vez en
«Clave de la IA», en el inicio, y queda solo en ese celular). Se abre en `…/despacho-incidencias/ia/` y se instala como
otra app («Despacho IA»). Las fallas internas de esta versión se guardan aparte; el enlace de la hoja se comparte.
`ia/claude-sdk.js` es el SDK oficial `@anthropic-ai/sdk` 1.3.0 empaquetado para el navegador con esbuild.
