@echo off
rem Vuelve a crear el archivo de la curva de demanda de ayer (borra el anterior). NO envia el correo.
cd /d C:\bosnis
C:\Python34\python.exe demanda.py curva --rehacer
echo.
echo === ARCHIVO CREADO: revisalo y luego usa enviar-correo.bat ===
pause
