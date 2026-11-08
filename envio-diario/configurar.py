# -*- coding: utf-8 -*-
"""Pide las claves y las guarda SOLO en esta PC: C:\\bosnis\\credenciales.ini"""
from __future__ import print_function
import configparser, getpass, os

ARCHIVO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "credenciales.ini")
c = configparser.ConfigParser()
print("Escribe cada dato y Enter. Las claves no se ven al escribir (es normal).\n")
c["cenace"] = {
    "usuario": input("CENACE (Bitacora Net) - usuario: ").strip(),
    "clave": getpass.getpass("CENACE - clave: ").strip(),
    "ingeniero": input("CENACE - Nombre y Apellido del ingeniero de turno: ").strip(),
}
c["demanda"] = {
    "usuario": input("DemandaMaxima - usuario: ").strip(),
    "clave": getpass.getpass("DemandaMaxima - clave: ").strip(),
}
with open(ARCHIVO, "w", encoding="utf-8") as f:
    c.write(f)
print("\nGuardado en", ARCHIVO)
