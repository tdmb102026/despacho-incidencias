// Servidor de la IA para la app Despacho de Incidencias (modo «Con IA").
// La app manda la contraseña del operador y la foto; aquí se revisa la contraseña en la hoja «Claves»,
// se manda la foto a Claude (Anthropic) con la clave de API de fer, y se devuelven los campos leídos.
// La clave de API nunca sale de aquí: los celulares solo conocen su contraseña.
// Se pega en Extensiones → Apps Script de una hoja nueva y se implementa como "Aplicación web"
// (ejecutar como: yo; acceso: cualquier persona). Los pasos están en ia-servidor/LEEME.md.

// Haiku: el más barato (unos 0,1 centavos de dólar por foto). Si lee mal, se puede cambiar a "claude-sonnet-5-5" (~1 centavo).
const MODELO = "claude-haiku-5-5";
const HOJA = "Claves";
const TITULOS = ["Contraseña", "Operador", "Activa (SI/NO)", "Fotos leídas", "Último uso"];

// ---------- hoja de contraseñas ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Despacho IA")
    .addItem("Guardar clave de Anthropic", "guardarClaveAnthropic")
    .addItem("Preparar hoja de contraseñas", "hoja_")
    .addToUi();
}
function guardarClaveAnthropic() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Clave de API de Anthropic", "Pega la clave (empieza con sk-ant-). Queda guardada en el script, no en la hoja.", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const k = r.getResponseText().trim();
  if (!/^sk-ant-/.test(k)) return ui.alert("Esa no parece una clave de Anthropic (debe empezar con sk-ant-).");
  PropertiesService.getScriptProperties().setProperty("ANTHROPIC_API_KEY", k);
  ui.alert("Clave guardada.");
}
function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(HOJA);
  if (!h) h = ss.insertSheet(HOJA);
  if (h.getLastRow() === 0) {
    h.appendRow(TITULOS); h.setFrozenRows(1); h.getRange(1, 1, 1, TITULOS.length).setFontWeight("bold");
    h.getRange("A:A").setNumberFormat("@");
  }
  return h;
}
// Fila de la contraseña, si existe y está activa
function operador_(clave) {
  clave = String(clave || "").trim();
  if (!clave) return null;
  const h = hoja_(), n = h.getLastRow() - 1;
  if (n < 1) return null;
  const filas = h.getRange(2, 1, n, 3).getDisplayValues();
  for (let i = 0; i < n; i++)
    if (filas[i][0].trim() === clave && !/^NO/i.test(filas[i][2].trim())) return { fila: i + 2, nombre: filas[i][1] };
  return null;
}
function contar_(op) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const h = hoja_(), c = h.getRange(op.fila, 4);
    c.setValue((Number(c.getValue()) || 0) + 1);
    h.getRange(op.fila, 5).setValue(new Date());
  } finally { lock.releaseLock(); }
}

// ---------- lo que se le pide a la IA ----------
const SIS_INC = `Lees fotos tomadas con un celular a la pantalla del ADMS de EEASA (Ambato, Ecuador), módulo "Gestión de incidencias".
La pantalla puede tener trama (moiré), reflejos o estar inclinada o girada: lee con cuidado cada dígito y no inventes. Si un dato no se ve, déjalo vacío.
- Arriba hay pestañas con incidencias "INC 110315xxxxx" (11 dígitos). La pestaña activa es la que se ve seleccionada (resaltada o con su contenido abajo).
- En la tabla de llamadas, la fila de la llamada tiene fecha, motivo (p. ej. "Sector sin servicio") y la ubicación.
- El recuadro amarillo "Comentario" trae la dirección, el teléfono del cliente (TELF, CEL…: 10 dígitos que empiezan con 09) y el texto del cliente.
- La columna "Ubicación" de la fila de la llamada trae el sector o barrio (p. ej. "HUANTUGSUMO PELILEO - HUANTUGSUMO"): cópiala tal cual.
- El primario es el alimentador de la incidencia. Solo llénalo si en la pantalla se lee el nombre de un alimentador de la lista
  (p. ej. "Alimentador actual: 01_09_Huambaló" → Huambaló). No lo deduzcas del nombre de una ciudad, barrio o calle: si no se lee, deja "".`;
const SIS_FAL = `Lees fotos tomadas con un celular a pantallas del SCADA/ADMS de EEASA (Ambato, Ecuador) para llenar la bitácora de fallas internas.
La pantalla puede tener trama (moiré), reflejos o estar inclinada o girada: lee con cuidado cada dígito, coma y punto, y no inventes. Si un dato no se ve, déjalo vacío.
Las fechas van como dd/mm/aaaa hh:mm:ss (sin milisegundos).`;
const obj_ = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const PESTANAS = { type: "array", items: { type: "string" }, description: "Números de 11 dígitos de todas las pestañas INC, de izquierda a derecha" };
const ACTIVA = { type: "string", description: "Número de 11 dígitos de la pestaña INC activa" };
const lista_ = l => (Array.isArray(l) ? l : []).map(String).filter(s => s.length < 60).slice(0, 400);

