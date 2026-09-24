// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  gatherPreflightFacts,
  staleEngineLocks,
  distOlderThanSource,
  defaultGitRun,
  HOT_SOURCES,
  FLIGHT_STAMP_FILE,
} from '../../src/flight/preflight-facts.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'pilot@example.test']);
  git(dir, ['config', 'user.name', 'Pilot']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'one');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'feat: first']);
}

describe('gatherPreflightFacts against a real scratch repository', () => {
  let scratch: string;
  let repo: string;
  let dbDir: string;
  const noCli = { cliVersion: () => null, freeBytes: () => 7 };

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'autopilot-preflight-'));
    repo = join(scratch, 'repo');
    dbDir = join(scratch, 'db');
    mkdirSync(repo);
    mkdirSync(dbDir);
    initRepo(repo);
  });

  afterEach(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

  it('reads a clean repository with its identity, no lanes, no parked heads, and the injected probes', () => {
    const facts = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      cliVersion: () => '2.1.273 (Claude Code)',
      authDescription: 'API key',
      laneCount: 3,
      env: { AUTOPILOT_CLI_TIMEOUT_MS: '3600000', AUTOPILOT_CLI_IDLE_TIMEOUT_MS: '300000' },
    });
    expect(facts).toEqual({
      targetDirty: 0,
      gitIdentity: { name: 'Pilot', email: 'pilot@example.test' },
      freeBytes: 7,
      distOlderThanSource: null,
      staleLocks: [],
      dirtyLanes: [],
      parkedHeads: 0,
      cli: { found: true, version: '2.1.273 (Claude Code)' },
      authDescription: 'API key',
      caps: { wallClockMin: 60, idleMin: 5 },
      laneCount: 3,
    });
  });

  it('defaults: caps from the driver, subscription auth, one lane, no CLI when the probe answers null', () => {
    const facts = gatherPreflightFacts(repo, dbDir, { ...noCli, env: {} });
    expect(facts.caps).toEqual({ wallClockMin: 90, idleMin: 20 });
    expect(facts.authDescription).toBe('Claude subscription (Claude Code login)');
    expect(facts.laneCount).toBe(1);
    expect(facts.cli).toEqual({ found: false, version: null });
  });

  it('without an override, reads the REAL configured auth mode from connection.json beside the store', () => {
    writeFileSync(
      join(dbDir, 'connection.json'),
      JSON.stringify({ mode: 'api-key', apiKey: 'sk-ant-fake' }),
    );
    const facts = gatherPreflightFacts(repo, dbDir, noCli);
    // Secret-free: the key value itself never appears in the description.
    expect(facts.authDescription).toBe('Anthropic API key');
  });

  it('an explicit authDescription override still wins over connection.json', () => {
    writeFileSync(
      join(dbDir, 'connection.json'),
      JSON.stringify({ mode: 'api-key', apiKey: 'sk-ant-fake' }),
    );
    const facts = gatherPreflightFacts(repo, dbDir, { ...noCli, authDescription: 'API key' });
    expect(facts.authDescription).toBe('API key');
  });

  it('counts changed and untracked paths, and a blank identity reads as missing', () => {
    writeFileSync(join(repo, 'a.txt'), 'changed');
    writeFileSync(join(repo, 'new.txt'), 'untracked');
    git(repo, ['config', 'user.name', '']);
    const facts = gatherPreflightFacts(repo, dbDir, noCli);
    expect(facts.targetDirty).toBe(2);
    expect(facts.gitIdentity).toEqual({ name: null, email: 'pilot@example.test' });
  });

  it('a directory that is not a repository reads as null dirtiness and no identity', () => {
    const plain = join(scratch, 'plain');
    mkdirSync(plain);
    const facts = gatherPreflightFacts(plain, dbDir, {
      ...noCli,
      runGit: (cwd, args) => (cwd === plain ? null : defaultGitRun(cwd, args)),
    });
    expect(facts.targetDirty).toBeNull();
    expect(facts.gitIdentity).toEqual({ name: null, email: null });
    expect(facts.dirtyLanes).toEqual([]);
    expect(facts.parkedHeads).toBe(0);
  });

  it('names a lane worktree with leftovers, ignores the main checkout and clean lanes, and counts parked heads', () => {
    const laneClean = join(scratch, 'lane-clean');
    const laneDirty = join(scratch, 'lane-dirty');
    git(repo, ['worktree', 'add', '-q', '-b', 'lane-a', laneClean]);
    git(repo, ['worktree', 'add', '-q', '-b', 'lane-b', laneDirty]);
    writeFileSync(join(laneDirty, 'loose.txt'), 'uncommitted');
    git(repo, ['update-ref', 'refs/autopilot/parked/lane-a/abcd1234', 'HEAD']);
    git(repo, ['update-ref', 'refs/autopilot/parked/lane-b/ef012345', 'HEAD']);
    const facts = gatherPreflightFacts(repo, dbDir, noCli);
    // git reports the lane in its OS-canonical spelling (macOS's /private
    // symlink, Windows 8.3 names) — compare canonical forms, as worktree.ts does.
    const canonical = (p: string) => realpathSync.native(p).replace(/\\/g, '/').toLowerCase();
    expect(facts.dirtyLanes).toHaveLength(1);
    expect(canonical(facts.dirtyLanes[0] ?? '')).toBe(canonical(laneDirty));
    expect(facts.targetDirty).toBe(0);
    expect(facts.parkedHeads).toBe(2);
  });
});

