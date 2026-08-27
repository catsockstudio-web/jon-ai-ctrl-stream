@echo off
REM Update to the latest version, then start the overlay server.
REM Double-click this file. Leave the window open while you stream.
REM Close it (or press Ctrl+C) to stop the server.
cd /d "%~dp0"

echo Updating...
git pull
if errorlevel 1 (
  echo.
  echo Could not update - starting with the version you already have.
  echo.
)

echo.
node server.mjs

REM If node exits, keep the window open so any error stays readable.
pause
