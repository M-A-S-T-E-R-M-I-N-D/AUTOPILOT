// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure logic shared by the server read-model (`read/fleet.ts`) and the
 * hand-authored client bundle (`web/shell.ts`, no bundler, CSP `self`-only —
 * epic 0002 "shell decomposition", slice 1). `web/shell.ts` embeds this
 * module's real compiled source into the generated `/app.js` text via
 * `firingCallsign.toString()` and `JSON.stringify(CALLSIGN_WORDS)` — see
 * `fleetJs()` — instead of hand-retyping the word list and hash loop, so the
 * two copies can no longer drift apart. `apps/dashboard/test/web/
 * callsign-parity.test.ts` regression-tests that the served bundle's output
 * matches this module's own function.
 */

/**
 * Curated one-word suffixes for {@link firingCallsign} — plain, pronounceable,
 * and free of any status/severity connotation so a callsign never reads as a
 * verdict.
 */
export const CALLSIGN_WORDS: readonly string[] = [
  'nova',
  'ember',
  'quartz',
  'raven',
  'onyx',
  'zephyr',
  'echo',
  'flux',
  'cipher',
  'halo',
  'vertex',
  'drift',
  'pulse',
  'talon',
  'shard',
  'lumen',
  'cobalt',
  'grit',
  'signal',
  'tide',
];

/**
 * A stable, deterministic callsign for a firing — e.g. "AP-7 nova" — so the
 * operator can refer to a specific run by name instead of its opaque
 * `firingId`. Pure function of the id (firing number + a hash into a curated
 * word list): the SAME firing always gets the SAME callsign, no storage or
 * migration needed.
 */
export function firingCallsign(firingId: string): string {
  const n = /firing-(\d+)/.exec(firingId)?.[1] ?? '0';
  let hash = 0;
  for (let i = 0; i < firingId.length; i++) {
    hash = (hash * 31 + firingId.charCodeAt(i)) >>> 0;
  }
  return `AP-${n} ${CALLSIGN_WORDS[hash % CALLSIGN_WORDS.length]}`;
}