describe('staleEngineLocks', () => {
  let dbDir: string;
  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'autopilot-preflight-locks-'));
  });
  afterEach(() => rmSync(dbDir, { recursive: true, force: true }));

  it('lists engine locks whose owner is dead and nothing else', () => {
    writeFileSync(
      join(dbDir, 'engine-fly-x.lock'),
      JSON.stringify({ pid: 2_147_483_646, startedAt: 1 }),
    );
    writeFileSync(
      join(dbDir, 'engine-fly-x--fleet-2.lock'),
      JSON.stringify({ pid: process.pid, startedAt: 1 }),
    );
    writeFileSync(
      join(dbDir, 'gate-semaphore-slot-0.lock'),
      JSON.stringify({ pid: 2_147_483_646, startedAt: 1 }),
    );
    writeFileSync(join(dbDir, 'engine-broken.lock'), 'not json');
    writeFileSync(
      join(dbDir, 'engine-notalock.txt'),
      JSON.stringify({ pid: 2_147_483_646, startedAt: 1 }),
    );
    expect(staleEngineLocks(dbDir)).toEqual(['engine-fly-x.lock']);
  });

  it('is empty for a missing directory', () => {
    expect(staleEngineLocks(join(dbDir, 'nowhere'))).toEqual([]);
  });
});

describe('distOlderThanSource — content hashes against the build stamp', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'autopilot-preflight-build-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function write(rel: string, content: string): void {
    const path = join(root, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  const sha = (content: string) => createHash('sha256').update(content).digest('hex');
  function stamp(entries: Record<string, string>): void {
    write(FLIGHT_STAMP_FILE, JSON.stringify(entries));
  }

  it('is fresh when every present source hashes to its stamp, stale when one differs or is unstamped', () => {
    expect(HOT_SOURCES).toContain('packages/engine/src/adapters/claude-cli.ts');
    expect(FLIGHT_STAMP_FILE).toBe('apps/dashboard/dist/flight/freshness-stamp.json');
    const [fly, loop] = HOT_SOURCES;
    write(fly, 'fly v1');
    write(loop, 'loop v1');
    stamp({ [fly]: sha('fly v1'), [loop]: sha('loop v1') });
    expect(distOlderThanSource(root)).toBe(false);
    // Touching a file without changing it (a formatter, a checkout) stays fresh.
    write(fly, 'fly v1');
    expect(distOlderThanSource(root)).toBe(false);
    // A real edit is stale.
    write(fly, 'fly v2');
    expect(distOlderThanSource(root)).toBe(true);
    // A source the stamp never saw is stale too.
    write(fly, 'fly v1');
    stamp({ [loop]: sha('loop v1') });
    expect(distOlderThanSource(root)).toBe(true);
  });

  it('is null without a stamp, with a malformed one, or with no source to compare', () => {
    expect(distOlderThanSource(root)).toBeNull();
    write(FLIGHT_STAMP_FILE, 'not json');
    write(HOT_SOURCES[0], 'fly v1');
    expect(distOlderThanSource(root)).toBeNull();
    write(FLIGHT_STAMP_FILE, '42');
    expect(distOlderThanSource(root)).toBeNull();
    stamp({ [HOT_SOURCES[0]]: sha('fly v1') });
    rmSync(join(root, HOT_SOURCES[0]));
    expect(distOlderThanSource(root)).toBeNull();
  });
});
