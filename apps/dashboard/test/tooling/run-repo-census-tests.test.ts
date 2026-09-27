// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE TESTS THE IMPORT GRAPH CANNOT SEE (2026-09-25): a test that reads the
 * repository by path is never selected by `vitest --changed`, so every
 * per-firing gate runs all of them, discovered by what they read.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ALWAYS,
  censusTestFiles,
  isRepoReadingTest,
} from '../../../../scripts/ci/run-repo-census-tests.mjs';

describe('isRepoReadingTest', () => {
  it('spots a test that reads or lists the repository by path', () => {
    for (const source of [
      "const README = readFileSync(join(ROOT, 'README.md'), 'utf8');",
      "readFileSync(resolve(root, 'CHANGELOG.md'))",
      "readdirSync(join(ROOT, 'config/mutation'))",
      "readdirSync(join(root, 'docs'))",
      "existsSync(join(ROOT, '.github', 'workflows', 'ci.yml'))",
      'readFileSync(`${ROOT}/docs/RUNBOOK.md`)',
      "execFileSync('git', ['ls-files', '-z']); readFileSync(join(REPO_ROOT, file))",
      "existsSync(join(ROOT, 'config', 'stryker.conf.json'))",
      // a real-git suite that ALSO reads the repository still counts
      "gitSync(dir, ['config', 'user.name', 'T']); readdirSync(join(ROOT, 'config/mutation'))",
    ]) {
      expect(isRepoReadingTest(source), source).toBe(true);
    }
  });

  it('leaves a test alone that reads only its own fixtures', () => {
    for (const source of [
      "readFileSync(join(dir, 'db.sqlite'))",
      "import { x } from '../../src/read/fleet-report.js';",
      '// mentions README in a comment only',
    ]) {
      expect(isRepoReadingTest(source), source).toBe(false);
    }
  });

  // Firing 535's gate crashed on real-git suites that timed out under fleet
  // load. They rode every per-firing gate only because their repo setup runs
  // `git config`, whose argv `['config', …]` read as the repository's config/.
  it('reads git config argv as a git subcommand, not the config/ directory', () => {
    for (const source of [
      [
        "gitSync(dir, ['config', 'user.email', 't@example.com']);",
        "gitSync(dir, ['config', 'user.name', 'T']);",
        "gitSync(dir, ['config', 'commit.gpgsign', 'false']);",
        "writeFileSync(join(dir, 'a.txt'), 'a'); readFileSync(join(dir, 'a.txt'));",
      ].join('\n'),
      'execFileSync(\'git\', ["config", "core.autocrlf", "false"]); existsSync(dir);',
      "git([\n  'config',\n  'rerere.enabled',\n  'true',\n]);\nreaddirSync(dir);",
    ]) {
      expect(isRepoReadingTest(source), source).toBe(false);
    }
  });
});

describe('censusTestFiles', () => {
  it('finds the README count test that four convergence reds proved invisible to --changed', () => {
    const files = censusTestFiles();
    expect(files).toContain('apps/dashboard/test/flight/ci-workflow-gate.test.ts');
    // the whole-repository windowsHide census (2026-09-26)
    expect(files).toContain('apps/dashboard/test/flight/spawn-windows-hide.test.ts');
    for (const always of ALWAYS) expect(files).toContain(always);
    // the real-git suite that timed out in firing 535's gate reads no repo path
    expect(files).not.toContain('packages/onboarding/test/backup/ritual.test.ts');
    expect([...files].sort()).toEqual(files);
    expect(new Set(files).size).toBe(files.length);
  });

  it('walks every package test tree, nested folders included, and skips node_modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'ap-census-'));
    try {
      const write = (rel: string, body: string): void => {
        mkdirSync(join(root, rel, '..'), { recursive: true });
        writeFileSync(join(root, rel), body);
      };
      write('apps/a/test/deep/reads.test.ts', "readFileSync(join(ROOT, 'README.md'))");
      write('packages/b/test/plain.test.ts', "import { x } from '../src/x.js';");
      write('packages/b/test/node_modules/dep/reads.test.ts', "readFileSync('README.md')");
      write('packages/b/test/reads.spec.ts', "readFileSync('README.md')");
      // Proves the 'packages' root actually contributes (not just 'apps'):
      // without it, a config bug that dropped 'packages' from the scanned
      // roots would pass every assertion above unnoticed.
      write('packages/b/test/reads.test.ts', "readFileSync(join(ROOT, 'config'))");
      // Proves only the package's test/ subtree is scanned, not the package
      // root: without it, a config bug that scanned 'apps/a' instead of
      // 'apps/a/test' would still find every fixture above by walking one
      // level higher and hitting the same test/ folder on the way down.
      write('apps/a/other.test.ts', "readFileSync(join(ROOT, 'README.md'))");
      expect(censusTestFiles(root)).toEqual(
        [...ALWAYS, 'apps/a/test/deep/reads.test.ts', 'packages/b/test/reads.test.ts'].sort(),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('copes with a root that has no apps or packages at all', () => {
    const root = mkdtempSync(join(tmpdir(), 'ap-census-empty-'));
    try {
      expect(censusTestFiles(root)).toEqual([...ALWAYS].sort());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
