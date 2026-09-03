@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM Report the dashboard run state (running/stopped/stale) + doctor checks.
setlocal
cd /d "%~dp0"
if not exist "apps\dashboard\dist\control\cli.js" (
  echo   Not built yet -- run START-DASHBOARD.cmd first.
  pause
  exit /b 0
)
node apps\dashboard\dist\control\cli.js status
echo.
node apps\dashboard\dist\control\cli.js doctor
echo.
pause
