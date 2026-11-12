@echo off
rem NOCHE COMPLETO: curva en otra ventana + a la 01:30 TPL, Bosnis, curva y correo de demanda, captura TPL
cd /d C:\bosnis
start "CURVA EN VIVO" cmd /c curva-noche.bat
C:\Python34\python.exe esperar.py 01:30
C:\Python34\python.exe tpl.py enviar
C:\Python34\python.exe bosnis.py
C:\Python34\python.exe demanda.py todo
C:\Python34\python.exe tpl.py capturar
echo.
echo === ENVIO DIARIO TERMINADO ===
pause
