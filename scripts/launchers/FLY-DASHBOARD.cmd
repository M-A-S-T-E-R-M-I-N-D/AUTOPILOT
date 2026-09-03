@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM Actually FLY a demo project: the real engine loop ships gate-verified commits
REM and writes real telemetry, so the dashboard shows a live flight. $0 (scripted
REM agent, no model runs). Idempotent; artifacts live under .autopilot/.
setlocal
cd /d "%~dp0..\.."

where pnpm >nul 2>nul
if errorlevel 1 (
  echo   pnpm was not found on PATH. Enable it once with:  corepack enable pnpm
  pause
  exit /b 1
)

echo Building AUTOPILOT...
call pnpm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED -- see the errors above.
  pause
  exit /b 1
)

echo.
node apps\dashboard\dist\flight.js
echo.
echo Now run START-DASHBOARD.cmd (or refresh the page) to watch it fly.
echo.
pause
