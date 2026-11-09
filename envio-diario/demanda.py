# -*- coding: utf-8 -*-
"""
Curva de carga EEASA + correo "Demanda EEASA" del dia anterior.

Uso (en C:\\bosnis):
    python demanda.py curva            -> crea la curva de AYER (desde el 4 de 4, hoja CECON1 columna V)
    python demanda.py correo           -> manda el correo con la curva adjunta
    python demanda.py todo             -> las dos cosas
    --prueba                           -> la curva se guarda en C:\\bosnis\\pruebas y el correo NO se envia
    --fecha 2026-11-07                 -> otra fecha
"""
from __future__ import print_function

import argparse
import base64
import datetime
import os
import subprocess
import sys
import time
import traceback

import bosnis
from bosnis import log, MESES, carpeta_existente, leer_claves, visibles, abrir_chrome
from selenium.webdriver.common.keys import Keys

VERSION = "demanda v3"
AQUI = bosnis.AQUI
RAIZ_PARTES = r"D:\PARTES OPERACION CECON\MisDocumentos\excel\PARTES {Y}"
CARPETA_CURVAS = "DEMANDA EEASA CCND {Y}"            # dentro de PARTES {Y}, luego carpeta del MES
NOMBRE_CURVA = "Formato curva de carga EEASA %02d_%02d_ %d"
CARPETA_PRUEBAS = os.path.join(AQUI, "pruebas")

URL_OUTLOOK = "https://outlook.office.com/mail/"
PARA = ["ccnd@redenergia.gob.ec"]
CC = ["cguato@eeasa.com.ec", "dgutierrez@eeasa.com.ec"]
ASUNTO = "Demanda EEASA"
TEXTO = ("Estimados,\n\n"
         "Adjunto información solicitada sobre la demanda de la Empresa Eléctrica Ambato correspondiente al "
         "{fecha}.  Se indica que la información fue descargada de los medidores ION, los cuales almacenan "
         "información cada 15 minutos.\n\n")
DESPEDIDA = "Saludos Cordiales,"


# ---------------------------------------------------------------- curva
def partes(fecha):
    return RAIZ_PARTES.replace("{Y}", str(fecha.year))


def buscar_4de4(fecha):
    """PARTES {Y}\\AMBATO.. {Y}\\MM_MES {Y}\\DD MES {Y}.xls"""
    raiz = partes(fecha)
    mes = MESES[fecha.month - 1]
    nombre = "%02d %s %d" % (fecha.day, mes, fecha.year)
    for d in sorted(os.listdir(raiz)):
        if d.upper().startswith("AMBATO") and d.endswith(str(fecha.year)):
            carpeta = os.path.join(raiz, d, "%02d_%s %d" % (fecha.month, mes, fecha.year))
            r = bosnis.buscar_excel(carpeta, nombre) if os.path.isdir(carpeta) else None
            if r:
                return r
    raise RuntimeError("No encuentro el 4 de 4 '%s' en %s\\AMBATO...\\" % (nombre, raiz))


def carpeta_curvas(fecha):
    return os.path.join(partes(fecha), CARPETA_CURVAS.replace("{Y}", str(fecha.year)), MESES[fecha.month - 1])


def ruta_curva(fecha, ext=".xlsx"):
    return os.path.join(carpeta_curvas(fecha), NOMBRE_CURVA % (fecha.day, fecha.month, fecha.year) + ext)


def curva_existente(fecha):
    c = carpeta_curvas(fecha)
    base = NOMBRE_CURVA % (fecha.day, fecha.month, fecha.year)
    if os.path.isdir(c):
        for f in os.listdir(c):
            if os.path.splitext(f)[0] == base and not f.startswith("~$"):
                return os.path.join(c, f)
    return None


def plantilla(fecha):
    """La curva mas reciente que exista (este mes o los anteriores), sin contar la del mismo dia."""
    for atras in range(1, 40):
        d = fecha - datetime.timedelta(days=atras)
        r = curva_existente(d)
        if r:
            return r
    raise RuntimeError("No encuentro ninguna curva anterior en %s" % carpeta_curvas(fecha))


