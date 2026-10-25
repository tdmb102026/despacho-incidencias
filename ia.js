// ---------- Modo «Con IA» ----------
// Las fotos van al servidor de fer (Apps Script de Google, ia-servidor/ia-google.gs), que revisa la contraseña
// del operador y se las pasa a Claude (Anthropic). La clave de API queda en el servidor.
// El Motorola del CECON lo usan todos los turnos: la contraseña vale solo un turno (8 horas) o hasta tocar «Salir»,
// así cada foto se cuenta al operador que la tomó.

// Enlace /exec del servidor de fer. Si se vacía, se puede pegar en la pantalla de la contraseña.
const IA_URL = "https://script.google.com/macros/s/AKfycbw4zZF5oOZ4Gd0l33tUGuSLAzXfVqkFf-ljV6wMYeIGc9j9nv7WUzb2urt80IlFp6GCJQ/exec";
let modoIA = false;
const iaGet = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const iaPut = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
const iaUrl = () => IA_URL || iaGet("ia-servidor");
const TURNO = 8 * 3600e3;
// Contraseña del turno en curso ("" si ya pasó el turno o se tocó Salir)
function iaClave() {
  if (Date.now() > +iaGet("ia-hasta")) { iaPut("ia-clave", ""); iaPut("ia-nombre", ""); }
  return iaGet("ia-clave");
}

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
const IA_ERRORES = {
  "contraseña": "Tu contraseña de la IA ya no vale (o terminó tu turno). Vuelve al inicio y entra de nuevo, o usa el modo Sin IA.",
  "saldo": "La IA está ocupada o se acabó el saldo. Espera un momento o usa el modo Sin IA.",
  "clave-api": "El servidor de la IA no tiene una clave de Anthropic válida. Avisa a fer.",
  "sin-clave-api": "El servidor de la IA todavía no tiene la clave de Anthropic. Avisa a fer.",
  "rechazo": "La IA no quiso leer esta foto. Prueba con otra.",
};
// Pregunta al servidor. Va como texto plano para que el navegador no pida permiso aparte (CORS)
async function iaPost(body) {
  const url = iaUrl();
  if (!url) throw iaErr("Falta el enlace del servidor de la IA.");
  if (!navigator.onLine) throw iaErr("Sin internet: la IA necesita señal. Usa el modo Sin IA.");
  let j;
  try { j = await (await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })).json(); }
  catch { throw iaErr("No se pudo conectar con la IA (¿sin señal?). Vuelve a intentarlo."); }
  if (!j.ok) {
    if (j.error === "contraseña") iaPut("ia-hasta", "");
    throw iaErr(IA_ERRORES[j.error] || "La IA dio un error. Vuelve a intentarlo.");
  }
  return j;
}
async function iaRead(file, tipo, listas) {
  const { data, canvas } = await iaImage(file);
  const j = await iaPost({ clave: iaClave(), tipo, imagen: data, listas });
  return { out: j.datos || {}, canvas };
}

