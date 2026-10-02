// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for scripts/e2e/adopt-visual-actuals.mjs, which copies the PNGs a
 * CI run rendered over the committed Playwright baselines.
 *
 * The script's own header promises that when a test was retried "the last
 * wins, which is the one CI finally reported". It did not: the actuals were
 * ordered by a plain string sort of their paths, and `-` sorts before both
 * `/` and `\`, so `…-chromium-retry1/x-actual.png` came BEFORE
 * `…-chromium/x-actual.png`. The first attempt was copied last and won. A
 * flaky render that CI retried therefore adopted the attempt CI threw away.
 *
 * The CLI tests run the real script end to end on a throwaway tree, so they
 * also prove the entry-point guard still fires when the file is run
 * directly. The `attemptOf` import is what puts the script in this test's
 * import graph, so `vitest --changed` selects it when the script changes.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attemptOf } from '../../../../scripts/e2e/adopt-visual-actuals.mjs';

const SCRIPT = fileURLToPath(
  new URL('../../../../scripts/e2e/adopt-visual-actuals.mjs', import.meta.url),
);

const SNAPSHOTS = 'apps/dashboard/e2e/visual.spec.ts-snapshots';

let work: string;
let repo: string;
let actuals: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'adopt-visual-'));
  repo = join(work, 'repo');
  actuals = join(work, 'actuals');
  mkdirSync(join(repo, SNAPSHOTS), { recursive: true });
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function baseline(name: string, body: string): string {
  const file = join(repo, SNAPSHOTS, name);
  writeFileSync(file, body);
  return file;
}

function actual(dir: string, stem: string, body: string): void {
  mkdirSync(join(actuals, dir), { recursive: true });
  writeFileSync(join(actuals, dir, `${stem}-actual.png`), body);
}

function runCli(): string {
  return execFileSync(process.execPath, [SCRIPT, actuals, repo], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

describe('attemptOf', () => {
  it('reads the first attempt as 0 and -retryN as N, on either separator', () => {
    expect(attemptOf('test-results/visual-fleet-dark-chromium')).toBe(0);
    expect(attemptOf('test-results/visual-fleet-dark-chromium-retry2')).toBe(2);
    expect(attemptOf('test-results\\visual-fleet-dark-chromium-retry10')).toBe(10);
  });

  it('reads only the last path segment', () => {
    expect(attemptOf('run-retry3/visual-fleet-dark-chromium')).toBe(0);
  });
});

describe('adopt-visual-actuals CLI', () => {
  it("adopts the final retry's render, not the first attempt's", () => {
    const target = baseline('fleet-dark-chromium-win32.png', 'committed');
    actual('visual-fleet-dark-chromium', 'fleet-dark', 'attempt 0');
    actual('visual-fleet-dark-chromium-retry1', 'fleet-dark', 'attempt 1');
    actual('visual-fleet-dark-chromium-retry2', 'fleet-dark', 'attempt 2');

    const out = runCli();

    expect(readFileSync(target, 'utf8')).toBe('attempt 2');
    expect(out).toContain('1 baseline(s) adopted from 3 actual(s)');
  });

  it('orders retries by number, so retry10 beats retry2', () => {
    const target = baseline('fleet-dark-chromium-win32.png', 'committed');
    actual('visual-fleet-dark-chromium-retry2', 'fleet-dark', 'attempt 2');
    actual('visual-fleet-dark-chromium-retry10', 'fleet-dark', 'attempt 10');

    runCli();

    expect(readFileSync(target, 'utf8')).toBe('attempt 10');
  });

  it('picks the longest committed project the directory ends with', () => {
    // `-landscape` suffix-matches the directory too; `tablet-landscape` is the
    // real project (the 2026-09-17 bug took the last hyphen segment instead).
    const tablet = baseline('home-tablet-landscape-win32.png', 'committed tablet');
    const shorter = baseline('home-landscape-win32.png', 'committed landscape');
    actual('visual-home-tablet-landscape', 'home', 'tablet render');

    runCli();

    expect(readFileSync(tablet, 'utf8')).toBe('tablet render');
    expect(readFileSync(shorter, 'utf8')).toBe('committed landscape');
  });

  it('keeps the project segment, so a chromium render never overwrites the projectless twin', () => {
    const chromium = baseline('project-populated-dark-chromium-win32.png', 'committed chromium');
    const twin = baseline('project-populated-dark-win32.png', 'committed twin');
    actual('visual-project-populated-dark-chromium', 'project-populated-dark', 'chromium render');

    runCli();

    expect(readFileSync(chromium, 'utf8')).toBe('chromium render');
    expect(readFileSync(twin, 'utf8')).toBe('committed twin');
  });

  it('leaves an unmatched actual alone and exits non-zero', () => {
    const target = baseline('fleet-dark-chromium-win32.png', 'committed');
    actual('visual-orphan-firefox', 'orphan', 'stray render');

    let status = 0;
    let stdout = '';
    try {
      runCli();
    } catch (error) {
      ({ status, stdout } = error as { status: number; stdout: string });
    }

    expect(status).toBe(1);
    expect(stdout).toContain('UNMATCHED (left alone):');
    expect(stdout).toContain('orphan [dir visual-orphan-firefox] -> no committed baseline');
    expect(readFileSync(target, 'utf8')).toBe('committed');
  });
});
