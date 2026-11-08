# -*- coding: utf-8 -*-
"""
Carga diaria de datos BOSNI a CENACE (Agente Entregas - Bitacora Net).

Compatible con Python 3.4 + selenium 3.141.0 (la PC .75, Windows 7 / 2008 R2, Chrome 109).

Uso (desde cmd, en la carpeta de este archivo):
    python bosnis.py                       -> carga los datos de AYER y guarda
    python bosnis.py --fecha 2026-11-07    -> otra fecha
    python bosnis.py --prueba              -> carga y revisa, pero NO aprieta Guardar

    python bosnis.py --sin-generar         -> no genera el reporte (los Excel ya existen)

Pasos: 1) genera "Diario - Puntos frontera" (Hoja 4 de 4 + BOSNI) en DemandaMaxima,
2) espera los 9 Excel, 3) los sube a CENACE uno por uno, 4) revisa 432 registros y guarda la captura.
"""
from __future__ import print_function

import argparse
import datetime
import os
import sys
import time
import traceback

from selenium import webdriver
from selenium.common.exceptions import (NoAlertPresentException,
                                        TimeoutException,
                                        UnexpectedAlertPresentException)
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

# ---------------------------------------------------------------- configuracion
AQUI = os.path.dirname(os.path.abspath(__file__))

URL_DEMANDA = "http://172.20.18.45:666/demanda"
URL_CENACE = "http://sirio.cenace.gob.ec/BITACORAWEB/AdministracionCargaArchivos/CargarEntregas"

# Carpeta raiz de los BOSNI; {Y} = anio
RAIZ_BOSNI = r"D:\PARTES OPERACION CECON\MisDocumentos\excel\PARTES {Y}\BOSNI {Y}"

CHROMEDRIVER = os.path.join(AQUI, "chromedriver.exe")
PERFIL_CHROME = os.path.join(AQUI, "perfil-chrome")   # perfil propio: el login queda guardado
CARPETA_LOG = os.path.join(AQUI, "registros")

# Orden de carga: (valor del select Subestacion, nombre, archivo sin extension)
CARGAS = [
    ("98", "Ambato", "Posicion Ambato1 Ambato"),
    ("98", "Ambato", "Posicion Ambato2 Ambato"),
    ("470", "Baños", "Posicion Baños2 Baños"),
    ("351", "Puyo", "Posicion Puyo Puyo"),
    ("101", "Tena", "Posicion Tena Norte Tena"),
    ("101", "Tena", "Posicion Tena Tena"),
    ("95", "Totoras", "Posicion Ambato Totoras"),
    ("95", "Totoras", "Posicion Baños Totoras"),
    ("95", "Totoras", "Posicion Montalvo Totoras"),
]
REGISTROS_POR_ARCHIVO = 48   # cada 30 minutos

MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO",
         "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]

# ---------------------------------------------------------------- utilidades
_log_file = None


def log(msg):
    linea = "[%s] %s" % (datetime.datetime.now().strftime("%H:%M:%S"), msg)
    print(linea)
    if _log_file:
        _log_file.write(linea + "\n")
        _log_file.flush()


def carpeta_dia(fecha):
    mes = MESES[fecha.month - 1]
    return os.path.join(RAIZ_BOSNI.replace("{Y}", str(fecha.year)),
                        "%s %d" % (mes, fecha.year),
                        "%02d %s %d" % (fecha.day, mes, fecha.year))


def ruta_captura(fecha):
    mes = MESES[fecha.month - 1]
    carpeta = os.path.join(RAIZ_BOSNI.replace("{Y}", str(fecha.year)),
                           "00_CAPTURAS %d" % fecha.year,
                           "%02d_%s" % (fecha.month, mes))
    if not os.path.isdir(carpeta):
        os.makedirs(carpeta)
    return os.path.join(carpeta, "BOSNI %s.png" % fecha.strftime("%d-%m-%Y"))


