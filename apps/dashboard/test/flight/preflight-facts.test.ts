// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  gatherPreflightFacts,
  codexLoginStatus,
  geminiAuthConfigured,
  geminiAuthProbeFor,
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
    geminiAuth: () => null,
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

  it('asks whether a Gemini CLI that answered has an auth method set, and carries only a known answer', () => {
    const asked: NodeJS.ProcessEnv[] = [];
    const geminiAuth = (env: NodeJS.ProcessEnv) => {
      asked.push(env);
      return false;
    };
    const engineCli = () => ({ found: true, version: '0.8.2' });
    const geminiEnv = { AUTOPILOT_ENGINE: 'gemini', AUTOPILOT_ENGINE_MODEL: 'gemini-2.5-pro' };
    const unset = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      engineCli,
      geminiAuth,
      env: geminiEnv,
    });
    expect(unset.engine).toEqual({
      kind: 'cli',
      engine: 'gemini',
      model: 'gemini-2.5-pro',
      found: true,
      version: '0.8.2',
      authConfigured: false,
    });
    // It judges the env the lane's child inherits.
    expect(asked).toEqual([geminiEnv]);
    const unknown = gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      engineCli,
      geminiAuth: () => null,
      env: geminiEnv,
    });
    expect(unknown.engine).not.toHaveProperty('authConfigured');
    // A missing CLI, a Codex lane and a Claude lane are never asked.
    gatherPreflightFacts(repo, dbDir, { ...noCli, geminiAuth, env: geminiEnv });
    gatherPreflightFacts(repo, dbDir, {
      ...noCli,
      engineCli,
      geminiAuth,
      env: { AUTOPILOT_ENGINE: 'codex', AUTOPILOT_ENGINE_MODEL: 'gpt-5-codex' },
    });
    gatherPreflightFacts(repo, dbDir, { ...noCli, engineCli, geminiAuth, env: {} });
    expect(asked).toHaveLength(1);
  });

  it('without an override, finds the auth type selected in the target .gemini/settings.json', () => {
    mkdirSync(join(repo, '.gemini'));
    writeFileSync(
      join(repo, '.gemini', 'settings.json'),
      JSON.stringify({ security: { auth: { selectedType: 'gemini-api-key' } } }),
    );
    const { cliVersion, codexLogin, freeBytes } = noCli;
    const facts = gatherPreflightFacts(repo, dbDir, {
      cliVersion,
      codexLogin,
      freeBytes,
      engineCli: () => ({ found: true, version: '0.8.2' }),
      env: {
        AUTOPILOT_ENGINE: 'gemini',
        AUTOPILOT_ENGINE_MODEL: 'gemini-2.5-pro',
        GEMINI_CLI_HOME: join(scratch, 'home'),
      },
    });
    expect(facts.engine).toMatchObject({ engine: 'gemini', authConfigured: true });
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

describe('geminiAuthConfigured — what validateNonInteractiveAuth would find', () => {
  const none = { settings: [], dotEnvs: [] };

  it('takes an auth type from the env by getAuthTypeFromEnv rules', () => {
    // gemini-cli packages/core/src/core/contentGenerator.ts, getAuthTypeFromEnv.
    const fromEnv = (env: Record<string, string>) => geminiAuthConfigured(env, none);
    expect(fromEnv({ GEMINI_API_KEY: 'placeholder' })).toBe(true);
    expect(fromEnv({ GOOGLE_GENAI_USE_VERTEXAI: 'true' })).toBe(true);
    expect(fromEnv({ GOOGLE_GENAI_USE_GCA: 'true' })).toBe(true);
    expect(fromEnv({ GOOGLE_GEMINI_BASE_URL: 'http://localhost:8080' })).toBe(true);
    expect(fromEnv({ CLOUD_SHELL: 'true' })).toBe(true);
    expect(fromEnv({ GEMINI_CLI_USE_COMPUTE_ADC: 'true' })).toBe(true);
    // The switches are exact `=== 'true'` checks, and an empty key names nothing.
    expect(
      fromEnv({ GOOGLE_GENAI_USE_VERTEXAI: '1', GOOGLE_GENAI_USE_GCA: 'TRUE', GEMINI_API_KEY: '' }),
    ).toBe(false);
    // GOOGLE_API_KEY selects no auth type of its own.
    expect(fromEnv({ GOOGLE_API_KEY: 'placeholder' })).toBe(false);
  });

  it('reads the same variables out of a .env file, quoted, exported or commented', () => {
    const withDotEnv = (text: string) =>
      geminiAuthConfigured({}, { settings: [], dotEnvs: [null, text] });
    expect(withDotEnv('# keys\nexport GEMINI_API_KEY="placeholder" # personal\n')).toBe(true);
    expect(withDotEnv("GOOGLE_GENAI_USE_VERTEXAI='true'\r\n")).toBe(true);
    expect(withDotEnv('GOOGLE_GENAI_USE_GCA=true # sign in with Google\n')).toBe(true);
    expect(
      withDotEnv('GEMINI_API_KEY=\nGOOGLE_GENAI_USE_GCA=false\n# GEMINI_API_KEY=placeholder\n'),
    ).toBe(false);
  });

  it('takes security.auth.selectedType from any settings file, and cannot tell past one it cannot read', () => {
    const withSettings = (...settings: (string | null)[]) =>
      geminiAuthConfigured({}, { settings, dotEnvs: [] });
    expect(withSettings(null, '{"security":{"auth":{"selectedType":"oauth-personal"}}}')).toBe(
      true,
    );
    expect(
      withSettings('{"security":{"auth":{"selectedType":""}}}', '{"ui":{"theme":"Default"}}', '[]'),
    ).toBe(false);
    // gemini-cli strips comments before it parses; a selected type still shows through them.
    expect(
      withSettings(
        '{\n  // signed in once\n  "security": { "auth": { "selectedType": "gemini-api-key" } }\n}',
      ),
    ).toBe(true);
    // One that shows none could still hide one, so the answer is unknown, not "unset".
    expect(withSettings('{"ui":{}}', '{\n  // no auth here\n  "ui": {}\n}')).toBeNull();
    // An auth type found anywhere else still answers.
    expect(
      geminiAuthConfigured(
        { GEMINI_API_KEY: 'placeholder' },
        { settings: ['not json'], dotEnvs: [] },
      ),
    ).toBe(true);
  });
});

describe('geminiAuthProbeFor — where gemini-cli looks for an auth method', () => {
  const target = resolve('/work/repo');
  const home = resolve('/operator-home');

  it('reads the user, workspace and system-defaults settings, each .env from the target up, and the home .env files', () => {
    const read: string[] = [];
    const probe = geminiAuthProbeFor(target, (path) => {
      read.push(path);
      return null;
    });
    const defaults = resolve('/etc/gemini/system-defaults.json');
    expect(probe({ GEMINI_CLI_HOME: home, GEMINI_CLI_SYSTEM_DEFAULTS_PATH: defaults })).toBe(false);
    const root = resolve('/');
    expect(read).toEqual(
      expect.arrayContaining([
        join(home, '.gemini', 'settings.json'),
        join(target, '.gemini', 'settings.json'),
        defaults,
        join(target, '.gemini', '.env'),
        join(target, '.env'),
        join(dirname(target), '.env'),
        join(root, '.env'),
        join(home, '.gemini', '.env'),
        join(home, '.env'),
      ]),
    );
    // No system-defaults path of its own: a lane's system settings are its
    // guard file, so the machine's own system files are never merged.
    read.length = 0;
    probe({ GEMINI_CLI_HOME: home });
    expect(read).not.toContain(defaults);
  });

  it('finds a key in a .env above the target, or a type selected in the user settings', () => {
    const probeWith = (files: Record<string, string>) =>
      geminiAuthProbeFor(target, (p) => files[p] ?? null)({ GEMINI_CLI_HOME: home });
    const keyFile = { [join(dirname(target), '.env')]: 'GEMINI_API_KEY=placeholder\n' };
    expect(probeWith(keyFile)).toBe(true);
    const selected = '{"security":{"auth":{"selectedType":"oauth-personal"}}}';
    expect(probeWith({ [join(home, '.gemini', 'settings.json')]: selected })).toBe(true);
    // An env that names one is answered without reading a file.
    const read: string[] = [];
    const keyed = geminiAuthProbeFor(target, (p) => {
      read.push(p);
      return null;
    })({ GEMINI_CLI_HOME: home, GEMINI_API_KEY: 'placeholder' });
    expect(keyed).toBe(true);
    expect(read).toEqual([]);
  });

  it('reads a file that is there but cannot be read as unknown, never as absent', () => {
    const probe = geminiAuthProbeFor(target, (path) => {
      if (path === join(target, '.env')) throw new Error('EACCES: permission denied');
      return null;
    });
    expect(probe({ GEMINI_CLI_HOME: home })).toBeNull();
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
