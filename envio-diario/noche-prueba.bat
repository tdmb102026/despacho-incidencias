@echo off
rem PRUEBA del turno nocturno: la curva SI escribe (hasta 00:00), lo demas NO envia nada
cd /d C:\bosnis
start "CURVA EN VIVO" C:\Python34\python.exe curva_vivo.py --hasta 24:00
call diario-prueba.bat
