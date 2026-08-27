@echo off
REM Run the overlay server automatically whenever you sign in to Windows.
REM No admin rights needed - this only writes a shortcut into your own
REM Startup folder. Run uninstall-autostart.bat to undo it.
setlocal
set "REPO=%~dp0"
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\JON_AI_CTRL Server.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%');" ^
  "$s.TargetPath = 'wscript.exe';" ^
  "$s.Arguments = '""%REPO%start-hidden.vbs""';" ^
  "$s.WorkingDirectory = '%REPO%';" ^
  "$s.Description = 'JON_AI_CTRL overlay server';" ^
  "$s.Save()"

if errorlevel 1 (
  echo.
  echo Could not create the shortcut.
  pause
  exit /b 1
)

echo.
echo Installed. The server will start automatically when you sign in.
echo Starting it now so you do not have to sign out and back in...
start "" wscript.exe "%REPO%start-hidden.vbs"
echo.
echo Check it with status.bat
echo.
pause
