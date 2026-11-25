@echo off
rem SOLO CORREO: crea el archivo de la curva de demanda (4 de 4 de ayer) y lo envia por Outlook
cd /d C:\bosnis
C:\Python34\python.exe demanda.py todo
echo.
echo === CORREO TERMINADO ===
pause
