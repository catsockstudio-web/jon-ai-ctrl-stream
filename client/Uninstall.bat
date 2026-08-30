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
REM Every server must be stopped, not just the one answering on the port.
REM Windows locks a folder that is any running process's working directory,
REM and holds server.log open for as long as the redirect lives - so a single
REM leftover process is enough to make this whole folder undeletable, with
REM nothing on screen explaining why.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/shutdown' -Method Post -TimeoutSec 5 -ErrorAction Stop ^| Out-Null; Start-Sleep -Milliseconds 800; Write-Host '        Asked it to stop.' } catch { Write-Host '        Nothing was answering on port 8787.' };" ^
  "$here = (Get-Location).Path;" ^
  "$mine = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue ^| Where-Object { $_.CommandLine -and ($_.CommandLine -match 'server\.mjs' -or $_.CommandLine -match 'Nightwire\.ps1') -and $_.Name -in @('node.exe','cmd.exe','powershell.exe') });" ^
  "if($mine.Count -gt 0){" ^
  "  Write-Host '';" ^
  "  Write-Host ('        ' + $mine.Count + ' overlay process(es) still running:');" ^
  "  foreach($p in $mine){ Write-Host ('          PID ' + $p.ProcessId + '  ' + $p.CommandLine) };" ^
  "  Write-Host '';" ^
  "  $a = Read-Host '        Stop them so this folder can be deleted? (Y/N)';" ^
  "  if($a -match '^[Yy]'){" ^
  "    foreach($p in $mine){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "    Start-Sleep -Milliseconds 600; Write-Host '        Stopped.'" ^
  "  }" ^
  "} else { Write-Host '        No overlay processes left running.' };" ^
  "try { [IO.File]::Open((Join-Path $here 'server.log'),'Open','Read','None').Close(); Write-Host '        server.log is free - this folder can be deleted.' }" ^
  "catch [IO.FileNotFoundException] { Write-Host '        This folder can be deleted.' }" ^
  "catch { Write-Host '        NOTE: server.log is still in use, so the folder will not delete yet.'; Write-Host '        Close any window sitting in this folder and run this again.' }"

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
