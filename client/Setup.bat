@echo off
title Nightwire Stream Overlay - Setup
setlocal enabledelayedexpansion
set "PKG=%~dp0"
if "%PKG:~-1%"=="\" set "PKG=%PKG:~0,-1%"

echo.
echo   ============================================
echo     Nightwire  -  Stream Overlay Setup
echo   ============================================
echo.
echo   This will:
echo     1. make sure Node.js is available
echo     2. run the overlay server automatically at sign-in
echo     3. add the OBS scenes, already wired up
echo.
echo   Please close OBS before continuing, if it is open.
echo.
pause

REM ---------------------------------------------------------------- 1. Node
echo.
echo   [1/3] Checking for Node.js...
where node >nul 2>&1
if %errorlevel%==0 goto :nodeok

echo         Not found. Installing it (this may take a minute)...
where winget >nul 2>&1
if %errorlevel%==0 (
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
  REM winget updates PATH for new processes only; look in the usual place too.
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
  where node >nul 2>&1
  if !errorlevel!==0 goto :nodeok
)

echo.
echo   Node.js could not be installed automatically.
echo   Your browser will open the download page - install the LTS version,
echo   then run this Setup again.
echo.
start "" https://nodejs.org/en/download
pause
exit /b 1

:nodeok
for /f "tokens=*" %%v in ('node -v') do echo         Node.js %%v found.

REM ---------------------------------------------------------- 2. auto-start
echo.
echo   [2/3] Setting the overlay server to run at sign-in...
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nightwire Server.lnk"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%');" ^
  "$s.TargetPath = 'wscript.exe';" ^
  "$s.Arguments = '\"%PKG%\start-hidden.vbs\"';" ^
  "$s.WorkingDirectory = '%PKG%';" ^
  "$s.Description = 'Nightwire overlay server';" ^
  "$s.Save()"

echo         Starting it now...
start "" wscript.exe "%PKG%\start-hidden.vbs"

REM Give the server a moment, then confirm it is actually answering.
powershell -NoProfile -Command ^
  "$ok=$false; foreach($i in 1..15){ try { Invoke-WebRequest 'http://127.0.0.1:8787/api/state' -UseBasicParsing -TimeoutSec 2 ^| Out-Null; $ok=$true; break } catch { Start-Sleep -Milliseconds 600 } };" ^
  "if($ok){ Write-Host '        Server is running.' } else { Write-Host '        Server did not start - see server.log' }"

REM ------------------------------------------------------- 3. OBS scenes
echo.
echo   [3/3] Adding the OBS scenes...
set "OBSDIR=%APPDATA%\obs-studio\basic\scenes"
if not exist "%OBSDIR%" (
  echo         OBS does not appear to be installed yet.
  echo         Install OBS, run it once, then run this Setup again.
  goto :done
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src = '%PKG%\obs\Nightwire.json';" ^
  "$dst = '%OBSDIR%\Nightwire.json';" ^
  "$esc = '%PKG%'.Replace('\','\\');" ^
  "$json = [IO.File]::ReadAllText($src).Replace('__PACKAGE_DIR__', $esc);" ^
  "[IO.File]::WriteAllText($dst, $json);" ^
  "Write-Host '        Scenes installed.'"

:done
echo.
echo   ============================================
echo     Done.
echo   ============================================
echo.
echo   Next, in OBS:
echo     Scene Collection  ^>  Nightwire
echo.
echo   Then pick your camera:
echo     double-click "Camera - Gameplay" and choose your webcam.
echo     Everything else is already positioned.
echo.
echo   The full manual, with screenshots, is in this folder:
echo     "Nightwire - Setup and Operating Manual.pdf"
echo.
echo   Opening the quick instructions and the control panel...
start "" "%PKG%\START HERE.html"
start "" http://127.0.0.1:8787/dashboard.html
echo.
pause
