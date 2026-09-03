// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The OPTIONAL GitHub CLI doctor check (epic 0006 "GitHub-connected mode",
 * slice 1 — board web-mss4lpw9-ktpcoh). `gh` is an optional dependency: its
 * absence degrades to SOLO mode, so this check NEVER fails the doctor —
 * `ok` stays true in every state and the detail line is the hint that tells
 * the operator which of the three states they are in and what unlocks
 * GitHub-connected mode. Read-only probes only (`gh --version`,
 * `gh auth status`): the epic's doctrine forbids running `gh auth login`
 * on the operator's behalf.
 *
 * Lives outside `DashboardControl.doctor()` on purpose: `gh auth status`
 * may validate the token over the network, and the in-process doctor
 * callers (tests, status paths) must not pay that latency — the CLI's
 * `doctor` command is where an operator reads this line, so that is where
 * it runs.
 */

import { execFileSync } from 'node:child_process';
import type { DoctorCheck } from './types.js';

/** Injectable probe runner — throws when `gh` is missing or exits non-zero. */
export type GhRun = (args: readonly string[]) => string;

/** `gh auth status` may validate the token over the network — bounded, not open-ended. */
const GH_PROBE_TIMEOUT_MS = 10_000;

function defaultGhRun(args: readonly string[]): string {
  return execFileSync('gh', args as string[], {
    encoding: 'utf8',
    timeout: GH_PROBE_TIMEOUT_MS,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * One doctor line for the GitHub CLI: not installed / installed-but-not-
 * authenticated / authenticated as `<login>`. The login parse tolerates the
 * account line being absent (older `gh` prints its status report to stderr,
 * which the runner does not capture) — the exit code alone already proved
 * authentication, so it degrades to a bare 'authenticated'.
 */
export function ghDoctorCheck(run: GhRun = defaultGhRun): DoctorCheck {
  const name = 'gh (optional)';
  try {
    run(['--version']);
  } catch {
    return {
      name,
      ok: true,
      detail:
        'not installed — GitHub-connected mode stays off; install GitHub CLI, then: gh auth login',
    };
  }
  let statusOut: string;
  try {
    statusOut = run(['auth', 'status']);
  } catch {
    return {
      name,
      ok: true,
      detail: 'installed, not authenticated — GitHub-connected mode unlocks after: gh auth login',
    };
  }
  const login = /account\s+(\S+)/.exec(statusOut)?.[1];
  return { name, ok: true, detail: login ? `authenticated as ${login}` : 'authenticated' };
}
