# -*- coding: utf-8 -*-
"""Instala/actualiza el programa BOSNI en C:\\bosnis (Python 3.4)."""
from __future__ import print_function
import io, os, time, zipfile
import urllib.request as u

DESTINO = r"C:\bosnis"
BASE = "https://raw.githubusercontent.com/tdmb102026/despacho-incidencias/claude/project-thread-vee0yh/envio-diario/"
DRIVER = "https://chromedriver.storage.googleapis.com/109.0.5414.74/chromedriver_win32.zip"

if not os.path.isdir(DESTINO):
    os.makedirs(DESTINO)

# usar el ultimo commit exacto (evita copias viejas en cache)
import json
RAMA = "claude/project-thread-vee0yh"
try:
    BASE = BASE.replace(RAMA, V)   # V viene del comando de instalar (commit exacto)
    print("Version", V[:7])
except NameError:
  try:
    info = json.loads(u.urlopen("https://api.github.com/repos/tdmb102026/despacho-incidencias/commits/" + RAMA,
                                timeout=60).read().decode("utf-8"))
    BASE = BASE.replace(RAMA, info["sha"])
    print("Version del", info["commit"]["committer"]["date"], info["sha"][:7])
  except Exception as e:
    print("(no se pudo leer la ultima version, uso la rama)", e)

for nombre in ("bosnis.py", "tpl.py", "demanda.py", "curva.vbs", "curva_vivo.py", "leer4de4.vbs", "esperar.py", "configurar.py", "configurar.bat", "noche.bat", "curva-noche.bat", "curva-manana.bat", "curva-tarde.bat", "curva-madrugada.bat", "curva-rellenar.bat"):
    print("Bajando", nombre)
    datos = u.urlopen(BASE + nombre + "?t=%d" % time.time(), timeout=60).read()
    open(os.path.join(DESTINO, nombre), "wb").write(datos)

def version_chrome():
    import subprocess, re
    for clave in (r"HKCU\Software\Google\Chrome\BLBeacon", r"HKLM\Software\Google\Chrome\BLBeacon",
                  r"HKLM\Software\WOW6432Node\Google\Chrome\BLBeacon"):
        try:
            out = subprocess.check_output('reg query "%s" /v version' % clave, shell=True,
                                          stderr=subprocess.STDOUT).decode("latin-1")
            m = re.search(r"(\d+)\.(\d+)\.(\d+)\.(\d+)", out)
            if m:
                return m.group(0)
        except Exception:
            pass
    return None


if not os.path.isfile(os.path.join(DESTINO, "chromedriver.exe")):
    ver = version_chrome()
    print("Chrome instalado:", ver)
    mayor = int(ver.split(".")[0]) if ver else 109
    if mayor <= 114:
        if mayor != 109:
            exacta = u.urlopen("https://chromedriver.storage.googleapis.com/LATEST_RELEASE_%d" % mayor,
                               timeout=60).read().decode().strip()
            DRIVER = "https://chromedriver.storage.googleapis.com/%s/chromedriver_win32.zip" % exacta
        nombre_zip = "chromedriver.exe"
    else:
        exacta = u.urlopen("https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_%d" % mayor,
                           timeout=60).read().decode().strip()
        DRIVER = ("https://storage.googleapis.com/chrome-for-testing-public/%s/win32/chromedriver-win32.zip"
                  % exacta)
        nombre_zip = "chromedriver-win32/chromedriver.exe"
    print("Bajando chromedriver", DRIVER)
    z = zipfile.ZipFile(io.BytesIO(u.urlopen(DRIVER, timeout=120).read()))
    with open(os.path.join(DESTINO, "chromedriver.exe"), "wb") as f:
        f.write(z.read(nombre_zip))

# borrar los .bat viejos de pruebas para que solo queden los que se usan
for viejo in ("bosnis.bat", "bosnis-prueba.bat", "bosnis-prueba-completa.bat", "tpl-prueba.bat", "demanda-prueba.bat",
              "diario-prueba.bat", "diario.bat", "curva-prueba.bat", "noche-prueba.bat", "curva-login.bat", "curva-dia.bat"):
    try:
        os.remove(os.path.join(DESTINO, viejo))
    except OSError:
        pass

print("LISTO. Todo quedo en", DESTINO)
print("Usa: noche.bat (todo de noche), curva-noche.bat, curva-manana.bat, curva-tarde.bat, curva-madrugada.bat")
