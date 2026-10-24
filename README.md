# Despacho de Incidencias

App web (PWA) para el celular del CECON: se toma la foto de la incidencia en Gestión de incidencias del ADMS,
la app lee el número, motivo, primario y teléfono dentro del mismo celular (OCR con tesseract.js, sin internet)
y arma el mensaje para el grupo de WhatsApp que corresponde.

Para instalar: abrir el enlace de GitHub Pages en Chrome → menú ⋮ → "Instalar app".

## Con IA o sin IA

Al abrir la app se elige el modo. **Sin IA** es el lector del celular de siempre. **Con IA** pide una contraseña y
manda las fotos a Claude (Anthropic) a través de un Apps Script de Google que guarda la clave de API, revisa las
contraseñas de los operadores y cuenta las fotos de cada uno (`ia-servidor/`, pasos en `ia-servidor/LEEME.md`).
Los campos, el mensaje de WhatsApp y la fila de la bitácora son los mismos en los dos modos.
