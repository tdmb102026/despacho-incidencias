# Fallas internas: del celular a la Bitácora

1. En el celular, la app (Fallas internas) lee las fotos y guarda la falla.
2. La app envía la fila a una hoja de Google tuya, llamada `Para_Bitacora`.
3. En la PC abres «Nueva falla interna» en la Bitácora y aplastas el marcador **LLENAR BITACORA** (v5).
   El marcador muestra las fallas pendientes de la hoja, eliges una y llena el formulario.
   Si no puede leer la hoja, igual puedes copiar la fila y pegarla con Ctrl+V, como antes.

## Preparar la hoja de Google (una sola vez)

1. Crea una hoja de cálculo nueva en Google Drive (por ejemplo «Fallas internas»).
2. Menú **Extensiones → Apps Script**. Borra lo que haya y pega todo el contenido de `hoja-google.gs`. Guarda.
3. **Implementar → Nueva implementación → tipo: Aplicación web**.
   Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier persona**. Implementar y autorizar con tu cuenta.
4. Copia el enlace que termina en `/exec`.

## En el celular

App → Fallas internas → «Conexión con la hoja de Google» → pega el enlace.

## En la PC

Abre https://tdmb102026.github.io/despacho-incidencias/bitacora/marcador.html, pega el mismo enlace
y arrastra el botón azul a la barra de marcadores (o copia el código y reemplaza la URL de tu marcador actual).

## Columnas de la fila (igual que Para_Bitacora, más tres al final)

Subido · Incidencia · Clientes · Estado · Desconexión · Conexión · Duración · Falla S/E · Falla alimentador ·
Corriente A · B · C · kW · Origen · Causa · Subcausa · Descripción · **Protecciones actuadas** · **Equipo dinámico** · **ID**

Con reconectador, S/E y alimentador van vacíos: la Bitácora los pone sola al elegir el equipo dinámico.
