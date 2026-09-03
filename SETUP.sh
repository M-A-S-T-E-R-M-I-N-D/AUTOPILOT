#!/usr/bin/env bash
# (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
# First-run bootstrap: detects and installs missing prerequisites --
# pnpm, project dependencies, and the Claude Code CLI -- then prints a
# doctor report. Safe to re-run any time; every step is idempotent.
set -u
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js was not found on PATH."
  echo "  AUTOPILOT needs Node.js 22.12 or newer: https://nodejs.org/"
  echo "  Install it, then run SETUP.sh again."
  echo
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found -- setup will install it for you."
fi

node scripts/setup.mjs
exit $?
