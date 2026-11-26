// ---------- Cortes de energía (restricción de carga) ----------
// El Excel de cortes (SUBIR A DRIVE) deja en la hoja de Google «Cortes de carga» un corte por alimentador,
// con la Incidencia y los Clientes vacíos. Aquí se toma la foto del Navegador de incidencias del ADMS,
// la IA lee cada fila (ID, fecha de creación, cuadrilla, alimentador) y la app une cada corte con su incidencia:
// mismo alimentador y la primera incidencia creada después de la hora del corte (el ADMS tarda en crearla,
// a veces mucho), y antes de la reconexión si el corte ya está cerrado. Las incidencias viejas del mismo
// alimentador se crearon antes del corte, así que no se confunden. Si hay dos posibles, va la de cuadrilla CECON.
// Lo elegido se guarda en la hoja (columnas Incidencia y Clientes) y luego Llenar Bitácora lo usa; el Excel lo baja.

const CORTE_TOL = 90e3;   // la hora de creación puede leerse sin segundos o el reloj del ADMS ir un poco atrás
let cortes = [];          // [{ clave, desconexion, conexion, se, alimentador, estado, inc, cli, cands }]
let corFilas = [];        // filas leídas del Navegador (se juntan las de varias fotos: página 1/2…)
let corLeyendo = 0;

// Enlace /exec de la hoja «Cortes de carga» (el mismo del Excel). Si se pega otro en Conexión, ese manda.
const COR_URL = "https://script.google.com/macros/s/AKfycbxg9L1ILa-B-k9mK5wpKT3VyAfXPUG8WnNS8PnPa76KdvxEHpelEpn4GE-fp686-tYRnw/exec";
const corUrl = () => store.get("hoja-cortes", "") || COR_URL;
// "16/11/2026 18:44:4" o "16/11/2026 18:33" → milisegundos (los segundos cortados cuentan como 0)
function corHora(s) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ""));
  return m ? Date.UTC(+m[3], m[2] - 1, +m[1], +m[4], +m[5], m[6] && m[6].length === 2 ? +m[6] : 0) : NaN;
}
const corHHMM = s => (/\d{1,2}:\d{2}(:\d{2})?/.exec(String(s || "")) || [""])[0];
// Nombre del alimentador de la columna del ADMS: «01_04_La Joya» → «La Joya» (puede venir cortado: «01_01_Puerto Arti»)
const corNombre = t => String(t || "").replace(/^\s*_?\d{1,2}\s*_+\s*\d{1,2}\s*_+\s*/, "").replace(/^\s*_?\d{1,2}\s*_+\s*/, "").trim();
const corSE = t => { const m = /^\s*_?\d{1,2}\s*_+\s*(\d{1,2})\s*_/.exec(String(t || "")); return m ? SE_NUM[+m[1]] || "" : ""; };
// ¿Es el mismo alimentador? «MANUELA SAENZ» (Excel) ~ «Manuelita Sáenz» (ADMS), «Puerto Arti» ~ «PUERTO ARTURO»
function corMismo(excel, adms) {
  const a = sonido(squash(excel)), b = sonido(squash(corNombre(adms)));
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.95;
  // cortado y además mal leído: se compara del mismo largo
  const n = Math.min(a.length, b.length);
  const sim = Math.max(parecido(a, b), n >= 5 ? parecido(a.slice(0, n), b.slice(0, n)) - 0.05 : 0);
  return sim >= 0.75 ? sim : 0;
}
// La subestación del ADMS (número) desempata alimentadores con el mismo nombre en dos S/E
const corMismaSE = (se, adms) => { const s = squash(corSE(adms)), e = squash(se); return !!s && !!e && (s.startsWith(e) || e.startsWith(s)); };
const esCecon = f => /CECON/i.test(f.cuadrilla || "");
const incDe = id => String(id || "").replace(/\D/g, "");