def buscar_excel(carpeta, nombre):
    """Busca el archivo aceptando .xls/.xlsx/.csv y diferencias de tildes."""
    def norm(s):
        s = s.lower()
        for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n")):
            s = s.replace(a, b)
        return " ".join(s.split())
    objetivo = norm(nombre)
    for f in os.listdir(carpeta):
        base, ext = os.path.splitext(f)
        if norm(base) == objetivo and ext.lower() in (".xls", ".xlsx", ".csv", ".xlsm"):
            return os.path.join(carpeta, f)
    return None


def aceptar_alertas(driver):
    textos = []
    for _ in range(3):
        try:
            a = driver.switch_to.alert
            textos.append(a.text)
            a.accept()
            time.sleep(0.5)
        except NoAlertPresentException:
            break
    return textos


def cerrar_chrome_viejo():
    """Cierra ventanas de Chrome que dejo abiertas una corrida anterior (solo las del perfil del programa)."""
    try:
        import subprocess
        subprocess.call('wmic process where "name=\'chrome.exe\' and commandline like \'%%perfil-chrome%%\'" call terminate',
                        shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.call("taskkill /F /IM chromedriver.exe", shell=True,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(2)
    except Exception:
        pass


def abrir_chrome():
    cerrar_chrome_viejo()
    op = webdriver.ChromeOptions()
    op.add_argument("--user-data-dir=" + PERFIL_CHROME)
    op.add_argument("--window-size=1600,1000")
    op.add_argument("--start-maximized")
    op.add_argument("--disable-gpu")
    op.add_argument("--log-level=3")
    op.add_experimental_option("excludeSwitches", ["enable-logging"])
    op.add_experimental_option("detach", True)   # Chrome no se cierra si el programa termina con error
    d = webdriver.Chrome(executable_path=CHROMEDRIVER, chrome_options=op)
    d.set_page_load_timeout(90)
    return d


ARCHIVO_CLAVES = os.path.join(AQUI, "credenciales.ini")


def leer_claves(seccion):
    """Lee C:\\bosnis\\credenciales.ini (lo crea configurar.py). Nunca se sube a internet."""
    try:
        import configparser
        c = configparser.ConfigParser()
        c.read(ARCHIVO_CLAVES, encoding="utf-8")
        return dict(c[seccion]) if c.has_section(seccion) else {}
    except Exception:
        return {}


def visibles(driver, css):
    return [e for e in driver.find_elements_by_css_selector(css) if e.is_displayed()]


def login_automatico(driver, claves, con_ingeniero):
    """Llena usuario, clave (y nombre del ingeniero de turno) en el primer formulario visible."""
    if not claves.get("usuario") or not claves.get("clave"):
        return False
    claves_campo = visibles(driver, "input[type=password]")
    if not claves_campo:
        return False
    textos = visibles(driver, "input[type=text], input[type=email], input:not([type])")
    if not textos:
        return False
    textos[0].clear()
    textos[0].send_keys(claves["usuario"])
    claves_campo[0].clear()
    claves_campo[0].send_keys(claves["clave"])
    if con_ingeniero and len(textos) > 1 and claves.get("ingeniero"):
        textos[1].clear()
        textos[1].send_keys(claves["ingeniero"])
    botones = [b for b in visibles(driver, "button, input[type=submit]")
               if (b.text or b.get_attribute("value") or "").strip().lower() in ("login", "ingresar", "iniciar sesion", "iniciar sesión", "entrar")]
    if botones:
        botones[0].click()
    else:
        claves_campo[0].send_keys(Keys.ENTER)
    time.sleep(4)
    return True


def esperar_login(driver):
    """Si CENACE pide iniciar sesion: entra solo con credenciales.ini, o espera a que la persona entre."""
    if "CargarEntregas" in driver.current_url and driver.find_elements_by_id("IdSubestacion"):
        return
    if login_automatico(driver, leer_claves("cenace"), True):
        log("CENACE: sesion iniciada automaticamente")
        if "CargarEntregas" not in driver.current_url:
            driver.get(URL_CENACE)
        time.sleep(2)
        if driver.find_elements_by_id("IdSubestacion"):
            return
        log("CENACE: el login automatico no funciono (revisa credenciales.ini)")
    log("CENACE pide iniciar sesion. Inicia sesion en la ventana de Chrome (tienes 5 minutos)...")
    fin = time.time() + 300
    while time.time() < fin:
        time.sleep(3)
        try:
            if driver.find_elements_by_id("IdSubestacion"):
                return
            if "CargarEntregas" not in driver.current_url and "Login" not in driver.current_url \
                    and "Account" not in driver.current_url:
                driver.get(URL_CENACE)
        except Exception:
            pass
    raise RuntimeError("No se inicio sesion en CENACE a tiempo.")

# ---------------------------------------------------------------- DemandaMaxima
def clic_texto(driver, texto, timeout=30):
    xp = "//*[normalize-space(text())='%s']" % texto
    fin = time.time() + timeout
    while time.time() < fin:
        for e in driver.find_elements_by_xpath(xp):
            try:
                if e.is_displayed():
                    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", e)
                    e.click()
                    return e
            except Exception:
                pass
        time.sleep(1)
    raise RuntimeError("No se encontro '%s' en la pagina." % texto)


def marcar(driver, id_, valor=True):
    e = driver.find_element_by_id(id_)
    if e.is_selected() != valor:
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});arguments[0].click();", e)
    time.sleep(0.5)


