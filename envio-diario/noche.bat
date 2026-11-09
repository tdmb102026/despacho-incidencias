@echo off
rem Turno nocturno completo: abre la curva en vivo en otra ventana (pide el link),
rem espera a la 01:00 y corre el envio diario (TPL, Bosnis, curva y correo, captura TPL)
cd /d C:\bosnis
start "CURVA EN VIVO" cmd /c curva-noche.bat
C:\Python34\python.exe esperar.py 01:00
call diario.bat
