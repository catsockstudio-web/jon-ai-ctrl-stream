@echo off
REM Start Nightwire (it normally starts by itself at sign-in).
REM
REM Opens the tray app, which starts the server if it is not already up and
REM then sits by the clock as the one place to open the dashboard, restart it,
REM or stop it. Running this twice is harmless - only one tray icon can exist.
cd /d "%~dp0"
start "" wscript.exe "%~dp0Nightwire.vbs"
echo.
echo   Nightwire is starting - look for the icon by the clock.
timeout /t 4 >nul
start "" http://127.0.0.1:8787/dashboard.html