def generar_reporte(driver, fecha, carpeta):
    log("Generando 'Diario - Puntos frontera' en DemandaMaxima...")
    inicio = time.time()
    driver.get(URL_DEMANDA)
    fin = time.time() + 300
    intento_login = False
    while not driver.find_elements_by_xpath("//*[normalize-space(text())='Reportes']"):
        if not intento_login and visibles(driver, "input[type=password]"):
            intento_login = True
            if login_automatico(driver, leer_claves("demanda"), False):
                log("DemandaMaxima: sesion iniciada automaticamente")
        if time.time() > fin:
            raise RuntimeError("DemandaMaxima no cargo (o pide iniciar sesion).")
        if int(time.time()) % 30 == 0:
            log("Esperando DemandaMaxima (si pide usuario, inicia sesion en la ventana)...")
        time.sleep(1)
    clic_texto(driver, "Reportes")
    time.sleep(2)
    clic_texto(driver, "Diario - Puntos frontera")
    WebDriverWait(driver, 60).until(EC.presence_of_element_located(("id", "fechaReporteFrontera")))
    time.sleep(2)

    f = driver.find_element_by_id("fechaReporteFrontera")
    f.click()
    f.send_keys(Keys.CONTROL, "a")
    f.send_keys(fecha.strftime("%d/%m/%Y"))
    f.send_keys(Keys.ENTER)
    time.sleep(1)
    f.send_keys(Keys.ESCAPE)
    # cerrar el calendario que queda abierto encima de los botones
    driver.execute_script("document.activeElement && document.activeElement.blur();")
    driver.find_element_by_tag_name("body").send_keys(Keys.ESCAPE)
    time.sleep(2)
    valor = driver.find_element_by_id("fechaReporteFrontera").get_attribute("value")
    if valor != fecha.strftime("%d/%m/%Y"):
        raise RuntimeError("No se pudo poner la fecha en DemandaMaxima (quedo %s)." % valor)

    marcar(driver, "_dbcprivate_checklist_archivosAdicionalesReporteFrontera_input_4DE4")
    marcar(driver, "_dbcprivate_checklist_archivosAdicionalesReporteFrontera_input_BOSNI")
    marcar(driver, "_dbcprivate_checklist_reemplazarArchivosReporteFrontera_input_replace")
    for id_ in ("_dbcprivate_checklist_archivosAdicionalesReporteFrontera_input_4DE4",
                "_dbcprivate_checklist_archivosAdicionalesReporteFrontera_input_BOSNI"):
        if not driver.find_element_by_id(id_).is_selected():
            raise RuntimeError("No se pudo marcar %s" % id_)

    # boton GENERAR REPORTE visible de la seccion frontera
    boton = None
    for e in driver.find_elements_by_xpath("//button[normalize-space(.)='GENERAR REPORTE']") + \
            driver.find_elements_by_xpath("//*[self::a or self::div][normalize-space(.)='GENERAR REPORTE' and not(*[normalize-space(.)='GENERAR REPORTE'])]"):
        if e.is_displayed():
            boton = e
            break
    if boton is None:
        raise RuntimeError("No se encontro el boton GENERAR REPORTE.")
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});arguments[0].click();", boton)
    log("   reporte pedido, esperando los 9 archivos (hasta 20 min)...")

    fin = time.time() + 20 * 60
    while time.time() < fin:
        time.sleep(10)
        if os.path.isdir(carpeta):
            listos = 0
            for _, _, nombre in CARGAS:
                r = buscar_excel(carpeta, nombre)
                if r and os.path.getmtime(r) >= inicio - 5:
                    listos += 1
            if listos == len(CARGAS):
                time.sleep(5)
                log("   los 9 archivos estan listos")
                return
        if "COMPLETADO" in driver.page_source and time.time() - inicio > 60:
            pass  # sigue esperando a que aparezcan en la carpeta
    raise RuntimeError("Pasaron 20 minutos y no aparecieron los 9 archivos nuevos en %s" % carpeta)


