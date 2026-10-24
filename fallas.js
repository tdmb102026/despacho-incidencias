// ---------- Fallas internas ----------
// Con 3 o 4 fotos del SCADA/ADMS se arma la fila de Para_Bitacora: 1) incidencia y clientes,
// 2) historial del equipo (apertura y último cierre), 3) lista de disparos (hora y fases),
// 4) opcional: corrientes. La falla se guarda en el celular y se envía a la hoja de Google;
// en la PC el marcador "Llenar Bitácora" la lee y llena el formulario.

const SLOTS = [
  { t: "1 · Incidencia", d: "Gestión de incidencias: pestaña INC y Clientes afectados" },
  { t: "2 · Historial del equipo", d: "Event Summary: apertura y último cierre (lo más nuevo arriba)" },
  { t: "3 · Disparos", d: "Lista filtrada por DISPA: hora del disparo y fases" },
  { t: "4 · Cargas (opcional)", d: "Unifilar con las corrientes del equipo" },
];
const EQUIPOS = [
  ...DEMANDA.map(([se, nombre], i) => ({ tipo: "alim", se, nombre, i })),
  ...RECONECTADORES.map(nombre => ({ tipo: "rec", se: "", nombre })),
].map(e => ({ ...e, k: squash(e.nombre), ks: squash(e.se) }));
const eqLabel = e => e ? (e.tipo === "rec" ? "Rec. " + e.nombre : e.nombre + " · S/E " + e.se) : "";
const eqFind = (tipo, nombre) => EQUIPOS.find(e => e.tipo === tipo && e.nombre === nombre) || null;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let fallas = store.get("fallas", []);
let cur = null;           // falla abierta en el editor
const shots = {};         // fotos de la sesión: id -> [url…] (no se guardan, pesan mucho)
const saveAll = () => store.set("fallas", fallas.slice(-60));

// ---------- lectura de las fotos ----------
const fixO = s => s.replace(/(?<=\d)[OoQ]|[OoQ](?=\d)/g, "0");
const pad = x => String(x).padStart(2, "0");
// Fecha y hora del SCADA: 23/10/2026 9:53:23,003 → 23/10/2026 09:53:23
function stamp(line) {
  const m = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s+(\d{1,2})\s*[:.]\s*(\d{2})\s*[:.]\s*(\d{2})/.exec(fixO(line));
  if (!m) return null;
  return { s: `${pad(m[1])}/${pad(m[2])}/${m[3]} ${pad(m[4])}:${m[5]}:${m[6]}`, n: Date.UTC(+m[3], m[2] - 1, +m[1], +m[4], +m[5], +m[6]) };
}
const lineTexts = data => (data.lines || []).map(l => l.text).filter(t => t.trim());

