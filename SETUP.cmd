@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM First-run bootstrap: detects and installs missing prerequisites --
REM pnpm, project dependencies, and the Claude Code CLI -- then prints a
REM doctor report. Safe to re-run any time; every step is idempotent.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on PATH.
  echo   AUTOPILOT needs Node.js 22.12 or newer: https://nodejs.org/
  echo   Install it, then double-click SETUP.cmd again.
  echo.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm not found -- setup will install it for you.
)

node scripts\setup.mjs
set SETUP_EXIT=%errorlevel%
echo.
pause
exit /b %SETUP_EXIT%
