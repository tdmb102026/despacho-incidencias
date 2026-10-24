// ---------- Lectura con IA ----------
// Cada foto va a Claude (Anthropic) y vuelve con los campos en JSON, ya separados.
// La clave de API la pega fer una vez y queda solo en este celular.

const IA_MODEL = "claude-opus-5-5";
const IA_KEY = "ia-clave";
const iaKey = () => { try { return localStorage.getItem(IA_KEY) || ""; } catch { return ""; } };
const iaSetKey = k => { try { k ? localStorage.setItem(IA_KEY, k) : localStorage.removeItem(IA_KEY); } catch {} };

// La foto se reduce a lo que el modelo usa (2576 px el lado largo, ~3.7 MP), así sube rápido y cuesta menos
async function iaImage(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 2576 / Math.max(img.width, img.height), Math.sqrt(3.7e6 / (img.width * img.height)));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.9);
  return { data: url.slice(url.indexOf(",") + 1), canvas: c };
}

// Gira la foto (grados en sentido horario) para compartirla derecha
function iaRotate(src, deg) {
  const c = document.createElement("canvas"), side = deg % 180 !== 0;
  c.width = side ? src.height : src.width; c.height = side ? src.width : src.height;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

const iaErr = msg => Object.assign(new Error(msg), { ia: true });
// Pide a Claude que lea la foto y devuelva un JSON con la forma de `schema`
async function iaRead(file, system, schema, text) {
  const key = iaKey();
  if (!key) throw iaErr("Falta la clave de la IA: ábrela en el inicio, en «Clave de la IA».");
  if (!navigator.onLine) throw iaErr("Sin internet: la IA necesita señal para leer la foto.");
  const { data, canvas } = await iaImage(file);
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 90e3 });
  const params = {
    model: IA_MODEL, max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }, { type: "text", text }] }],
  };
  let r;
  try {
    // Si el modelo se niega por error, la API reintenta sola con otro modelo
    r = await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) r = await client.messages.create(params).catch(iaFail);
    else iaFail(e);
  }
  if (r.stop_reason === "refusal") throw iaErr("La IA no quiso leer esta foto. Prueba con otra.");
  const t = r.content.find(b => b.type === "text");
  if (!t) throw iaErr("La IA no devolvió datos. Vuelve a intentarlo.");
  return { out: JSON.parse(t.text), canvas };
}
function iaFail(e) {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw iaErr("La clave de la IA no sirve. Revísala en el inicio, en «Clave de la IA».");
  if (e instanceof Anthropic.RateLimitError) throw iaErr("La IA está ocupada o se acabó el saldo de la cuenta. Espera un momento o revisa el saldo en console.anthropic.com.");
  if (e instanceof Anthropic.APIConnectionError) throw iaErr("No se pudo conectar con la IA (¿sin señal?). Vuelve a intentarlo.");
  if (e instanceof Anthropic.APIError && /credit|balance/i.test(e.message)) throw iaErr("Se acabó el saldo de la cuenta de la IA. Recárgalo en console.anthropic.com.");
  throw iaErr("La IA dio un error (" + (e.status || e.name) + "). Vuelve a intentarlo.");
}

// ---------- Despacho de incidencias ----------
const IA_INC_SYSTEM = `Lees fotos tomadas con un celular a la pantalla del ADMS de EEASA (Ambato, Ecuador), módulo "Gestión de incidencias".
La pantalla puede tener trama (moiré), reflejos o estar inclinada o girada: lee con cuidado cada dígito y no inventes. Si un dato no se ve, déjalo vacío.
- Arriba hay pestañas con incidencias "INC 110315xxxxx" (11 dígitos). La pestaña activa es la que se ve seleccionada (resaltada o con su contenido abajo).
- En la tabla de llamadas, la fila de la llamada tiene fecha, motivo (p. ej. "Sector sin servicio") y la ubicación.
- El recuadro amarillo "Comentario" trae la dirección, el teléfono del cliente (TELF, CEL…: 10 dígitos que empiezan con 09) y el texto del cliente.
- El primario es el alimentador de la incidencia ("Alimentador actual", p. ej. "01_09_Huambaló" → Huambaló). Elige el nombre exacto de la lista; si no aparece, deja "".`;
const IA_INC_SCHEMA = () => ({
  type: "object", additionalProperties: false,
  required: ["pestanas", "activa", "motivo", "primario", "telefonos", "giro"],
  properties: {
    pestanas: { type: "array", items: { type: "string" }, description: "Números de 11 dígitos de todas las pestañas INC, de izquierda a derecha" },
    activa: { type: "string", description: "Número de 11 dígitos de la pestaña INC activa" },
    motivo: { type: "string", enum: [...MOTIVOS.map(m => m[0]), ""] },
    primario: { type: "string", enum: [...ALIM.map(a => a[1]), ""] },
    telefonos: { type: "array", items: { type: "string" }, description: "Teléfonos del cliente, 10 dígitos, el más probable primero" },
    giro: { type: "integer", enum: [0, 90, 180, 270], description: "Grados en sentido horario para que la pantalla quede derecha" },
  },
});
async function iaReadInc(file) {
  const { out, canvas } = await iaRead(file, IA_INC_SYSTEM, IA_INC_SCHEMA(), "Lee esta foto de Gestión de incidencias.");
  const six = d => String(d).replace(/\D/g, "").slice(-6);
  const tabs = (out.pestanas || []).map(six).filter(d => d.length === 6);
  const inc = six(out.activa || "") || tabs.at(-1) || "";
  const incs = [...new Set([...tabs, inc].filter(Boolean))];
  const phones = [...new Set((out.telefonos || []).map(t => t.replace(/\D/g, "")).filter(t => /^0\d{9}$/.test(t)))];
  return { inc, incs, motivo: out.motivo || "", prims: out.primario ? [out.primario] : [], phones, giro: out.giro || 0, canvas, raw: JSON.stringify(out, null, 1) };
}

