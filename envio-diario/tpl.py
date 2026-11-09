# -*- coding: utf-8 -*-
"""
TPL diario: descarga con el programa "Terminal Portatil de Lectura" (AMPER) y envio a SIMEC (CENACE).

Uso (Python 3.4 en la .75):
    python tpl.py enviar             -> vacia C:\\TPL\\datos, descarga los 26 zip con el TPL y los envia a SIMEC
    python tpl.py enviar --prueba    -> igual, pero NO aprieta Enviar en SIMEC
    python tpl.py enviar --sin-descargar --prueba   -> usa los zip que ya estan en C:\\TPL\\datos
    python tpl.py capturar           -> espera "Instalacion OK" de los 26 y guarda la imagen TPL DD-MM-AAAA.png
    python tpl.py capturar --prueba  -> la imagen va a C:\\bosnis\\capturas-prueba

El programa TPL es de escritorio (Java): se maneja con teclado y clics, asi que la sesion
de la .75 tiene que estar abierta (no bloqueada) mientras descarga.
"""
from __future__ import print_function

import argparse
import ctypes
import datetime
import os
import subprocess
import sys
import time
import traceback
from ctypes import wintypes

import bosnis
from bosnis import log, abrir_chrome, aceptar_alertas, leer_claves, login_automatico, visibles

# ---------------------------------------------------------------- configuracion
CARPETA_TPL = r"C:\TPL"
CARPETA_DATOS = r"C:\TPL\datos"
JAVAW = r"C:\TPL\jre\bin\javaw.exe"
JAR = r"C:\TPL\TPL.jar"

TITULO_LOGIN = "TPL Ventana de inicio"
TITULO_PRINCIPAL = "Terminal Portatil de Lectura"
TITULO_LLAMADA = "Llamada a lista de Puntos"   # dialogo "Se recuperaran datos desde el dia ..." -> Aceptar
ACEPTAR_LLAMADA = (196, 120)                    # boton Aceptar dentro de ese dialogo
TITULO_RESULTADOS = "Resultados de llamada"     # al terminar: lista "Ficheros generados: 1" -> Aceptar

# Posicion de los botones dentro de la ventana del TPL (pixeles desde la esquina de la ventana)
ICONO_DESCARGA = (90, 61)          # icono verde del medio, desde la esquina IZQUIERDA superior
CHECK_SELECCIONAR = (-119, 61)     # casilla "Seleccionar todo", desde la esquina DERECHA superior

MEDIDORES = [
    "DAMB01_WB_P", "DAMB01_WB_R", "DAMB02_WB_P", "DAMB02_WB_R", "DAMB03_WB_P", "DAMB03_WB_R",
    "DAMB04_WB_P", "DAMB04_WB_R", "DAMB05_WB_P", "DAMB05_WB_R", "DAMB06_WB_P", "DAMB06_WB_R",
    "DAMB07_WB_P", "DAMB07_WB_R", "DAMB08_WB_P", "DAMB08_WB_R", "DAMB09_WB_P", "DAMB09_WB_R",
    "DAMB10_WB_P", "DAMB10_WB_R", "GDAMCLLIAX01_WB_P", "GDAMCLLIMD02_WB_P", "GDAMCLLIMD02_WB_R",
    "GDAMCPENAX01_WB_P", "GDAMCPENH01_WB_P", "GDAMCPENH01_WB_R",
]

URL_SIMEC = "https://smec.cenace.gob.ec/SMEC/Login.do"
URL_SIMEC_ENVIAR = "https://smec.cenace.gob.ec/SMEC/ServletUploads"
URL_SIMEC_ESTADO = "https://smec.cenace.gob.ec/SMEC/ConsultarEstadoArchivos.do"

RAIZ_CAPTURAS = r"C:\Users\Operadores CECON\Desktop\Errores\Capturas  SIMEC"   # ojo: dos espacios

# ---------------------------------------------------------------- Windows (ctypes, sin instalar nada)
user32 = ctypes.windll.user32 if os.name == "nt" else None

