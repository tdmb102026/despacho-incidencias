@echo off
rem Abre el Chrome del programa en modo normal para iniciar sesion en Outlook a mano (una vez). Luego cierra la ventana.
wmic process where "name=chrome.exe and commandline like %%%%perfil-chrome%%%%" call terminate >nul 2>nul
start "" chrome.exe --user-data-dir="C:\bosnis\perfil-chrome" https://outlook.office.com/mail/
