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

  // A `fly.ts` edit selected zero tests at the per-firing gate (2026-09-30):
  // five suites pin its wiring by reading its SOURCE TEXT, and a source read
  // imports nothing, so `vitest --changed` never sees the dependency.
  it('spots a test that reads a workspace source file as text', () => {
    for (const source of [
      "readFileSync(new URL('../../src/fly.ts', import.meta.url), 'utf8');",
      'readFileSync(fileURLToPath(new URL("../src/prompt.ts", import.meta.url)), \'utf8\');',
      'const s = readFileSync(new URL(`../../../../packages/engine/src/guard.ts`, import.meta.url));',
      // a census that scans a whole source folder
      "readdirSync(fileURLToPath(new URL('../../src/', import.meta.url)));",
      [
        'const flySource = readFileSync(',
        '  fileURLToPath(',
        '    new URL(',
        "      '../../src/fly.ts',",
        '      import.meta.url,',
        '    ),',
        '  ),',
        "  'utf8',",
        ');',
      ].join('\n'),
    ]) {
      expect(isRepoReadingTest(source), source).toBe(true);
    }
  });

  it('leaves a test alone whose only source mention is an import or a non-src URL', () => {
    for (const source of [
      "import { x } from '../../src/fly.js'; readFileSync(join(dir, 'a.txt'));",
      "readFileSync(new URL('./fixtures/src.json', import.meta.url));",
      // the test's own folder, not the workspace source above it
      "readFileSync(new URL('./src/fixture.ts', import.meta.url));",
      "readFileSync(new URL('../fixtures/src/a.ts', someOtherBase));",
      "const u = new URL('../../src/fly.ts', import.meta.url); // no filesystem read",
    ]) {
      expect(isRepoReadingTest(source), source).toBe(false);
    }
  });

  // Under jsdom, import.meta.url is an http: URL, not file:, so a suite that
  // needs the DOM resolves a workspace source read from process.cwd()
  // instead. main.ts's two repo-binding guards and the icon-system emoji
  // census rode along on no change to the file they pin (2026-10-04).
  it('spots a workspace source read resolved from process.cwd(), not import.meta.url', () => {
    for (const source of [
      "readFileSync(join(process.cwd(), 'apps/dashboard/src/server/main.ts'), 'utf8');",
      // a census that scans a whole source folder, read as text by cwd
      "readdirSync(join(process.cwd(), 'apps/dashboard/src/web'));",
      [
        'const MAIN = readFileSync(',
        "  join(process.cwd(), 'apps/dashboard/src/server/main.ts'),",
        "  'utf8',",
        ');',
      ].join('\n'),
    ]) {
      expect(isRepoReadingTest(source), source).toBe(true);
    }
  });

  it('leaves a test alone whose cwd-joined path is not under a src/ folder', () => {
    for (const source of [
      "readFileSync(join(process.cwd(), 'node_modules/fake/pkg.json'));",
      'readFileSync(join(process.cwd(), path));',
      "const dir = process.cwd(); readFileSync(join(dir, 'tmp/output.json'));",
    ]) {
      expect(isRepoReadingTest(source), source).toBe(false);
    }
  });

  it('never splices the text around a removed config argv into a path', () => {
    // A slash before the argv and a folder name right after it must not
    // meet once the argv is gone.
    expect(isRepoReadingTest("readFileSync(p); const s = `/['config'docs/`;")).toBe(false);
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
    // the five fly.ts source-text suites a fly.ts edit never selected (2026-09-30)
    for (const flyCensus of [
      'lane-head',
      'lane-freshness',
      'strand-tasks',
      'merged-head-gating',
      'social-flight-pass',
    ]) {
      expect(files).toContain(`apps/dashboard/test/flight/${flyCensus}.test.ts`);
    }
    // the cwd-joined source-text suites a main.ts/web edit never selected (2026-10-04)
    expect(files).toContain('apps/dashboard/test/flight/mirror-pass-preview-repo-gate.test.ts');
    expect(files).toContain('apps/dashboard/test/flight/issue-triage-repo-unbound.test.ts');
    expect(files).toContain('apps/dashboard/test/web/icon-system-emoji-census.test.ts');
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

  it('copes with a package that has no test folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'ap-census-notest-'));
    try {
      mkdirSync(join(root, 'packages', 'bare'), { recursive: true });
      expect(censusTestFiles(root)).toEqual([...ALWAYS].sort());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