INPUT_MOUSE, INPUT_KEYBOARD = 0, 1
KEYEVENTF_KEYUP, KEYEVENTF_UNICODE = 0x0002, 0x0004
MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP = 0x0002, 0x0004
VK_TAB, VK_RETURN = 0x09, 0x0D
WM_CLOSE = 0x0010
SW_RESTORE = 9


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_void_p)]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_void_p)]


class _U(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", _U)]


def _enviar(*entradas):
    arr = (INPUT * len(entradas))(*entradas)
    user32.SendInput(len(entradas), arr, ctypes.sizeof(INPUT))


def tecla(vk):
    _enviar(INPUT(INPUT_KEYBOARD, _U(ki=KEYBDINPUT(vk, 0, 0, 0, None))),
            INPUT(INPUT_KEYBOARD, _U(ki=KEYBDINPUT(vk, 0, KEYEVENTF_KEYUP, 0, None))))
    time.sleep(0.15)


def escribir(texto):
    for ch in texto:
        c = ord(ch)
        _enviar(INPUT(INPUT_KEYBOARD, _U(ki=KEYBDINPUT(0, c, KEYEVENTF_UNICODE, 0, None))),
                INPUT(INPUT_KEYBOARD, _U(ki=KEYBDINPUT(0, c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, None))))
        time.sleep(0.05)


def clic(x, y):
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.2)
    _enviar(INPUT(INPUT_MOUSE, _U(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTDOWN, 0, None))),
            INPUT(INPUT_MOUSE, _U(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTUP, 0, None))))
    time.sleep(0.5)


def buscar_ventana(parte_titulo):
    encontrada = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            n = user32.GetWindowTextLengthW(hwnd)
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(hwnd, buf, n + 1)
            if parte_titulo.lower() in buf.value.lower():
                encontrada.append(hwnd)
        return True
    user32.EnumWindows(cb, 0)
    return encontrada[0] if encontrada else None


def esperar_ventana(parte_titulo, segundos):
    fin = time.time() + segundos
    while time.time() < fin:
        h = buscar_ventana(parte_titulo)
        if h:
            return h
        time.sleep(1)
    return None


def al_frente(hwnd):
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetForegroundWindow(hwnd)
    time.sleep(1)


def rect(hwnd):
    r = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def pantalla():
    from PIL import ImageGrab
    return ImageGrab.grab()


def casilla_marcada(x, y):
    """Mira los pixeles de la casilla: si hay un visto (pixeles oscuros) esta marcada."""
    try:
        img = pantalla()
        oscuros = 0
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                p = img.getpixel((x + dx, y + dy))
                if sum(p[:3]) < 300:
                    oscuros += 1
        return oscuros >= 5
    except Exception as e:
        log("   (no pude revisar la casilla: %s)" % e)
        return None


# ---------------------------------------------------------------- 1) programa TPL
def nombre_zip(medidor, fecha):
    return "%s_%s.zip" % (medidor, fecha.strftime("%Y_%m_%d"))


def vaciar_datos():
    if not os.path.isdir(CARPETA_DATOS):
        os.makedirs(CARPETA_DATOS)
    n = 0
    for f in os.listdir(CARPETA_DATOS):
        ruta = os.path.join(CARPETA_DATOS, f)
        if os.path.isfile(ruta):
            os.remove(ruta)
            n += 1
    log("Carpeta datos vaciada (%d archivos borrados)" % n)


def zips_listos(fecha):
    faltan = [m for m in MEDIDORES if not os.path.isfile(os.path.join(CARPETA_DATOS, nombre_zip(m, fecha)))]
    return faltan


