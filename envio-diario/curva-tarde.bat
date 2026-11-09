@echo off
rem Turno tarde: llena la curva del Sheets compartido hasta las 00:00
cd /d C:\bosnis
C:\Python34\python.exe curva_vivo.py --hasta 24:00
pause
