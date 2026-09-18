// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { rmSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  createLandingExecuteApi,
  createOutOfBandLandGateCheck,
  type E2eLandGuard,
  createRealE2eLandGuard,
  implicatedFilesFromFailedLog,
  remedyFilesOf,
  gateSpecNeedsRefresh,
  mergeDetectedCiExtras,
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

    it('LETS THROUGH a branch that re-renders the very baselines the converged branch is red on', async () => {
      // THE DEADLOCK THIS CLOSES (operator, 2026-09-15: "how did you finish
      // red?"). Visual baselines are CI-canonical — only a CI run can
      // regenerate them — so any rendered-UI change leaves the converged
      // branch red for one cycle, until the freshly rendered snapshots are
      // adopted and landed. But this guard refuses to land INTO a red
      // converged branch, so it blocked the one commit that could clear the
      // redness it was reporting. A guard whose refusal cannot be cleared by
      // the remedy has stopped guarding anything.
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-e2efix-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        // The branch carries an adopted baseline, exactly as the real fix did.
        const snapDir = join(repo, 'apps/dashboard/e2e/visual.spec.ts-snapshots');
        mkdirSync(snapDir, { recursive: true });
        writeFileSync(join(snapDir, 'fleet-dark-chromium-win32.png'), 'rendered-by-ci');
        gitSync(repo, ['add', '-A']);
        gitSync(repo, ['commit', '-q', '-m', 'test(visual): adopt the CI-rendered baselines']);

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

        // The red verdict no longer wins: this branch IS the remedy.
        expect(result?.reason).not.toBe('e2e-red');
        const mainLog = gitSync(repo, ['log', 'main', '--oneline']);
        expect(mainLog).toContain('adopt the CI-rendered baselines');
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('still refuses a branch that changes anything OTHER than the baselines', async () => {
      // The escape stays narrow on purpose. Keeping unrelated work off a
      // broken converged branch is the whole point of the guard, and this
      // is the case that proves the exception did not swallow the rule.
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-e2enofix-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          undefined,
          undefined,
          vi.fn(() => ({ ok: false, detail: 'failure (5m ago)' })) as E2eLandGuard,
        )('p1');

        expect(result?.reason).toBe('e2e-red');
        expect(gitSync(repo, ['log', 'main', '--oneline'])).not.toContain('feat: second');
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

  describe('postPushWatch (POST-PUSH VERDICT RITUAL slice 3)', () => {
    it('fires with the landed project id, root, base branch, and new HEAD sha on a green land', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-ppw-green-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const postPushWatch = vi.fn();
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          postPushWatch,
        )('p1');
        expect(result?.ok).toBe(true);
        expect(postPushWatch).toHaveBeenCalledOnce();

        const newHead = gitSync(repo, ['rev-parse', 'main']);
        expect(postPushWatch).toHaveBeenCalledWith('p1', repo, 'main', newHead);
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('does NOT fire on a red-gate refusal', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-ppw-red-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_FAIL);
        s.close();

        const postPushWatch = vi.fn();
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          postPushWatch,
        )('p1');
        expect(result?.ok).toBe(false);
        expect(postPushWatch).not.toHaveBeenCalled();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('does NOT fire on a flight-running refusal', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-ppw-flying-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const postPushWatch = vi.fn();
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          () => true,
          undefined,
          undefined,
          undefined,
          postPushWatch,
        )('p1');
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('flight-running');
        expect(postPushWatch).not.toHaveBeenCalled();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('does NOT fire on an e2e-red refusal', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-ppw-e2ered-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const postPushWatch = vi.fn();
        const e2eLandGuard: E2eLandGuard = () => ({ ok: false, detail: 'failure (5m ago)' });
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          undefined,
          undefined,
          e2eLandGuard,
          undefined,
          postPushWatch,
        )('p1');
        expect(result?.ok).toBe(false);
        expect(result?.reason).toBe('e2e-red');
        expect(postPushWatch).not.toHaveBeenCalled();
      } finally {
        cleanupDir(repo);
        cleanupDir(dbDir);
      }
    });

    it('lands normally when postPushWatch is omitted', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-ppw-omit-'));
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

    it('a postPushWatch that throws synchronously never fails the land', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-ppw-throws-'));
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
      try {
        setupBranchedRepo(repo);
        const dbPath = join(dbDir, 'a.db');
        const s = openStore(dbPath);
        migrate(s);
        project(s, 'p1', repo, NODE_OK);
        s.close();

        const postPushWatch = vi.fn(() => {
          throw new Error('boom');
        });
        const result = await createLandingExecuteApi(
          dbPath,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          postPushWatch,
        )('p1');
        expect(result?.ok).toBe(true);
        expect(result?.reason).toBe('landed');
        expect(postPushWatch).toHaveBeenCalledOnce();
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

/**
 * THE REMEDY ESCAPE (ADR 0008, amendment 2026-09-17). The lines below are
 * the shape `gh run view --log-failed` really hands back — the job/step
 * prefix, then vitest's coloured output — taken from the run that reddened
 * `main` on dd1d4ec1 (a test asserting a full temp path the Windows runner
 * spells two ways).
 */
const ESC = '';
const FAILED_LOG = [
  `verify (windows-latest)\tTest + coverage (>=80%)\t2026-09-17T06:15:13.9559228Z  ${ESC}[31m❯${ESC}[39m ${ESC}[30m${ESC}[43m node ${ESC}[49m${ESC}[39m packages/engine/test/adapters/worktree.test.ts ${ESC}[2m(${ESC}[22m${ESC}[2m48 tests${ESC}[22m${ESC}[2m | ${ESC}[22m${ESC}[31m1 failed${ESC}[39m${ESC}[2m)${ESC}[22m`,
  `verify (windows-latest)\tTest + coverage (>=80%)\t2026-09-17T06:17:50.0931723Z ${ESC}[41m${ESC}[1m FAIL ${ESC}[22m${ESC}[49m ${ESC}[30m${ESC}[43m node ${ESC}[49m${ESC}[39m packages/engine/test/adapters/worktree.test.ts${ESC}[2m > ${ESC}[22mfastForwardWorktree${ESC}[2m > ${ESC}[22mreports ok:false gracefully when the lane has diverged`,
  `verify (windows-latest)\tTest + coverage (>=80%)\t2026-09-17T06:17:50.0941707Z ${ESC}[31m${ESC}[1mAssertionError${ESC}[22m: expected 'cannot fast-forward' to contain 'RUNNER~1'${ESC}[39m`,
  `verify (windows-latest)\tTest + coverage (>=80%)\t2026-09-17T06:17:50.0948701Z ${ESC}[36m ${ESC}[2m❯${ESC}[22m packages/engine/test/adapters/worktree.test.ts:${ESC}[2m769:28${ESC}[22m${ESC}[39m`,
  `verify (windows-latest)\tTest + coverage (>=80%)\t2026-09-17T06:17:50.0950000Z ${ESC}[36m ${ESC}[2m❯${ESC}[22m packages/engine/src/adapters/worktree.ts:${ESC}[2m214:11${ESC}[22m${ESC}[39m`,
].join('\n');

describe('implicatedFilesFromFailedLog', () => {
  it('names the test file from the FAIL header and every file a ❯ frame points at, once each, colour codes stripped', () => {
    expect(implicatedFilesFromFailedLog(FAILED_LOG)).toEqual([
      'packages/engine/test/adapters/worktree.test.ts',
      'packages/engine/src/adapters/worktree.ts',
    ]);
  });

  it('never mistakes the pool label for a file, and yields nothing for a log with no vitest failure in it', () => {
    expect(implicatedFilesFromFailedLog('')).toEqual([]);
    expect(
      implicatedFilesFromFailedLog('build\tBuild\t2026-09-17T06:00:00Z error TS2322: x'),
    ).toEqual([]);
    expect(implicatedFilesFromFailedLog(' FAIL  node  something-without-a-path')).toEqual([]);
  });

  it('names the file a scanner or tsc reports as path:line / path(line — a red that is not a test failure still names what clears it', () => {
    // The exact shape scripts/ci/no-personal-paths.mjs printed on the run that
    // reddened main at 8490c592 (a test with three literal drive paths).
    // (The offending snippets' drive letter is joined at runtime so this
    // fixture does not trip the same scanner.)
    const d = 'X';
    const scanner = [
      'verify (ubuntu-latest)\tNo personal paths\t2026-09-17T18:20:00Z no-personal-paths FAILED: 3 personal identifier(s) found:',
      `verify (ubuntu-latest)\tNo personal paths\t2026-09-17T18:20:00Z   packages/engine/test/adapters/worktree.test.ts:90  [windows-drive-path]  ${d}:/work/lanes/wt-a`,
      `verify (ubuntu-latest)\tNo personal paths\t2026-09-17T18:20:00Z   packages/engine/test/adapters/worktree.test.ts:91  [windows-drive-path]  ${d}:\\work\\lanes\\wt-a`,
      'verify (ubuntu-latest)\tNo personal paths\t2026-09-17T18:20:00Z apps/dashboard/src/paths.ts(12,5): error TS2322: nope',
    ].join('\n');
    expect(implicatedFilesFromFailedLog(scanner)).toEqual([
      'packages/engine/test/adapters/worktree.test.ts',
      'apps/dashboard/src/paths.ts',
    ]);
  });
});

describe('remedyFilesOf', () => {
  it('is the implicated files the landing actually changes, separators normalised', () => {
    expect(
      remedyFilesOf(
        [String.raw`packages\engine\test\adapters\worktree.test.ts`, 'docs/x.md'],
        [
          'packages/engine/test/adapters/worktree.test.ts',
          'packages/engine/src/adapters/worktree.ts',
        ],
      ),
    ).toEqual(['packages/engine/test/adapters/worktree.test.ts']);
  });

  it('is empty when the landing touches none of them — or when nothing was implicated at all', () => {
    expect(remedyFilesOf(['docs/x.md'], ['packages/a.ts'])).toEqual([]);
    expect(remedyFilesOf(['packages/a.ts'], [])).toEqual([]);
  });
});

describe("createRealE2eLandGuard — reading the red run's own failure", () => {
  const NOW = Date.parse('2026-09-17T08:00:00Z');
  const listing = (conclusion: string, databaseId?: number): string =>
    JSON.stringify([
      { status: 'completed', conclusion, createdAt: '2026-09-17T05:54:30Z', databaseId },
    ]);

  it("on a fresh red with a known run id, reads that run's failed log and names its files", () => {
    const calls: string[][] = [];
    const guard = createRealE2eLandGuard(
      () => (args) => {
        calls.push([...args]);
        return args.includes('view') ? FAILED_LOG : listing('failure', 35187588300);
      },
      () => NOW,
    );
    const verdict = guard('/repo', 'main');
    expect(verdict.ok).toBe(false);
    expect(verdict.implicatedFiles).toEqual([
      'packages/engine/test/adapters/worktree.test.ts',
      'packages/engine/src/adapters/worktree.ts',
    ]);
    expect(calls[1]).toEqual(['run', 'view', '35187588300', '--log-failed']);
  });

  it('a green run never reads a log, and a red one without a run id names nothing', () => {
    const calls: string[][] = [];
    const green = createRealE2eLandGuard(
      () => (args) => {
        calls.push([...args]);
        return listing('success', 1);
      },
      () => NOW,
    );
    expect(green('/repo', 'main').ok).toBe(true);
    expect(calls).toHaveLength(1);

    const noId = createRealE2eLandGuard(
      () => () => listing('failure'),
      () => NOW,
    );
    const verdict = noId('/repo', 'main');
    expect(verdict.ok).toBe(false);
    expect(verdict.implicatedFiles).toBeUndefined();
  });

  it('an unreadable log keeps the refusal with no files — the escape is earned by evidence only', () => {
    const guard = createRealE2eLandGuard(
      () => (args) => {
        if (args.includes('view')) throw new Error('gh: log unavailable');
        return listing('failure', 7);
      },
      () => NOW,
    );
    const verdict = guard('/repo', 'main');
    expect(verdict.ok).toBe(false);
    expect(verdict.implicatedFiles).toEqual([]);
  });
});

describe('createLandingExecuteApi — the remedy escape end to end', () => {
  it('lands a branch that touches a file the red run names, and leaves an e2e-land-remedy trail', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-remedy-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo); // the flight branch adds b.txt
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_OK);
      s.close();

      const e2eLandGuard: E2eLandGuard = () => ({
        ok: false,
        detail: 'failure (5m ago)',
        implicatedFiles: ['b.txt', 'packages/never-touched.ts'],
      });
      const result = await createLandingExecuteApi(
        dbPath,
        undefined,
        undefined,
        undefined,
        e2eLandGuard,
      )('p1');

      expect(result?.reason).not.toBe('e2e-red');
      expect(gitSync(repo, ['log', 'main', '--oneline'])).toContain('feat: second');

      const s2 = openStore(dbPath);
      const rows = s2.db
        .prepare(`SELECT type, payload FROM events WHERE type LIKE 'e2e-land-%'`)
        .all() as { type: string; payload: string }[];
      s2.close();
      expect(rows.map((r) => r.type)).toEqual(['e2e-land-remedy']);
      expect(JSON.parse(rows[0]!.payload)).toEqual({
        detail: 'failure (5m ago)',
        files: ['b.txt'],
      });
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });

  it('still refuses a branch that touches none of the files the red run names', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-noremedy-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_OK);
      s.close();

      const e2eLandGuard: E2eLandGuard = () => ({
        ok: false,
        detail: 'failure (5m ago)',
        implicatedFiles: ['packages/never-touched.ts'],
      });
      const result = await createLandingExecuteApi(
        dbPath,
        undefined,
        undefined,
        undefined,
        e2eLandGuard,
      )('p1');

      expect(result?.ok).toBe(false);
      expect(result?.reason).toBe('e2e-red');
      expect(gitSync(repo, ['log', 'main', '--oneline'])).not.toContain('feat: second');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});

/**
 * THE 2026-09-18 GAPS (operator: "fix everything, so no such incident
 * happens again"). Each block below pins one closed gap of that day's
 * INSTRUCTIONS: A (gate parity — a stale stored spec is re-detected), B (a
 * dirty tree is refused BEFORE the gate), C (a stale server build is named
 * on the result), E (a cancelled run is no verdict), G (more failure shapes,
 * and package-relative / absolute paths matched by suffix).
 */

describe('gate parity — a stored spec that predates ciExtras is refreshed at landing (gap A)', () => {
  it('gateSpecNeedsRefresh is true exactly when the stored spec has no ciExtras field', () => {
    expect(gateSpecNeedsRefresh(null)).toBe(false);
    expect(gateSpecNeedsRefresh({ ecosystem: 'js' })).toBe(true);
    expect(gateSpecNeedsRefresh({ ecosystem: 'js', ciExtras: [] })).toBe(false);
  });

  it('mergeDetectedCiExtras folds in ONLY the detected extras — an operator-edited command list is never overwritten', () => {
    const stored = JSON.parse(NODE_OK);
    const detected = {
      ecosystem: 'js',
      test: { bin: 'other', args: [], label: 'other' },
      ciExtras: [{ bin: 'node', args: ['-e', 'process.exit(0)'], label: 'ci:x' }],
    };
    const merged = mergeDetectedCiExtras(stored, detected);
    expect(merged.test).toEqual(stored.test);
    expect(merged.ciExtras).toEqual(detected.ciExtras);
    expect(mergeDetectedCiExtras(stored, { ecosystem: 'js' })).toBe(stored);
  });

  it('runs the freshly detected ci:* extras in the landing gate, and persists them — detected once, never again', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-parity-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_OK); // stored WITHOUT ciExtras — an old onboarding
      s.close();

      const detector = vi.fn(() => ({
        ...(JSON.parse(NODE_OK) as { ecosystem: string }),
        ciExtras: [{ bin: 'node', args: ['-e', 'process.exit(1)'], label: 'ci:boom' }],
      }));
      const api = createLandingExecuteApi(
        dbPath,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        detector,
        () => [],
      );

      const result = await api('p1');
      // The extra ran and was red — proof the parity gate now includes it.
      expect(result?.reason).toBe('gate-red');
      expect(result?.gate?.checks?.map((c) => c.label)).toContain('ci:boom');
      expect(detector).toHaveBeenCalledWith(repo);

      const s2 = openStore(dbPath);
      const row = s2.db.prepare('SELECT gate_config FROM projects WHERE id = ?').get('p1') as {
        gate_config: string;
      };
      s2.close();
      expect(JSON.parse(row.gate_config).ciExtras?.[0]?.label).toBe('ci:boom');

      // Second landing: the stored spec now carries ciExtras — no re-detection.
      await api('p1');
      expect(detector).toHaveBeenCalledTimes(1);
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});

describe('a dirty tree is refused BEFORE the gate (gap B)', () => {
  it('names the dirty tree at once — the gate never runs, so the result carries no gate', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-dirty-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      writeFileSync(join(repo, 'wip.txt'), 'uncommitted');
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_OK);
      s.close();

      const result = await createLandingExecuteApi(
        dbPath,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        () => null,
        () => [],
      )('p1');
      expect(result?.ok).toBe(false);
      expect(result?.reason).toBe('merge-failed');
      expect(result?.details).toContain('checked before the gate');
      expect(result?.gate).toBeUndefined();
      expect(gitSync(repo, ['log', 'main', '--oneline'])).not.toContain('feat: second');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});

describe('a stale server build is named on the landing result (gap C)', () => {
  it('appends the freshness note to details when landing code is newer than the running build, and nothing otherwise', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ap-dash-land-stale-'));
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-land-db-'));
    try {
      setupBranchedRepo(repo);
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', repo, NODE_OK);
      s.close();

      const stale = await createLandingExecuteApi(
        dbPath,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        () => null,
        () => ['landing/execute'],
      )('p1');
      expect(stale?.ok).toBe(true);
      expect(stale?.details).toContain('landed autopilot/flight onto main');
      expect(stale?.details).toContain('landing/execute code is newer than the build');
    } finally {
      cleanupDir(repo);
      cleanupDir(dbDir);
    }
  });
});