// Une cada corte con su incidencia. Los cortes del mismo alimentador van en orden: cada uno busca
// hasta el siguiente corte de ese alimentador. Una incidencia no se usa para dos cortes.
function corUnir() {
  const usadas = new Set(cortes.filter(c => c.fijo && c.inc).map(c => c.inc));
  const orden = cortes.slice().sort((x, y) => corHora(x.desconexion) - corHora(y.desconexion));
  for (const c of orden) {
    const t0 = corHora(c.desconexion), t1 = c.estado === "CERRADO" ? corHora(c.conexion) : NaN;
    const sig = orden.find(o => o !== c && corHora(o.desconexion) > t0 && squash(o.alimentador) === squash(c.alimentador));
    const tFin = Math.min(isNaN(t1) ? Infinity : t1 + CORTE_TOL, sig ? corHora(sig.desconexion) : Infinity);
    c.cands = corFilas
      .map(f => ({ ...f, sim: corMismo(c.alimentador, f.alimentador), t: corHora(f.creada) }))
      .filter(f => f.sim && !isNaN(f.t) && f.t >= t0 - CORTE_TOL && f.t <= tFin)
      .sort((x, y) => (y.sim >= 0.95) - (x.sim >= 0.95) || corMismaSE(c.se, y.alimentador) - corMismaSE(c.se, x.alimentador)
        || esCecon(y) - esCecon(x) || x.t - y.t);
    if (c.fijo) continue;   // lo eligió o escribió la persona
    const elegida = c.cands.find(f => !usadas.has(incDe(f.id)));
    c.inc = elegida ? incDe(elegida.id) : "";
    c.auto = !!elegida;
    if (elegida) usadas.add(c.inc);
  }
}

// ---------- pantalla ----------
function corNote(t) { $("cor-note").textContent = t; $("cor-note").hidden = !t; }
function showCor() {
  $("cor-url").value = corUrl();
  $("cor-tip").textContent = modoIA
    ? "Primero sube los cortes desde el Excel (SUBIR A DRIVE). Después toma la foto del Navegador de incidencias con las incidencias de los cortes a la vista. Si no entran todas, toma otra foto: se juntan."
    : "Sin IA la foto no se lee: escribe el número de incidencia de cada corte. Para leer la foto, entra Con IA.";
  $("cor-pick").hidden = !modoIA;
  drawCor();
}
function drawCor() {
  const box = $("cor-list"); box.innerHTML = "";
  if (!cortes.length) {
    const p = document.createElement("p"); p.className = "tip";
    p.textContent = corUrl() ? "No hay cortes pendientes sin incidencia. Toca Actualizar después de SUBIR A DRIVE." : "Falta el enlace de la hoja Cortes de carga (abajo, en Conexión).";
    box.appendChild(p);
  }
  for (const c of cortes) {
    const el = document.createElement("div"); el.className = "cor";
    el.innerHTML = '<div class="cor-h"><b></b><small></small></div><div class="chips"></div>'
      + '<div class="row2"><div class="inmic"><input class="mono" inputmode="numeric" maxlength="11" placeholder="Incidencia" aria-label="Incidencia">'
      + '<button class="mic" type="button" aria-label="Dictar la incidencia" hidden>🎤</button></div>'
      + '<div class="inmic"><input class="mono" inputmode="numeric" placeholder="Clientes" aria-label="Clientes afectados">'
      + '<button class="mic" type="button" aria-label="Dictar los clientes" hidden>🎤</button></div></div><span></span>';
    el.querySelector("b").textContent = c.alimentador + (c.se ? " · " + c.se : "");
    el.querySelector("small").textContent = "Corte " + corHHMM(c.desconexion) + (c.estado === "CERRADO" && c.conexion ? " → " + corHHMM(c.conexion) : "");
    const chips = el.querySelector(".chips");
    for (const f of c.cands || []) {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip";
      b.textContent = incDe(f.id).slice(-6) + " · " + corHHMM(f.creada) + (esCecon(f) ? " · CECON" : "");
      b.setAttribute("aria-pressed", String(incDe(f.id) === c.inc));
      b.onclick = () => { c.inc = incDe(f.id); c.fijo = true; corUnir(); drawCor(); };
      chips.appendChild(b);
    }
    const [inc, cli] = el.querySelectorAll("input");
    inc.value = c.inc || ""; cli.value = c.cli || "";
    inc.oninput = () => { c.inc = inc.value.replace(/\D/g, ""); c.fijo = !!c.inc; aviso(); corBoton(); };
    cli.oninput = () => { c.cli = cli.value.replace(/\D/g, ""); };
    const [micInc, micCli] = el.querySelectorAll(".mic");
    corMic(micInc, inc, corCompletar);
    corMic(micCli, cli, n => n);
    const msg = el.querySelector("span");
    const aviso = () => {
      const ok = /^\d{11}$/.test(c.inc || "");
      msg.className = ok ? "ok" : "pend";
      msg.textContent = !c.inc ? (corFilas.length ? "No encontré su incidencia en las fotos: toma otra foto más tarde o escríbela." : "Sin incidencia todavía.")
        : !ok ? "La incidencia tiene 11 dígitos (110…)."
        : c.fijo ? "Elegida por ti." : (c.cands.length > 1 ? "Elegida sola (hay " + c.cands.length + " posibles: revisa)." : "Elegida sola.");
    };
    aviso();
    box.appendChild(el);
  }
  corBoton();
}
function corBoton() {
  const listos = cortes.filter(c => /^\d{11}$/.test(c.inc || "")).length;
  $("cor-send").disabled = !listos;
  $("cor-send").textContent = listos ? `Guardar ${listos} en la hoja` : "Guardar en la hoja";
}