// ---------- Despacho de incidencias ----------
// La pantalla de Gestión de incidencias casi nunca muestra el primario: la Ubicación es el sector ("HUANTUGSUMO PELILEO").
// Se buscan nombres de alimentadores en la ubicación y el comentario, y la app recuerda qué primario se envió
// para cada ubicación, así la próxima vez sale solo.
let iaUbic = "";
const ubicKey = u => squash(String(u).split(" - ")[0]);
function iaPrims(out) {
  const ubic = out.ubicacion || "", com = out.comentario || "";
  const learned = ubic ? store.get("ubic-primario", {})[ubicKey(ubic)] : "";
  const found = parseOCR(ubic + "\n" + com, com).prims;
  return [learned, out.primario, ...found].filter((v, i, l) => v && priName(v) && l.indexOf(v) === i);
}
function iaLearn() {
  const pri = priName($("f-pri").value);
  if (!modoIA || !iaUbic || !ubicKey(iaUbic) || !pri) return;
  const m = store.get("ubic-primario", {}); m[ubicKey(iaUbic)] = pri; store.set("ubic-primario", m);
}
$("share").addEventListener("click", iaLearn);
$("copy").addEventListener("click", iaLearn);
async function iaReadInc(file) {
  const { out, canvas } = await iaRead(file, "inc", { motivos: MOTIVOS.map(m => m[0]), primarios: ALIM.map(a => a[1]) });
  const six = d => String(d).replace(/\D/g, "").slice(-6);
  const tabs = (out.pestanas || []).map(six).filter(d => d.length === 6);
  const inc = six(out.activa || "") || tabs.at(-1) || "";
  const phones = [...new Set((out.telefonos || []).map(t => t.replace(/\D/g, "")).filter(t => /^0\d{9}$/.test(t)))];
  return { inc, incs: [...new Set([...tabs, inc].filter(Boolean))], motivo: out.motivo || "", prims: iaPrims(out), ubic: out.ubicacion || "",
    phones, giro: out.giro || 0, canvas, raw: JSON.stringify(out, null, 1) };
}
async function processFileIA(file) {
  photoFile = file; msgEdited = false;
  $("thumb").src = URL.createObjectURL(file);
  $("prev").hidden = false; $("result").hidden = true; $("note").hidden = true;
  $("barfill").style.width = "10%"; $("status").textContent = "Enviando la foto a la IA…";
  // Barra que avanza sola mientras la IA lee (no hay progreso real)
  let pct = 10; const tick = setInterval(() => { pct += (95 - pct) * 0.06; $("barfill").style.width = pct + "%"; if (pct > 30) $("status").textContent = "La IA está leyendo la foto…"; }, 400);
  try {
    const p = await iaReadInc(file);
    // La foto que se comparte va derecha (horizontal), como la vio la IA
    if (p.giro) {
      const blob = await new Promise(r => iaRotate(p.canvas, p.giro).toBlob(r, "image/jpeg", 0.9));
      if (blob) { photoFile = new File([blob], "incidencia.jpg", { type: "image/jpeg" }); $("thumb").src = URL.createObjectURL(photoFile); }
    }
    $("raw").textContent = p.raw;
    showResult(p);
  } catch (err) {
    $("status").textContent = err.ia ? err.message : "No se pudo leer la foto. Vuelve a intentarlo.";
  } finally { clearInterval(tick); }
}

// ---------- Fallas internas ----------
// Historial del equipo: la IA devuelve cada fila ya clasificada (apertura, cierre automático, cierre del operador)
function iaHist(out) {
  let ev = [];
  for (const r of out.filas || []) {
    const st = stamp(r.fecha || "");
    if (!st || r.tipo === "otro") continue;
    ev.push({ ...st, close: r.tipo !== "apertura", auto: r.tipo === "cierre_auto" });
  }
  // Igual que sin IA: solo el día de la falla (hoy, o el de la apertura más nueva) y la última racha
  const t = new Date(), hoy = `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`;
  const newest = list => list.slice().sort((a, b) => b.n - a.n)[0];
  const day = ev.some(e => e.s.startsWith(hoy)) ? hoy : (newest(ev.filter(e => !e.close)) || newest(ev) || { s: "" }).s.slice(0, 10);
  ev = ev.filter(e => e.s.startsWith(day)).sort((a, b) => a.n - b.n || a.close - b.close);
  let i = ev.length - 1;
  while (i > 0 && !(ev[i - 1].close && !ev[i].close && ev[i].n - ev[i - 1].n > 5 * 60e3)) i--;
  const racha = ev.slice(i), first = racha.find(e => !e.close), last = racha.at(-1);
  const point = /(\d{2}[A-Z]{5,}\d{1,3}-\d{2}_[A-Z0-9]{3,12})/.exec(norm(out.punto || "").replace(/\s/g, ""));
  const tag = point ? point[1].split("_").pop() : "";
  const closed = !!(last && last.close);
  return {
    point: point ? point[1] : "", tag, rec: !!out.reconectador || /R\d{3}/.test(tag),
    open: first ? first.s : "", closed, close: closed ? last.s : "", auto: closed && !!last.auto,
    score: first ? 2 : ev.length ? 1 : 0,
  };
}
// Respuesta de la IA → lo mismo que devuelve la lectura sin IA de cada foto
function iaSlot(n, out) {
  if (n === 0) {
    const d = s => String(s).replace(/\D/g, ""), act = d(out.activa || ""), ok = x => /^110\d{7,8}$/.test(x);
    // La activa va al final: es la que se elige sola
    const incs = [...new Set((out.pestanas || []).map(d).filter(x => ok(x) && x !== act))];
    if (ok(act)) incs.push(act);
    const clientes = d(out.clientes || "");
    return { incs, clientes, score: !!incs.length + !!clientes };
  }
  if (n === 1) return iaHist(out);
  const num = s => { const m = /\d{1,4}(?:[.,]\d{1,3})?/.exec(String(s || "")); return m ? m[0].replace(",", ".") : ""; };
  const gs = (out.grupos || []).map(g => ({ equipo: g.equipo, vals: [g.a, g.b, g.c].map(num) })).filter(g => g.vals.every(Boolean));
  // El grupo del equipo elegido va primero
  const k = squash((cur && cur.eq && cur.eq.nombre) || "");
  if (k) gs.sort((a, b) => squash(b.equipo).includes(k) - squash(a.equipo).includes(k));
  return { groups: gs, score: gs.length ? 1 : 0 };
}
function readSlotIA(f, n, file) {
  (shots[f.id] = shots[f.id] || [])[n] = URL.createObjectURL(file);
  f.read = f.read || {}; f.read[n] = "Esperando a la IA…";
  drawSlots();
  readQueue = readQueue.then(async () => {
    f.read[n] = "La IA está leyendo la foto…"; if (cur === f) drawSlots();
    const { out } = await iaRead(file, "fal" + (n + 1));
    // guessEquipo busca los nombres de equipos en el texto de la foto 3
    const text = (n === 2 ? (out.nombres || []).concat((out.grupos || []).map(g => g.equipo)).join("\n") + "\n" : "") + JSON.stringify(out, null, 1);
    applySlot(f, n, iaSlot(n, out), text);
  }).catch(e => { f.read[n] = e.ia ? e.message : "No se pudo leer. Vuelve a intentarlo."; if (cur === f) drawSlots(); });
}

