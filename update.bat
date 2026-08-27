@echo off
REM Update only - does not start the server.
cd /d "%~dp0"
git pull
echo.
git log --oneline -1
echo.
pause
