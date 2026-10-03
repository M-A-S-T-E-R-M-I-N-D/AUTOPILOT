// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The FACTS `preflight.ts` judges, gathered from the machine: git state of
 * the target and its lane worktrees, the engine lock files, the rescue refs,
 * the build's freshness, free disk, the `claude` binary and, for a lane
 * `AUTOPILOT_ENGINE` routes off Claude, the Codex or Gemini CLI (and whether
 * Codex is signed in, or Gemini has an auth method set). Synchronous on
 * purpose — `FlightRunner.start()` is synchronous and every caller of it
 * (the Fly button, the fleet launcher, the fleet watchdog) gets the same
 * gate — and every probe is injectable so the gatherer itself is testable
 * against a real scratch repository without a real `claude`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  parseLockInfo,
  isProcessAlive,
  parseWorktreeList,
  canonicalWorktreePath,
  describeAuth,
  DEFAULT_CLI_TIMEOUT_MS,
  DEFAULT_CLI_IDLE_TIMEOUT_MS,
} from '@autopilot/engine';
import { cliTimeoutMsFromEnv, cliIdleTimeoutMsFromEnv } from './budget.js';
import { sha256Of } from '../landing/freshness.js';
import { readConnectionConfig } from '../connection/config.js';
import { parseCliVersion } from '../connection/cli-probe.js';
import { firingEngineFromEnv } from './firing-engine.js';
import type { EngineFact, PreflightFacts } from './preflight.js';

/** Runs `git` in `cwd`; null on any failure (not a repo, git missing). */
export type GitRun = (cwd: string, args: readonly string[]) => string | null;

export const defaultGitRun: GitRun = (cwd, args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};

/** The `claude --version` line, or null when the binary is not there. */
export type CliVersionProbe = () => string | null;

let cachedCliVersion: { value: string | null } | null = null;