function pedido_(tipo, listas) {
  if (tipo === "inc") return { sistema: SIS_INC, texto: "Lee esta foto de Gestión de incidencias.", esquema: obj_({
    pestanas: PESTANAS, activa: ACTIVA,
    motivo: { type: "string", enum: lista_(listas.motivos).concat([""]) },
    ubicacion: { type: "string", description: "Texto de la columna Ubicación de la fila de la llamada" },
    comentario: { type: "string", description: "Texto del recuadro amarillo Comentario" },
    primario: { type: "string", enum: lista_(listas.primarios).concat([""]) },
    telefonos: { type: "array", items: { type: "string" }, description: "Teléfonos del cliente, 10 dígitos, el más probable primero" },
    giro: { type: "integer", enum: [0, 90, 180, 270], description: "Grados en sentido horario para que la pantalla quede derecha" } }) };
  if (tipo === "fal1") return { sistema: SIS_FAL, esquema: obj_({ pestanas: PESTANAS, activa: ACTIVA, clientes: { type: "string", description: "Clientes afectados, solo dígitos" } }),
    texto: `Foto de "Gestión de incidencias". Arriba hay pestañas "INC 110315xxxxx" (11 dígitos); la activa es la seleccionada. "Clientes afectados" es un número entero.` };
  if (tipo === "fal2") return { sistema: SIS_FAL, esquema: obj_({
    filas: { type: "array", items: obj_({ fecha: { type: "string", description: "dd/mm/aaaa hh:mm:ss" }, tipo: { type: "string", enum: ["apertura", "cierre_auto", "cierre_operador", "otro"] }, mensaje: { type: "string" } }) },
    punto: { type: "string" }, reconectador: { type: "boolean" } }),
    texto: `Foto del "Event Summary" (historial) de un equipo. Cada fila tiene un color de fondo:
azul = el equipo se abrió (estado anormal); verde = reconexión automática; blanco = comando del operador ("Comando discreto Cerrado/Abierto realizado", "Cambio de estado…"); celeste = control.
Lista TODAS las filas con fecha, en el orden en que aparecen. tipo: "apertura" para las azules (aunque la palabra no se lea bien) y para las blancas que dicen Abierto;
"cierre_auto" para las verdes que no dicen Abierto; "cierre_operador" para las blancas que dicen Cerrado; "otro" para las que dicen Emitido, Issue, Executing o Ilegal, las celestes y el resto.
punto: el código del equipo tal como aparece en la columna del punto, p. ej. "01AGORCPRI93-13_8R020". reconectador: si el texto dice Reconectador o el código termina en R y 3 dígitos.` };
  if (tipo === "fal3") return { sistema: SIS_FAL, esquema: obj_({
    grupos: { type: "array", items: obj_({ equipo: { type: "string" }, a: { type: "string" }, b: { type: "string" }, c: { type: "string" } }) },
    nombres: { type: "array", items: { type: "string" } } }),
    texto: `Foto del unifilar con las medidas del equipo. Junto a cada equipo hay una columna de 3 o 4 corrientes como "34.23 A": las 3 primeras son las fases A, B y C (la 4.ª es el neutro).
Lista cada columna de corrientes con el nombre del equipo que está junto a ella (p. ej. "REC. POMONA", "RIO VERDE - 93"). Copia los decimales tal como se ven, con punto.
nombres: todos los nombres de equipos que se leen en la pantalla.` };
  return null;
}

// Llamada a la API de Claude (Apps Script no tiene SDK de Anthropic: va por HTTP).
// Esfuerzo medio: con Haiku sigue siendo rápido (Apps Script corta las llamadas de más de un minuto).
function claude_(p, imagen) {
  const key = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, error: "sin-clave-api" };
  const cuerpo = {
    model: MODELO, max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: p.esquema } },
    system: p.sistema,
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imagen } }, { type: "text", text: p.texto }] }],
  };
  const r = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { "x-api-key": key, "anthropic-version": "2026-10-21" },
    payload: JSON.stringify(cuerpo),
  });
  const code = r.getResponseCode(), j = JSON.parse(r.getContentText() || "{}");
  if (code === 401 || code === 403) return { ok: false, error: "clave-api" };
  if (code === 429 || /credit|balance/i.test(((j.error || {}).message) || "")) return { ok: false, error: "saldo" };
  if (code !== 200) return { ok: false, error: "api", detalle: code + " " + ((j.error || {}).message || "") };
  if (j.stop_reason === "refusal") return { ok: false, error: "rechazo" };
  const t = (j.content || []).filter(b => b.type === "text")[0];
  if (!t) return { ok: false, error: "vacio" };
  return { ok: true, datos: JSON.parse(t.text) };
}

// ---------- aplicación web ----------
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, servicio: "despacho-ia" }); }
// El celular manda { clave, tipo: "probar" | "inc" | "fal1" | "fal2" | "fal3", imagen (base64 JPEG), listas }
function doPost(e) {
  try {
    const q = JSON.parse(e.postData.contents);
    const op = operador_(q.clave);
    if (!op) return json_({ ok: false, error: "contraseña" });
    if (q.tipo === "probar") return json_({ ok: true, operador: op.nombre });
    const p = pedido_(q.tipo, q.listas || {});
    if (!p || !q.imagen) return json_({ ok: false, error: "pedido" });
    const r = claude_(p, q.imagen);
    if (r.ok) contar_(op);
    return json_(r);
  } catch (err) {
    return json_({ ok: false, error: "servidor", detalle: String(err) });
  }
}
