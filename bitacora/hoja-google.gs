// Hoja de Google "Para_Bitacora": la app del celular guarda aquí cada falla interna
// y el marcador "Llenar Bitácora" de la PC las lee para llenar el formulario.
// Se pega en Extensiones → Apps Script de la hoja y se implementa como "Aplicación web"
// (ejecutar como: yo; acceso: cualquier persona). Los pasos están en bitacora/LEEME.md.

const HOJA = "Para_Bitacora";
const TITULOS = ["Subido", "Incidencia", "Clientes afectados", "Estado", "Fecha/hora desconexión", "Fecha/hora conexión",
  "Duración", "Falla S/E", "Falla alimentador", "Corriente A", "Corriente B", "Corriente C", "kW (referencia)",
  "Origen / tipo", "Causa", "Subcausa", "Descripción", "Protecciones actuadas", "Equipo dinámico", "ID"];
const N = TITULOS.length, COL_ID = N;

function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(HOJA);
  if (!h) h = ss.insertSheet(HOJA);
  if (h.getLastRow() === 0) { h.appendRow(TITULOS); h.setFrozenRows(1); h.getRange(1, 1, 1, N).setFontWeight("bold"); }
  return h;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function filaDe_(h, id) {
  if (!id || h.getLastRow() < 2) return 0;
  const ids = h.getRange(2, COL_ID, h.getLastRow() - 1, 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(String(id));
  return i < 0 ? 0 : i + 2;
}

// El celular manda la fila (20 columnas). Si la falla ya estaba (mismo ID) se actualiza
// y vuelve a quedar pendiente, por ejemplo cuando después se reconecta.
function doPost(e) { return json_(guardar_(JSON.parse(e.postData.contents).fila)); }
function guardar_(filaIn) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const fila = (filaIn || []).slice(0, N).map(v => v == null ? "" : String(v));
    while (fila.length < N) fila.push("");
    fila[0] = "";
    const h = hoja_(), n = filaDe_(h, fila[COL_ID - 1]) || h.getLastRow() + 1;
    // Todo como texto: si no, Google cambia las fechas y el número de incidencia
    h.getRange(n, 1, 1, N).setNumberFormat("@").setValues([fila]);
    return { ok: true, guardada: n };
  } finally { lock.releaseLock(); }
}

// El marcador pide las fallas pendientes (columna Subido vacía), y después marca la que llenó.
function doGet(e) {
  const h = hoja_(), p = (e && e.parameter) || {};
  // El celular guarda por aquí (?fila=[…]): es lo que mejor funciona desde el navegador
  if (p.fila) return json_(guardar_(JSON.parse(p.fila)));
  if (p.marcar) {
    const n = filaDe_(h, p.marcar);
    if (n) h.getRange(n, 1).setValue("x");
    return json_({ ok: !!n });
  }
  const filas = h.getLastRow() < 2 ? [] : h.getRange(2, 1, h.getLastRow() - 1, N).getDisplayValues();
  return json_({ ok: true, filas: filas.filter(f => !f[0] && f[COL_ID - 1]).slice(-30) });
}