def hacer_curva(fecha, prueba):
    origen = buscar_4de4(fecha)
    base = plantilla(fecha)
    ext = os.path.splitext(base)[1]
    if prueba:
        if not os.path.isdir(CARPETA_PRUEBAS):
            os.makedirs(CARPETA_PRUEBAS)
        destino = os.path.join(CARPETA_PRUEBAS, os.path.basename(ruta_curva(fecha, ext)))
        if os.path.exists(destino):
            os.remove(destino)
    else:
        ya = curva_existente(fecha)
        if ya:
            log("La curva ya existe, no la toco: %s" % ya)
            return ya
        carpeta_existente(carpeta_curvas(fecha))
        destino = ruta_curva(fecha, ext)
    log("4 de 4: %s" % origen)
    log("Curva base: %s" % os.path.basename(base))
    p = subprocess.Popen(["cscript", "//nologo", os.path.join(AQUI, "curva.vbs"), origen, base, destino,
                          "Fecha: " + fecha.strftime("%d-%m-%Y"),
                          "Potencia Activa Total [MW] - " + fecha.strftime("%d/%m/%Y")],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    salida = p.communicate()[0].decode("cp1252", "replace").strip()
    log("Excel: %s" % salida)
    if p.returncode != 0 or not os.path.isfile(destino):
        raise RuntimeError("No se pudo crear la curva.")
    log("Curva guardada: %s" % destino)
    return destino


# ---------------------------------------------------------------- correo
def fecha_larga(fecha):
    return "%02d de %s de %d" % (fecha.day, MESES[fecha.month - 1].lower(), fecha.year)


def primero(driver, selectores):
    for css in selectores:
        e = visibles(driver, css)
        if e:
            return e[0]
    return None


def boton_texto(driver, textos):
    for b in visibles(driver, "button, [role=button], [role=menuitem]"):
        t = " ".join(((b.text or "") + " " + (b.get_attribute("aria-label") or "")).split()).lower()
        if any(x.lower() in t for x in textos):
            return b
    return None


def login_microsoft(driver, claves):
    """Pantalla de login de Microsoft (correo -> clave -> mantener sesion)."""
    if not claves.get("usuario") or not claves.get("clave"):
        return
    for _ in range(4):
        u = primero(driver, ["input[name=loginfmt]"])
        if u:
            u.clear()
            u.send_keys(claves["usuario"] + Keys.ENTER)
            time.sleep(4)
            continue
        c = primero(driver, ["input[name=passwd]"])
        if c:
            c.clear()
            c.send_keys(claves["clave"] + Keys.ENTER)
            time.sleep(5)
            continue
        si = primero(driver, ["#idSIButton9"])     # "Mantener la sesion iniciada?" -> Si
        if si and "kmsi" in (driver.page_source[:20000].lower() + driver.current_url.lower()):
            si.click()
            time.sleep(4)
            continue
        break


def entrar_outlook(driver):
    driver.get(URL_OUTLOOK)
    time.sleep(6)
    fin = time.time() + 300
    aviso = False
    while time.time() < fin:
        if boton_texto(driver, ["correo nuevo", "new mail", "nuevo correo"]):
            return
        try:
            login_microsoft(driver, leer_claves("correo"))
        except Exception:
            pass
        if not aviso:
            log("Outlook: si pide iniciar sesion, entra en la ventana de Chrome (5 minutos) y marca 'mantener sesion'.")
            aviso = True
        time.sleep(3)
    raise RuntimeError("No se pudo entrar a Outlook.")


def escribir_destinos(driver, etiquetas, correos):
    campo = None
    for et in etiquetas:
        campo = primero(driver, ['div[aria-label="%s"][contenteditable=true]' % et,
                                 'input[aria-label="%s"]' % et])
        if campo:
            break
    if not campo:
        raise RuntimeError("No encuentro el campo %s" % etiquetas[0])
    campo.click()
    for c in correos:
        campo.send_keys(c + ";")
        time.sleep(1.5)


def cancelar_onedrive(driver):
    """Si sale 'Cargar en OneDrive' (subir y compartir vinculo) se cancela: queremos adjunto normal."""
    for d in visibles(driver, "[role=dialog], [role=alertdialog]"):
        t = (d.text or "").lower()
        if "cargar en" in t or "upload to" in t or "onedrive" in t:
            for b in d.find_elements_by_css_selector("button"):
                if (b.text or "").strip().lower() in ("cancelar", "cancel"):
                    b.click()
                    time.sleep(2)
                    return True
    return False


def adjunto_visible(driver, nombre):
    base = os.path.splitext(nombre)[0][:25]
    c = cuerpo(driver)
    todo = driver.find_element_by_tag_name("body").text or ""
    if "no se insert" in todo.lower() or "wasn't inserted" in todo.lower():
        return False                       # es el aviso de "no es imagen", no el adjunto
    zona = driver.find_elements_by_css_selector("[aria-label*='djunto'], [aria-label*='ttachment']")
    textos = " ".join((z.text or "") + " " + (z.get_attribute("aria-label") or "") for z in zona)
    return base in textos or base in (driver.find_element_by_tag_name("body").text or "").replace((c.text if c else ""), "")


def esperar_adjunto(driver, nombre, segundos):
    fin = time.time() + segundos
    while time.time() < fin:
        time.sleep(2)
        if cancelar_onedrive(driver):
            return False
        cerrar_aviso_imagen(driver)
        if adjunto_visible(driver, nombre):
            return True
    return False


def cerrar_aviso_imagen(driver):
    for b in visibles(driver, "button[aria-label='Cerrar'], button[aria-label='Close'], button[aria-label='Descartar']"):
        try:
            if "imagen" in (b.find_element_by_xpath("./..").text or "").lower():
                b.click()
        except Exception:
            pass


def input_del_clip(driver):
    """Aprieta Adjuntar archivo > Examinar este equipo, pero sin abrir la ventana de Windows:
    se atrapa el campo de archivo que Outlook usa para el adjunto normal."""
    driver.execute_script("""
        window.__fi = null;
        if (!window.__fiHook) {
            window.__fiHook = true;
            var o = HTMLInputElement.prototype.click;
            HTMLInputElement.prototype.click = function () {
                if (this.type === 'file') { window.__fi = this; return; }
                return o.apply(this, arguments);
            };
        }""")
    clip = primero(driver, ['button[aria-label="Adjuntar archivo"]', 'button[aria-label="Attach file"]',
                            'button[aria-label*="djuntar"]', 'button[aria-label*="ttach"]'])
    if not clip:
        log("   no encuentro el boton Adjuntar archivo")
        return None
    clip.click()
    time.sleep(2)
    if not driver.execute_script("return window.__fi"):
        op = boton_texto(driver, ["examinar este equipo", "browse this computer", "cargar desde este equipo",
                                  "este equipo", "this computer"])
        if op:
            op.click()
            time.sleep(2)
    return driver.execute_script("""
        var f = window.__fi;
        if (f && !f.isConnected) { f.style.display = 'none'; document.body.appendChild(f); }
        return f;""")


def adjuntar(driver, ruta):
    nombre = os.path.basename(ruta)
    try:
        f = input_del_clip(driver)
        if f:
            f.send_keys(ruta)
            if esperar_adjunto(driver, nombre, 30):
                log("Adjunto listo: %s" % nombre)
                return
            log("   el boton Adjuntar no funciono, pruebo otra forma")
    except Exception as e:
        log("   Adjuntar archivo: %s" % e)
    inputs = [i for i in driver.find_elements_by_css_selector("input[type=file]")
              if "image" not in (i.get_attribute("accept") or "")]
    log("Adjuntando (%d opciones)..." % len(inputs))
    for n, i in enumerate(inputs):
        try:
            i.send_keys(ruta)
        except Exception:
            continue
        if esperar_adjunto(driver, nombre, 20):
            log("Adjunto listo: %s" % nombre)
            return
        log("   opcion %d no sirvio" % (n + 1))
    # ultima opcion: soltar el archivo sobre el mensaje (como arrastrarlo)
    datos = base64.b64encode(open(ruta, "rb").read()).decode("ascii")
    driver.execute_script("""
        var b = atob(arguments[0]), a = new Uint8Array(b.length);
        for (var k = 0; k < b.length; k++) a[k] = b.charCodeAt(k);
        var f = new File([a], arguments[1], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        var dt = new DataTransfer(); dt.items.add(f);
        var t = arguments[2];
        ['dragenter','dragover','drop'].forEach(function (n) {
            t.dispatchEvent(new DragEvent(n, {bubbles: true, cancelable: true, dataTransfer: dt}));
        });""", datos, nombre, cuerpo(driver))
    if esperar_adjunto(driver, nombre, 60):
        log("Adjunto listo: %s" % nombre)
        return
    raise RuntimeError("No aparecio el adjunto en el correo.")


def cuerpo(driver):
    return primero(driver, ['div[aria-label="Cuerpo del mensaje"]', 'div[aria-label="Message body"]',
                            'div[role=textbox][contenteditable=true]'])


def mandar_correo(fecha, archivo, prueba):
    if not CC:
        log("OJO: todavia no hay correos en CC (falta configurarlos).")
    driver = abrir_chrome()
    try:
        entrar_outlook(driver)
        boton_texto(driver, ["correo nuevo", "new mail", "nuevo correo"]).click()
        time.sleep(5)
        asunto = None
        fin = time.time() + 30
        while not asunto and time.time() < fin:
            asunto = primero(driver, ['input[aria-label="Agregar un asunto"]', 'input[aria-label="Add a subject"]',
                                      'input[placeholder*="asunto"]', 'input[placeholder*="ubject"]'])
            time.sleep(1)
        if not asunto:
            raise RuntimeError("No se abrio el correo nuevo.")
        escribir_destinos(driver, ["Para", "To"], PARA)
        if CC:
            if not primero(driver, ['div[aria-label="CC"][contenteditable=true]', 'div[aria-label="Cc"][contenteditable=true]']):
                b = boton_texto(driver, ["cc"])
                if b:
                    b.click()
                    time.sleep(1)
            escribir_destinos(driver, ["CC", "Cc"], CC)
        asunto.click()
        asunto.send_keys(ASUNTO)
        c = cuerpo(driver)
        if not c:
            raise RuntimeError("No encuentro el cuerpo del correo.")
        tiene_firma = DESPEDIDA.lower() in (c.text or "").lower()
        c.click()
        c.send_keys(Keys.CONTROL + Keys.HOME)
        texto = TEXTO.format(fecha=fecha_larga(fecha)) + ("" if tiene_firma else DESPEDIDA + "\n")
        c.send_keys(texto)
        adjuntar(driver, archivo)
        if prueba:
            log("PRUEBA: el correo quedo listo pero NO se envio. Revisalo en Chrome.")
            try:
                bosnis.pausa("\nRevisa el correo en Chrome y presiona Enter (NO se envia)...")
            except Exception:
                pass
            return True
        b = primero(driver, ['button[aria-label="Enviar"]', 'button[aria-label="Send"]', 'button[title="Enviar"]'])
        if not b:
            b = boton_texto(driver, ["enviar"])
        b.click()
        time.sleep(8)
        if cuerpo(driver) and ASUNTO in (driver.find_element_by_tag_name("body").text or "") \
                and visibles(driver, 'input[aria-label="Agregar un asunto"]'):
            raise RuntimeError("El correo parece no haberse enviado.")
        log("Correo enviado a %s (CC %s)" % (", ".join(PARA), ", ".join(CC) or "-"))
        driver.quit()
        return True
    except Exception:
        log("ERROR correo:\n" + traceback.format_exc())
        log("Chrome queda abierto para que revises.")
        return False


# ---------------------------------------------------------------- main
def main():
    p = argparse.ArgumentParser()
    p.add_argument("que", choices=["curva", "correo", "todo"])
    p.add_argument("--fecha", help="AAAA-MM-DD (por defecto: ayer)")
    p.add_argument("--prueba", action="store_true")
    a = p.parse_args()
    fecha = (datetime.datetime.strptime(a.fecha, "%Y-%m-%d").date() if a.fecha
             else datetime.date.today() - datetime.timedelta(days=1))
    if not os.path.isdir(bosnis.CARPETA_LOG):
        os.makedirs(bosnis.CARPETA_LOG)
    bosnis._log_file = open(os.path.join(bosnis.CARPETA_LOG, "demanda_%s.txt" % fecha), "a")
    log("==== %s %s %s %s====" % (VERSION, a.que, fecha, "(PRUEBA) " if a.prueba else ""))
    try:
        archivo = None
        if a.que in ("curva", "todo"):
            archivo = hacer_curva(fecha, a.prueba)
        if a.que in ("correo", "todo"):
            if not archivo:
                archivo = (os.path.join(CARPETA_PRUEBAS, os.path.basename(ruta_curva(fecha))) if a.prueba
                           else curva_existente(fecha))
                if not archivo or not os.path.isfile(archivo):
                    raise RuntimeError("No existe la curva del dia; corre primero: demanda.py curva")
            if not mandar_correo(fecha, archivo, a.prueba):
                return 1
        if a.prueba and archivo:
            try:
                os.startfile(archivo)
            except Exception:
                pass
    except Exception as e:
        log("ERROR: %s" % e)
        return 1
    log("==== FIN OK ====")
    return 0


if __name__ == "__main__":
    sys.exit(main())