# ---------------------------------------------------------------- CENACE
def poner_fecha(driver, fecha_txt):
    driver.execute_script(
        "var e=document.getElementById('fechaIngreso');e.value=arguments[0];"
        "if(window.jQuery){jQuery(e).val(arguments[0]).trigger('change');}"
        "else{e.dispatchEvent(new Event('change',{bubbles:true}));}", fecha_txt)


def cargar_un_archivo(driver, fecha_txt, id_sub, ruta, guardar):
    wait = WebDriverWait(driver, 60)
    driver.get(URL_CENACE)
    esperar_login(driver)
    wait.until(EC.presence_of_element_located(("id", "IdSubestacion")))

    poner_fecha(driver, fecha_txt)
    Select(driver.find_element_by_id("IdSubestacion")).select_by_value(id_sub)
    time.sleep(1)

    # el input de archivo esta oculto (input-ghost): se hace visible para enviarle la ruta
    archivo = driver.find_element_by_id("archivo")
    driver.execute_script(
        "arguments[0].style.display='block';arguments[0].style.visibility='visible';"
        "arguments[0].style.opacity=1;arguments[0].style.width='300px';arguments[0].style.height='30px';",
        archivo)
    archivo.send_keys(ruta)
    time.sleep(1)

    driver.find_element_by_id("btnCargar").click()
    try:
        WebDriverWait(driver, 90).until(
            lambda d: aceptar_alertas(d) is not None and len(d.find_elements_by_id("MW%d" % REGISTROS_POR_ARCHIVO)) > 0)
    except TimeoutException:
        raise RuntimeError("Despues de Cargar no aparecieron las %d filas." % REGISTROS_POR_ARCHIVO)

    filas = len(driver.find_elements_by_css_selector("input[id^='MW']"))
    fecha_tabla = driver.find_element_by_id("fechaIngreso").get_attribute("value")
    log("   cargado: %d filas, fecha en pantalla %s" % (filas, fecha_tabla))
    if fecha_tabla != fecha_txt:
        raise RuntimeError("La fecha en pantalla (%s) no es la esperada (%s)." % (fecha_tabla, fecha_txt))

    if not guardar:
        log("   (prueba) NO se aprieta Guardar")
        return filas

    driver.find_element_by_id("btnGuardar").click()
    time.sleep(2)
    alertas = aceptar_alertas(driver)
    if alertas:
        log("   avisos: %s" % " | ".join(alertas))
    try:
        WebDriverWait(driver, 90).until(
            lambda d: "almacenado con" in d.page_source)
    except UnexpectedAlertPresentException:
        log("   avisos: %s" % " | ".join(aceptar_alertas(driver)))
    except TimeoutException:
        raise RuntimeError("Despues de Guardar no aparecio 'Registro almacenado con exito'.")
    log("   guardado OK")
    return filas