function parseInc(data) {
  const N = norm(fixO(data.text));
  const incs = [...new Set([...N.matchAll(/INC\s*((?:\d\s?){10,11})(?!\d)/g)].map(m => m[1].replace(/\s/g, "")).filter(d => /^110\d{7,8}$/.test(d)))];
  const cli = /CLIENTES\s*AFECTADOS\s*:?\s*(\d[\d.,]*)/.exec(N);
  const clientes = cli ? cli[1].replace(/[.,]/g, "") : "";
  return { incs, clientes, score: !!incs.length + !!clientes };
}
// Historial del equipo: el último cierre (si lo hay) y la primera apertura que se alcance a ver
function parseHist(data) {
  const N = norm(fixO(data.text)), ev = [];
  for (const t of lineTexts(data)) {
    const st = stamp(t), M = norm(t);
    if (!st || /ILEGAL|EMITIDO|ISSUE|EXECUTING/.test(M)) continue;
    if (/CERRADO/.test(M) && /REALIZADO|CAMBIO|ESTADO/.test(M)) ev.push({ ...st, close: true });
    else if (/ABIERTO/.test(M)) ev.push({ ...st, close: false });
  }
  const point = /(\d{2}[A-Z]{5,}\d{1,3}\s*-\s*\d{2}\s*_\s*[A-Z0-9]{3,8}?)(?=\s*-|\s|$)/.exec(N);
  const tag = point ? point[1].replace(/\s/g, "").split("_").pop() : "";
  const last = ev.slice().sort((a, b) => b.n - a.n)[0];
  const opens = ev.filter(e => !e.close).sort((a, b) => a.n - b.n);
  return {
    point: point ? point[1].replace(/\s/g, "") : "", tag, rec: /RECONECTADOR/.test(N) || /R\d{3}/.test(tag),
    open: opens[0] ? opens[0].s : "", closed: !!(last && last.close), close: last && last.close ? last.s : "",
    score: ev.length ? 1 + !!point : 0,
  };
}
// Disparos: la primera hora del equipo y las fases que dispararon en esos segundos
function parseTrips(data, tag) {
  let rows = lineTexts(data).map(t => ({ t, M: norm(fixO(t)), st: stamp(t) })).filter(r => r.st && /DISPAR|-\s*D[A-Z0-9]/.test(r.M));
  // El lector a veces cambia un carácter del código (8R020 → 8R070, 8ROZ0): se acepta una diferencia
  const T = squash(tag || "").replace(/O/g, "0");
  const hasTag = M => { const q = squash(M).replace(/O/g, "0");
    for (let i = 0; i + T.length <= q.length; i++) { let d = 0; for (let j = 0; j < T.length && d < 2; j++) d += q[i + j] !== T[j]; if (d < 2) return true; }
    return false; };
  if (T && rows.some(r => hasTag(r.M))) rows = rows.filter(r => hasTag(r.M));
  if (!rows.length) return { score: 0 };
  const first = rows.reduce((a, b) => (b.st.n < a.st.n ? b : a));
  const fases = new Set();
  for (const r of rows) if (r.st.n - first.st.n <= 5000) {
    for (const m of r.M.matchAll(/FASE\s*([ABC])(?![A-Z])|-\s*DF([ABC])(?![A-Z])/g)) fases.add(m[1] || m[2]);
    if (/FASE\s*N(?![A-Z])|NEUTRO|TIERRA|-\s*DFN(?![A-Z])/.test(r.M)) fases.add("N");
  }
  return { open: first.st.s, fases: [...fases].sort().join(""), score: 1 + !!fases.size };
}
// Corrientes: columnas de 3 o 4 valores "34.23 A"; se toman los 3 primeros (A, B, C)
function parseAmps(data, eqName) {
  const ws = data.words || [];
  const L = ws.flatMap((w, i) => {
    const t = fixO(w.text), m = /^(\d{1,4}[.,]\d{1,3})(A?)$/.exec(t);
    if (!m || !(m[2] || /^A$/i.test((ws[i + 1] || {}).text || ""))) return [];
    return [{ v: m[1].replace(",", "."), x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 }];
  }).sort((a, b) => a.y - b.y);
  const groups = [];
  for (const r of L) {
    const g = groups.find(g => Math.abs(g.x - r.x) < 3 * r.h && r.y - g.items.at(-1).y < 2.6 * r.h);
    if (g) g.items.push(r); else groups.push({ x: r.x, items: [r] });
  }
  let gs = groups.filter(g => g.items.length >= 3).map(g => ({ vals: g.items.slice(0, 3).map(i => i.v), x: g.x, y: g.items[0].y }));
  // El grupo más cercano al nombre del equipo va primero
  const k = squash(eqName || ""), lab = k && (data.lines || []).find(l => squash(l.text).includes(k));
  if (lab) { const cx = lab.bbox.x0, cy = lab.bbox.y1; gs.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)); }
  else gs.sort((a, b) => b.vals.reduce((s, v) => s + +v, 0) - a.vals.reduce((s, v) => s + +v, 0));
  return { groups: gs, score: gs.length ? 1 : 0 };
}

