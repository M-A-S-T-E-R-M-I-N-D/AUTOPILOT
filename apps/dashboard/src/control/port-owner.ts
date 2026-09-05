// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Finds whichever pid is LISTENING on `port` right now, independent of any
 * state file `DashboardControl` tracks — the RUNBOOK "stale server" gap
 * (docs/RUNBOOK.md #2, BUG web-mto5bxd1-x00maq): a process that took the
 * port some other way (a plain `pnpm dashboard`, a crashed IDE task, a
 * killed terminal whose SIGTERM never reached its child) is otherwise
 * invisible to `status`/`restart`. `restart()`'s port-squatter fallback uses
 * this to find and kill it instead of blindly binding a second listener next
 * to it — the exact "two main.js processes, stale one holding the port"
 * field failure this recurred as.
 */

import { execFileSync } from 'node:child_process';

/** Injectable probe runner — mirrors gh-doctor.ts's `GhRun` seam. A thrown
 *  error (missing OS tool, no listener found) fails open to "no owner
 *  found" below, never to "found a pid to kill". */
export type PortProbeRun = (bin: string, args: readonly string[]) => string;

function defaultRun(bin: string, args: readonly string[]): string {
  return execFileSync(bin, args as string[], { encoding: 'utf8', windowsHide: true });
}

/** Parses a Windows `netstat -ano` listing for the LISTENING pid bound to `port`. */
function parseNetstatListener(out: string, port: number): number | null {
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    const local = cols[1];
    if (!local?.endsWith(`:${port}`)) continue;
    const pid = Number(cols[cols.length - 1]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

export function findPortOwnerPid(
  port: number,
  platform: NodeJS.Platform = process.platform,
  run: PortProbeRun = defaultRun,
): number | null {
  try {
    if (platform === 'win32') {
      return parseNetstatListener(run('netstat', ['-ano']), port);
    }
    const out = run('lsof', ['-ti', `tcp:${port}`]).trim();
    const pid = Number(out.split('\n')[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}
