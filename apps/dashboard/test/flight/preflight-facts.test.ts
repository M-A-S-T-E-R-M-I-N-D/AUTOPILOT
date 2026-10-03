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
  codexLoginStatus,
  defaultEngineCliProbe,
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
  // A codex or gemini lane's own gate runs these tests with AUTOPILOT_ENGINE
  // set: no test may ask a real CLI.
  const noCli = {
    cliVersion: () => null,
    engineCli: () => ({ found: false, version: null }),
    codexLogin: () => null,
    freeBytes: () => 7,
  };

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
      engine: { kind: 'claude' },
      authDescription: 'API key',
      caps: { wallClockMin: 60, idleMin: 5 },
      laneCount: 3,
    });
  });

  it('reads AUTOPILOT_ENGINE as the flight does and asks only a codex or gemini lane its CLI', () => {
    const asked: string[] = [];
    const engineCli = (binary: string) => {
      asked.push(binary);
      return { found: true, version: '0.46.0' };
    };
    const claude = gatherPreflightFacts(repo, dbDir, { ...noCli, engineCli, env: {} });
    expect(claude.engine).toEqual({ kind: 'claude' });
    const codex = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      engineCli,
      env: { AUTOPILOT_ENGINE: 'codex', AUTOPILOT_ENGINE_MODEL: 'gpt-5-codex' },
    });
    expect(codex.engine).toEqual({
      kind: 'cli',
      engine: 'codex',
      model: 'gpt-5-codex',
      found: true,
      version: '0.46.0',
    });
    const gemini = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      env: { AUTOPILOT_ENGINE: 'gemini', AUTOPILOT_ENGINE_MODEL: 'gemini-2.5-pro' },
    });
    expect(gemini.engine).toEqual({
      kind: 'cli',
      engine: 'gemini',
      model: 'gemini-2.5-pro',
      found: false,
      version: null,
    });
    expect(asked).toEqual(['codex']);
  });

  it('asks a Codex CLI that answered whether it is signed in, unless CODEX_API_KEY signs `codex exec` in', () => {
    let asked = 0;
    const codexLogin = () => {
      asked += 1;
      return false;
    };
    const engineCli = () => ({ found: true, version: '0.46.0' });
    const codexEnv = { AUTOPILOT_ENGINE: 'codex', AUTOPILOT_ENGINE_MODEL: 'gpt-5-codex' };
    const signedOut = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      engineCli,
      codexLogin,
      env: codexEnv,
    });
    expect(signedOut.engine).toEqual({
      kind: 'cli',
      engine: 'codex',
      model: 'gpt-5-codex',
      found: true,
      version: '0.46.0',
      signedIn: false,
    });
    expect(asked).toBe(1);
    // `codex login status` never reads the key `codex exec` signs in with.
    const keyed = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      engineCli,
      codexLogin,
      env: { ...codexEnv, CODEX_API_KEY: 'placeholder' },
    });
    expect(keyed.engine).not.toHaveProperty('signedIn');
    // A missing CLI, a Gemini lane and a Claude lane are never asked.
    gatherPreflightFacts(repo, dbDir, { ...noCli, codexLogin, env: codexEnv });
    gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      engineCli,
      codexLogin,
      env: { AUTOPILOT_ENGINE: 'gemini', AUTOPILOT_ENGINE_MODEL: 'gemini-2.5-pro' },
    });
    gatherPreflightFacts(repo, dbDir, { ...noCli, engineCli, codexLogin, env: {} });
    expect(asked).toBe(1);
    // A blank key signs nothing in, so the CLI is asked; an answer that says
    // nothing about the login adds nothing.
    let askedUnknown = 0;
    const unknown = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      engineCli,
      codexLogin: () => {
        askedUnknown += 1;
        return null;
      },
      env: { ...codexEnv, CODEX_API_KEY: '  ' },
    });
    expect(askedUnknown).toBe(1);
    expect(unknown.engine).not.toHaveProperty('signedIn');
  });

  it('carries the refusal fly.ts would print for an engine setting it cannot honour', () => {
    const refused = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      env: { AUTOPILOT_ENGINE: 'gemini', AUTOPILOT_ENGINE_MODEL: 'sonnet' },
    });
    expect(refused.engine).toEqual({
      kind: 'refused',
      reason:
        'AUTOPILOT_ENGINE_MODEL=sonnet names a Claude model, which the Gemini CLI cannot run.',
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

describe('defaultEngineCliProbe', () => {
  it('finds a binary that answers --version with its x.y.z, and not one that is missing', () => {
    // node stands in for codex/gemini: both are npm-installed node CLIs.
    expect(defaultEngineCliProbe('node')).toEqual({
      found: true,
      version: process.versions.node,
    });
    expect(defaultEngineCliProbe('autopilot-no-such-engine-cli')).toEqual({
      found: false,
      version: null,
    });
  });
});

describe('codexLoginStatus — what `codex login status` answered', () => {
  it('reads exit 0 as signed in, `Not logged in` on exit 1 as signed out, and anything else as unknown', () => {
    // `run_login_status` (openai/codex codex-rs/cli/src/login.rs) answers on stderr.
    expect(codexLoginStatus(0, 'Logged in using ChatGPT\n')).toBe(true);
    expect(codexLoginStatus(0, '')).toBe(true);
    expect(codexLoginStatus(1, 'Not logged in\n')).toBe(false);
    // Windows writes the line through a console with CRLF.
    expect(codexLoginStatus(1, 'Not logged in\r\n')).toBe(false);
    // Exit 1 also covers a login it could not read, which says nothing either way.
    expect(codexLoginStatus(1, 'Error checking login status: bad config.toml\n')).toBeNull();
    expect(codexLoginStatus(1, '')).toBeNull();
    // A timeout kill, and a status no version of the verb exits with.
    expect(codexLoginStatus(null, 'Not logged in\n')).toBeNull();
    expect(codexLoginStatus(2, 'Not logged in\n')).toBeNull();
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