describe('createRealE2eLandGuard — a cancelled run is no verdict (gap E)', () => {
  it('reads a fresh CANCELLED run (superseded by a newer push) as unknown, never as red, and reads no log', () => {
    const NOW = Date.parse('2026-09-18T09:00:00Z');
    const calls: string[][] = [];
    const guard = createRealE2eLandGuard(
      () => (args) => {
        calls.push([...args]);
        return JSON.stringify([
          {
            status: 'completed',
            conclusion: 'cancelled',
            createdAt: '2026-09-18T08:50:00Z',
            databaseId: 35260858221,
          },
        ]);
      },
      () => NOW,
    );
    const verdict = guard('/repo', 'main');
    expect(verdict.ok).toBe(true);
    expect(verdict.detail).toContain('cancelled run ignored');
    expect(calls).toHaveLength(1);
  });
});

describe('implicatedFilesFromFailedLog — the shapes beyond vitest (gap G)', () => {
  const PREFIX = 'verify (ubuntu-latest)\tLint and format\t2026-09-18T08:00:00Z ';

  it("reads prettier's [warn] path lines", () => {
    expect(implicatedFilesFromFailedLog(`${PREFIX}[warn] apps/dashboard/src/web/shell.ts`)).toEqual(
      ['apps/dashboard/src/web/shell.ts'],
    );
  });

  it("reads eslint's file-on-its-own-line, even as the runner's absolute path", () => {
    const log = [
      `${PREFIX}/srv/ci/work/AUTOPILOT/AUTOPILOT/apps/dashboard/src/read/fleet.ts`,
      `${PREFIX}  12:5  error  'x' is defined but never used  no-unused-vars`,
    ].join('\n');
    expect(implicatedFilesFromFailedLog(log)).toEqual([
      '/srv/ci/work/AUTOPILOT/AUTOPILOT/apps/dashboard/src/read/fleet.ts',
    ]);
  });

  it("reads Playwright's package-relative spec reference", () => {
    const log = `${PREFIX}  ✘  1 [chromium] › e2e/visual.spec.ts:12:5 › fleet dark renders (3.2s)`;
    expect(implicatedFilesFromFailedLog(log)).toEqual(['e2e/visual.spec.ts']);
  });

  it("reads the windows-latest runner's backslash spec paths and its plain `x` failure marker (run 35325023691 — the first refusal whose remedy was on the branch)", () => {
    const log = [
      `${PREFIX}  x   7 [chromium] › apps\\dashboard\\e2e\\dashboard.spec.ts:8:3 › dashboard boot smoke › the shell loads (1.2s)`,
      `${PREFIX}  x  13 [chromium] › apps\\dashboard\\e2e\\project-page.spec.ts:23:3 › project page (/p/:id) › renders an honest not-found state (0.9s)`,
    ].join('\n');
    expect(implicatedFilesFromFailedLog(log)).toEqual([
      'apps/dashboard/e2e/dashboard.spec.ts',
      'apps/dashboard/e2e/project-page.spec.ts',
    ]);
  });

  it("never implicates the PASSING tests the failed job's log also lists — a green spec clears nothing", () => {
    const log = [
      `${PREFIX}  ok  1 [chromium] › apps\\dashboard\\e2e\\anti-cls.spec.ts:24:1 › zero layout shift (1.4s)`,
      `${PREFIX}  ok  3 [chromium] › apps/dashboard/e2e/command-palette.spec.ts:14:1 › Ctrl+K lands (487ms)`,
      `${PREFIX}  x   7 [chromium] › apps\\dashboard\\e2e\\dashboard.spec.ts:8:3 › dashboard boot smoke › the shell loads (1.2s)`,
    ].join('\n');
    expect(implicatedFilesFromFailedLog(log)).toEqual(['apps/dashboard/e2e/dashboard.spec.ts']);
  });
});

describe('remedyFilesOf — package-relative and absolute spellings match by suffix (gap G)', () => {
  it('a Playwright spec named relative to apps/dashboard matches the repo-relative changed file', () => {
    expect(
      remedyFilesOf(['apps/dashboard/e2e/visual.spec.ts', 'docs/x.md'], ['e2e/visual.spec.ts']),
    ).toEqual(['apps/dashboard/e2e/visual.spec.ts']);
  });

  it('an eslint absolute path from the runner matches the repo-relative changed file', () => {
    expect(
      remedyFilesOf(
        ['apps/dashboard/src/read/fleet.ts'],
        ['/srv/ci/work/AUTOPILOT/AUTOPILOT/apps/dashboard/src/read/fleet.ts'],
      ),
    ).toEqual(['apps/dashboard/src/read/fleet.ts']);
  });

  it('a mere shared basename is not a match — the boundary is a path separator', () => {
    expect(remedyFilesOf(['apps/dashboard/src/x.ts'], ['packages/engine/src/x.ts'])).toEqual([]);
  });
});
