@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM Rebuild (local only) and restart the dashboard, then reopen it in the browser.
setlocal
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo   pnpm was not found on PATH. Run SETUP.cmd once -- it installs pnpm without admin rights.
  pause
  exit /b 1
)

echo Rebuilding AUTOPILOT...
call pnpm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED -- see the errors above. The dashboard was not restarted.
  pause
  exit /b 1
)

echo.
node apps\dashboard\dist\control\cli.js restart
echo.
pause
