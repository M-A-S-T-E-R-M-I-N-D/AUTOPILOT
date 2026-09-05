// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm dashboard:flight` — actually FLY a demo project so the dashboard shows a
 * live flight with real telemetry (firings, ship rate, activity), not just a
 * static registration.
 *
 * This runs the REAL M1 engine loop over REAL adapters (git + SQLite) on a
 * self-contained sample repo: each firing makes a real, gate-valid change and
 * commits it; a REAL gate (`node --check`) verifies the commit; the engine keeps
 * it (or additively reverts on red) and writes real events + metrics. The only
 * simulated part is the "thinking": a scripted agent stands in for the live
 * `claude` CLI, so NO model runs — cost and tokens are honestly zero. Everything
 * that makes a firing trustworthy (real commit, real gate, real sha cross-check,
 * gate-verified `shipped`) is genuine. Idempotent onboarding; all under the
 * git-ignored `.autopilot/` workspace.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { openStore, migrate } from '@autopilot/store';
import {
  runLoop,
  DEFAULT_ENGINE_CONFIG,
  INITIAL_RESILIENCE_STATE,
  GitVcs,
  SqliteFiringStore,
  SystemClock,
  GateRunner,
  FileInstanceLock,
  type LoopDeps,
  type ModelPort,
  type ModelResponse,
  type ModelEnvelope,
} from '@autopilot/engine';
import {
  onboard,
  GitBackup,
  FsFileSource,
  SqliteIndexStore,
  SqliteProjectStore,
  readFsSnapshot,
  taskIdSource,
  type OnboardDeps,
} from '@autopilot/onboarding';
import { resolveDbPath } from './read/config.js';
import { engineLockFileName } from './flight/lock.js';

const FIRINGS = 5;
const PROJECT_ID = 'demo-flight-demo';
const PROGRESS_REL = 'src/progress.js';

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function git(repo: string, args: readonly string[]): void {
  execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore', windowsHide: true });
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

const SEED_FILES: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify(
    { name: 'flight-demo', scripts: { test: 'node --check src/progress.js' } },
    null,
    2,
  )}\n`,
  'pnpm-lock.yaml': '',
  'src/index.js': "'use strict';\nmodule.exports = { ready: true };\n",
  'src/progress.js': '// AUTOPILOT progress log — each firing appends one gate-verified line.\n',
  'README.md': '# flight-demo\n\nA sample repo AUTOPILOT flies in the demo.\n',
};

function ensureRepo(dir: string): void {
  if (existsSync(join(dir, '.git'))) return;
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(SEED_FILES)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'demo@autopilot.local']);
  git(dir, ['config', 'user.name', 'AUTOPILOT Demo']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed flight-demo']);
}

/** Envelope with HONEST $0 / 0 tokens — a scripted agent; no model actually ran. */
function envelope(result: string, durationMs: number): ModelEnvelope {
  return {
    result,
    isError: false,
    apiErrorStatus: null,
    costUsd: 0,
    numTurns: 1,
    durationMs,
    stopReason: 'end_turn',
    modelUsed: 'scripted-demo',
    tokensIn: 0,
    tokensOut: 0,
    cacheRead: 0,
    cacheCreate: 0,
  };
}

/**
 * A scripted agent standing in for the live CLI: makes a REAL, gate-valid change,
 * commits it, and self-reports the REAL sha. The commit, gate, ship/revert, and
 * sha cross-check are all real; only the "thinking" is scripted (cost/tokens = 0).
 */
class ScriptedFlightAgent implements ModelPort {
  private n = 0;
  constructor(
    private readonly repo: string,
    private readonly now: () => number,
  ) {}
  invoke(): Promise<ModelResponse> {
    const start = this.now();
    this.n += 1;
    // A unique top-level const — always valid syntax, never a redeclaration.
    appendFileSync(
      join(this.repo, PROGRESS_REL),
      `const step${this.n} = ${this.n}; // firing ${this.n}\n`,
    );
    git(this.repo, ['add', '-A']);
    git(this.repo, ['commit', '-q', '-m', `feat: AP-${this.n} extend the progress log`]);
    const sha = gitOut(this.repo, ['rev-parse', '--short', 'HEAD']);
    const result = `did work\nMETRICS:{"item":"AP-${this.n}","outcome":"shipped","kind":"feat","sha":"${sha}"}`;
    return Promise.resolve({
      stdout: '',
      exitCode: 0,
      envelope: envelope(result, this.now() - start),
    });
  }
}

