@echo off
REM Remove Nightwire's shortcuts and stop it running at sign-in.
REM
REM Deliberately leaves this folder alone: your settings, your uploaded
REM artwork and your OBS scene collection are yours. Delete the folder
REM afterwards if you want it gone entirely - nothing is installed anywhere
REM else, and nothing was written to the registry.
title Nightwire - Uninstall
setlocal
set "PKG=%~dp0"
if "%PKG:~-1%"=="\" set "PKG=%PKG:~0,-1%"

echo.
echo   This will:
echo     - stop Nightwire if it is running
echo     - remove the Startup, Start Menu and Desktop shortcuts
echo.
echo   It will NOT delete this folder, your settings or your artwork.
echo.
pause

echo.
echo   Stopping Nightwire...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/shutdown' -Method Post -TimeoutSec 5 -ErrorAction Stop ^| Out-Null; Write-Host '        Stopped.' } catch { Write-Host '        It was not running.' }"

echo.
echo   Removing shortcuts...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nightwire.lnk"
set "OLDSTARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nightwire Server.lnk"
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Nightwire.lnk"
set "DESKTOP=%USERPROFILE%\Desktop\Nightwire.lnk"
for %%L in ("%STARTUP%" "%OLDSTARTUP%" "%STARTMENU%" "%DESKTOP%") do (
  if exist "%%~L" (
    del "%%~L"
    echo         Removed %%~nxL
  )
)

echo.
echo   ============================================
echo     Done.
echo   ============================================
echo.
echo   Nightwire will no longer start when you sign in.
echo.
echo   Still on your PC, for you to remove if you want to:
echo     - this folder
echo     - the Nightwire scene collection in OBS
echo       ^(OBS: Scene Collection ^> Remove^)
echo.
pause
