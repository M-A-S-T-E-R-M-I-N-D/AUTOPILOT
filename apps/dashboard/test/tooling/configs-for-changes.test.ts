// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE PER-CHANGE MUTATION GATE'S SELECTOR (`scripts/mutation/configs-for-changes.mjs`).
 *
 * Runs the real script against explicit file lists. The two rules pinned
 * below both come from one incident: the dependabot group PR that moved
 * vitest 4→5 (2026-09-18) changed only package.json and the lockfile, so
 * the selector chose nothing, the PR's mutation check passed vacuously, and
 * the next nightly sweep reported every mutant in all 103 configs alive —
 * the runner's mutant activation never reached a vitest 5 worker. A
 * toolchain change must run a canary, and a changed mutation config must
 * run itself.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

interface Selection {
  readonly selected: readonly { readonly config: string; readonly files: readonly string[] }[];
  readonly uncovered: readonly string[];
}

/** Runs the selector for `files` and returns its JSON. */
function selectFor(files: readonly string[]): Selection {
  const out = execFileSync(
    process.execPath,
    ['scripts/mutation/configs-for-changes.mjs', '--json', '--files', ...files],
    { cwd: REPO, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return JSON.parse(out) as Selection;
}

const CANARY = 'config/mutation/stryker.dashboard-paths.config.mjs';

describe('configs-for-changes — the toolchain canary', () => {
  it('a dependency bump (package.json + lockfile) runs the canary even though it touches no mutated module', () => {
    const { selected } = selectFor(['package.json', 'pnpm-lock.yaml']);
    expect(selected.map((s) => s.config)).toEqual([CANARY]);
    expect(selected[0]?.files).toEqual(['(toolchain canary)']);
  });

  it('a change to the mutation workflow or the selector itself runs the canary too', () => {
    expect(selectFor(['.github/workflows/mutation-pr.yml']).selected.map((s) => s.config)).toEqual([
      CANARY,
    ]);
    expect(
      selectFor(['scripts/mutation/configs-for-changes.mjs']).selected.map((s) => s.config),
    ).toEqual([CANARY]);
  });

  it('a change that touches neither a mutated module nor the toolchain selects nothing', () => {
    expect(selectFor(['docs/MUTATION-DEBT.md', 'README.md']).selected).toEqual([]);
  });
});

describe('configs-for-changes — a changed mutation config selects itself', () => {
  it('a vitest config under config/mutation selects the Stryker config it belongs to (and the canary, since it is toolchain)', () => {
    const configs = selectFor(['config/mutation/vitest.engine-git.config.ts']).selected.map(
      (s) => s.config,
    );
    expect(configs).toContain('config/mutation/stryker.engine-git.config.mjs');
    expect(configs).toContain(CANARY);
  });

  it('a Stryker config selects itself exactly once, even when it IS the canary', () => {
    const configs = selectFor([CANARY]).selected.map((s) => s.config);
    expect(configs).toEqual([CANARY]);
  });
});

describe('configs-for-changes — the module match is unchanged', () => {
  it('a mutated source file still selects its own config, and a source file with no config is reported uncovered', () => {
    const { selected, uncovered } = selectFor([
      'apps/dashboard/src/paths.ts',
      'apps/dashboard/src/server/main.ts',
    ]);
    expect(selected.map((s) => s.config)).toEqual([CANARY]);
    expect(selected[0]?.files).toEqual(['apps/dashboard/src/paths.ts']);
    expect(uncovered).toEqual(['apps/dashboard/src/server/main.ts']);
  });
});