def descargar_con_tpl(fecha):
    claves = leer_claves("tpl")
    if not claves.get("usuario"):
        raise RuntimeError("Faltan usuario/clave del TPL: corre configurar.bat")
    vaciar_datos()

    # cerrar un TPL que haya quedado abierto
    for t in (TITULO_PRINCIPAL, TITULO_LOGIN):
        h = buscar_ventana(t)
        if h:
            user32.PostMessageW(h, WM_CLOSE, 0, 0)
            time.sleep(3)

    log("Abriendo el programa TPL...")
    subprocess.Popen([JAVAW, "-jar", JAR], cwd=CARPETA_TPL)
    h = esperar_ventana(TITULO_LOGIN, 90)
    if not h:
        raise RuntimeError("No aparecio la ventana de inicio del TPL.")
    al_frente(h)
    time.sleep(1)
    escribir(claves["usuario"])
    tecla(VK_TAB)
    escribir(claves.get("clave", ""))
    tecla(VK_RETURN)

    h = esperar_ventana(TITULO_PRINCIPAL, 90)
    if not h:
        raise RuntimeError("El TPL no abrio despues del login (revisa usuario/clave en configurar.bat).")
    time.sleep(5)
    al_frente(h)
    izq, arriba, der, abajo = rect(h)
    log("   ventana TPL en (%d,%d)-(%d,%d)" % (izq, arriba, der, abajo))

    cx, cy = der + CHECK_SELECCIONAR[0], arriba + CHECK_SELECCIONAR[1]
    if casilla_marcada(cx, cy):
        log("   'Seleccionar todo' ya estaba marcada")
    else:
        clic(cx, cy)
        time.sleep(1)
        if casilla_marcada(cx, cy) is False:
            log("   OJO: no veo marcada 'Seleccionar todo', reintento")
            clic(cx, cy)
    log("   descarga: clic en el icono verde")
    clic(izq + ICONO_DESCARGA[0], arriba + ICONO_DESCARGA[1])

    d = esperar_ventana(TITULO_LLAMADA, 30)
    if d:
        al_frente(d)
        log("   dialogo 'Se recuperaran datos desde el dia...': Aceptar")
        tecla(VK_RETURN)
        time.sleep(2)
        d = buscar_ventana(TITULO_LLAMADA)
        if d:
            l, t, _, _ = rect(d)
            clic(l + ACEPTAR_LLAMADA[0], t + ACEPTAR_LLAMADA[1])
            time.sleep(2)
        if buscar_ventana(TITULO_LLAMADA):
            raise RuntimeError("No pude apretar Aceptar en el dialogo de fechas del TPL.")
    else:
        log("   (no aparecio el dialogo de fechas)")

    fin = time.time() + 10 * 60
    ultimo = None
    while time.time() < fin:
        time.sleep(15)
        faltan = zips_listos(fecha)
        if len(faltan) != ultimo:
            log("   %d/26 archivos descargados" % (26 - len(faltan)))
            ultimo = len(faltan)
        if not faltan:
            time.sleep(10)   # que termine de escribir el ultimo
            log("Los 26 archivos estan en C:\\TPL\\datos")
            r = esperar_ventana(TITULO_RESULTADOS, 60)
            if r:
                al_frente(r)
                tecla(VK_RETURN)
                time.sleep(2)
                if buscar_ventana(TITULO_RESULTADOS):
                    user32.PostMessageW(buscar_ventana(TITULO_RESULTADOS), WM_CLOSE, 0, 0)
                    time.sleep(2)
                log("   ventana de resultados cerrada")
            h = buscar_ventana(TITULO_PRINCIPAL)
            if h:
                user32.PostMessageW(h, WM_CLOSE, 0, 0)
            return
    raise RuntimeError("En 10 minutos no se descargaron los 26. Faltan: %s" % ", ".join(zips_listos(fecha)))


# ---------------------------------------------------------------- 2) SIMEC
def entrar_simec(driver):
    driver.get(URL_SIMEC)
    time.sleep(3)
    if "ERR_CERT" in driver.page_source or "no es privada" in driver.page_source:
        log("SIMEC: Chrome muestra 'La conexion no es privada'. Pasalo a mano (Configuracion avanzada > Acceder); espero 5 min...")
        fin = time.time() + 300
        while time.time() < fin and ("ERR_CERT" in driver.page_source or "no es privada" in driver.page_source):
            time.sleep(3)
    if "Salir" in driver.page_source and "EEASA" in driver.page_source:
        return
    if login_automatico(driver, leer_claves("simec"), False):
        time.sleep(3)
    if "Salir" in driver.page_source:
        log("SIMEC: sesion iniciada")
        return
    log("SIMEC pide iniciar sesion: entra a mano en Chrome (5 minutos)...")
    fin = time.time() + 300
    while time.time() < fin:
        time.sleep(3)
        if "Salir" in driver.page_source:
            return
    raise RuntimeError("No se inicio sesion en SIMEC.")


