@echo off
rem CURVA NOCHE: 1) archivo de HOY, columna D de 22:15 a 00:00
rem              2) archivo del DIA NUEVO, columna C completa y D de 00:15 a 05:45
cd /d C:\bosnis
set TURNO=noche
echo.
echo === PARTE 1: archivo de HOY (columna D de 22:15 a 00:00) ===
C:\Python34\python.exe curva_vivo.py --sin-referencia --desde 22:15 --hasta 24:00
echo.
echo === PARTE 2: archivo del DIA NUEVO (columna C y D de 00:15 a 05:45) ===
C:\Python34\python.exe curva_vivo.py --desde 00:15 --hasta 05:45
