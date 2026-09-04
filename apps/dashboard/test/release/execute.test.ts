// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { rmSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { createReleaseExecuteApi } from '../../src/release/execute.js';
import type { CommandResult } from '../../src/github/execute.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(repo: string): void {
  gitSync(repo, ['init', '-q']);
  gitSync(repo, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(repo, ['config', 'user.name', 'Test']);
  gitSync(repo, ['config', 'commit.gpgsign', 'false']);
}

function project(s: Store, id: string, rootPath: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, rootPath, 100, 100);
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

const CHANGELOG = ['# Changelog', '', '## [Unreleased]', '', ''].join('\n');

/** The maturity verdict every v1.1.0 release in these tests detects —
 *  >= 1.0.0, no pre-release suffix (release/maturity.ts). */
const STABLE_MATURITY = {
  phase: 'stable',
  prerelease: false,
  source: 'stable-version',
  reasoning: '>= 1.0.0 with no pre-release suffix — a stable release',
} as const;

/** A tagged repo (v1.0.0) with `package.json`/`CHANGELOG.md` committed. */
function setupTaggedRepo(repo: string): void {
  initRepo(repo);
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2) + '\n',
  );
  writeFileSync(join(repo, 'CHANGELOG.md'), CHANGELOG);
  gitSync(repo, ['add', '-A']);
  gitSync(repo, ['commit', '-q', '-m', 'chore: init']);
  gitSync(repo, ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0']);
}

/** A tagged ZERO-MAJOR repo (v0.21.0) — SemVer §4 initial-development
 *  territory, where the maturity intelligence must publish `--prerelease`. */
function setupZeroMajorRepo(repo: string): void {
  initRepo(repo);
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({ name: 'x', version: '0.21.0' }, null, 2) + '\n',
  );
  writeFileSync(join(repo, 'CHANGELOG.md'), CHANGELOG);
  gitSync(repo, ['add', '-A']);
  gitSync(repo, ['commit', '-q', '-m', 'chore: init']);
  gitSync(repo, ['tag', '-a', 'v0.21.0', '-m', 'v0.21.0']);
}

