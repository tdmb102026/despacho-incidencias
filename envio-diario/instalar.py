# -*- coding: utf-8 -*-
"""Instala/actualiza el programa BOSNI en C:\\bosnis (Python 3.4)."""
from __future__ import print_function
import io, os, zipfile
import urllib.request as u

DESTINO = r"C:\bosnis"
BASE = "https://raw.githubusercontent.com/tdmb102026/despacho-incidencias/claude/project-thread-vee0yh/envio-diario/"
DRIVER = "https://chromedriver.storage.googleapis.com/109.0.5414.74/chromedriver_win32.zip"

if not os.path.isdir(DESTINO):
    os.makedirs(DESTINO)

for nombre in ("bosnis.py", "bosnis.bat", "bosnis-prueba.bat"):
    print("Bajando", nombre)
    datos = u.urlopen(BASE + nombre, timeout=60).read()
    open(os.path.join(DESTINO, nombre), "wb").write(datos)

if not os.path.isfile(os.path.join(DESTINO, "chromedriver.exe")):
    print("Bajando chromedriver 109")
    z = zipfile.ZipFile(io.BytesIO(u.urlopen(DRIVER, timeout=120).read()))
    z.extract("chromedriver.exe", DESTINO)

print("LISTO. Todo quedo en", DESTINO)