async function corBajar() {
  const url = corUrl();
  if (!/^https:\/\/script\.google/.test(url)) { $("cor-cfg").open = true; drawCor(); return; }
  corNote("Buscando cortes pendientes en la hoja…");
  try {
    const j = await (await fetch(url + "?sinInc=1&t=" + Date.now())).json();
    if (!j || !Array.isArray(j.cortes)) throw new Error("viejo");
    const antes = Object.fromEntries(cortes.map(c => [c.clave, c]));
    cortes = j.cortes.map(c => {
      const a = antes[c.clave];
      // clientes de la tabla por alimentador; si no está, los de la última vez
      return a ? { ...c, inc: a.inc, cli: a.cli, fijo: a.fijo } : { ...c, cli: clientesDe(c.se, c.alimentador) || store.get("cor-clientes", {})[squash(c.alimentador)] };
    });
    corUnir(); corNote("");
  } catch (e) {
    corNote(e.message === "viejo"
      ? "La hoja Cortes de carga todavía tiene el script anterior. Pega el nuevo (bitacora/hoja-cortes.gs) e implementa una versión nueva."
      : "No pude leer la hoja (¿sin señal o enlace equivocado?).");
  }
  drawCor();
}

// Lee la foto con la IA y junta sus filas con las de fotos anteriores (por ID)
async function corFoto(file) {
  const my = ++corLeyendo;
  $("cor-thumb").src = URL.createObjectURL(file); $("cor-prev").hidden = false;
  $("cor-bar").style.width = "10%"; $("cor-status").textContent = "Enviando la foto a la IA…";
  let pct = 10; const tick = setInterval(() => { pct += (95 - pct) * 0.06; $("cor-bar").style.width = pct + "%"; if (pct > 30) $("cor-status").textContent = "La IA está leyendo la lista…"; }, 400);
  try {
    const { out } = await iaRead(file, "cortes", {});
    if (my !== corLeyendo) return;
    const nuevas = (out.filas || []).map(f => ({ id: incDe(f.id), creada: f.creada || "", cuadrilla: f.cuadrilla || "", alimentador: f.alimentador || "", color: f.color || "" }))
      .filter(f => /^110\d{8}$/.test(f.id));
    const porId = Object.fromEntries(corFilas.map(f => [f.id, f]));
    for (const f of nuevas) porId[f.id] = f;
    corFilas = Object.values(porId);
    $("cor-raw").textContent = JSON.stringify(out, null, 1);
    corUnir(); drawCor();
    const hallados = cortes.filter(c => c.inc).length;
    $("cor-bar").style.width = "100%";
    $("cor-status").textContent = `Leí ${nuevas.length} incidencias. ${hallados} de ${cortes.length} cortes tienen incidencia.`;
  } catch (err) {
    if (my === corLeyendo) $("cor-status").textContent = err.ia ? err.message : "No se pudo leer la foto. Vuelve a intentarlo.";
  } finally { clearInterval(tick); }
}

