@echo off
rem Envio diario completo: TPL (enviar) -> BOSNI -> TPL (captura)
cd /d C:\bosnis
C:\Python34\python.exe tpl.py enviar
C:\Python34\python.exe bosnis.py
C:\Python34\python.exe tpl.py capturar
