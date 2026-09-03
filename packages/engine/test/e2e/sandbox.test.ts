// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * M1 Definition of Done (docs/ACTION-PLAN.md): on a sandbox repo the engine runs
 * headless and ships ≥1 GATED commit (tree stays green, or reverts cleanly);
 * telemetry lands in SQLite; STOP is honored. This exercises the REAL loop over
 * REAL adapters (git + SQLite + fs) driven by a scripted agent that performs REAL
 * git commits — deterministic, offline, and free (no live CLI / spend), yet
 * proving the whole pipeline end to end.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, migrate, type Store } from '@autopilot/store';
import { runLoop, type LoopDeps } from '../../src/loop.js';
import { DEFAULT_ENGINE_CONFIG } from '../../src/config.js';
import { GitVcs } from '../../src/adapters/git.js';
import { SqliteFiringStore } from '../../src/adapters/store.js';
import { FsControl } from '../../src/adapters/fs-control.js';
import { SystemClock } from '../../src/adapters/clock.js';
import type {
  ModelPort,
  ModelResponse,
  ModelEnvelope,
  GatePort,
  GateResult,
} from '../../src/ports.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'README.md'), '# sandbox');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'chore: seed sandbox']);
}

function envelope(result: string): ModelEnvelope {
  return {
    result,
    isError: false,
    apiErrorStatus: null,
    costUsd: 6,
    numTurns: 5,
    durationMs: 100,
    stopReason: 'end_turn',
    modelUsed: 'fable',
    tokensIn: 10,
    tokensOut: 5,
    cacheRead: 100,
    cacheCreate: 2,
  };
}

/** A scripted agent that performs a REAL commit in the sandbox and self-reports it. */
class ScriptedAgent implements ModelPort {
  private count = 0;
  constructor(
    private readonly repo: string,
    private readonly willCommit: boolean,
  ) {}
  invoke(): Promise<ModelResponse> {
    if (!this.willCommit) {
      return Promise.resolve({ stdout: '', exitCode: 0, envelope: envelope('nothing to do') });
    }
    this.count++;
    writeFileSync(join(this.repo, `work-${this.count}.txt`), 'the work');
    gitSync(this.repo, ['add', '-A']);
    gitSync(this.repo, ['commit', '-q', '-m', 'feat: AP-1 the work']);
    const sha = gitSync(this.repo, ['rev-parse', '--short', 'HEAD']);
    return Promise.resolve({
      stdout: '',
      exitCode: 0,
      envelope: envelope(
        `did work\nMETRICS:{"item":"AP-1","outcome":"shipped","kind":"feat","sha":"${sha}"}`,
      ),
    });
  }
}

class FixedGate implements GatePort {
  runs = 0;
  constructor(private readonly ok: boolean) {}
  run(): Promise<GateResult> {
    this.runs++;
    return Promise.resolve({ ok: this.ok });
  }
}

describe('M1 DoD — sandbox headless run', () => {
  let sandbox: string;
  let control: string;
  let store: Store;
  let projectId: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'autopilot-sandbox-'));
    control = mkdtempSync(join(tmpdir(), 'autopilot-control-'));
    initRepo(sandbox);
    writeFileSync(join(control, 'PROMPT.txt'), 'fly the sandbox repo');

    store = openStore(':memory:');
    migrate(store);
    projectId = randomUUID();
    const now = Date.now();
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES (?, 'sandbox', 'sandbox', ?, 'flying', ?, ?)`,
      )
      .run(projectId, sandbox, now, now);
  });

  afterEach(() => {
    store.close();
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(control, { recursive: true, force: true });
  });

  function deps(agent: ModelPort, gate: GatePort): { loop: LoopDeps; sink: SqliteFiringStore } {
    const fsctl = new FsControl({
      stopFile: join(control, 'STOP.txt'),
      stateFile: join(control, 'state.json'),
      promptFile: join(control, 'PROMPT.txt'),
      sleepChunkMs: 5,
      delay: () => Promise.resolve(),
    });
    const sink = new SqliteFiringStore(store, projectId);
    const loop: LoopDeps = {
      firing: {
        model: agent,
        vcs: new GitVcs(sandbox),
        gate,
        store: sink,
        clock: new SystemClock(),
      },
      stopRequested: () => fsctl.stopRequested(),
      loadState: () => fsctl.loadState(),
      saveState: (s) => fsctl.saveState(s),
      nextFiring: () => Promise.resolve(sink.reserveNextFiring()),
      buildPrompt: (f, r) => fsctl.buildPrompt(f, r),
      sleep: (m) => fsctl.sleep(m),
      nextPaceMin: () => Promise.resolve(0),
      log: () => {},
    };
    return { loop, sink };
  }

  function metricRow(): {
    shipped: number;
    gate_result: string;
    item: string;
    self_reported: number;
    sha: string;
  } {
    return store.db.prepare('SELECT * FROM metrics WHERE project_id = ?').get(projectId) as {
      shipped: number;
      gate_result: string;
      item: string;
      self_reported: number;
      sha: string;
    };
  }

  it('ships one gated commit and lands verified telemetry in SQLite', async () => {
    const { loop } = deps(new ScriptedAgent(sandbox, true), new FixedGate(true));
    const summary = await runLoop(loop, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });

    expect(summary.firings).toBe(1);
    // The sandbox has a real, kept commit from the agent.
    const subjects = gitSync(sandbox, ['log', '--format=%s']);
    expect(subjects).toContain('feat: AP-1 the work');
    expect(subjects).not.toMatch(/Revert/);
    // Telemetry landed and is honest.
    const m = metricRow();
    expect(m.shipped).toBe(1);
    expect(m.gate_result).toBe('passed');
    expect(m.item).toBe('AP-1');
    expect(m.self_reported).toBe(1);
    // The reported sha is a real commit (un-fakeable cross-check).
    expect(gitSync(sandbox, ['cat-file', '-e', `${m.sha}^{commit}`])).toBe('');
  });

  it('reverts cleanly when the gate fails (tree returns to green, additively)', async () => {
    const { loop } = deps(new ScriptedAgent(sandbox, true), new FixedGate(false));
    await runLoop(loop, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });

    // HEAD is now an additive revert of the work commit.
    expect(gitSync(sandbox, ['log', '-1', '--format=%s'])).toMatch(/^Revert "feat: AP-1 the work"/);
    // The work file is gone (reverted), tree is clean.
    expect(gitSync(sandbox, ['status', '--porcelain'])).toBe('');
    const m = metricRow();
    expect(m.shipped).toBe(0);
    expect(m.gate_result).toBe('reverted');
  });

  it('honors STOP: a present sentinel means zero firings', async () => {
    writeFileSync(join(control, 'STOP.txt'), '');
    const { loop } = deps(new ScriptedAgent(sandbox, true), new FixedGate(true));
    const summary = await runLoop(loop, DEFAULT_ENGINE_CONFIG, { maxIterations: 5 });

    expect(summary).toEqual({ firings: 0, stoppedBy: 'stop' });
    expect(gitSync(sandbox, ['log', '--format=%s'])).toBe('chore: seed sandbox');
  });
});