$("go-cor").onclick = () => { history.pushState({ v: "cor" }, ""); show("cor"); corBajar(); };
$("cor-act").onclick = corBajar;
$("cor-url").addEventListener("change", () => { store.set("hoja-cortes", $("cor-url").value.trim()); corBajar(); });
$("cor-cam").onclick = () => openCam("cor", file => file ? corFoto(file) : $("cor-gal").click());
$("cor-gal").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) corFoto(f); };
$("cor-thumb").onclick = () => { $("view-img").src = $("view-dl").href = $("cor-thumb").src; viewFrom = "cor"; $("view").hidden = false; history.pushState({ v: "view" }, ""); };

// ---------- dictado ----------
// «seis uno seis siete uno dos» o «616712» → dígitos. Si se dicen solo los últimos dígitos de la INC,
// se completa con una incidencia leída en la foto que termine así, o con el inicio de la última que se guardó.
function corCompletar(n) {
  if (!n || n.length >= 11) return n.slice(0, 11);
  const f = corFilas.find(x => incDe(x.id).endsWith(n));
  if (f) return incDe(f.id);
  const ult = store.get("cor-ultima-inc", "");
  return /^\d{11}$/.test(ult) ? ult.slice(0, 11 - n.length) + n : n;
}
function corMic(b, inp, arreglar) {
  if (!Speech) return;
  b.hidden = false;
  b.onclick = () => {
    const rec = new Speech();
    rec.lang = "es-EC"; rec.interimResults = false; rec.maxAlternatives = 3;
    rec.onresult = e => {
      const alts = [...e.results[0]].map(a => norm(a.transcript).toLowerCase().replace(/[a-z]+/g, w => DIGITOS[w] ?? " ").replace(/\D/g, "")).filter(Boolean);
      const n = arreglar(alts[0] || "");
      if (n) { inp.value = n; inp.dispatchEvent(new Event("input")); }
    };
    rec.onend = () => b.setAttribute("aria-pressed", "false");
    rec.onerror = e => { if (e.error !== "no-speech" && e.error !== "aborted") alert("No pude usar el micrófono. Revisa el permiso del navegador."); };
    b.setAttribute("aria-pressed", "true"); rec.start();
  };
}

$("cor-send").onclick = async () => {
  const url = corUrl();
  const lista = cortes.filter(c => /^\d{11}$/.test(c.inc || "")).map(c => ({ clave: c.clave, incidencia: c.inc, clientes: c.cli || "" }));
  if (!lista.length) return;
  // Cada incidencia una sola vez
  const rep = lista.map(x => x.incidencia).filter((v, i, l) => l.indexOf(v) !== i);
  if (rep.length) return corNote("La incidencia " + rep[0] + " está en dos cortes. Corrige una.");
  const cl = store.get("cor-clientes", {});
  for (const c of cortes) if (c.cli) cl[squash(c.alimentador)] = c.cli;
  store.set("cor-clientes", cl);
  store.set("cor-ultima-inc", lista.at(-1).incidencia);
  $("cor-send").disabled = true; corNote("Guardando…");
  try {
    const j = await (await fetch(url + "?ponerInc=" + encodeURIComponent(JSON.stringify(lista)) + "&t=" + Date.now())).json();
    const n = (j.guardados || []).length;
    if (!j.ok) throw new Error();
    corNote(`Listo: ${n} ${n === 1 ? "corte quedó" : "cortes quedaron"} con incidencia en la hoja. En la PC: Llenar Bitácora › CORTES DE CARGA. En el Excel, SUBIR A DRIVE trae los números.`);
    await corBajar();
    if (n) corNote(`Listo: ${n} ${n === 1 ? "corte quedó" : "cortes quedaron"} con incidencia en la hoja. En la PC: Llenar Bitácora › CORTES DE CARGA. En el Excel, SUBIR A DRIVE trae los números.`);
  } catch {
    corNote("No se pudo guardar (¿sin señal?). Vuelve a tocar Guardar.");
  } finally { drawCor(); }
};
// Por si no hay señal: texto para mandar por WhatsApp o pegar a mano en la hoja
$("cor-copy").onclick = async () => {
  const t = cortes.filter(c => c.inc).map(c => `${c.alimentador}\t${corHHMM(c.desconexion)}\tINC ${c.inc}\t${c.cli || ""}`).join("\n");
  if (!t) return corNote("Todavía no hay incidencias para copiar.");
  try { await navigator.clipboard.writeText(t); corNote("Copiado."); } catch { corNote("No se pudo copiar."); }
};