def enviar_simec(driver, fecha, prueba):
    rutas = [os.path.join(CARPETA_DATOS, nombre_zip(m, fecha)) for m in MEDIDORES]
    entrar_simec(driver)
    driver.get(URL_SIMEC_ENVIAR)
    time.sleep(3)
    f = driver.find_element_by_id("fichero")
    driver.execute_script("arguments[0].style.display='block';arguments[0].style.visibility='visible';"
                          "arguments[0].style.opacity=1;", f)
    f.send_keys("\n".join(rutas))
    time.sleep(3)
    avisos = aceptar_alertas(driver)
    if avisos:
        log("   SIMEC dice: %s" % " | ".join(avisos))
    time.sleep(3)
    correctos = driver.page_source.count("Nombre de archivo correcto")
    log("   %d/26 con 'Nombre de archivo correcto'" % correctos)
    if correctos < 26:
        raise RuntimeError("SIMEC no acepto los 26 nombres (solo %d)." % correctos)
    if prueba:
        log("   (prueba) NO se aprieta Enviar")
        return
    boton = [b for b in visibles(driver, "input[type=submit]") if (b.get_attribute("value") or "").strip() == "Enviar"]
    if not boton:
        raise RuntimeError("No encontre el boton Enviar.")
    boton[0].click()
    time.sleep(5)
    avisos = aceptar_alertas(driver)
    if avisos:
        log("   SIMEC dice: %s" % " | ".join(avisos))
    log("Enviados los 26 a SIMEC")


# ---------------------------------------------------------------- 3) estado + capturas
JS_FILAS = """
var r=[];document.querySelectorAll('tr').forEach(function(tr){
  var td=tr.querySelectorAll('td'); if(td.length>=5 && /\\.zip\\s*$/.test(td[0].innerText))
    r.push([td[0].innerText.trim(), td[td.length-1].innerText.trim()]);});
return r;"""


def estado_ok(driver, fecha):
    driver.get(URL_SIMEC_ESTADO)
    time.sleep(3)
    filas = driver.execute_script(JS_FILAS)
    esperados = set(nombre_zip(m, fecha) for m in MEDIDORES)
    ok = set(a for a, e in filas if a in esperados and "OK" in e.upper())
    return len(ok), filas


def ventana_chrome_al_frente(driver):
    try:
        driver.minimize_window()
        time.sleep(1)
    except Exception:
        pass
    driver.maximize_window()
    time.sleep(2)


JS_CONTENEDOR = """
var tds=[].filter.call(document.querySelectorAll('td'),function(t){return /\\.zip\\s*$/.test(t.innerText);});
if(!tds.length) return null;
var e=tds[0]; while(e && !(e.scrollHeight>e.clientHeight+5 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))) e=e.parentElement;
return e;"""

JS_MARCAR_ULTIMA_VISIBLE = """
var cont=arguments[0]; var box=cont.getBoundingClientRect(); var ult=null;
[].forEach.call(cont.querySelectorAll('tr'),function(tr){var r=tr.getBoundingClientRect();
  if(r.top>=box.top && r.bottom<=box.bottom && /\\.zip/.test(tr.innerText)) ult=tr;});
if(!ult) return null;
var c=ult.querySelector('td'); var rg=document.createRange(); rg.selectNodeContents(c);
var s=window.getSelection(); s.removeAllRanges(); s.addRange(rg);
return ult.offsetTop;"""