// ---------- pantallas: elegir modo y contraseña ----------
function setModo(ia) {
  modoIA = ia;
  $("modo-lbl").textContent = ia ? "Con IA · " + (iaGet("ia-nombre") || "operador") : "Sin IA";
  $("ia-salir").hidden = !ia;
  $("home-tip").textContent = ia ? "Las fotos las lee la IA (necesita internet)." : "Toma la foto de cerca, con la fila de la llamada y el recuadro del Comentario visibles.";
}
$("go-sin").onclick = () => { setModo(false); history.pushState({ v: "home" }, ""); show("home"); };
$("go-con").onclick = () => {
  if (iaClave() && iaUrl()) { setModo(true); history.pushState({ v: "home" }, ""); show("home"); return; }
  history.pushState({ v: "clave" }, ""); show("clave");
};
$("go-modo").onclick = () => history.back();
// Al terminar el turno: el siguiente operador entra con su propia contraseña
$("ia-salir").onclick = () => { iaPut("ia-hasta", ""); iaClave(); history.back(); };
$("ia-url-f").hidden = !!IA_URL;
$("ia-url").value = iaGet("ia-servidor");
$("ia-entrar").onclick = async () => {
  const clave = $("ia-pass").value.trim(), url = $("ia-url").value.trim();
  if (!IA_URL) {
    if (!/^https:\/\/script\.google/.test(url)) { $("ia-note").textContent = "Pega el enlace del servidor (empieza con https://script.google.com)."; $("ia-note").hidden = false; return; }
    iaPut("ia-servidor", url);
  }
  if (!clave) return;
  $("ia-entrar").disabled = true; $("ia-note").textContent = "Revisando la contraseña…"; $("ia-note").hidden = false;
  try {
    const j = await iaPost({ clave, tipo: "probar" });
    iaPut("ia-clave", clave); iaPut("ia-nombre", j.operador || ""); iaPut("ia-hasta", String(Date.now() + TURNO)); $("ia-pass").value = ""; $("ia-note").hidden = true;
    setModo(true); history.replaceState({ v: "home" }, ""); show("home");
  } catch (e) {
    $("ia-note").textContent = e.ia ? (e.message.startsWith("Tu contraseña") ? "Esa contraseña no vale. Revísala o pídela a fer." : e.message) : "No se pudo revisar la contraseña.";
  } finally { $("ia-entrar").disabled = false; }
};
$("ia-pass").addEventListener("keydown", e => { if (e.key === "Enter") $("ia-entrar").click(); });
