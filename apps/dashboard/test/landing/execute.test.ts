// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  createLandingExecuteApi,
  createOutOfBandLandGateCheck,
  type E2eLandGuard,
  createRealE2eLandGuard,
} from '../../src/landing/execute.js';
import { engineLockFileName, deriveFlyProjectId } from '../../src/flight/lock.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(repo: string): void {
  gitSync(repo, ['init', '-q']);
  gitSync(repo, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(repo, ['config', 'user.name', 'Test']);
  gitSync(repo, ['config', 'commit.gpgsign', 'false']);
}

function project(s: Store, id: string, rootPath: string, gateConfig: string | null): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', ?, ?, ?)`,
    )
    .run(id, id, id, rootPath, gateConfig, 100, 100);
}

/** Best-effort: `dir` is disposable scratch space under `%TEMP%`, never the
 *  repo of record, and every caller runs this from a `finally` block AFTER
 *  its real assertions already passed — Windows can still hold a file handle
 *  past `rmSync`'s own maxRetries backoff (observed: EBUSY on a git worktree
 *  dir despite a 5×50ms retry budget), and a leftover locked temp dir must
 *  never fail a test whose actual behavior was already verified correct. */
function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    /* OS will reclaim %TEMP% eventually; see comment above. */
  }
}

/** A branch-ahead-of-main repo: init on main, then one commit on autopilot/flight. */
function setupBranchedRepo(repo: string): void {
  initRepo(repo);
  writeFileSync(join(repo, 'a.txt'), 'one');
  gitSync(repo, ['add', '-A']);
  gitSync(repo, ['commit', '-q', '-m', 'init']);
  gitSync(repo, ['branch', 'main']);
  gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);
  writeFileSync(join(repo, 'b.txt'), 'two');
  gitSync(repo, ['add', '-A']);
  gitSync(repo, ['commit', '-q', '-m', 'feat: second']);
}

const NODE_OK = JSON.stringify({
  ecosystem: 'js',
  test: { bin: 'node', args: ['-e', 'process.exit(0)'], label: 'node ok' },
});
const NODE_FAIL = JSON.stringify({
  ecosystem: 'js',
  test: { bin: 'node', args: ['-e', 'process.exit(1)'], label: 'node fail' },
});