def capturar(driver, fecha, prueba):
    ventana_chrome_al_frente(driver)
    driver.get(URL_SIMEC_ESTADO)
    time.sleep(4)
    cont = driver.execute_script(JS_CONTENEDOR)
    if cont is None:
        raise RuntimeError("No encontre la tabla de estado con barra de desplazamiento.")
    driver.execute_script("arguments[0].scrollTop=0;", cont)
    top_ultima = driver.execute_script(JS_MARCAR_ULTIMA_VISIBLE, cont)
    time.sleep(1)
    img1 = pantalla()
    # segunda: bajar dejando la fila marcada arriba
    driver.execute_script("arguments[0].scrollTop=arguments[1]-2;", cont, top_ultima or 0)
    time.sleep(1)
    img2 = pantalla()

    from PIL import Image
    ancho = max(img1.size[0], img2.size[0])
    final = Image.new("RGB", (ancho, img1.size[1] + img2.size[1]), "white")
    final.paste(img1, (0, 0))
    final.paste(img2, (0, img1.size[1]))

    if prueba:
        carpeta = os.path.join(bosnis.AQUI, "capturas-prueba")
        nombre = "PRUEBA TPL %s.png" % fecha.strftime("%d-%m-%Y")
    else:
        mes = bosnis.MESES[fecha.month - 1]
        carpeta = os.path.join(RAIZ_CAPTURAS, str(fecha.year), "%02d_%s" % (fecha.month, mes))
        nombre = "TPL %s.png" % fecha.strftime("%d-%m-%Y")
        carpeta = bosnis.carpeta_existente(carpeta)
    if not os.path.isdir(carpeta):
        os.makedirs(carpeta)
    ruta = os.path.join(carpeta, nombre)
    final.save(ruta)
    log("Captura TPL guardada: %s" % ruta)
    return ruta


# ---------------------------------------------------------------- principal
def main():
    p = argparse.ArgumentParser()
    p.add_argument("accion", choices=["enviar", "capturar", "todo"])
    p.add_argument("--fecha", help="AAAA-MM-DD (por defecto: ayer)")
    p.add_argument("--prueba", action="store_true", help="no aprieta Enviar")
    p.add_argument("--sin-descargar", action="store_true", help="usa los zip que ya estan en C:\\TPL\\datos")
    p.add_argument("--espera", type=int, default=20, help="minutos maximos esperando 'Instalacion OK'")
    a = p.parse_args()

    fecha = (datetime.datetime.strptime(a.fecha, "%Y-%m-%d").date() if a.fecha
             else datetime.date.today() - datetime.timedelta(days=1))
    if not os.path.isdir(bosnis.CARPETA_LOG):
        os.makedirs(bosnis.CARPETA_LOG)
    bosnis._log_file = open(os.path.join(bosnis.CARPETA_LOG, "tpl_%s.txt" % fecha.strftime("%Y-%m-%d")), "a")
    log("==== TPL v6 %s %s %s====" % (a.accion, fecha, "(PRUEBA) " if a.prueba else ""))

    driver = None
    errores = 0
    try:
        if a.accion in ("enviar", "todo"):
            if not a.sin_descargar:
                descargar_con_tpl(fecha)
            faltan = zips_listos(fecha)
            if faltan:
                raise RuntimeError("Faltan zip en C:\\TPL\\datos: %s" % ", ".join(faltan))
            driver = abrir_chrome(ignorar_certificados=True)
            enviar_simec(driver, fecha, a.prueba)

        if a.accion in ("capturar", "todo"):
            if driver is None:
                driver = abrir_chrome(ignorar_certificados=True)
                entrar_simec(driver)
            fin = time.time() + a.espera * 60
            while True:
                n, _ = estado_ok(driver, fecha)
                log("Estado SIMEC: %d/26 con Instalacion OK" % n)
                if n >= 26 or a.prueba or time.time() > fin:
                    break
                time.sleep(60)
            if n < 26 and not a.prueba:
                log("OJO: no estan los 26 en OK, igual guardo la captura para que revises")
                errores += 1
            capturar(driver, fecha, a.prueba)
            if a.prueba:
                try:
                    os.startfile(os.path.join(bosnis.AQUI, "capturas-prueba"))
                except Exception:
                    pass
    except Exception as e:
        errores += 1
        log("ERROR: %s" % (getattr(e, "msg", None) or e))
        log(traceback.format_exc())
    finally:
        if driver is not None:
            if errores == 0 and not a.prueba:
                driver.quit()
            else:
                log("Chrome queda abierto para que revises.")
    log("==== FIN TPL: %s ====" % ("TODO OK" if errores == 0 else "%d problema(s)" % errores))
    return 0 if errores == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
