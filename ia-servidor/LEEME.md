# Modo «Con IA»: servidor y contraseñas

Al abrir la app se elige **Con IA** o **Sin IA**. Sin IA es la app de siempre (lector del celular).
Con IA pide una contraseña; las fotos van a un servidor tuyo en Google, que revisa la contraseña y se las pasa a
Claude (Anthropic) con **tu** clave de API. La clave nunca llega a los celulares de los operadores.

## Preparar el servidor (una sola vez)

1. Crea la clave de API en https://console.anthropic.com → **API Keys** → *Create Key*. Carga saldo en **Billing**
   (con el modelo Haiku cada foto cuesta unos 0,1 centavos de dólar: unos 10 dólares cada 10.000 fotos).
2. Crea una hoja de cálculo nueva en Google Drive, por ejemplo «Despacho IA - contraseñas».
3. Menú **Extensiones → Apps Script**. Borra lo que haya, pega todo `ia-google.gs` y guarda.
4. **Implementar → Nueva implementación → tipo: Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso:
   **Cualquier persona**. Implementar, autorizar con tu cuenta y copiar el enlace que termina en `/exec`.
5. Vuelve a la hoja y recárgala: aparece el menú **Despacho IA**. Usa **Guardar clave de Anthropic** y pega la clave.
   Luego **Preparar hoja de contraseñas**: se crea la pestaña «Claves».
6. El enlace `/exec` queda fijo en `ia.js` (`IA_URL`). Si cambias el script, usa **Implementar → Gestionar implementaciones → editar → Nueva versión**, así el enlace no cambia.

## Contraseñas

En la pestaña «Claves», una fila por operador:

| Contraseña | Operador | Activa (SI/NO) | Fotos leídas | Último uso |
|---|---|---|---|---|
| fer2026 | fer | SI | | |
| juan-7841 | Juan | SI | | |

- Para dar acceso a alguien: agrega una fila con una contraseña nueva y dásela.
- Para quitarlo (por ejemplo si no pagó): pon **NO** en «Activa» o borra la fila. Su app vuelve a pedir contraseña.
- «Fotos leídas» suma sola cada foto que la IA leyó con esa contraseña: sirve para saber cuánto cobrar.
- El Motorola lo usan todos los turnos: la contraseña vale 8 horas o hasta tocar **Salir (fin de turno)**, y la app
  muestra arriba quién está usando la IA. Así las fotos se cuentan al operador del turno.

## Lo aprendido (pestaña «Aprendido»)

La hoja crea sola la pestaña **Aprendido**: qué primario va con cada ubicación (`ubic`) y qué equipo es cada código del SCADA (`codigo`). Cada celular sube lo que aprende al compartir o copiar una incidencia, o al elegir el equipo de una falla, y baja lo de todos al entrar con contraseña. Si una fila está mal, se corrige la columna «Es» o se borra la fila.

## Modelo

`MODELO` al inicio del script. Por defecto `claude-haiku-5-5` (el más barato). Si lee mal las fotos, cambiarlo a
`claude-sonnet-5-5` (~1 centavo por foto) y volver a implementar.