describe('createLandingExecuteApi', () => {
  it('returns null for an unknown project id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-land-unknown-'));
    const dbPath = join(dir, 'a.db');
    try {
      const s = openStore(dbPath);
      migrate(s);
      s.close();
      const api = createLandingExecuteApi(dbPath);
      expect(await api('nope')).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('refuses with reason "merge-failed" when there is no discoverable base branch', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-nobase-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      initRepo(repo);
      gitSync(repo, ['checkout', '-q', '-b', 'autopilot/flight']);
      writeFileSync(join(repo, 'a.txt'), 'one');
      gitSync(repo, ['add', '-A']);
      gitSync(repo, ['commit', '-q', '-m', 'init']);

      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, null);
      s.close();

      const result = await createLandingExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(false);
      expect(result?.reason).toBe('merge-failed');
      expect(result?.details).toContain('no discoverable base branch');
      expect(result?.restarting).toBe(false);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('refuses on a red gate WITHOUT touching git', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-red-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_FAIL);
      s.close();

      const result = await createLandingExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(false);
      expect(result?.reason).toBe('gate-red');

      // main never gained the flight branch's commit — git was never touched.
      const mainLog = gitSync(repo, ['log', 'main', '--oneline']);
      expect(mainLog).not.toContain('feat: second');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('lands once the gate is green — the base branch gains the commit', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-green-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_OK);
      s.close();

      const result = await createLandingExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(true);
      expect(result?.reason).toBe('landed');
      expect(result?.restarting).toBe(false); // no selfRestart wired

      const mainLog = gitSync(repo, ['log', 'main', '--oneline']);
      expect(mainLog).toContain('feat: second');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('persists a `landed` events row on a successful land (Notifications channel flight-landed event)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-event-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_OK);
      s.close();

      const result = await createLandingExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(true);

      const s2 = openStore(dbPath);
      const rows = s2.db
        .prepare(`SELECT project_id, type, payload FROM events WHERE type = 'landed'`)
        .all() as { project_id: string; type: string; payload: string }[];
      s2.close();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.project_id).toBe('p1');
      expect(JSON.parse(rows[0]!.payload)).toEqual({ details: result?.details });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('does NOT persist a `landed` events row on a refused land (red gate)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-noevent-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_FAIL);
      s.close();

      const result = await createLandingExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(false);

      const s2 = openStore(dbPath);
      const rows = s2.db.prepare(`SELECT id FROM events WHERE type = 'landed'`).all();
      s2.close();
      expect(rows).toHaveLength(0);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('lands with no gate configured (vacuous pass) when there are no commands to run', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-nogate-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, null);
      s.close();

      const result = await createLandingExecuteApi(dbPath)('p1');
      expect(result?.ok).toBe(true);
      expect(result?.reason).toBe('landed');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  describe('running-flight guard', () => {
    it('refuses with reason "flight-running" and never touches git', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-flying-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const isFlightRunning = vi.fn(() => true);
        const result = await createLandingExecuteApi(dbPath, undefined, isFlightRunning)('p1');
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('flight-running');
        expect(result?.restarting).toBe(false);
        expect(isFlightRunning).toHaveBeenCalledWith(repo);

        // main never gained the flight branch's commit — git was never touched.
        const mainLog = gitSync(repo, ['log', 'main', '--oneline']);
        expect(mainLog).not.toContain('feat: second');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('does NOT fire self-restart when refused for a running flight, even at the self root', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-flying-self-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const trigger = vi.fn();
        const result = await createLandingExecuteApi(
          dbPath,
          { root: repo, trigger },
          () => true,
        )('p1');
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('flight-running');
        expect(result?.restarting).toBe(false);
        expect(trigger).not.toHaveBeenCalled();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('lands normally when isFlightRunning is omitted', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-noflight-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const result = await createLandingExecuteApi(dbPath)('p1');
        expect(result?.ok).toBe(true);
        expect(result?.reason).toBe('landed');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('invokes outOfBandGateCheck with the project id/root/gate config on a flight-running refusal', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-oob-invoke-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const outOfBandGateCheck = vi.fn();
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          () => true,
          outOfBandGateCheck,
        )('p1');
        expect(result?.reason).toBe('flight-running');
        expect(outOfBandGateCheck).toHaveBeenCalledWith('p1', repo, NODE_OK);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('never invokes outOfBandGateCheck when no flight is running', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-oob-noinvoke-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const outOfBandGateCheck = vi.fn();
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          () => false,
          outOfBandGateCheck,
        )('p1');
        expect(result?.ok).toBe(true);
        expect(outOfBandGateCheck).not.toHaveBeenCalled();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });
  });

  describe('cross-process flight lock (ap-mtm4qzty-1 — a flight this dashboard process never spawned or adopted must still refuse a concurrent land)', () => {
    it('refuses with reason "flight-running" when a live engine lock exists for the project, even though the in-memory isFlightRunning reports false', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-crosslock-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        // Simulates a `fly.ts` flight started from a DIFFERENT process (e.g. a
        // stray terminal `pnpm dashboard:fly`) — this dashboard's own
        // FlightRunnerRegistry never spawned or adopted it, so isFlightRunning
        // (omitted here, same as production when no flight went through THIS
        // process) has no way to know. Only the lockfile fly.ts itself writes
        // proves a live owner.
        writeFileSync(
          join(dbDir, engineLockFileName(deriveFlyProjectId(repo))),
          JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
        );

        const result = await createLandingExecuteApi(dbPath)('p1');
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('flight-running');
        expect(result?.restarting).toBe(false);

        // main never gained the flight branch's commit — git was never touched.
        const mainLog = gitSync(repo, ['log', 'main', '--oneline']);
        expect(mainLog).not.toContain('feat: second');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('refuses when the live lock belongs to an N-way instanced flight (fleet sibling), not just the bare project lock', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-crosslock-inst-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        writeFileSync(
          join(dbDir, engineLockFileName(deriveFlyProjectId(repo), 'fleet-2')),
          JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
        );

        const result = await createLandingExecuteApi(dbPath)('p1');
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('flight-running');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('lands normally when a lock file exists but its recorded pid is dead (stale, reclaimable)', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-crosslock-stale-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        writeFileSync(
          join(dbDir, engineLockFileName(deriveFlyProjectId(repo))),
          JSON.stringify({ pid: 999_999_999, startedAt: Date.now() }),
        );

        const result = await createLandingExecuteApi(dbPath)('p1');
        expect(result?.ok).toBe(true);
        expect(result?.reason).toBe('landed');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });
  });

  describe('e2e land guard', () => {
    it('refuses with reason "e2e-red" and never touches git when the guard reports red', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-e2ered-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const e2eLandGuard: E2eLandGuard = vi.fn(() => ({
          ok: false,
          detail: 'failure (5m ago)',
        }));
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          undefined,
          undefined,
          e2eLandGuard,
        )('p1');
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('e2e-red');
        expect(result?.details).toContain('failure (5m ago)');
        expect(result?.restarting).toBe(false);
        expect(e2eLandGuard).toHaveBeenCalledWith(repo, 'main');

        // main never gained the flight branch's commit — git was never touched.
        const mainLog = gitSync(repo, ['log', 'main', '--oneline']);
        expect(mainLog).not.toContain('feat: second');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('persists an `e2e-land-block` events row when the guard is red', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-e2eevent-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const e2eLandGuard: E2eLandGuard = () => ({ ok: false, detail: 'failure (5m ago)' });
        await createLandingExecuteApi(dbPath, undefined, undefined, undefined, e2eLandGuard)('p1');

        const s2 = openStore(dbPath);
        const rows = s2.db
          .prepare(`SELECT project_id, type, payload FROM events WHERE type = 'e2e-land-block'`)
          .all() as { project_id: string; type: string; payload: string }[];
        s2.close();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.project_id).toBe('p1');
        expect(JSON.parse(rows[0]!.payload)).toEqual({ detail: 'failure (5m ago)' });
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('lands normally when the guard reports green', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-e2egreen-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const e2eLandGuard: E2eLandGuard = () => ({ ok: true, detail: 'success (1h ago)' });
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          undefined,
          undefined,
          e2eLandGuard,
        )('p1');
        expect(result?.ok).toBe(true);
        expect(result?.reason).toBe('landed');

        const mainLog = gitSync(repo, ['log', 'main', '--oneline']);
        expect(mainLog).toContain('feat: second');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('lands normally when e2eLandGuard is omitted', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-e2enoop-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const result = await createLandingExecuteApi(dbPath)('p1');
        expect(result?.ok).toBe(true);
        expect(result?.reason).toBe('landed');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('does NOT fire self-restart when refused for red e2e, even at the self root', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-e2eself-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const trigger = vi.fn();
        const e2eLandGuard: E2eLandGuard = () => ({ ok: false, detail: 'failure (5m ago)' });
        const result = await createLandingExecuteApi(
          dbPath,
          { root: repo, trigger },
          undefined,
          undefined,
          e2eLandGuard,
        )('p1');
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('e2e-red');
        expect(result?.restarting).toBe(false);
        expect(trigger).not.toHaveBeenCalled();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });
  });

  describe('createOutOfBandLandGateCheck', () => {
    it('persists a `land-gate-alarm` events row when the out-of-band gate is red', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-oob-red-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_FAIL);
        s.close();

        const check = createOutOfBandLandGateCheck(dbPath);
        check('p1', repo, NODE_FAIL);

        await vi.waitFor(
          async () => {
            const s2 = openStore(dbPath);
            const rows = s2.db
              .prepare(
                `SELECT project_id, type, payload FROM events WHERE type = 'land-gate-alarm'`,
              )
              .all() as { project_id: string; type: string; payload: string }[];
            s2.close();
            expect(rows).toHaveLength(1);
            expect(rows[0]?.project_id).toBe('p1');
            expect(JSON.parse(rows[0]!.payload).details).toContain('failed');
          },
          { timeout: 10_000 },
        );

        // The events row lands INSIDE the check's try block, before its finally
        // block awaits removeWorktree(rootPath, worktreePath) — so the row
        // appearing does not mean the check is done with `repo`. The trailing
        // `git worktree remove` can still be touching `repo/.git` when
        // cleanupDir(repo) below runs, failing with Windows EBUSY. Wait for
        // deregistration too, the same technique the sibling "no gate
        // configured" test already uses.
        await vi.waitFor(
          () => {
            const worktreeList = gitSync(repo, ['worktree', 'list', '--porcelain']);
            const registeredCount = worktreeList
              .split('\n')
              .filter((line) => line.startsWith('worktree ')).length;
            expect(registeredCount).toBe(1);
          },
          { timeout: 10_000 },
        );

        // the flight branch's own checkout is left untouched by the check.
        const flightLog = gitSync(repo, ['log', '--oneline']);
        expect(flightLog).toContain('feat: second');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('persists no events row when the out-of-band gate is green', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-oob-green-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        s.close();

        const check = createOutOfBandLandGateCheck(dbPath);
        check('p1', repo, NODE_OK);

        // Wait for the scratch worktree to deregister — same signal the
        // red-gate test above uses. A green gate returns from the check's
        // try block straight into its finally's `removeWorktree` await, so
        // a fixed sleep alone races that: too short and cleanupDir(repo)
        // below can hit `git worktree remove` still touching `repo/.git`,
        // failing with Windows EBUSY.
        await vi.waitFor(
          () => {
            const worktreeList = gitSync(repo, ['worktree', 'list', '--porcelain']);
            const registeredCount = worktreeList
              .split('\n')
              .filter((line) => line.startsWith('worktree ')).length;
            expect(registeredCount).toBe(1);
          },
          { timeout: 10_000 },
        );
        // `removeWorktree` runs a SECOND git subprocess (`worktree prune`)
        // right after the one that deregisters — the wait above only proves
        // the first has finished. A short settle buffer covers that second
        // spawn's own startup + Windows' handle-release lag; proven empirically
        // to eliminate the EBUSY that `vi.waitFor` alone still left flaky.
        await new Promise((r) => setTimeout(r, 300));

        const s2 = openStore(dbPath);
        const rows = s2.db.prepare(`SELECT id FROM events WHERE type = 'land-gate-alarm'`).all();
        s2.close();
        expect(rows).toHaveLength(0);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('does nothing (no worktree, no event) when no gate is configured', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-oob-nogate-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        s.close();

        const check = createOutOfBandLandGateCheck(dbPath);
        check('p1', repo, null);

        await new Promise((resolve) => setTimeout(resolve, 200));
        const worktreeList = gitSync(repo, ['worktree', 'list', '--porcelain']);
        const registeredCount = worktreeList
          .split('\n')
          .filter((line) => line.startsWith('worktree ')).length;
        expect(registeredCount).toBe(1); // only the main checkout — no scratch worktree created
        const s2 = openStore(dbPath);
        const rows = s2.db.prepare(`SELECT id FROM events`).all();
        s2.close();
        expect(rows).toHaveLength(0);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });
  });

  describe('selfRestart', () => {
    it('fires the trigger when the landed project IS the self-hosted root', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-self-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const trigger = vi.fn();
        const result = await createLandingExecuteApi(dbPath, { root: repo, trigger })('p1');
        expect(result?.ok).toBe(true);
        expect(result?.restarting).toBe(true);
        expect(trigger).toHaveBeenCalledOnce();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('does NOT fire the trigger when the landed project is a different folder', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-notself-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const trigger = vi.fn();
        const result = await createLandingExecuteApi(dbPath, {
          root: join(dbDir, 'somewhere-else'),
          trigger,
        })('p1');
        expect(result?.ok).toBe(true);
        expect(result?.restarting).toBe(false);
        expect(trigger).not.toHaveBeenCalled();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('does NOT fire the trigger on a red-gate refusal, even for the self root', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-self-red-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_FAIL);
        s.close();

        const trigger = vi.fn();
        const result = await createLandingExecuteApi(dbPath, { root: repo, trigger })('p1');
        expect(result?.ok).toBe(false);
        expect(result?.restarting).toBe(false);
        expect(trigger).not.toHaveBeenCalled();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });
  });
});

describe('createRealE2eLandGuard staleness (EVALUATION 2026-09-02 — its first live refusal was a week-old verdict)', () => {
  const runReporting =
    (createdAtIso: string, conclusion: string) => () => (args: readonly string[]) => {
      expect(args).toContain('run');
      return JSON.stringify([{ status: 'completed', conclusion, createdAt: createdAtIso }]);
    };
  const NOW = Date.parse('2026-09-02T12:00:00Z');

  it('ignores a RED verdict older than the freshness window — a week-old failure describes a long-gone commit, not this landing', () => {
    const guard = createRealE2eLandGuard(
      runReporting('2026-08-25T12:00:00Z', 'failure'),
      () => NOW,
    );
    const verdict = guard('/repo', 'main');
    expect(verdict.ok).toBe(true);
    expect(verdict.detail).toContain('stale e2e verdict ignored');
  });

  it('still refuses on a FRESH red — the guard exists for exactly this', () => {
    const guard = createRealE2eLandGuard(
      runReporting('2026-09-02T11:30:00Z', 'failure'),
      () => NOW,
    );
    expect(guard('/repo', 'main').ok).toBe(false);
  });

  it('a fresh green passes untouched, and gh-unavailable stays never-block', () => {
    const green = createRealE2eLandGuard(
      runReporting('2026-09-02T11:00:00Z', 'success'),
      () => NOW,
    );
    expect(green('/repo', 'main').ok).toBe(true);

    const noGh = createRealE2eLandGuard(
      () => () => {
        throw new Error('gh: not found');
      },
      () => NOW,
    );
    expect(noGh('/repo', 'main').ok).toBe(true);
  });
});
