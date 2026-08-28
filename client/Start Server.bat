@echo off
REM Start the overlay server (it normally starts by itself at sign-in).
cd /d "%~dp0"
start "" wscript.exe "%~dp0start-hidden.vbs"
echo.
echo   Server starting...
timeout /t 3 >nul
start "" http://127.0.0.1:8787/dashboard.html
