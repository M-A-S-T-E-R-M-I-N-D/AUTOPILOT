// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { FlightSettings } from '@autopilot/engine';

/**
 * GUARD SETTINGS VERIFICATION (STPA finding): `fly.ts` writes the PreToolUse
 * containment-guard settings file, then spawns Claude Code with `--settings`
 * pointing at it — but a `writeFileSync` that lands truncated (disk full,
 * an interrupted write, a stale file left by a prior process with different
 * permissions) or a `guardHookScriptPath()` that doesn't resolve to a real
 * file (an unbuilt `dist/guard-hook.js`) both fail SILENTLY: the CLI's own
 * PreToolUse hook plumbing treats an unreadable/erroring hook command as "no
 * decision" and simply continues — the flight flies with zero containment
 * and no signal that it happened. This is the verification step: read the
 * file back, confirm it deep-equals what was actually intended, and confirm
 * the script it invokes is really there to run.
 */
export interface GuardVerification {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Verify the guard-settings file that was just written actually landed
 * correctly, and that the guard-hook script it references exists. `readRaw`
 * and `scriptExists` are injected so this stays pure and unit-testable —
 * fly.ts wires them to `readFileSync`/`existsSync`.
 */
export function verifyGuardSettings(
  guardSettingsPath: string,
  expected: FlightSettings,
  guardScriptPath: string,
  readRaw: (path: string) => string,
  scriptExists: (path: string) => boolean,
): GuardVerification {
  let raw: string;
  try {
    raw = readRaw(guardSettingsPath);
  } catch {
    return {
      ok: false,
      reason: `guard settings file could not be read back after writing: ${guardSettingsPath}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: `guard settings file did not parse back as valid JSON after writing: ${guardSettingsPath}`,
    };
  }
  if (JSON.stringify(parsed) !== JSON.stringify(expected)) {
    return {
      ok: false,
      reason: 'guard settings read back from disk do not match what fly.ts intended to write',
    };
  }
  if (!scriptExists(guardScriptPath)) {
    return {
      ok: false,
      reason: `guard-hook script not found at ${guardScriptPath} — the PreToolUse hook command would fail to run`,
    };
  }
  return { ok: true };
}