// Foto lista para el lector: gris, hasta 2200 px y, si la pantalla es oscura (SCADA), invertida
function prep(src) {
  const W = Math.min(2200, src.width), H = Math.round(src.height * W / src.width);
  const t = document.createElement("canvas"); t.width = 80; t.height = Math.max(1, Math.round(80 * H / W));
  const tg = t.getContext("2d"); tg.drawImage(src, 0, 0, t.width, t.height);
  const d = tg.getImageData(0, 0, t.width, t.height).data;
  let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.filter = "grayscale(1)" + (sum / (d.length / 4) < 110 ? " invert(1)" : "");
  g.drawImage(src, 0, 0, W, H);
  return c;
}
// Foto 1 (pantalla clara, letras grandes): blanco y negro a 3000 px, así se leen todas las pestañas INC
function prepBW(src, W = 3000) {
  W = Math.min(W, src.width); const H = Math.round(src.height * W / src.width);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(src, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H), d = id.data; let mean = 0;
  for (let i = 0; i < d.length; i += 4) mean += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
  mean /= d.length / 4;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11 > mean * .75 ? 255 : 0;
  g.putImageData(id, 0, 0); return c;
}
// Foto 4 (unifilar oscuro): solo lo verde (las medidas) queda en negro sobre blanco
function prepGreen(src, W = 1300) {
  W = Math.min(W, src.width); const H = Math.round(src.height * W / src.width);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(src, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i + 1] - Math.max(d[i], d[i + 2]) > 40 && d[i + 1] > 90 ? 0 : 255;
  g.putImageData(id, 0, 0); return c;
}
// Clientes afectados: el número queda lejos de la etiqueta; se recorta esa franja y se lee solo con dígitos
async function readClientes(w, src, pic, data) {
  const lab = (data.words || []).find(x => /AFECTADOS/.test(norm(x.text)));
  if (!lab) return "";
  const k = src.width / pic.width, h = (lab.bbox.y1 - lab.bbox.y0) * k;
  const x0 = lab.bbox.x1 * k, x1 = Math.min(src.width, x0 + 18 * h), y0 = Math.max(0, lab.bbox.y0 * k - 0.6 * h);
  const c = crop(src, x0, y0, x1 - x0, 2.2 * h, Math.round((x1 - x0) * 80 / (2.2 * h)));
  // El fondo de la pantalla tiene trama: solo lo bien oscuro (el número en negrita) queda negro
  const g = c.getContext("2d"), id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  let mean = 0; for (let i = 0; i < d.length; i += 4) mean += d[i]; mean /= d.length / 4;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] < mean * .55 ? 0 : 255;
  g.putImageData(id, 0, 0);
  // Lector aparte solo para dígitos (así los otros no quedan limitados a números)
  const wd = await (digitsReady = digitsReady || Tesseract.createWorker("spa", 1, { workerPath: new URL("ocr/worker-wrap.js", location.href).href, corePath: new URL("ocr/", location.href).href, langPath: new URL("ocr/lang", location.href).href, workerBlobURL: false, gzip: true }).then(async x => { await x.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789" }); return x; }));
  const t = (await wd.recognize(c)).data.text.replace(/\D/g, "");
  return t.length && t.length <= 6 ? t : "";
}
let readQueue = Promise.resolve(), digitsReady = null;
function readSlot(f, n, file) {
  const id = f.id;
  (shots[id] = shots[id] || [])[n] = URL.createObjectURL(file);
  f.read = f.read || {}; f.read[n] = "Esperando al lector…";
  drawSlots();
  readQueue = readQueue.then(async () => {
    const w = await getWorker();
    const img = await createImageBitmap(file);
    const rots = img.height > img.width ? [0, 90, 270] : [0, 180];
    let best = null;
    for (const rot of rots) {
      f.read[n] = "Leyendo la foto…"; if (cur === f) drawSlots();
      const src = await orient(file, rot);
      const pic = n === 0 ? prepBW(src) : n === 3 ? prepGreen(src) : prep(src);
      if (n === 3) await w.setParameters({ tessedit_pageseg_mode: "11" });
      let data;
      try { data = (await w.recognize(pic)).data; } finally { if (n === 3) await w.setParameters({ tessedit_pageseg_mode: "3" }); }
      const r = n === 0 ? parseInc(data) : n === 1 ? parseHist(data) : n === 2 ? parseTrips(data, f.hist && f.hist.tag) : parseAmps(data, f.eq && f.eq.nombre);
      if (n === 0 && r.incs.length && !r.clientes) { r.clientes = await readClientes(w, src, pic, data); r.score += !!r.clientes; }
      if (!best || r.score > best.r.score) best = { r, data };
      if (r.score >= (n === 3 ? 1 : 2)) break;
    }
    applySlot(f, n, best.r, best.data.text);
  }).catch(() => { f.read[n] = "No se pudo leer. Prueba otra foto más cercana y derecha."; if (cur === f) drawSlots(); });
}
function applySlot(f, n, r, text) {
  f.raw = f.raw || []; f.raw[n] = text;
  if (n === 0) {
    f.incs = r.incs; if (r.incs.length) f.inc = r.incs.at(-1);
    if (r.clientes) f.clientes = r.clientes;
    f.read[n] = r.score ? `INC ${f.inc || "?"} · ${f.clientes || "?"} clientes` : "No encontré la INC ni los clientes.";
  } else if (n === 1) {
    f.hist = r;
    // La apertura tiene que ser antes del último cierre; si no, se espera la hora de la foto de disparos
    const before = r.open && (!r.close || stamp(r.open).n < stamp(r.close).n);
    if (before && (!f.des || stamp(r.open).n < stamp(f.des).n)) f.des = r.open;
    if (r.score) { f.estado = r.closed ? "CERRADO" : "ABIERTO"; f.con = r.close; }
    // Equipo ya conocido por su código del SCADA
    const known = r.point && store.get("codigos", {})[r.point];
    if (known && !f.eq) f.eq = eqFind(known[0], known[1]);
    f.read[n] = r.score ? (r.closed ? `Último cierre ${r.close.slice(11)}` : "Sin cierre: queda abierto") + (r.tag ? ` · ${r.tag}` : "") : "No encontré eventos de apertura o cierre.";
  } else if (n === 2) {
    if (r.open && !(f.con && stamp(r.open).n >= stamp(f.con).n)) f.des = r.open;
    if (r.fases) f.fases = r.fases;
    f.read[n] = r.score ? `Disparo ${r.open.slice(11)}${r.fases ? " · fase " + r.fases : ""}` : "No encontré disparos.";
  } else {
    // La lectura del unifilar es poco segura: se ofrece para tocarla, no se llena sola
    f.amps = r.groups.map(g => g.vals);
    f.read[n] = r.score ? "Revisa las corrientes abajo: toca la lectura si coincide, o escríbelas." : "No pude leer las corrientes: escríbelas abajo.";
  }
  if (n === 3 && !f.eq) guessEquipo(f);
  saveAll();
  if (cur === f) { drawSlots(); fillEditor(); }
}
// Equipo por su nombre en cualquiera de las fotos (unifilar: "REC. POMONA", "RIO VERDE - 93")
function guessEquipo(f) {
  const all = (f.raw || [])[3] || "", sq = squash(all), words = norm(all);
  const hits = EQUIPOS.filter(e => e.k.length >= 5 && sq.includes(e.k));
  hits.sort((a, b) => (b.tipo === "rec" && /REC/.test(words)) - (a.tipo === "rec" && /REC/.test(words)) || b.k.length - a.k.length);
  f.eqHits = hits.slice(0, 4).map(e => [e.tipo, e.nombre]);
  if (hits[0]) f.eq = hits[0];
}

// ---------- carga desde el Excel de demanda ----------
function demandaKW(f) {
  if (!f.eq || f.eq.tipo !== "alim" || !f.des) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(f.des);
  const row = DEMANDA[f.eq.i];
  if (!m || !row) return null;
  const day = (new Date(+m[3], m[2] - 1, +m[1]).getDay() + 6) % 7; // lunes = 0
  const i = day * 24 + +m[4], v0 = row[2][i], v1 = row[2][(i + 1) % 168];
  const kw = Math.round((v0 + (v1 - v0) * (+m[5] + m[6] / 60) / 60) * 1000);
  const dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  return { kw, note: `Del Excel de demanda: ${row[1]}, ${dias[day]} a las ${m[4]}:${m[5]} ≈ ${kw} kW.` };
}

// ---------- descripción y fila ----------
function describe(f) {
  if (!f.eq || !f.des) return "";
  const t = f.des.slice(11), falla = "falla" + (f.fases ? " fase " + f.fases : "");
  const fin = f.estado === "CERRADO" && f.con ? ` y se cierra a las ${f.con.slice(11)}.` : " y queda abierto.";
  return f.eq.tipo === "rec"
    ? `A las ${t}, se abre por ${falla} el reconectador ${f.eq.nombre}${fin}`
    : `A las ${t}, se desconecta por ${falla} el primario ${f.eq.nombre} de la subestación ${f.eq.se}${fin}`;
}
function rowOf(f) {
  const rec = f.eq && f.eq.tipo === "rec", cerrado = f.estado === "CERRADO";
  const amps = f.ia || f.ib || f.ic;
  return ["", f.inc || "", f.clientes || "", cerrado ? "CERRADO" : "ABIERTO", f.des || "", cerrado ? f.con || "" : "", "",
    f.eq && !rec ? f.eq.se : "", f.eq && !rec ? f.eq.nombre : "", f.ia || "", f.ib || "", f.ic || "", amps ? "" : f.kw || "",
    f.origen || "", f.causa || "", f.subcausa || "", f.txt || "", f.fases ? "Fase " + f.fases : "", rec ? f.eq.nombre : "", f.id];
}

// ---------- pantallas ----------
function showFal(v) {
  if (v === "fal") drawList();
  else if (!cur) { history.back(); return; }
  else { drawSlots(); fillEditor(); }
}
$("go-fal").onclick = () => { history.pushState({ v: "fal" }, ""); show("fal"); getWorker().catch(() => {}); };
$("fal-url").value = store.get("hoja", "");
$("fal-url").addEventListener("input", () => store.set("hoja", $("fal-url").value.trim()));
$("fal-new").onclick = () => {
  const now = new Date();
  cur = { id: "F" + now.getTime().toString(36).toUpperCase(), creada: now.toISOString(), estado: "ABIERTO" };
  fallas.push(cur); saveAll();
  history.pushState({ v: "fed" }, ""); show("fed");
};
function drawList() {
  const box = $("fal-list"); box.innerHTML = "";
  if (!fallas.length) { box.innerHTML = '<p class="tip">Aún no hay fallas. Toca «Nueva falla» y toma las fotos.</p>'; return; }
  for (const f of fallas.slice().reverse()) {
    const b = document.createElement("button");
    b.className = "big fal-item"; b.type = "button";
    b.innerHTML = "<strong></strong><small></small><small></small>";
    b.children[0].textContent = (f.inc ? "INC " + f.inc : "Sin INC") + " · " + (eqLabel(f.eq) || "equipo sin elegir");
    b.children[1].textContent = (f.des || "sin hora") + " · " + (f.estado || "ABIERTO");
    b.children[2].textContent = f.enviada ? "✓ Enviada a la hoja" : "Pendiente de enviar";
    b.children[2].className = f.enviada ? "ok" : "pend";
    b.onclick = () => { cur = f; history.pushState({ v: "fed" }, ""); show("fed"); };
    box.appendChild(b);
  }
}
function drawSlots() {
  const f = cur, box = $("fx-slots"); if (!f) return;
  box.innerHTML = "";
  SLOTS.forEach((s, n) => {
    const el = document.createElement("div"); el.className = "slot";
    el.innerHTML = '<div class="slot-h"><div><b></b><small></small></div></div><div class="pick"><button class="btn shot" type="button">Cámara</button><label class="btn shot alt"><input type="file" accept="image/*">Galería</label></div>';
    el.querySelector("b").textContent = s.t;
    el.querySelector("small").textContent = (f.read && f.read[n]) || s.d;
    const url = shots[f.id] && shots[f.id][n];
    if (url) {
      const im = document.createElement("img"); im.src = url; im.alt = s.t;
      im.onclick = () => { $("view-img").src = $("view-dl").href = url; viewFrom = "fed"; $("view").hidden = false; history.pushState({ v: "view" }, ""); };
      el.querySelector(".slot-h").prepend(im);
    }
    const inp = el.querySelector("input");
    inp.onchange = () => { const file = inp.files[0]; inp.value = ""; if (file) readSlot(f, n, file); };
    el.querySelector("button").onclick = () => openCam("fed", file => file ? readSlot(f, n, file) : inp.click());
    box.appendChild(el);
  });
}

// Editor: campos ↔ falla
const FX = { inc: "fx-inc", clientes: "fx-cli", des: "fx-des", con: "fx-con", ia: "fx-ia", ib: "fx-ib", ic: "fx-ic", kw: "fx-kw", origen: "fx-ori", causa: "fx-cau", subcausa: "fx-sub" };
function fillEditor() {
  const f = cur; if (!f) return;
  for (const [k, id] of Object.entries(FX)) if (document.activeElement !== $(id)) $(id).value = f[k] || "";
  chips($("fx-c-inc"), f.incs || [], f.inc, v => { f.inc = v; changed(); });
  if (document.activeElement !== $("fx-eq")) $("fx-eq").value = eqLabel(f.eq);
  const hits = (f.eqHits || []).map(([t, n]) => eqFind(t, n)).filter(Boolean);
  chips($("fx-c-eq"), hits.map(eqLabel), eqLabel(f.eq), v => { f.eq = hits.find(e => eqLabel(e) === v); learnCode(f); changed(); });
  $("fx-w-eq").hidden = !!f.eq; $("fx-w-eq").textContent = "Elige el equipo para completar la S/E, el alimentador y la carga.";
  // Fases: botones que se prenden y apagan
  const fb = $("fx-fases"); fb.innerHTML = "";
  for (const ph of ["A", "B", "C", "N"]) {
    const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = ph;
    b.setAttribute("aria-pressed", String((f.fases || "").includes(ph)));
    b.onclick = () => { const s = new Set(f.fases || ""); s.has(ph) ? s.delete(ph) : s.add(ph); f.fases = [..."ABCN"].filter(x => s.has(x)).join(""); changed(); };
    fb.appendChild(b);
  }
  const eb = $("fx-est"); eb.innerHTML = "";
  for (const st of ["ABIERTO", "CERRADO"]) {
    const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = st === "ABIERTO" ? "Queda abierto" : "Reconectado";
    b.setAttribute("aria-pressed", String((f.estado || "ABIERTO") === st));
    b.onclick = () => { f.estado = st; changed(); };
    eb.appendChild(b);
  }
  $("fx-con-f").hidden = f.estado !== "CERRADO";
  const ab = $("fx-c-amp"), cura = [f.ia, f.ib, f.ic].join(" / "); ab.innerHTML = ""; ab.hidden = !(f.amps || []).length;
  for (const a of f.amps || []) {
    const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = "Leí " + a.join(" / ") + " A";
    b.setAttribute("aria-pressed", String(a.join(" / ") === cura));
    b.onclick = () => { [f.ia, f.ib, f.ic] = a; changed(); };
    ab.appendChild(b);
  }
  // Carga: corrientes de la foto 4; si no hay y es alimentador, el Excel; si es reconectador, a mano
  const amps = f.ia || f.ib || f.ic, d = !amps && demandaKW(f);
  if (d && !f.kwManual) f.kw = String(d.kw);
  if (document.activeElement !== $("fx-kw")) $("fx-kw").value = amps ? "" : f.kw || "";
  $("fx-kw").disabled = !!amps;
  $("fx-kw-n").textContent = amps ? "Con corrientes la bitácora calcula los kW." : d ? d.note : f.eq && f.eq.tipo === "rec" ? "Reconectador sin foto de cargas: escribe los kW." : "";
  if (!f.txtEdited) f.txt = describe(f);
  if (document.activeElement !== $("fx-txt")) $("fx-txt").value = f.txt || "";
  for (const [k, id] of [["origen", "fx-l-ori"], ["causa", "fx-l-cau"], ["subcausa", "fx-l-sub"]])
    $(id).innerHTML = store.get("usados-" + k, []).map(v => `<option value="${v.replace(/"/g, "&quot;")}">`).join("");
  $("fx-raw").textContent = (f.raw || []).map((t, i) => t ? `--- Foto ${i + 1} ---\n${t}` : "").filter(Boolean).join("\n");
}
function changed() { cur.enviada = false; saveAll(); fillEditor(); }
for (const [k, id] of Object.entries(FX)) $(id).addEventListener("input", () => {
  cur[k] = $(id).value.trim(); if (k === "kw") cur.kwManual = !!cur.kw; changed();
});
$("fx-txt").addEventListener("input", () => { cur.txt = $("fx-txt").value; cur.txtEdited = !!cur.txt; cur.enviada = false; saveAll(); });

// Buscador de equipo: alimentadores (con su S/E) y reconectadores
function suggestEq() {
  const q = squash($("fx-eq").value), box = $("fx-s-eq");
  const list = q ? EQUIPOS.filter(e => e.k.includes(q) || e.ks.includes(q)).sort((a, b) => b.k.startsWith(q) - a.k.startsWith(q)).slice(0, 8) : [];
  box.innerHTML = "";
  for (const e of list) {
    const b = document.createElement("button"); b.type = "button"; b.innerHTML = "<span></span><small></small>";
    b.firstChild.textContent = e.nombre; b.lastChild.textContent = e.tipo === "rec" ? "Reconectador" : "S/E " + e.se;
    b.onmousedown = ev => ev.preventDefault();
    b.onclick = () => { cur.eq = e; learnCode(cur); box.hidden = true; $("fx-eq").blur(); changed(); };
    box.appendChild(b);
  }
  box.hidden = !list.length;
}
$("fx-eq").addEventListener("input", suggestEq);
$("fx-eq").addEventListener("focus", () => { $("fx-eq").select(); });
$("fx-eq").addEventListener("blur", () => { setTimeout(() => { $("fx-s-eq").hidden = true; $("fx-eq").value = eqLabel(cur && cur.eq); }, 150); });
// Se recuerda qué equipo es cada código del SCADA (01AGORCPRI93-13_8R020 → Rec. MACHAY) para la próxima vez
function learnCode(f) {
  if (!f.hist || !f.hist.point || !f.eq) return;
  const m = store.get("codigos", {}); m[f.hist.point] = [f.eq.tipo, f.eq.nombre]; store.set("codigos", m);
}

function note(t) { $("fx-note").textContent = t; $("fx-note").hidden = false; }
function remember(f) {
  for (const k of ["origen", "causa", "subcausa"]) if (f[k]) {
    const l = store.get("usados-" + k, []).filter(v => v !== f[k]); l.unshift(f[k]); store.set("usados-" + k, l.slice(0, 15));
  }
}
function problems(f) {
  const p = [];
  if (!/^\d{10,11}$/.test(f.inc || "")) p.push("la incidencia");
  if (!f.eq) p.push("el equipo");
  if (!stamp(f.des || "")) p.push("la hora de desconexión");
  if (f.estado === "CERRADO" && !stamp(f.con || "")) p.push("la hora de conexión");
  else if (f.estado === "CERRADO" && stamp(f.des || "") && stamp(f.des).n >= stamp(f.con).n) p.push("la desconexión (debe ser antes del cierre)");
  return p;
}
$("fx-send").onclick = async () => {
  const f = cur;
  let url = store.get("hoja", "");
  const p = problems(f);
  if (p.length) return note("Falta o está mal: " + p.join(", ") + ".");
  // Sin enlace guardado, se pide aquí mismo (queda guardado para las próximas)
  if (!/^https:\/\/script\.google/.test(url)) {
    url = (prompt("Pega el enlace de la hoja de Google (termina en /exec):") || "").trim();
    if (!/^https:\/\/script\.google/.test(url)) return note("Ese enlace no es el de la hoja: debe empezar con https://script.google.com. Mientras, usa «Copiar fila».");
    store.set("hoja", url); $("fal-url").value = url;
  }
  remember(f);
  note("Enviando…");
  const body = JSON.stringify({ fila: rowOf(f) });
  try {
    try { await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body }); }
    catch { await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body }); }
    f.enviada = new Date().toISOString(); saveAll();
    note("Enviada. En la PC abre «Nueva falla interna» y aplasta LLENAR BITACORA." + (f.estado === "ABIERTO" ? " Cuando se reconecte, abre esta falla, marca «Reconectado» y envíala otra vez." : ""));
  } catch { note("No se pudo enviar (¿sin señal?). La falla queda guardada; vuelve a tocar «Enviar a la hoja»."); }
};
$("fx-copy").onclick = async () => {
  remember(cur);
  const t = rowOf(cur).join("\t");
  try { await navigator.clipboard.writeText(t); note("Fila copiada. Pégala en el marcador LLENAR BITACORA (Ctrl+V)."); }
  catch { note("No se pudo copiar."); }
};
$("fx-del").onclick = () => {
  if (!confirm("¿Borrar esta falla del celular?")) return;
  fallas = fallas.filter(x => x !== cur); cur = null; saveAll(); history.back();
};
