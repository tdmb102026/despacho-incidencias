@echo off
rem Turno nocturno: 1) Sheets de HOY hasta las 00:00  2) Sheets del dia NUEVO desde 00:15 hasta 05:45
cd /d C:\bosnis
set TURNO=noche
echo.
echo === PARTE 1: archivo de HOY (hasta las 00:00) ===
C:\Python34\python.exe curva_vivo.py --hasta 24:00
echo.
echo === PARTE 2: archivo del DIA NUEVO (00:15 a 05:45) ===
C:\Python34\python.exe curva_vivo.py --hasta 05:45