// ---------- Fallas internas ----------
const IA_FAL_SYSTEM = `Lees fotos tomadas con un celular a pantallas del SCADA/ADMS de EEASA (Ambato, Ecuador) para llenar la bitácora de fallas internas.
La pantalla puede tener trama (moiré), reflejos o estar inclinada o girada: lee con cuidado cada dígito, coma y punto, y no inventes. Si un dato no se ve, déjalo vacío.
Las fechas van como dd/mm/aaaa hh:mm:ss (sin milisegundos).`;
const IA_FAL = [
  { // 1 · Gestión de incidencias
    text: `Foto de "Gestión de incidencias". Arriba hay pestañas "INC 110315xxxxx" (11 dígitos); la activa es la seleccionada. "Clientes afectados" es un número entero.`,
    schema: { type: "object", additionalProperties: false, required: ["pestanas", "activa", "clientes"], properties: {
      pestanas: { type: "array", items: { type: "string" }, description: "Números de 11 dígitos de todas las pestañas INC, de izquierda a derecha" },
      activa: { type: "string", description: "Número de 11 dígitos de la pestaña INC activa" },
      clientes: { type: "string", description: "Clientes afectados, solo dígitos" } } },
  },
  { // 2 · Event Summary
    text: `Foto del "Event Summary" (historial) de un equipo. Cada fila tiene un color de fondo:
azul = el equipo se abrió (estado anormal); verde = reconexión automática; blanco = comando del operador ("Comando discreto Cerrado/Abierto realizado", "Cambio de estado…"); celeste = control.
Lista TODAS las filas con fecha, en el orden en que aparecen. tipo: "apertura" para las azules (aunque la palabra no se lea bien) y para las blancas que dicen Abierto;
"cierre_auto" para las verdes que no dicen Abierto; "cierre_operador" para las blancas que dicen Cerrado; "otro" para las que dicen Emitido, Issue, Executing o Ilegal, las celestes y el resto.
punto: el código del equipo tal como aparece en la columna del punto, p. ej. "01AGORCPRI93-13_8R020". reconectador: si el texto dice Reconectador o el código termina en R y 3 dígitos.`,
    schema: { type: "object", additionalProperties: false, required: ["filas", "punto", "reconectador"], properties: {
      filas: { type: "array", items: { type: "object", additionalProperties: false, required: ["fecha", "tipo", "mensaje"], properties: {
        fecha: { type: "string", description: "dd/mm/aaaa hh:mm:ss" },
        tipo: { type: "string", enum: ["apertura", "cierre_auto", "cierre_operador", "otro"] },
        mensaje: { type: "string" } } } },
      punto: { type: "string" }, reconectador: { type: "boolean" } } },
  },
  { // 3 · Unifilar con corrientes
    text: `Foto del unifilar con las medidas del equipo. Junto a cada equipo hay una columna de 3 o 4 corrientes como "34.23 A": las 3 primeras son las fases A, B y C (la 4.ª es el neutro).
Lista cada columna de corrientes con el nombre del equipo que está junto a ella (p. ej. "REC. POMONA", "RIO VERDE - 93"). Copia los decimales tal como se ven, con punto.
nombres: todos los nombres de equipos que se leen en la pantalla.`,
    schema: { type: "object", additionalProperties: false, required: ["grupos", "nombres"], properties: {
      grupos: { type: "array", items: { type: "object", additionalProperties: false, required: ["equipo", "a", "b", "c"], properties: {
        equipo: { type: "string" }, a: { type: "string" }, b: { type: "string" }, c: { type: "string" } } } },
      nombres: { type: "array", items: { type: "string" } } } },
  },
];
