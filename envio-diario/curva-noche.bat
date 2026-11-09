@echo off
rem Turno nocturno: llena la curva del Sheets compartido hasta las 05:45 y se apaga solo
cd /d C:\bosnis
C:\Python34\python.exe curva_vivo.py --hasta 05:45
