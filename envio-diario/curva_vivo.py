# -*- coding: utf-8 -*-
"""
Llena en vivo el Google Sheets compartido CURVA_PUNTOS_FRONTERA_<DIA>_<DDMMAAAA>, pestaña 01_EEASA_AMBATO.
  Columna C (fila 2 = 00:15 ... fila 97 = 00:00): semana de comparacion 21-27/09/2026, mismo dia de la semana,
            sacado del 4 de 4 (hoja CECON1, columna V / 1000).
  Columna D: dato real cada 15 min, leido de la grafica de DemandaMaxima (/curvas, kW Totales EEASA).

Uso:
    python curva_vivo.py                 -> pide el link y llena hasta las 05:45 (turno nocturno)
    python curva_vivo.py --hasta 24:00   -> hasta las 00:00 del dia siguiente (turno tarde)
    --link URL        -> no pregunta el link
    --solo-leer       -> solo muestra los datos, NO escribe en el Sheets
    --sin-referencia  -> no llena la columna C
"""
from __future__ import print_function

import argparse
import datetime
import os
import re
import subprocess
import sys
import time
import traceback

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys

import bosnis
from bosnis import log, MESES, leer_claves, login_automatico, visibles

VERSION = "curva en vivo v10"
AQUI = bosnis.AQUI
PERFIL = os.path.join(AQUI, "perfil-curva")          # Chrome aparte: no choca con diario.bat
URL_CURVAS = "http://172.20.18.45:666/curvas"
PESTANA = "01_EEASA_AMBATO"
SEMANA_REF = datetime.date(2026, 9, 21)               # lunes 21/09/2026 ... domingo 27/09/2026