export const defaultCliVersionProbe: CliVersionProbe = () => {
  // One probe per process: the answer does not change while the dashboard
  // runs, and a second `claude --version` costs a second nobody asked for.
  if (cachedCliVersion !== null) return cachedCliVersion.value;
  let value: string | null;
  try {
    value = execFileSync('claude', ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    value = null;
  }
  cachedCliVersion = { value };
  return value;
};

/** `<binary> --version` for the Codex or Gemini CLI a lane flies on (epic
 *  0036): found when it answered, with the x.y.z it printed. */
export type EngineCliProbe = (binary: string) => {
  readonly found: boolean;
  readonly version: string | null;
};

const answeredEngineClis = new Map<string, { found: true; version: string | null }>();

export const defaultEngineCliProbe: EngineCliProbe = (binary) => {
  // Only an answer is kept: a CLI that was missing is asked again at the
  // next launch, since the operator may have just installed it.
  const answered = answeredEngineClis.get(binary);
  if (answered !== undefined) return answered;
  try {
    const stdout = execFileSync(binary, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      // npm installs both CLIs on Windows as `.cmd` shims, which only a shell
      // launches; `binary` is one of the engine names, never operator text.
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const probe = { found: true as const, version: parseCliVersion(stdout) };
    answeredEngineClis.set(binary, probe);
    return probe;
  } catch {
    return { found: false, version: null };
  }
};

/**
 * What `codex login status` answered (epic 0036, GitHub #21's login
 * detection). `run_login_status` (openai/codex `codex-rs/cli/src/login.rs`,
 * read 2026-10-03) answers on stderr: exit 0 behind `Logged in using …`, and
 * exit 1 either behind `Not logged in`, when no login is stored, or behind
 * `Error checking login status: …`, which says nothing about one. So only
 * that one line reads as signed out; any other answer, or a kill, is unknown.
 */
export function codexLoginStatus(exitCode: number | null, stderr: string): boolean | null {
  if (exitCode === 0) return true;
  if (exitCode !== 1) return null;
  return stderr.split('\n').some((line) => line.trim() === 'Not logged in') ? false : null;
}

/** Whether the Codex CLI is signed in: `codexLoginStatus`'s answer. */
export type CodexLoginProbe = () => boolean | null;

export const defaultCodexLoginProbe: CodexLoginProbe = () => {
  try {
    execFileSync('codex', ['login', 'status'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      // npm's `codex.cmd` shim needs a shell on Windows, as `--version` does.
      shell: process.platform === 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return codexLoginStatus(0, '');
  } catch (err) {
    // A spawn failure carries no status, and a timeout kill a null one.
    const { status, stderr } = err as { status?: number | null; stderr?: unknown };
    return codexLoginStatus(status ?? null, typeof stderr === 'string' ? stderr : '');
  }
};

/** Whether an env names an auth type as gemini-cli's `getAuthTypeFromEnv`
 *  (`packages/core/src/core/contentGenerator.ts`, read 2026-10-03) picks
 *  one: Google login, Vertex AI, a gateway base URL, an API key, or the
 *  machine's own Google credentials. */
function geminiEnvNamesAuth(env: Readonly<Record<string, string | undefined>>): boolean {
  return (
    env['GOOGLE_GENAI_USE_GCA'] === 'true' ||
    env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true' ||
    Boolean(env['GOOGLE_GEMINI_BASE_URL']) ||
    Boolean(env['GEMINI_API_KEY']) ||
    env['CLOUD_SHELL'] === 'true' ||
    env['GEMINI_CLI_USE_COMPUTE_ADC'] === 'true'
  );
}

const DOT_ENV_LINE = /^\s*(?:export\s+)?([\w.-]+)\s*=(.*)$/;
const DOT_ENV_QUOTED = /^(['"`])([\s\S]*?)\1/;

/** A `.env` file's values as dotenv's `parse`, which gemini-cli's
 *  `loadEnvironment` uses, reads them: an optional `export`, a quoted value
 *  whole, an unquoted one up to its first `#`. */
function dotEnvValues(text: string): Record<string, string> {
  const entries: [string, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = DOT_ENV_LINE.exec(line);
    if (match === null) continue;
    const raw = (match[2] ?? '').trim();
    const quoted = DOT_ENV_QUOTED.exec(raw);
    entries.push([match[1] ?? '', quoted ? (quoted[2] ?? '') : (raw.split('#')[0] ?? '').trim()]);
  }
  return Object.fromEntries(entries);
}

function ownField(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

const SELECTED_TYPE_TEXT = /"selectedType"\s*:\s*"[^"\s]/;

/** Whether one settings file selects an auth type
 *  (`security.auth.selectedType`). gemini-cli strips comments before it
 *  parses (`loadSettings`, `packages/cli/src/config/settings.ts`), which
 *  `JSON.parse` cannot: a file it cannot parse that still shows a selected
 *  type selects one, and one that shows none is unknown. */
function geminiSettingsSelectAuth(text: string): boolean | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return SELECTED_TYPE_TEXT.test(text) ? true : null;
  }
  const selected = ownField(ownField(ownField(parsed, 'security'), 'auth'), 'selectedType');
  return typeof selected === 'string' && selected.trim() !== '';
}

/** The files {@link geminiAuthConfigured} reads, as text, null for one that
 *  is not there. */
export interface GeminiAuthFiles {
  /** The settings files gemini-cli merges. */
  readonly settings: readonly (string | null)[];
  /** The `.env` files it may load. */
  readonly dotEnvs: readonly (string | null)[];
}

/**
 * Whether a headless `gemini` run would find an auth method (epic 0036,
 * GitHub #21's login detection). The CLI has no status verb, so this reads
 * where `validateNonInteractiveAuth` (`packages/cli/src/validateNonInterActiveAuth.ts`,
 * read 2026-10-03) looks: the merged settings' `security.auth.selectedType`,
 * else an auth type the env names, a `.env` file's included, since
 * `loadEnvironment` loads one into the env first. With neither the run exits
 * `FATAL_AUTHENTICATION_ERROR` before its first turn. True when any source
 * names one, false when every source was read and none did, and null when a
 * settings file could not be parsed.
 */
export function geminiAuthConfigured(
  env: Readonly<Record<string, string | undefined>>,
  files: GeminiAuthFiles,
): boolean | null {
  if (geminiEnvNamesAuth(env)) return true;
  if (files.dotEnvs.some((text) => text !== null && geminiEnvNamesAuth(dotEnvValues(text)))) {
    return true;
  }
  let unknown = false;
  for (const text of files.settings) {
    if (text === null) continue;
    const selects = geminiSettingsSelectAuth(text);
    if (selects === true) return true;
    if (selects === null) unknown = true;
  }
  return unknown ? null : false;
}

/** Whether the Gemini CLI a lane inherits `env` for has an auth method set:
 *  {@link geminiAuthConfigured}'s answer. */
export type GeminiAuthProbe = (env: NodeJS.ProcessEnv) => boolean | null;

/** A file's text, or null when nothing is there; one that is there but
 *  cannot be read throws. */
export type ReadTextIfPresent = (path: string) => string | null;

const readTextIfPresent: ReadTextIfPresent = (path) =>
  existsSync(path) ? readFileSync(path, 'utf8') : null;

/** `dir` and every folder above it, nearest first. */
function selfAndAncestors(dir: string): string[] {
  const parent = dirname(dir);
  return parent === dir ? [dir] : [dir, ...selfAndAncestors(parent)];
}

/**
 * The {@link GeminiAuthProbe} for a lane flying `target`. It reads the user
 * settings under `GEMINI_CLI_HOME` or the home folder (gemini-cli's own
 * `homedir()`), the target's `.gemini/settings.json`, which a lane's
 * worktree checks out, and `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` when set. The
 * machine's own system settings never merge: a lane's system settings file
 * is its guard file. Every `.env` that `findEnvFile` might load counts, from
 * the target up, then the home folder's. The CLI loads only the first it
 * finds, from the lane's worktree up, so counting each can miss an unset
 * method but never invents one. A file it cannot read answers null.
 */
export function geminiAuthProbeFor(
  target: string,
  readText: ReadTextIfPresent = readTextIfPresent,
): GeminiAuthProbe {
  return (env) => {
    if (geminiEnvNamesAuth(env)) return true;
    const home = env['GEMINI_CLI_HOME'] || homedir();
    const defaults = env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH'];
    const settingsPaths = [
      join(home, '.gemini', 'settings.json'),
      join(target, '.gemini', 'settings.json'),
      ...(defaults ? [defaults] : []),
    ];
    const dotEnvPaths = [
      ...selfAndAncestors(resolve(target)).flatMap((dir) => [
        join(dir, '.gemini', '.env'),
        join(dir, '.env'),
      ]),
      join(home, '.gemini', '.env'),
      join(home, '.env'),
    ];
    try {
      return geminiAuthConfigured(env, {
        settings: settingsPaths.map((path) => readText(path)),
        dotEnvs: dotEnvPaths.map((path) => readText(path)),
      });
    } catch {
      return null;
    }
  };
}

/** What `AUTOPILOT_ENGINE` routes the flight to, read the way `fly.ts` reads
 *  it, so the preflight refuses what the flight itself would. */
export function gatherEngineFact(
  env: NodeJS.ProcessEnv,
  probe: EngineCliProbe,
  codexLogin: CodexLoginProbe,
  geminiAuth: GeminiAuthProbe,
): EngineFact {
  const choice = firingEngineFromEnv(env);
  if (!choice.ok) return { kind: 'refused', reason: choice.reason };
  const { route } = choice;
  if (route.engine === 'claude') return { kind: 'claude' };
  // Each adapter's default binary is its engine's name (`CodexCliModel`,
  // `GeminiCliModel`), and fly.ts names no other.
  const cli = probe(route.engine);
  const fact = { kind: 'cli' as const, engine: route.engine, model: route.model, ...cli };
  if (!cli.found) return fact;
  if (route.engine === 'gemini') {
    const authConfigured = geminiAuth(env);
    return authConfigured === null ? fact : { ...fact, authConfigured };
  }
  // `codex exec` also signs in with a CODEX_API_KEY the lane inherits
  // (`enable_codex_api_key_env`, codex-rs/exec/src/lib.rs), which `codex
  // login status` never reads, so such a key leaves nothing to ask.
  if ((env['CODEX_API_KEY'] ?? '').trim() !== '') return fact;
  const signedIn = codexLogin();
  return signedIn === null ? fact : { ...fact, signedIn };
}

/** The hot path of every firing, relative to the repository root that ships
 *  the dashboard. Freshness is judged by CONTENT, the same way the landing
 *  code is (`landing/freshness.ts`): the build step writes a sha256 of each
 *  of these into {@link FLIGHT_STAMP_FILE}, and a source whose hash no
 *  longer matches has not been built. Modification times cannot do this —
 *  `tsc -b` leaves an output alone when its source's content is unchanged,
 *  and a formatter or a checkout touches sources without changing them. */
export const HOT_SOURCES = [
  'apps/dashboard/src/fly.ts',
  'packages/engine/src/loop.ts',
  'packages/engine/src/firing.ts',
  'packages/engine/src/adapters/claude-cli.ts',
  'packages/engine/src/adapters/worktree.ts',
] as const;

/** Written by `scripts/build/stamp-landing-code.mjs` after `tsc -b`. */
export const FLIGHT_STAMP_FILE = 'apps/dashboard/dist/flight/freshness-stamp.json';

export interface GatherOptions {
  readonly runGit?: GitRun;
  readonly cliVersion?: CliVersionProbe;
  /** Asked only when `AUTOPILOT_ENGINE` routes the flight off Claude. */
  readonly engineCli?: EngineCliProbe;
  /** Asked only of a Codex CLI that answered, with no `CODEX_API_KEY` set. */
  readonly codexLogin?: CodexLoginProbe;
  /** Asked only of a Gemini CLI that answered; reads the files
   *  {@link geminiAuthProbeFor} names for the target when omitted. */
  readonly geminiAuth?: GeminiAuthProbe;
  /** Free bytes on the volume holding `target`; injectable for tests. */
  readonly freeBytes?: (target: string) => number | null;
  /** The repository the dashboard itself runs from (for build freshness);
   *  omitted means "unknown", which reports null rather than guessing. */
  readonly repoRoot?: string;
  /** Overrides the auth description instead of reading `connection.json`
   *  beside the store (`dbDir`) — tests inject this rather than writing a
   *  real config file. */
  readonly authDescription?: string;
  readonly laneCount?: number;
  readonly env?: NodeJS.ProcessEnv;
}

export function defaultFreeBytes(target: string): number | null {
  try {
    const s = statfsSync(target);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

function readStamp(repoRoot: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(repoRoot, FLIGHT_STAMP_FILE), 'utf8'));
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** True when any hot source's content differs from what the last build
 *  stamped (or the stamp has no entry for a source that exists); null
 *  when there is no stamp or no source to compare — a packaged install
 *  without sources, or a checkout never built. */
export function distOlderThanSource(repoRoot: string): boolean | null {
  const stamp = readStamp(repoRoot);
  if (stamp === null) return null;
  let compared = 0;
  for (const source of HOT_SOURCES) {
    let content: Uint8Array;
    try {
      content = readFileSync(join(repoRoot, source));
    } catch {
      continue;
    }
    if (stamp[source] !== sha256Of(content)) return true;
    compared += 1;
  }
  return compared === 0 ? null : false;
}

/** Engine lock files under `dbDir` whose owner process is dead. */
export function staleEngineLocks(dbDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dbDir);
  } catch {
    return [];
  }
  const stale: string[] = [];
  for (const entry of entries) {
    if (!entry.startsWith('engine-') || !entry.endsWith('.lock')) continue;
    let raw: string;
    try {
      raw = readFileSync(join(dbDir, entry), 'utf8');
    } catch {
      continue;
    }
    const info = parseLockInfo(raw);
    if (info !== null && !isProcessAlive(info.pid)) stale.push(entry);
  }
  return stale;
}

function countLines(text: string | null): number {
  if (text === null) return 0;
  return text.split('\n').filter((line) => line.trim() !== '').length;
}

export function gatherPreflightFacts(
  target: string,
  dbDir: string,
  opts: GatherOptions = {},
): PreflightFacts {
  const runGit = opts.runGit ?? defaultGitRun;
  const env = opts.env ?? process.env;

  const status = runGit(target, ['status', '--porcelain']);
  const targetDirty = status === null ? null : countLines(status);

  const name = runGit(target, ['config', 'user.name']);
  const email = runGit(target, ['config', 'user.email']);
  const gitIdentity = {
    name: name !== null && name.trim() !== '' ? name.trim() : null,
    email: email !== null && email.trim() !== '' ? email.trim() : null,
  };

  const dirtyLanes: string[] = [];
  const worktrees = runGit(target, ['worktree', 'list', '--porcelain']);
  if (worktrees !== null) {
    // git echoes each worktree in its OS-canonical spelling (symlinks
    // resolved, Windows 8.3 names expanded); the target arrives as the
    // caller typed it — compare both in canonical form (worktree.ts).
    const main = canonicalWorktreePath(target);
    for (const entry of parseWorktreeList(worktrees)) {
      if (canonicalWorktreePath(entry.path) === main) continue;
      if (!existsSync(entry.path)) continue;
      const laneStatus = runGit(entry.path, ['status', '--porcelain']);
      if (laneStatus !== null && countLines(laneStatus) > 0) dirtyLanes.push(entry.path);
    }
  }

  const parked = runGit(target, ['for-each-ref', 'refs/autopilot/parked']);
  const parkedHeads = countLines(parked);

  const version = (opts.cliVersion ?? defaultCliVersionProbe)();

  return {
    targetDirty,
    gitIdentity,
    freeBytes: (opts.freeBytes ?? defaultFreeBytes)(target),
    distOlderThanSource: opts.repoRoot === undefined ? null : distOlderThanSource(opts.repoRoot),
    staleLocks: staleEngineLocks(dbDir),
    dirtyLanes,
    parkedHeads,
    cli: { found: version !== null, version },
    engine: gatherEngineFact(
      env,
      opts.engineCli ?? defaultEngineCliProbe,
      opts.codexLogin ?? defaultCodexLoginProbe,
      opts.geminiAuth ?? geminiAuthProbeFor(target),
    ),
    // `dbDir` is the same directory main.ts and cli.ts each derive their
    // connection.json path from (dirname(dbPath)) — reading the REAL
    // configured mode here means every caller gets an honest answer without
    // having to thread its own connection config through (BUG: this used to
    // hardcode the subscription description regardless of mode).
    authDescription:
      opts.authDescription ?? describeAuth(readConnectionConfig(join(dbDir, 'connection.json'))),
    caps: {
      wallClockMin: Math.round((cliTimeoutMsFromEnv(env) ?? DEFAULT_CLI_TIMEOUT_MS) / 60_000),
      idleMin: Math.round((cliIdleTimeoutMsFromEnv(env) ?? DEFAULT_CLI_IDLE_TIMEOUT_MS) / 60_000),
    },
    laneCount: opts.laneCount ?? 1,
  };
}
