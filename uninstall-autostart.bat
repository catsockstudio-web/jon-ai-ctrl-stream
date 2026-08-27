@echo off
REM Stop the server from starting automatically at sign-in.
REM Does not stop a server that is running right now - use stop.bat for that.
setlocal
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\JON_AI_CTRL Server.lnk"
if exist "%LNK%" (
  del "%LNK%"
  echo Removed. The server will no longer start at sign-in.
) else (
  echo It was not set to start automatically.
)
echo.
pause