describe('createReleaseExecuteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-unknown-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      const api = createReleaseExecuteApi(dbPath);
      expect(await api('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('refuses with reason "no-op" when there is no prior release tag', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-notag-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
      writeFileSync(join(repo, 'CHANGELOG.md'), CHANGELOG);
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'chore: init']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1');
      expect(result).toEqual({
        ok: false,
        reason: 'no-op',
        details: 'no prior release tag to diff commits against',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('refuses with reason "no-op" and touches no files when nothing since the tag is release-worthy', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-noop-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      setupTaggedRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'x');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'docs: fix a typo']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1');
      expect(result).toEqual({
        ok: false,
        reason: 'no-op',
        details: 'no release-worthy commits since the last release',
      });
      const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
        version: string;
      };
      expect(pkg.version).toBe('1.0.0');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('bumps the version, cuts the changelog, commits, and tags on a release-worthy commit set', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-green-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      setupTaggedRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'x');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1');
      expect(result).toEqual({
        ok: true,
        reason: 'released',
        details: 'released v1.1.0 (minor)',
        version: '1.1.0',
        bump: 'minor',
        attestation: { ok: true, details: "attached a note to 'HEAD'" },
      });

      const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
        version: string;
      };
      expect(pkg.version).toBe('1.1.0');
      const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');
      expect(changelog).toContain('## [1.1.0]');

      const tags = gitSync(repo, ['tag', '-l']);
      expect(tags.split('\n')).toContain('v1.1.0');
      const lastSubject = gitSync(repo, ['log', '-1', '--format=%s']);
      expect(lastSubject).toBe('chore(release): v1.1.0');
      const trailer = gitSync(repo, ['log', '-1', '--format=%b']);
      expect(trailer).toContain('Signed-off-by:');
      const note = gitSync(repo, ['notes', 'show', 'HEAD']);
      expect(note).toContain('Release v1.1.0 (minor)');
      expect(note).toContain('feat: a new capability');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('bumps the top-level version even when a "scripts.version" key appears earlier in the file', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-scripts-version-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      initRepo(repo);
      writeFileSync(
        join(repo, 'package.json'),
        JSON.stringify({ name: 'x', scripts: { version: 'echo hi' }, version: '1.0.0' }, null, 2) +
          '\n',
      );
      writeFileSync(join(repo, 'CHANGELOG.md'), CHANGELOG);
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'chore: init']);
      gitSync(repo, ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0']);
      writeFileSync(join(repo, 'a.txt'), 'x');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(true);

      const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
        version: string;
        scripts: { version: string };
      };
      expect(pkg.version).toBe('1.1.0');
      expect(pkg.scripts.version).toBe('echo hi');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('tags a caller-supplied milestone at the same commit as the version tag', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-milestone-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      setupTaggedRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'x');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1', 'm4');
      expect(result?.ok).toBe(true);
      expect(result?.milestoneTag).toEqual({
        ok: true,
        details: "created annotated tag 'm4' at HEAD",
      });

      const tags = gitSync(repo, ['tag', '-l']);
      expect(tags.split('\n')).toContain('v1.1.0');
      expect(tags.split('\n')).toContain('m4');
      const vTagSha = gitSync(repo, ['rev-list', '-n1', 'v1.1.0']);
      const mTagSha = gitSync(repo, ['rev-list', '-n1', 'm4']);
      expect(mTagSha).toBe(vTagSha);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('rejects a malformed milestone tag before touching the repo', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-badmilestone-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      setupTaggedRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'x');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      await expect(createReleaseExecuteApi(dbPath)('p1', 'milestone-4')).rejects.toThrow();

      const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
        version: string;
      };
      expect(pkg.version).toBe('1.0.0');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('preserves package.json formatting outside the bumped version field', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-fmt-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      initRepo(repo);
      writeFileSync(
        join(repo, 'package.json'),
        '{\n  "name": "x",\n  "version": "1.0.0",\n  "private": true\n}\n',
      );
      writeFileSync(join(repo, 'CHANGELOG.md'), CHANGELOG);
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'chore: init']);
      gitSync(repo, ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0']);
      writeFileSync(join(repo, 'a.txt'), 'x');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'fix: a bug']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(true);
      expect(result?.version).toBe('1.0.1');

      const pkgRaw = readFileSync(join(repo, 'package.json'), 'utf8');
      expect(pkgRaw).toBe('{\n  "name": "x",\n  "version": "1.0.1",\n  "private": true\n}\n');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('also bumps apps/dashboard/src/info.ts PRODUCT_VERSION when present in the project tree (2026-08-24 drift incident, board web-mtcq72zo-1zqazq)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-info-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      setupTaggedRepo(repo);
      const infoDir = join(repo, 'apps', 'dashboard', 'src');
      mkdirSync(infoDir, { recursive: true });
      const infoPath = join(infoDir, 'info.ts');
      writeFileSync(
        infoPath,
        [
          "export const DASHBOARD_VERSION = '0.1.0';",
          '',
          "export const PRODUCT_VERSION = '1.0.0';",
          '',
        ].join('\n'),
      );
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(true);
      expect(result?.version).toBe('1.1.0');

      const infoRaw = readFileSync(infoPath, 'utf8');
      expect(infoRaw).toContain("export const PRODUCT_VERSION = '1.1.0';");
      expect(infoRaw).toContain("export const DASHBOARD_VERSION = '0.1.0';");
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('leaves other files untouched when the project tree has no apps/dashboard/src/info.ts', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-noinfo-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      setupTaggedRepo(repo);
      writeFileSync(join(repo, 'a.txt'), 'x');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(true);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('refuses with reason "no-op" when package.json has no string version', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-noversion-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
    try {
      initRepo(repo);
      writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x' }));
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'chore: init']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo);
      s.close();

      const result = await createReleaseExecuteApi(dbPath)('p1');
      expect(result).toEqual({
        ok: false,
        reason: 'no-op',
        details: 'package.json has no string "version"',
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  describe('citation refresh (board web-mtmrh0mv-161chu)', () => {
    /** A minimal stand-in for `scripts/citation/generate-citation.mjs` — the
     *  real script's exact behavior is covered by
     *  `apps/dashboard/test/tooling/generate-citation.test.ts`; this only
     *  needs SOME file present at that path so `createReleaseExecuteApi` can
     *  detect it and invoke it through the injected `runCommand`. */
    function withCitationScript(repo: string): void {
      mkdirSync(join(repo, 'scripts', 'citation'), { recursive: true });
      writeFileSync(join(repo, 'scripts', 'citation', 'generate-citation.mjs'), '// stub\n');
    }

    it('runs the citation script and folds its writes into the SAME release commit', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-citation-ok-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupTaggedRepo(repo);
        withCitationScript(repo);
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'chore: add citation stub']);
        gitSync(repo, ['tag', '-a', 'v1.0.0', '-f', '-m', 'v1.0.0']);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
        const result = await createReleaseExecuteApi(dbPath, async (command, args, cwd) => {
          calls.push({ command, args, cwd });
          // Simulate the real script writing a citation artifact — proves the
          // write happens BEFORE `commitAll`, so it lands in the same commit.
          writeFileSync(join(repo, 'CITATION.cff'), 'version: 1.1.0\n');
          return { exitCode: 0, stdout: '', stderr: '' };
        })('p1');

        expect(result?.ok).toBe(true);
        expect(calls).toEqual([
          { command: 'node', args: ['scripts/citation/generate-citation.mjs'], cwd: repo },
        ]);

        // One release commit, and it carries BOTH the version bump AND the
        // citation write — never a separate follow-up commit.
        const log = gitSync(repo, ['log', '--format=%s', '-n', '2']);
        expect(log.split('\n')[0]).toBe('chore(release): v1.1.0');
        const committedFiles = gitSync(repo, [
          'show',
          '--stat',
          '--format=',
          'HEAD',
        ]);
        expect(committedFiles).toContain('CITATION.cff');
        expect(committedFiles).toContain('package.json');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('never invokes the citation script for a project that has none', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-citation-absent-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupTaggedRepo(repo);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const calls: Array<{ command: string; args: readonly string[] }> = [];
        const result = await createReleaseExecuteApi(dbPath, async (command, args) => {
          calls.push({ command, args });
          throw new Error('runCommand must not be called when there is no citation script');
        })('p1');

        expect(result?.ok).toBe(true);
        expect(calls).toEqual([]);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('fails the release before any commit when the citation script exits non-zero', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-citation-fail-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupTaggedRepo(repo);
        withCitationScript(repo);
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'chore: add citation stub']);
        gitSync(repo, ['tag', '-a', 'v1.0.0', '-f', '-m', 'v1.0.0']);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const beforeLog = gitSync(repo, ['log', '--format=%H']);

        await expect(
          createReleaseExecuteApi(dbPath, async () => ({
            exitCode: 1,
            stdout: '',
            stderr: 'generate-citation: no CHANGELOG.md release heading found',
          }))('p1'),
        ).rejects.toThrow(/citation:update failed/);

        const afterLog = gitSync(repo, ['log', '--format=%H']);
        expect(afterLog).toBe(beforeLog);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });
  });

  describe('ghRelease (epic 0006 slice 3, board web-mss4lpwl-z0w495)', () => {
    it('refuses the GitHub Release leg with a non-fatal note when the project has no remote', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-ghr-noremote-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupTaggedRepo(repo);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const calls: Array<{ command: string; args: readonly string[] }> = [];
        const result = await createReleaseExecuteApi(dbPath, async (command, args) => {
          calls.push({ command, args });
          throw new Error('runCommand must not be called when there is no remote');
        })('p1', undefined, true);

        expect(result?.ok).toBe(true);
        expect(result?.ghRelease).toEqual({
          ok: false,
          details: 'no GitHub remote configured — sync this project to GitHub first',
          maturity: STABLE_MATURITY,
        });
        expect(calls).toEqual([]);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('pushes the new tag and runs "gh release create" when a remote exists', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-ghr-ok-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupTaggedRepo(repo);
        gitSync(repo, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
        const result = await createReleaseExecuteApi(dbPath, async (command, args, cwd) => {
          calls.push({ command, args, cwd });
          const ok: CommandResult =
            command === 'gh'
              ? { exitCode: 0, stdout: 'https://github.com/x/x/releases/tag/v1.1.0', stderr: '' }
              : { exitCode: 0, stdout: '', stderr: '' };
          return ok;
        })('p1', undefined, true);

        expect(result?.ok).toBe(true);
        expect(result?.ghRelease).toEqual({
          ok: true,
          details:
            'https://github.com/x/x/releases/tag/v1.1.0 (stable: >= 1.0.0 with no pre-release suffix — a stable release)',
          maturity: STABLE_MATURITY,
        });
        expect(calls).toEqual([
          { command: 'git', args: ['push', 'origin', 'v1.1.0'], cwd: repo },
          {
            command: 'gh',
            args: [
              'release',
              'create',
              'v1.1.0',
              '--verify-tag',
              '--notes-from-tag',
              '--title',
              // The project's display name leads the title; stable drops the
              // phase suffix (the bare-"v0.22.0" placeholder-title lesson).
              'p1 v1.1.0',
            ],
            cwd: repo,
          },
        ]);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('reports a non-fatal ghRelease failure when the tag push fails, and never calls gh', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-ghr-pushfail-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupTaggedRepo(repo);
        gitSync(repo, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const calls: string[] = [];
        const result = await createReleaseExecuteApi(dbPath, async (command) => {
          calls.push(command);
          const fail: CommandResult = { exitCode: 1, stdout: '', stderr: 'auth failed' };
          return fail;
        })('p1', undefined, true);

        expect(result?.ok).toBe(true);
        expect(result?.ghRelease).toEqual({
          ok: false,
          details: 'auth failed',
          maturity: STABLE_MATURITY,
        });
        expect(calls).toEqual(['git']);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('keeps the release itself ok when only "gh release create" fails', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-ghr-ghfail-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupTaggedRepo(repo);
        gitSync(repo, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const result = await createReleaseExecuteApi(dbPath, async (command) => {
          const outcome: CommandResult =
            command === 'gh'
              ? { exitCode: 1, stdout: '', stderr: 'release already exists' }
              : { exitCode: 0, stdout: '', stderr: '' };
          return outcome;
        })('p1', undefined, true);

        expect(result?.ok).toBe(true);
        expect(result?.reason).toBe('released');
        expect(result?.ghRelease).toEqual({
          ok: false,
          details: 'release already exists',
          maturity: STABLE_MATURITY,
        });
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('publishes a 0.x release with --prerelease so GitHub never crowns an alpha "Latest"', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-ghr-alpha-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupZeroMajorRepo(repo);
        gitSync(repo, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const calls: Array<{ command: string; args: readonly string[] }> = [];
        const result = await createReleaseExecuteApi(dbPath, async (command, args) => {
          calls.push({ command, args });
          const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
          return ok;
        })('p1', undefined, true);

        expect(result?.ok).toBe(true);
        expect(result?.ghRelease?.maturity).toEqual({
          phase: 'alpha',
          prerelease: true,
          source: 'zero-major',
          reasoning:
            'major version zero — SemVer 2.0.0 §4: initial development, anything may change; published as a pre-release, never "Latest"',
        });
        const ghCall = calls.find((c) => c.command === 'gh');
        expect(ghCall?.args).toContain('--prerelease');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('honors an operator maturity override — "stable" on a 0.x drops --prerelease', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-ghr-override-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupZeroMajorRepo(repo);
        gitSync(repo, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const calls: Array<{ command: string; args: readonly string[] }> = [];
        const result = await createReleaseExecuteApi(dbPath, async (command, args) => {
          calls.push({ command, args });
          const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
          return ok;
        })('p1', undefined, true, 'stable');

        expect(result?.ghRelease?.maturity).toEqual({
          phase: 'stable',
          prerelease: false,
          source: 'override',
          reasoning: 'operator override: stable',
        });
        const ghCall = calls.find((c) => c.command === 'gh');
        expect(ghCall?.args).not.toContain('--prerelease');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('never attaches a ghRelease field when ghRelease is not requested', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-rel-ghr-off-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-rel-db-'));
      try {
        setupTaggedRepo(repo);
        gitSync(repo, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
        writeFileSync(join(repo, 'a.txt'), 'x');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'feat: a new capability']);

        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo);
        s.close();

        const result = await createReleaseExecuteApi(dbPath, async () => {
          throw new Error('runCommand must not be called when ghRelease was not requested');
        })('p1');

        expect(result?.ok).toBe(true);
        expect(result?.ghRelease).toBeUndefined();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });
  });
});