def revisar_y_capturar(driver, fecha, prueba=False):
    driver.get(URL_CENACE)
    esperar_login(driver)
    # pestania "Datos Ingresados"
    for e in driver.find_elements_by_partial_link_text("Datos Ingresados"):
        try:
            e.click()
            break
        except Exception:
            pass
    time.sleep(3)
    texto = ""
    for e in driver.find_elements_by_css_selector(".dataTables_info"):
        if e.is_displayed():
            texto = e.text
    log("Datos Ingresados: %s" % (texto or "(no se encontro el total)"))
    if prueba:
        carpeta = os.path.join(AQUI, "capturas-prueba")
        if not os.path.isdir(carpeta):
            os.makedirs(carpeta)
        ruta = os.path.join(carpeta, "PRUEBA BOSNI %s.png" % fecha.strftime("%d-%m-%Y"))
    else:
        ruta = ruta_captura(fecha)
    driver.save_screenshot(ruta)
    log("Captura guardada: %s" % ruta)
    esperado = REGISTROS_POR_ARCHIVO * len(CARGAS)
    return ("total de %d registros" % esperado) in texto


# ---------------------------------------------------------------- principal
def main():
    global _log_file
    p = argparse.ArgumentParser()
    p.add_argument("--fecha", help="AAAA-MM-DD (por defecto: ayer)")
    p.add_argument("--prueba", action="store_true", help="no aprieta Guardar")
    p.add_argument("--sin-generar", action="store_true", help="no genera el reporte en DemandaMaxima")
    a = p.parse_args()

    if a.fecha:
        fecha = datetime.datetime.strptime(a.fecha, "%Y-%m-%d").date()
    else:
        fecha = datetime.date.today() - datetime.timedelta(days=1)
    fecha_txt = fecha.strftime("%Y-%m-%d")

    if not os.path.isdir(CARPETA_LOG):
        os.makedirs(CARPETA_LOG)
    _log_file = open(os.path.join(CARPETA_LOG, "bosnis_%s.txt" % fecha_txt), "a")
    log("==== BOSNI v5 %s %s====" % (fecha_txt, "(PRUEBA) " if a.prueba else ""))

    carpeta = carpeta_dia(fecha)
    log("Carpeta: %s" % carpeta)
    try:
        driver = abrir_chrome()
    except Exception as e:
        log("ERROR al abrir Chrome: %s" % (getattr(e, "msg", None) or e))
        return 2
    try:
        if not a.sin_generar:
            generar_reporte(driver, fecha, carpeta)
        if not os.path.isdir(carpeta):
            raise RuntimeError("No existe la carpeta del dia.")
        rutas = []
        faltan = []
        for id_sub, sub, nombre in CARGAS:
            r = buscar_excel(carpeta, nombre)
            if r:
                rutas.append((id_sub, sub, r))
            else:
                faltan.append(nombre)
        if faltan:
            raise RuntimeError("Faltan archivos: %s" % ", ".join(faltan))
    except Exception as e:
        log("ERROR: %s" % e)
        log("Chrome queda abierto para que revises.")
        return 2
    errores = 0
    try:
        for i, (id_sub, sub, ruta) in enumerate(rutas, 1):
            log("%d/%d %s <- %s" % (i, len(rutas), sub, os.path.basename(ruta)))
            try:
                cargar_un_archivo(driver, fecha_txt, id_sub, ruta, not a.prueba)
            except Exception as e:
                errores += 1
                log("   ERROR: %s" % e)
                aceptar_alertas(driver)
        if a.prueba:
            revisar_y_capturar(driver, fecha, prueba=True)
            try:
                os.startfile(os.path.join(AQUI, "capturas-prueba"))
            except Exception:
                pass
        else:
            ok = revisar_y_capturar(driver, fecha)
            if not ok:
                log("OJO: el total no es %d registros, revisa la captura." % (REGISTROS_POR_ARCHIVO * len(CARGAS)))
                errores += 1
    except Exception:
        log("ERROR inesperado:\n" + traceback.format_exc())
        errores += 1
    finally:
        if errores == 0 and a.prueba:
            try:
                input("\nPrueba terminada. Revisa Chrome y presiona Enter para cerrarlo...")
            except Exception:
                pass
        if errores == 0:
            driver.quit()
        else:
            log("Chrome queda abierto para que revises.")
            if a.prueba:
                try:
                    input("\nPresiona Enter para salir...")
                except Exception:
                    pass
    log("==== FIN: %s ====" % ("TODO OK" if errores == 0 else "%d problema(s)" % errores))
    return 0 if errores == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
