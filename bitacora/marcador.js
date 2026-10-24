// Marcador "Llenar Bitácora" v5: llena el formulario "Fallas internas EEASA" de la bitácora web.
// Toma la falla de la hoja de Google (la que llena la app del celular) o de una fila pegada
// (Para_Bitacora en Excel o en la hoja de Google). marcador.html lo convierte en marcador con el enlace de la hoja.
// Sobre la v4: equipo dinámico (reconectadores), protecciones actuadas y lectura directa de la hoja.
(async () => {
  const HOJA = "__HOJA__";
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const sq = v => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const esFecha = v => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(String(v).trim());
  const avisos = [];

  // ---------- 1. elegir la falla ----------
  const elegida = await new Promise(fin => {
    document.getElementById("llenar-bitacora-caja")?.remove();
    const caja = document.createElement("div");
    caja.id = "llenar-bitacora-caja";
    caja.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:15px Segoe UI,Arial,sans-serif";
    caja.innerHTML = '<div style="background:#fff;color:#123;padding:22px 24px;border-radius:10px;width:min(640px,92vw);max-height:90vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.3)">'
      + '<div style="font-weight:700;font-size:17px;margin-bottom:8px">Llenar Bitácora v5</div>'
      + '<div data-x="lista" style="display:grid;gap:6px;margin-bottom:12px"></div>'
      + '<div style="margin-bottom:6px">O presiona <b>Ctrl+V</b> para pegar una fila copiada de Para_Bitacora.</div>'
      + '<textarea style="width:100%;height:60px;box-sizing:border-box;font:12px Consolas,monospace"></textarea>'
      + '<div style="text-align:right;margin-top:10px"><button type="button" data-x="cancelar" style="padding:6px 14px;margin-right:8px">Cancelar</button>'
      + '<button type="button" data-x="ok" style="padding:6px 14px;background:#0b4a6f;color:#fff;border:0;border-radius:4px">Llenar</button></div></div>';
    document.body.appendChild(caja);
    const ta = caja.querySelector("textarea"), lista = caja.querySelector("[data-x=lista]");
    const listo = v => { caja.remove(); fin(v); };
    ta.addEventListener("paste", e => { const t = e.clipboardData && e.clipboardData.getData("text/plain"); if (t) { e.preventDefault(); listo({ texto: t }); } });
    caja.querySelector("[data-x=ok]").onclick = () => listo(ta.value ? { texto: ta.value } : null);
    caja.querySelector("[data-x=cancelar]").onclick = () => listo(null);
    caja.addEventListener("keydown", e => { if (e.key === "Escape") listo(null); });
    setTimeout(() => ta.focus(), 50);
    if (!/^https:/.test(HOJA)) return;
    lista.textContent = "Buscando fallas pendientes en la hoja de Google…";
    fetch(HOJA).then(r => r.json()).then(d => {
      const filas = (d.filas || []).slice().reverse();
      lista.textContent = filas.length ? "" : "No hay fallas pendientes en la hoja de Google.";
      for (const f of filas) {
        const b = document.createElement("button");
        b.type = "button";
        b.style.cssText = "text-align:left;padding:9px 12px;border:1px solid #b9c7d0;border-radius:6px;background:#f3f7f9;cursor:pointer;font:inherit";
        b.textContent = [f[1] ? "INC " + f[1] : "Sin INC", f[18] ? "Rec. " + f[18] : f[8], f[4], f[3]].filter(Boolean).join(" · ");
        b.onclick = () => listo({ fila: f });
        lista.appendChild(b);
      }
    }).catch(() => { lista.textContent = "No pude leer la hoja de Google desde aquí. Ábrela, copia la fila y pégala abajo."; });
  });
  if (!elegida) return;

  let c = elegida.fila;
  if (!c) {
    const linea = elegida.texto.split(/\r?\n/).find(l => l.split("\t").some(esFecha)) || elegida.texto.split(/\r?\n/).find(l => l.split("\t").length >= 15);
    if (!linea) return void alert("No reconozco la fila. Haz clic en el NÚMERO de la fila (a la izquierda) para seleccionarla entera, Ctrl+C y vuelve a intentar.");
    const r = linea.split("\t").map(v => v.replace(/^"|"$/g, "").trim());
    // Se alinea por la fecha de desconexión; sin fecha, se asume la fila entera desde Subido
    const iF = r.findIndex(esFecha);
    c = iF >= 0 ? Array(Math.max(0, 4 - iF)).fill("").concat(r) : r;
  }
  c = c.map(v => String(v == null ? "" : v).trim());
  const F = { incidencia: c[1], clientes: c[2], estado: c[3], desconexion: c[4], conexion: c[5], se: c[7], alimentador: c[8],
    ia: c[9], ib: c[10], ic: c[11], kw: c[12], origen: c[13], causa: c[14], subcausa: c[15], descripcion: c[16],
    protecciones: c[17] || "", equipo: c[18] || "", id: c[19] || "" };
  if (!(F.alimentador || F.equipo)) return void alert("La fila no tiene alimentador ni reconectador. ¿Copiaste una fila de datos?");
  if (!esFecha(F.desconexion)) avisos.push("Sin hora de desconexión: escríbela a mano");
  const form = document.querySelector("app-bitacora-fallas-internas form");
  if (!form) return void alert("Abre primero el formulario de registro nuevo de Fallas internas EEASA.");

  // ---------- 2. llenar ----------
  const dispara = (el, evs) => evs.forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true })));
  const escribe = (el, v) => {
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    el.focus(); Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    dispara(el, ["input", "change"]); el.dispatchEvent(new FocusEvent("blur")); dispara(el, ["focusout"]);
    return true;
  };
  const control = n => form.querySelector('[formcontrolname="' + n + '"]');
  const num = v => String(v || "").replace(/\s/g, "").replace(",", ".");
  // Campo por el texto de su etiqueta (para los que no sabemos el nombre interno)
  const porEtiqueta = etq => {
    const k = sq(etq);
    const hits = [...form.querySelectorAll("label,span,div,p,small")].filter(x => sq(x.textContent) === k);
    for (const el of hits.reverse()) for (let p = el.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) {
      const d = p.querySelector(".p-dropdown,.p-multiselect");
      if (d) return d;
    }
    return null;
  };
  const fecha = async (n, v) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(v || "");
    if (!m) return;
    const seg = control(n)?.querySelectorAll("input.bitacora-fecha-hora__segment");
    if (!seg || seg.length < 6) return void avisos.push("No encontré el campo " + n);
    for (let i = 0; i < 6; i++) { escribe(seg[i], m[i + 1]); await espera(60); }
  };
  // Lista desplegable (dropdown o multiselect de PrimeNG). valores: uno o varios textos a probar en orden.
  const lista = async (caja, valores, nombre) => {
    valores = [].concat(valores).filter(Boolean);
    if (!valores.length) return true;
    if (!caja) { avisos.push(nombre + ": no encontré la lista"); return false; }
    const k = caja.classList.contains("p-multiselect") ? "p-multiselect" : "p-dropdown";
    const etiqueta = caja.querySelector("." + k + "-label");
    if (valores.some(v => sq(etiqueta?.textContent) === sq(v))) return true;
    etiqueta?.click();
    let panel = null;
    for (let i = 0; i < 30 && !panel; i++) { await espera(100); panel = [...document.querySelectorAll("." + k + "-panel")].pop(); }
    if (!panel) { avisos.push(nombre + ": no se abrió la lista"); return false; }
    const filtro = panel.querySelector("input." + k + "-filter");
    const busca = v => {
      const items = [...panel.querySelectorAll("li." + k + "-item")], t = sq(v);
      const txt = it => sq(it.getAttribute("aria-label") || it.textContent);
      const exacto = items.find(it => txt(it) === t);
      if (exacto) return exacto;
      const parecidos = items.filter(it => txt(it).includes(t));
      return parecidos.length === 1 ? parecidos[0] : null;
    };
    let item = null;
    for (const v of valores) {
      for (let i = 0; i < 10 && !item; i++) { await espera(100); item = busca(v); }
      if (!item && filtro) {
        escribe(filtro, String(v).split(/[^A-Za-z0-9À-ſ]+/).sort((a, b) => b.length - a.length)[0] || v);
        for (let i = 0; i < 15 && !item; i++) { await espera(100); item = busca(v); }
        if (!item) escribe(filtro, "");
      }
      if (item) break;
    }
    if (item) item.click();
    if (!item || k === "p-multiselect") { etiqueta?.click(); document.body.click(); }
    await espera(400);
    if (!item) avisos.push(nombre + ': no encontré "' + valores[0] + '", escógelo a mano');
    return !!item;
  };

  F.incidencia ? escribe(control("numeroIncidencia"), F.incidencia.replace(/\D/g, "")) : avisos.push("Incidencia vacía");
  const cerrado = sq(F.estado) === "CERRADO";
  if (cerrado) await lista(control("estadoCodigo")?.querySelector(".p-dropdown"), "Cerrado", "Estado");
  await fecha("fechaHoraDesconexion", F.desconexion);
  if (cerrado) await fecha("fechaHoraConexion", F.conexion);
  F.clientes ? escribe(control("clientesAfectados"), num(F.clientes).replace(/\.\d*$/, "")) : avisos.push("Clientes afectados vacío");
  if (F.protecciones) {
    const fases = F.protecciones.replace(/^FASES?\s*/i, "");
    await lista(porEtiqueta("Protecciones actuadas"), [F.protecciones, "Fase " + fases, "Fases " + fases, fases], "Protecciones actuadas");
  }
  // Reconectador: al elegir el equipo dinámico la bitácora pone sola la S/E y el alimentador
  if (F.equipo) {
    await lista(porEtiqueta("Equipo dinámico"), F.equipo, "Equipo dinámico");
    await espera(800);
  }
  if (F.alimentador) {
    await lista(control("fallaSubestacionSeleccion")?.querySelector(".p-dropdown"), F.se, "Falla S/E");
    await lista(control("fallaAlimentadorSeleccion")?.querySelector(".p-dropdown"), F.alimentador, "Falla alimentador");
  }
  if (F.ia || F.ib || F.ic) {
    escribe(control("demandaDesconectadaA"), num(F.ia)); escribe(control("demandaDesconectadaB"), num(F.ib)); escribe(control("demandaDesconectadaC"), num(F.ic));
  } else if (F.kw) {
    const el = control("demandaDesconectadaManual"), v = num(F.kw.replace(/\.(?=\d{3}(\D|$))/g, ""));
    escribe(el, el && el.type === "number" ? v : v.replace(".", ","));
    avisos.push("Sin corrientes: puse " + F.kw + " kW en Resultado directo");
  } else avisos.push("Sin corrientes ni kW: escribe la carga a mano");
  await lista(control("origen")?.querySelector(".p-dropdown"), F.origen || "INP - Internas - No Programada", "Origen / tipo");
  await lista(control("causaCodigo")?.querySelector(".p-dropdown"), F.causa || "Otras", "Causa");
  await lista(control("subcausaCodigo")?.querySelector(".p-dropdown"), F.subcausa || "Desconocidas", "Subcausa");
  await espera(500);
  if (F.id && /^https:/.test(HOJA)) fetch(HOJA + "?marcar=" + encodeURIComponent(F.id)).catch(() => {});
  alert("Listo: " + (F.equipo ? "reconectador " + F.equipo : F.alimentador) + " (" + (F.desconexion || "sin hora") + ")."
    + (avisos.length ? "\n\nRevisa:\n• " + avisos.join("\n• ") : "") + "\n\nRevisa el formulario y presiona GUARDAR REGISTRO.");
})();
