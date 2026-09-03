// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Source-encoding guard: every tracked source file must be clean UTF-8
 * text with no NUL bytes. Born from firing 836, whose editing tool wrote a
 * stray byte into deliverable-predicates.ts — the gate stayed green (Node
 * tolerated it) but git's binary heuristic tripped, silently breaking the
 * file's diffs, reviews, and landing previews (`0 insertions, 0 deletions`
 * on a real change). The first sweep then caught a SECOND tool-written NUL
 * in flight-metrics.ts, so the guard now covers every tracked .ts/.mjs/.js
 * in the repo, not just the dashboard: tool-written byte corruption is a
 * recurring class, worth a standing repo-wide tripwire.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

/**
 * Every source file git can see, repo-relative — tracked PLUS untracked-but-
 * not-ignored, which is exactly the set `scripts/ci/{validate-spdx-headers,
 * secret-scan,validate-no-personal-paths,validate-configs}.mjs` already
 * enumerate. `--exclude-standard` applies the repo's own ignore rules, so
 * node_modules and build output still never enter (measured: identical 1006
 * files either way).
 *
 * `--others` matters. Tracked-only was blind to a file that is NEW and not yet
 * staged, so a green pre-`git add` run proved nothing about it — that is how a
 * NUL byte reached `flight/fleet-launch.ts` (6fc176cb, fixed 02f79b16): the
 * suite ran green before staging, then went red the moment the file was
 * tracked. Flights never hit this (firing.ts refuses to gate a dirty tree at
 * all), but an interactive commit does.
 *
 * This guard is load-bearing for more than encoding: secret-scan.mjs:82 and
 * validate-no-personal-paths.mjs:107 both `continue` on a NUL byte, so a
 * NUL-corrupted file is skipped by BOTH scanners. Weakening this check
 * silently punches a hole in those two.
 */
function trackedSourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '*.ts', '*.mjs', '*.js'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  return out.split('\0').filter((f) => f !== '');
}

describe('tracked source encoding', () => {
  const files = trackedSourceFiles();

  it('finds a non-trivial source tree to scan', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files.map((f) => [f]))('%s is NUL-free, strictly-valid UTF-8', (file) => {
    const bytes = readFileSync(join(REPO_ROOT, file));
    expect(bytes.includes(0), 'contains a NUL byte (git will flag the file binary)').toBe(false);
    // fatal:true throws on any malformed sequence — the assertion is the decode itself.
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).not.toThrow();
  });
});
