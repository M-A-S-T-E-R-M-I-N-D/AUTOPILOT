@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM RING-0 SUPERVISOR: run the watchdog daemon in this window -- it owns
REM start/revive/replace so you can observe instead of babysitting. Leave the
REM window open; close it (or Ctrl+C) to stop watching.
REM Optional args (same as `pnpm dashboard:watch -- <folder> [firings] [budgetUsd]`):
REM   WATCH-DASHBOARD.cmd "<path-to-project>" [firings] [budgetUsd]
REM keeps that one project flying too, whenever it's idle.
setlocal
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   pnpm was not found on PATH. Run SETUP.cmd once -- it installs pnpm without admin rights.
  echo.
  pause
  exit /b 1
)

echo Building AUTOPILOT ^(first run can take a moment^)...
call pnpm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED -- see the errors above. The watchdog was not started.
  echo.
  pause
  exit /b 1
)

echo.
node apps\dashboard\dist\control\cli.js watch "%~1" %2 %3
echo.
pause
