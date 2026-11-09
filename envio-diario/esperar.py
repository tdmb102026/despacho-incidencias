# -*- coding: utf-8 -*-
"""Espera hasta la hora indicada (por defecto 01:00) antes del envio diario. Uso: python esperar.py 01:00"""
import datetime, sys, time
hh, mm = [int(x) for x in (sys.argv[1] if len(sys.argv) > 1 else "01:00").split(":")]
ahora = datetime.datetime.now()
meta = ahora.replace(hour=hh, minute=mm, second=0, microsecond=0)
if ahora.hour >= 18:                      # abierto antes de medianoche -> la 01:00 de manana
    meta += datetime.timedelta(days=1)
if meta > ahora:
    print("Esperando hasta las %s para el envio diario (TPL, Bosnis, correo)... no cierres esta ventana." % meta.strftime("%H:%M"))
    time.sleep((meta - ahora).total_seconds())
