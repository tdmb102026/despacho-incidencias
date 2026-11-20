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

## Vigía de Alarmas

`vigia/` es una página aparte para el celular: mira el sumario de alarmas de OASIS con la cámara y suena solo
con alarmas magenta nuevas (aperturas), con el sumario vacío (pérdida de AOR) o si la cámara se congela.
No se conecta al SCADA. Se abre en el mismo enlace de GitHub Pages agregando `vigia/` al final.

## Cortes de energía (restricción de carga)

El Excel de cortes (botón SUBIR A DRIVE) deja cada alimentador cortado en la hoja de Google «Cortes de carga», sin
incidencia. En la app, **Cortes de energía** baja esos cortes, se toma la foto del Navegador de incidencias del ADMS
(modo Con IA) y la app une cada corte con su incidencia: mismo alimentador y la primera incidencia creada después de la
hora del corte (y antes de la reconexión si ya se cerró; si hay dos, la de cuadrilla CECON). Se revisa, se completan los
clientes y se guarda en la hoja. Luego Llenar Bitácora › CORTES DE CARGA llena la bitácora y SUBIR A DRIVE trae los
números al Excel.

- Script de la hoja: `bitacora/hoja-cortes.gs` (se pega en la hoja Cortes de carga y se implementa como versión nueva).
- El servidor de la IA (`ia-servidor/ia-google.gs`) necesita la versión con el tipo `cortes`.
