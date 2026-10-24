# Modo «Con IA»: servidor y contraseñas

Al abrir la app se elige **Con IA** o **Sin IA**. Sin IA es la app de siempre (lector del celular).
Con IA pide una contraseña; las fotos van a un servidor tuyo en Google, que revisa la contraseña y se las pasa a
Claude (Anthropic) con **tu** clave de API. La clave nunca llega a los celulares de los operadores.

## Preparar el servidor (una sola vez)

1. Crea la clave de API en https://console.anthropic.com → **API Keys** → *Create Key*. Carga saldo en **Billing**
   (cada foto cuesta unos 2 a 3 centavos de dólar).
2. Crea una hoja de cálculo nueva en Google Drive, por ejemplo «Despacho IA - contraseñas».
3. Menú **Extensiones → Apps Script**. Borra lo que haya, pega todo `ia-google.gs` y guarda.
4. **Implementar → Nueva implementación → tipo: Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso:
   **Cualquier persona**. Implementar, autorizar con tu cuenta y copiar el enlace que termina en `/exec`.
5. Vuelve a la hoja y recárgala: aparece el menú **Despacho IA**. Usa **Guardar clave de Anthropic** y pega la clave.
   Luego **Preparar hoja de contraseñas**: se crea la pestaña «Claves».
6. Pásale el enlace `/exec` a Claude para dejarlo fijo en la app (mientras tanto, se pega en la pantalla de la contraseña).

## Contraseñas

En la pestaña «Claves», una fila por operador:

| Contraseña | Operador | Activa (SI/NO) | Fotos leídas | Último uso |
|---|---|---|---|---|
| fer2026 | fer | SI | | |
| juan-7841 | Juan | SI | | |

- Para dar acceso a alguien: agrega una fila con una contraseña nueva y dásela.
- Para quitarlo (por ejemplo si no pagó): pon **NO** en «Activa» o borra la fila. Su app vuelve a pedir contraseña.
- «Fotos leídas» suma sola cada foto que la IA leyó con esa contraseña: sirve para saber cuánto cobrar.
