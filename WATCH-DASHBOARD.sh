#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
# SPDX-License-Identifier: Apache-2.0
# Run the RING-0 watchdog in this terminal. Ctrl+C stops the supervisor.
set -u
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "  pnpm was not found on PATH. Run ./SETUP.sh once -- it installs pnpm without admin rights."
  exit 1
fi

echo "Building AUTOPILOT (first run can take a moment)..."
pnpm run build
if [ $? -ne 0 ]; then
  echo
  echo "  BUILD FAILED -- see the errors above. The watchdog was not started."
  exit 1
fi

echo
pnpm dashboard:watch "$@"
echo