/** A REAL gate via the engine's GateRunner: `node --check` the file the agent
 *  touched — real syntax verification, argv-only, through the production adapter. */
function nodeCheckGate(repo: string): GateRunner {
  return new GateRunner({
    cwd: repo,
    commands: [{ bin: process.execPath, args: ['--check', PROGRESS_REL], label: 'node --check' }],
  });
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const repo = join(dirname(dbPath), 'demo', 'flight-demo');
  ensureRepo(repo);

  // Per-project single-instance guard: this demo runs the same real engine loop
  // against the same shared store as `dashboard:fly`
  // (packages/engine/src/adapters/instance-lock.ts), keyed on this demo's own
  // fixed project id so it can never race a real `dashboard:fly` flight against
  // this same demo project, while a flight against any OTHER project is unaffected.
  const lock = new FileInstanceLock(join(dirname(dbPath), engineLockFileName(PROJECT_ID)));
  const lockResult = lock.acquire();
  if (!lockResult.acquired) {
    out(
      `⛔ another AUTOPILOT flight is already running (pid ${lockResult.holderPid ?? 'unknown'}) ` +
        `against this store — refusing to start the demo flight.`,
    );
    process.exitCode = 1;
    return;
  }

  const store = openStore(dbPath);
  migrate(store);
  const now = (): number => Date.now();

  try {
    // Onboard first (idempotent): registers, backs up (MYTH/LEGACY/flight), indexes.
    const onboardDeps: OnboardDeps = {
      vcs: new GitBackup(repo),
      readSnapshot: (root) => readFsSnapshot(root),
      fileSource: new FsFileSource(repo),
      indexStore: new SqliteIndexStore(store),
      projects: new SqliteProjectStore(store, taskIdSource('flight-task')),
      newId: () => PROJECT_ID,
    };
    await onboard(onboardDeps, { root: repo, name: 'flight-demo' });
    store.db
      .prepare("UPDATE projects SET status = 'flying', updated_at = ? WHERE id = ?")
      .run(now(), PROJECT_ID);

    // Fly it: the REAL loop over real adapters.
    const sink = new SqliteFiringStore(store, PROJECT_ID, now);
    const loop: LoopDeps = {
      firing: {
        model: new ScriptedFlightAgent(repo, now),
        vcs: new GitVcs(repo),
        gate: nodeCheckGate(repo),
        store: sink,
        clock: new SystemClock(),
      },
      stopRequested: () => Promise.resolve(false),
      loadState: () => Promise.resolve(INITIAL_RESILIENCE_STATE),
      saveState: () => Promise.resolve(),
      nextFiring: () => Promise.resolve(sink.reserveNextFiring()),
      buildPrompt: (firing) => Promise.resolve({ text: `firing ${firing}`, version: 'demo-1' }),
      sleep: () => Promise.resolve(),
      nextPaceMin: () => Promise.resolve(0),
      log: () => {},
    };

    out(
      `Flying flight-demo for ${FIRINGS} firings (real loop · real gate · real commits · $0 scripted)…`,
    );
    const summary = await runLoop(loop, DEFAULT_ENGINE_CONFIG, { maxIterations: FIRINGS });
    const shipped = store.db
      .prepare('SELECT COALESCE(SUM(shipped), 0) AS s FROM metrics WHERE project_id = ?')
      .get(PROJECT_ID) as { s: number };
    out(`  ${summary.firings} firings · ${shipped.s} shipped (gate-verified)`);
  } finally {
    store.close();
    lock.release();
  }

  out('');
  out('Done — flight-demo now has real flight telemetry.');
  out('Start/refresh the dashboard to watch it:  pnpm dashboard:start');
}

void main();
