#!/usr/bin/env bash
# (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
# Report the dashboard run state (running/stopped/stale) + doctor checks.
set -u
cd "$(dirname "$0")"

if [ ! -f "apps/dashboard/dist/control/cli.js" ]; then
  echo "  Not built yet -- run START-DASHBOARD.sh first."
  exit 0
fi
node apps/dashboard/dist/control/cli.js status
echo
node apps/dashboard/dist/control/cli.js doctor
echo