# ---------------------------------------------------------------- utilidades
def fila_de(fecha_hoja, momento):
    """00:15 del dia -> fila 2 ... 00:00 del dia siguiente -> fila 97."""
    base = datetime.datetime.combine(fecha_hoja, datetime.time(0, 0))
    slot = int((momento - base).total_seconds() // 900)
    return slot + 1 if 1 <= slot <= 96 else None


def mw(kw):
    return ("%.2f" % (kw / 1000.0)).replace(".", ",")


def abrir():
    try:
        subprocess.call('wmic process where "name=\'chrome.exe\' and commandline like \'%%perfil-curva%%\'" call terminate',
                        shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(2)
    except Exception:
        pass
    op = webdriver.ChromeOptions()
    op.add_argument("--user-data-dir=" + PERFIL)
    op.add_argument("--window-size=1500,950")
    op.add_argument("--disable-gpu")
    op.add_argument("--disable-background-timer-throttling")
    op.add_argument("--disable-renderer-backgrounding")
    op.add_argument("--log-level=3")
    op.add_experimental_option("excludeSwitches", ["enable-logging"])
    op.add_experimental_option("detach", True)
    d = webdriver.Chrome(executable_path=bosnis.CHROMEDRIVER, chrome_options=op)
    d.set_page_load_timeout(90)
    return d


# ---------------------------------------------------------------- semana de comparacion
def referencia(fecha_hoja):
    ref = SEMANA_REF + datetime.timedelta(days=fecha_hoja.weekday())
    ruta = None
    raiz = bosnis.RAIZ_BOSNI.replace("BOSNI {Y}", "").replace("{Y}", str(ref.year)).rstrip("\\ ")
    mes = MESES[ref.month - 1]
    for d in sorted(os.listdir(raiz)):
        if d.upper().startswith("AMBATO") and d.endswith(str(ref.year)):
            c = os.path.join(raiz, d, "%02d_%s %d" % (ref.month, mes, ref.year))
            if os.path.isdir(c):
                ruta = bosnis.buscar_excel(c, "%02d %s %d" % (ref.day, mes, ref.year))
            if ruta:
                break
    if not ruta:
        raise RuntimeError("No encuentro el 4 de 4 del %s" % ref.strftime("%d/%m/%Y"))
    log("Referencia: %s (%s)" % (ref.strftime("%d/%m/%Y"), os.path.basename(ruta)))
    p = subprocess.Popen(["cscript", "//nologo", os.path.join(AQUI, "leer4de4.vbs"), ruta],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    salida = p.communicate()[0].decode("cp1252", "replace")
    valores = {}
    for linea in salida.splitlines():
        partes = linea.split()
        if len(partes) == 3 and partes[0] == "V" and partes[2] != "-":
            valores[int(partes[1]) + 1] = float(partes[2])      # fila del Sheets
    if len(valores) != 96:
        raise RuntimeError("El 4 de 4 de referencia tiene %d valores (deben ser 96). %s" % (len(valores), salida[:300]))
    return ref, valores


# ---------------------------------------------------------------- DemandaMaxima
JS_TRAZAS = """
function dos(n) { return (n < 10 ? '0' : '') + n; }
function fmt(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {            // milisegundos: plotly los muestra como UTC
    var d = new Date(v);
    return d.getUTCFullYear() + '-' + dos(d.getUTCMonth() + 1) + '-' + dos(d.getUTCDate()) + ' ' +
           dos(d.getUTCHours()) + ':' + dos(d.getUTCMinutes());
  }
  if (v instanceof Date) {
    return v.getFullYear() + '-' + dos(v.getMonth() + 1) + '-' + dos(v.getDate()) + ' ' +
           dos(v.getHours()) + ':' + dos(v.getMinutes());
  }
  return String(v);
}
function arr(v) {                         // plotly nuevo guarda {dtype, bdata} en base64
  if (!v) return [];
  if (v.bdata !== undefined) {
    var b = atob(v.bdata), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    var T = {f8: Float64Array, f4: Float32Array, i4: Int32Array, u4: Uint32Array, i2: Int16Array,
             u2: Uint16Array, i1: Int8Array, u1: Uint8Array}[v.dtype] || Float64Array;
    return Array.prototype.slice.call(new T(u.buffer));
  }
  return Array.prototype.slice.call(v);
}
var out = [];
document.querySelectorAll('.js-plotly-plot').forEach(function (g) {
  var tit = (g.layout && g.layout.title && (g.layout.title.text || g.layout.title)) || '';
  (g.data || []).forEach(function (t0, k) {
    var f = (g._fullData && g._fullData[k]) || {};
    var t = {name: t0.name, line: t0.line, fill: t0.fill, visible: t0.visible,
             x: arr(f.x && f.x.length ? f.x : t0.x), y: arr(f.y && f.y.length ? f.y : t0.y)};
    if (!t.x.length || !t.y.length) return;
    out.push({name: String(t.name || ''), dash: (t.line && t.line.dash) || '', fill: String(t.fill || ''),
              titulo: String(tit), visible: String(t.visible === undefined ? true : t.visible),
              tipo: typeof t.x[0],
              x: t.x.map(fmt),
              y: t.y.map(function (v) { return v === null ? null : Number(v); })});
  });
});
return out;
"""


def a_fecha(txt):
    txt = txt.replace("T", " ").strip()
    for formato, largo in (("%Y-%m-%d %H:%M", 16), ("%d/%m/%Y %H:%M", 16), ("%Y/%m/%d %H:%M", 16)):
        try:
            return datetime.datetime.strptime(txt[:largo], formato)
        except ValueError:
            pass
    return None


def entrar_demanda(driver):
    driver.get(URL_CURVAS)
    time.sleep(6)
    if visibles(driver, "input[type=password]"):
        login_automatico(driver, leer_claves("demanda"), False)
        time.sleep(4)
        driver.get(URL_CURVAS)
        time.sleep(6)
    fin = time.time() + 300
    while not driver.execute_script("return document.querySelectorAll('.js-plotly-plot').length"):
        if time.time() > fin:
            raise RuntimeError("No carga la grafica de DemandaMaxima")
        if visibles(driver, "input[type=password]"):
            log("DemandaMaxima pide iniciar sesion: entra en la ventana de Chrome.")
        time.sleep(5)
    for b in visibles(driver, "button, a, div[role=button]"):
        if (b.text or "").strip() == "EEASA":
            try:
                b.click()
                time.sleep(4)
            except Exception:
                pass
            break


def datos_reales(driver, fecha_hoja):
    """{fila: kW} del dia de la hoja, de la linea de la semana actual (continua, no proyeccion ni banda)."""
    mejor = {}
    mejor_puntaje = -1
    nombres = []
    trazas = driver.execute_script(JS_TRAZAS) or []
    if not trazas:
        nombres.append("ninguna grafica con datos (%d graficas en la pagina)"
                       % driver.execute_script("return document.querySelectorAll('.js-plotly-plot').length"))
    for t in trazas:
        if not getattr(datos_reales, "mostrado", False):
            ej = t["x"][-1] if t["x"] else "-"
            log("   linea: %s | %s | x=%s (%s) y=%s" % (t["titulo"][:30], t["name"][:25], ej, t["tipo"],
                                                    t["y"][-1] if t["y"] else "-"))
        n = t["name"].lower()
        if not n.strip() or "proyec" in n or "banda" in n or "incomplet" in n or "mite" in n \
                or t["dash"] not in ("", "solid") \
                or t["fill"] not in ("", "none") or t["visible"] == "legendonly":
            continue
        filas = {}
        for x, y in zip(t["x"], t["y"]):
            m = a_fecha(x)
            try:
                y = float(y)
            except (TypeError, ValueError):
                continue
            if m is None or y < 1000:          # en kW; ceros o vacios no sirven
                continue
            if m > datetime.datetime.now() - datetime.timedelta(minutes=1):
                continue                       # el cuarto de hora aun no termina (dato incompleto)
            f = fila_de(fecha_hoja, m)
            if f:
                filas[f] = y
        if not filas:
            continue
        # preferir la grafica "Dia" y luego "Semana" (no la de racionamiento)
        tit = t["titulo"].lower()
        puntaje = len(filas) * 10 + (2 if "día" in tit or "dia" in tit else 1 if "semana" in tit else 0) \
            + (5 if "totales eeasa" in tit else 0) - (5 if "racion" in tit else 0) \
            + (100000 if fecha_hoja.strftime("%d/%m") in t["name"] else 0)      # "Semana 45 - 08/11"
        nombres.append("%s / %s (%d)" % (t["titulo"], t["name"], len(filas)))
        if puntaje > mejor_puntaje:
            mejor, mejor_puntaje = filas, puntaje
            datos_reales.elegida = "%s / %s" % (t["titulo"], t["name"])
    datos_reales.mostrado = True
    return mejor, nombres


# ---------------------------------------------------------------- Google Sheets
def entrar_sheets(driver, link):
    driver.get(link)
    fin = time.time() + 300
    aviso = False
    while not visibles(driver, "#t-name-box, input.waffle-name-box"):
        if time.time() > fin:
            raise RuntimeError("No se abrio el Google Sheets")
        if not aviso and "accounts.google" in driver.current_url:
            log("Google pide iniciar sesion: entra en la ventana de Chrome (5 minutos). Solo la primera vez.")
            aviso = True
        time.sleep(3)
    time.sleep(3)
    m = re.search(r"(\d{2})(\d{2})(\d{4})", driver.title or "")
    if not m:
        raise RuntimeError("El nombre del archivo no tiene la fecha (DDMMAAAA): %s" % driver.title)
    fecha = datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    log("Sheets: %s -> dia %s" % (driver.title.split(" - ")[0], fecha.strftime("%d/%m/%Y")))
    return fecha


def escribir(driver, columna, desde, valores):
    """Escribe una lista de textos hacia abajo empezando en columna+desde (pestana 01_EEASA_AMBATO)."""
    caja = visibles(driver, "#t-name-box, input.waffle-name-box")[0]
    caja.click()
    caja.send_keys(Keys.CONTROL, "a")
    caja.send_keys("'%s'!%s%d" % (PESTANA, columna, desde) + Keys.ENTER)
    time.sleep(1.5)
    for i in range(0, len(valores), 12):        # de a 12 para no saturar al Chrome viejo
        ac = ActionChains(driver)
        for v in valores[i:i + 12]:
            ac.send_keys(v).send_keys(Keys.ENTER)
        ac.perform()
        time.sleep(0.5)
    time.sleep(2)


# ---------------------------------------------------------------- main
def main():
    p = argparse.ArgumentParser()
    p.add_argument("--hasta", default="05:45", help="HH:MM (24:00 = fin del dia)")
    p.add_argument("--desde", default="00:15", help="HH:MM primera hora que llena en la columna D")
    p.add_argument("--link")
    p.add_argument("--solo-leer", action="store_true")
    p.add_argument("--sin-referencia", action="store_true")
    a = p.parse_args()

    if not os.path.isdir(bosnis.CARPETA_LOG):
        os.makedirs(bosnis.CARPETA_LOG)
    bosnis._log_file = open(os.path.join(bosnis.CARPETA_LOG, "curva_vivo_%s.txt" % datetime.date.today()), "a")
    log("==== %s (hasta %s)%s ====" % (VERSION, a.hasta, " SOLO LEER" if a.solo_leer else ""))

    if a.hasta in ("24:00", "23:59") and datetime.datetime.now().hour < 6 and "noche" in (os.environ.get("TURNO", "")):
        log("Ya paso la medianoche: salto la parte de ayer.")
        return 0
    link = a.link
    if not link:
        print("\nPega el link del Google Sheets de HOY (clic derecho > Pegar) y Enter.")
        print("Si hoy no mandaron el archivo, solo presiona Enter y no se hace nada.")
        link = input("Link: ").strip()
    if not link:
        log("Sin link: hoy no se llena la curva.")
        return 0
    if "docs.google.com/spreadsheets" not in link:
        log("ERROR: ese no es un link de Google Sheets.")
        return 1

    hh, mm = [int(x) for x in a.hasta.split(":")]
    driver = abrir()
    driver.get("about:blank")
    pest_sheets = driver.current_window_handle
    fecha_hoja = entrar_sheets(driver, link)
    hoy = datetime.date.today()
    if fecha_hoja != hoy and not (datetime.datetime.now().hour >= 18 and fecha_hoja == hoy + datetime.timedelta(days=1)):
        log("ERROR: el archivo es del %s y hoy es %s. Revisa el link (no escribo nada)."
            % (fecha_hoja.strftime("%d/%m/%Y"), hoy.strftime("%d/%m/%Y")))
        return 1
    ultima_fila = fila_de(fecha_hoja, datetime.datetime.combine(fecha_hoja, datetime.time(0, 0))
                          + datetime.timedelta(hours=hh, minutes=mm)) or 97
    dh, dm = [int(x) for x in a.desde.split(":")]
    primera_fila = fila_de(fecha_hoja, datetime.datetime.combine(fecha_hoja, datetime.time(0, 0))
                           + datetime.timedelta(hours=dh, minutes=dm)) or 2
    log("Columna D: de las %s a las %s" % (a.desde, a.hasta))
    driver.execute_script("window.open('about:blank')")
    pest_dm = [h for h in driver.window_handles if h != pest_sheets][0]
    driver.switch_to.window(pest_dm)
    entrar_demanda(driver)

    if not a.sin_referencia:
        try:
            ref, valores = referencia(fecha_hoja)
            textos = [mw(valores[f]) for f in range(2, 98)]
            log("Columna C (%s): %s ... %s" % (ref.strftime("%d/%m"), textos[0], textos[-1]))
            if not a.solo_leer:
                driver.switch_to.window(pest_sheets)
                escribir(driver, "C", 2, textos)
                log("Columna C lista.")
        except Exception as e:
            log("OJO columna C: %s" % e)

    escritas = set()
    fin_total = datetime.datetime.combine(fecha_hoja, datetime.time(0, 0)) + \
        datetime.timedelta(hours=hh, minutes=mm + 10)      # 05:45 -> se apaga a mas tardar 05:55
    base_dia = datetime.datetime.combine(fecha_hoja, datetime.time(0, 0))
    while True:
        # solo refrescar cuando ya cerro un cuarto de hora nuevo (no mover la pagina por gusto)
        if escritas:
            siguiente = base_dia + datetime.timedelta(minutes=15 * max(escritas))   # fila f -> hora (f-1)*15 ... la siguiente es f*15
            if datetime.datetime.now() < siguiente + datetime.timedelta(minutes=2):
                if datetime.datetime.now() > fin_total:
                    break
                time.sleep(30)
                continue
        candado = os.path.join(AQUI, "tpl-usando-teclado.lock")
        if os.path.isfile(candado) and time.time() - os.path.getmtime(candado) < 20 * 60:
            if not getattr(main, "aviso_tpl", False):
                log("El TPL esta usando el teclado y el mouse: la curva espera para no estorbar.")
                main.aviso_tpl = True
            time.sleep(20)
            continue
        main.aviso_tpl = False
        try:
            driver.switch_to.window(pest_dm)
            driver.refresh()
            time.sleep(8)
            if not driver.execute_script("return document.querySelectorAll('.js-plotly-plot').length"):
                entrar_demanda(driver)
            # la pagina carga las graficas de a poco: esperar hasta 60 s a que aparezca el dato nuevo
            ya = max(escritas) if escritas else primera_fila - 1
            for _ in range(12):
                datos, nombres = datos_reales(driver, fecha_hoja)
                if datos and max(datos) > ya:
                    break
                time.sleep(5)
            if escritas and (not datos or max(datos) <= ya):
                hora_f = lambda f: (datetime.datetime(2000, 1, 1) + datetime.timedelta(minutes=15 * (f - 1))).strftime("%H:%M")
                aviso = "Esperando el dato de las %s (DemandaMaxima aun muestra hasta las %s)" % (
                    hora_f(ya + 1), hora_f(max(datos)) if datos else "-")
                if aviso != getattr(main, "ultimo_aviso", ""):
                    main.ultimo_aviso = aviso
                    log(aviso)
            if datos and getattr(datos_reales, "elegida", "") != getattr(main, "ultima_linea", ""):
                main.ultima_linea = datos_reales.elegida
                log("Dato real desde: %s" % datos_reales.elegida)
            pendientes = sorted(f for f in datos if f not in escritas and primera_fila <= f <= ultima_fila)
            if not datos:
                log("Sin datos del %s todavia. Lineas vistas: %s" % (fecha_hoja.strftime("%d/%m"), "; ".join(nombres)))
            if pendientes:
                # bloque seguido desde la primera fila pendiente hasta la ultima con dato
                desde, hasta = pendientes[0], pendientes[-1]
                textos = [mw(datos[f]) if f in datos else "" for f in range(desde, hasta + 1)]
                hora = lambda f: (datetime.datetime(2000, 1, 1) + datetime.timedelta(minutes=15 * (f - 1))).strftime("%H:%M")
                log("D%d-D%d (%s a %s): %s" % (desde, hasta, hora(desde), hora(hasta), " ".join(textos[-4:])))
                if not a.solo_leer:
                    driver.switch_to.window(pest_sheets)
                    if any(textos):
                        escribir(driver, "D", desde, textos)
                escritas.update(f for f in range(desde, hasta + 1) if f in datos)
            if ultima_fila in escritas or datetime.datetime.now() > fin_total:
                break
        except Exception:
            e = sys.exc_info()[1]
            log("ERROR (reintento en 3 min): %s: %s" % (type(e).__name__, (getattr(e, "msg", None) or str(e)).strip()[:300]))
            try:
                driver.title
            except Exception:
                log("Chrome se cerro, lo abro de nuevo.")
                driver = abrir()
                driver.get("about:blank")
                pest_sheets = driver.current_window_handle
                entrar_sheets(driver, link)
                driver.execute_script("window.open('about:blank')")
                pest_dm = [h for h in driver.window_handles if h != pest_sheets][0]
                driver.switch_to.window(pest_dm)
                entrar_demanda(driver)
        time.sleep(60)
    log("==== FIN: curva llena hasta %s. Se cierra solo. ====" % a.hasta)
    try:
        driver.quit()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
