@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM Stop the running dashboard (signals only the recorded pid).
setlocal
cd /d "%~dp0"
if not exist "apps\dashboard\dist\control\cli.js" (
  echo   Nothing to stop -- the dashboard was never built/started.
  pause
  exit /b 0
)
node apps\dashboard\dist\control\cli.js stop
echo.
pause
