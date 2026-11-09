@echo off
rem Envio diario completo: TPL (enviar) -> BOSNI -> curva y correo de demanda -> TPL (captura)
cd /d C:\bosnis
C:\Python34\python.exe tpl.py enviar
C:\Python34\python.exe bosnis.py
C:\Python34\python.exe demanda.py todo
C:\Python34\python.exe tpl.py capturar
