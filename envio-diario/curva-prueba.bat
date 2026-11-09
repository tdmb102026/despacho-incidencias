@echo off
rem PRUEBA: solo muestra los datos, NO escribe en el Sheets
cd /d C:\bosnis
C:\Python34\python.exe curva_vivo.py --solo-leer --hasta 24:00
pause
