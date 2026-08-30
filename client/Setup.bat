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
echo   [2/3] Installing shortcuts and setting Nightwire to run at sign-in...

REM Three shortcuts, all pointing at the tray app rather than the bare server:
REM Startup so it is simply there each morning, Start Menu and Desktop so there
REM is something to click if it was ever quit. The tray is what makes a hidden
REM background server controllable without going through Task Manager.
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nightwire.lnk"
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Nightwire.lnk"
set "DESKTOP=%USERPROFILE%\Desktop\Nightwire.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sh = New-Object -ComObject WScript.Shell;" ^
  "foreach($p in @('%STARTUP%','%STARTMENU%','%DESKTOP%')){" ^
  "  $s = $sh.CreateShortcut($p);" ^
  "  $s.TargetPath = 'wscript.exe';" ^
  "  $s.Arguments = '\"%PKG%\Nightwire.vbs\"';" ^
  "  $s.WorkingDirectory = '%PKG%';" ^
  "  $s.Description = 'Nightwire stream overlay';" ^
  "  if(Test-Path '%PKG%\obs\nightwire.ico'){ $s.IconLocation = '%PKG%\obs\nightwire.ico' };" ^
  "  $s.Save()" ^
  "}"

REM Earlier versions auto-started the server directly. Leave that shortcut in
REM place and sign-in would start a second, untracked server beside the tray.
set "OLDLNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nightwire Server.lnk"
if exist "%OLDLNK%" del "%OLDLNK%"

echo         Starting it now...
start "" wscript.exe "%PKG%\Nightwire.vbs"

REM Give the server a moment, then confirm it is actually answering, and say
REM what went wrong if it is not. "Setup finished" over a server that never
REM started is worse than an error, because the failure surfaces much later
REM as a dashboard that refuses to connect.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; foreach($i in 1..20){ try { Invoke-WebRequest 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 2 ^| Out-Null; $ok=$true; break } catch { Start-Sleep -Milliseconds 600 } };" ^
  "if($ok){ Write-Host '        Server is running.' } else {" ^
  "  Write-Host '        THE SERVER DID NOT START.';" ^
  "  if(Test-Path 'server.log'){ Write-Host ''; Write-Host '        server.log says:'; Get-Content 'server.log' -Tail 15 }" ^
  "  else { Write-Host '        No server.log was written - Node.js is probably not on PATH.'; Write-Host '        Close this window, open it again and re-run Setup.bat.' }" ^
  "}"

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
