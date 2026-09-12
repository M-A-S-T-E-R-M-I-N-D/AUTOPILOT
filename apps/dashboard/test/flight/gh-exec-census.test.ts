// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The anti-flood guard is only real where it is DEFAULTED. A new flight
 * module that writes `exec: CliExec = realCliExec` posts unguarded and
 * nothing would notice until a thread floods again — exactly how PR #33
 * got the same approval twice.
 *
 * So this census diffs the flight DIRECTORY on disk, never a hand-kept
 * list (the census-must-diff-the-disk law, learned from chunks.test.ts
 * and pr-review.test.ts): every `.ts` under `src/flight/` is read, and
 * any `CliExec` default other than `ghExec` fails with the file named.
 * `gh-exec.ts` is the one sanctioned exception — it is where the raw exec
 * gets wrapped.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLIGHT_DIR = fileURLToPath(new URL('../../src/flight/', import.meta.url));

/** The module that legitimately imports the raw exec, because it is the
 *  one that wraps it. */
const WRAPPER_FILE = 'gh-exec.ts';

function flightSources(): readonly string[] {
  return readdirSync(FLIGHT_DIR).filter((f) => f.endsWith('.ts'));
}

describe('every flight module defaults to the guarded gh exec', () => {
  it('finds the flight directory and reads more than a handful of modules', () => {
    expect(flightSources().length).toBeGreaterThan(10);
  });

  it('defaults no CliExec parameter to the unguarded realCliExec', () => {
    const offenders: string[] = [];
    for (const file of flightSources()) {
      if (file === WRAPPER_FILE) continue;
      const source = readFileSync(join(FLIGHT_DIR, file), 'utf8');
      if (/CliExec\s*=\s*realCliExec/.test(source)) offenders.push(file);
    }
    expect(
      offenders,
      `default to ghExec (flight/gh-exec.ts) instead: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('imports realCliExec in exactly one place — the wrapper', () => {
    const importers = flightSources().filter((file) =>
      /import\s*\{[^}]*\brealCliExec\b/.test(readFileSync(join(FLIGHT_DIR, file), 'utf8')),
    );
    expect(importers).toEqual([WRAPPER_FILE]);
  });

  it('keeps at least the eight known posting paths defaulting to ghExec', () => {
    const wired = flightSources().filter((file) =>
      /CliExec\s*=\s*ghExec/.test(readFileSync(join(FLIGHT_DIR, file), 'utf8')),
    );
    expect(wired.length).toBeGreaterThanOrEqual(8);
    expect(wired).toContain('issue-triage-execute.ts');
    expect(wired).toContain('pr-review-execute.ts');
    expect(wired).toContain('mirror-pass-execute.ts');
    expect(wired).toContain('discussions-triage-execute.ts');
  });
});
