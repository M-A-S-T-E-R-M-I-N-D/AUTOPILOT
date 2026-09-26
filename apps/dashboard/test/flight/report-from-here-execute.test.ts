// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import type * as AutopilotStore from '@autopilot/store';
import {
  createReportFromHerePreviewApi,
  createReportFromHereExecuteApi,
} from '../../src/flight/report-from-here-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import type { ReportRegionCapture } from '../../src/flight/report-from-here.js';

vi.mock('@autopilot/store', async (importOriginal) => {
  const actual = await importOriginal<typeof AutopilotStore>();
  return { ...actual, openStore: vi.fn(actual.openStore) };
});

/** The store the execute api opened on its most recent call — read back
 *  through the pass-through mock so a test can ask whether it was closed. */
function lastOpenedStore(): Store {
  const opened = vi.mocked(openStore).mock.results.at(-1);
  if (!opened || opened.type !== 'return') throw new Error('openStore was never called');
  return opened.value as Store;
}

/** A migrated scratch db holding one project, `p1` — the fixture every
 *  task-shaped execute test starts from. */
function seededDb(dir: string): string {
  const dbPath = join(dir, 'a.db');
  const s = openStore(dbPath);
  migrate(s);
  project(s, 'p1', dir);
  s.close();
  return dbPath;
}

interface TaskRow {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly status: string;
  readonly source: string;
  readonly focus: number;
  readonly created_at: number;
}

function taskRows(dbPath: string): TaskRow[] {
  const s = openStore(dbPath);
  try {
    return s.db
      .prepare('SELECT id, project_id, title, status, source, focus, created_at FROM tasks')
      .all() as TaskRow[];
  } finally {
    s.close();
  }
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

function okExec(): CliExec {
  return vi.fn(async () => ({ code: 0, stdout: '' }));
}

const capture: ReportRegionCapture = {
  regionId: 'flight-log',
  regionLabel: 'Flight log',
  description: 'The flight log timestamps read in UTC, not local time.',
  moduleSources: ['web/flight-log-panel.ts'],
  hasScreenshot: true,
};

describe('createReportFromHerePreviewApi', () => {
  it('plans a bug issue without touching the store or shelling out', () => {
    const plan = createReportFromHerePreviewApi()(capture, 'issue', '');
    expect(plan).toMatchObject({ ok: true, action: 'issue' });
  });

  it('plans a reasoned rejection for a blank description instead of throwing', () => {
    const plan = createReportFromHerePreviewApi()({ ...capture, description: '' }, 'issue', '');
    expect(plan).toMatchObject({ ok: false });
  });

  it("stamps the wall clock as a task plan's createdAt — the one input the pure core cannot supply", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1_760_000_000_000);
      const plan = createReportFromHerePreviewApi()(capture, 'local-task', 'p1');
      expect(plan).toMatchObject({
        ok: true,
        action: 'local-task',
        taskInput: { projectId: 'p1', createdAt: 1_760_000_000_000 },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createReportFromHereExecuteApi', () => {
  it('files an upstream issue through the injected CliExec for an "issue" action', async () => {
    // A REAL scratch db path, not '/tmp/unused.db': the execute api opens
    // the store unconditionally, and Node resolves '/tmp' against the CWD
    // DRIVE on Windows — a root-level tmp dir that happened to exist on the
    // dev box but not on the CI runner's workspace drive, where
    // better-sqlite3 then throws "directory does not exist" (observed: the
    // one red test of 8450, windows-latest only, 2026-09-03).
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-issue-'));
    try {
      const exec = okExec();
      const result = await createReportFromHereExecuteApi(join(dir, 'a.db'), exec)(
        capture,
        'issue',
        '',
      );
      expect(result.plan).toMatchObject({ ok: true, action: 'issue' });
      expect(result.commandResults).toHaveLength(1);
      expect(exec).toHaveBeenCalledWith('gh', expect.arrayContaining(['issue', 'create']));
      expect(result.taskCreated).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates a board task for a "local-task" action against a known project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-execute-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1', dir);
      s.close();

      const exec = okExec();
      const result = await createReportFromHereExecuteApi(dbPath, exec)(
        capture,
        'local-task',
        'p1',
      );
      expect(result.taskCreated).toBe(true);
      expect(exec).not.toHaveBeenCalled();

      const verify = openStore(dbPath);
      const rows = verify.db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number };
      expect(rows.n).toBe(1);
      verify.close();
    } finally {
      cleanupDir(dir);
    }
  });

  it('resolves taskCreated: false for a local-task action against an unknown project, never throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-execute-unknown-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.close();

      const result = await createReportFromHereExecuteApi(dbPath, okExec())(
        capture,
        'local-task',
        'nope',
      );
      expect(result.taskCreated).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createReportFromHereExecuteApi('/tmp/unused.db')).not.toThrow();
  });

  it('opens the store read-write and closes it after the ritual — it creates board tasks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-rw-'));
    try {
      const dbPath = seededDb(dir);
      vi.mocked(openStore).mockClear();
      await createReportFromHereExecuteApi(dbPath, okExec())(capture, 'local-task', 'p1');
      expect(openStore).toHaveBeenCalledTimes(1);
      expect(openStore).toHaveBeenLastCalledWith(dbPath);
      expect(lastOpenedStore().db.open).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('still closes the store when the gh exec throws mid-ritual, and surfaces the failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-throw-'));
    try {
      const exec: CliExec = vi.fn(async () => {
        throw new Error('gh vanished mid-call');
      });
      vi.mocked(openStore).mockClear();
      await expect(
        createReportFromHereExecuteApi(join(dir, 'a.db'), exec)(capture, 'issue', ''),
      ).rejects.toThrow('gh vanished mid-call');
      expect(lastOpenedStore().db.open).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('mints one task, not two, when the same capture is executed twice across separate store opens', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-retry-'));
    try {
      const dbPath = seededDb(dir);
      const api = createReportFromHereExecuteApi(dbPath, okExec());
      const first = await api(capture, 'local-task', 'p1');
      const retry = await api(capture, 'local-task', 'p1');
      expect(first.taskCreated).toBe(true);
      expect(retry.taskCreated).toBe(false);
      expect(taskRows(dbPath)).toHaveLength(1);
    } finally {
      cleanupDir(dir);
    }
  });

  it('lands a quick-fix-pr report as a queued, focused dashboard task stamped with the wall clock', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-quickfix-'));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1_760_000_000_000);
      const dbPath = seededDb(dir);
      const exec = okExec();
      const result = await createReportFromHereExecuteApi(dbPath, exec)(
        capture,
        'quick-fix-pr',
        'p1',
      );
      expect(result).toMatchObject({ taskCreated: true, commandResults: [] });
      expect(exec).not.toHaveBeenCalled();

      const rows = taskRows(dbPath);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        project_id: 'p1',
        status: 'queued',
        source: 'dashboard',
        focus: 1,
        created_at: 1_760_000_000_000,
      });
      expect(rows[0]?.title.startsWith('QUICK-FIX (deliver as PR): ')).toBe(true);
    } finally {
      vi.useRealTimers();
      cleanupDir(dir);
    }
  });

  it('files a pool offer through gh under its pool label and creates no board task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-pool-'));
    try {
      const dbPath = seededDb(dir);
      const exec = okExec();
      const result = await createReportFromHereExecuteApi(dbPath, exec)(
        capture,
        'pool-offer',
        'p1',
      );
      expect(result.taskCreated).toBe(false);
      expect(result.commandResults).toHaveLength(1);
      const args = vi.mocked(exec).mock.calls[0]?.[1] ?? [];
      expect(args.slice(0, 2)).toEqual(['issue', 'create']);
      const label = args[args.indexOf('--label') + 1] ?? '';
      expect(label.startsWith('pool: ')).toBe(true);
      expect(taskRows(dbPath)).toHaveLength(0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('reports a failed gh issue create honestly instead of throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-ghfail-'));
    try {
      const exec: CliExec = vi.fn(async () => ({ code: 1, stdout: '' }));
      const result = await createReportFromHereExecuteApi(join(dir, 'a.db'), exec)(
        capture,
        'issue',
        '',
      );
      expect(result.plan).toMatchObject({ ok: true, action: 'issue' });
      expect(result.commandResults.map((r) => r.code)).toEqual([1]);
      expect(result.taskCreated).toBe(false);
    } finally {
      cleanupDir(dir);
    }
  });

  it('applies nothing for a rejected capture — no gh call, no task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-report-from-here-rejected-'));
    try {
      const dbPath = seededDb(dir);
      const exec = okExec();
      const result = await createReportFromHereExecuteApi(dbPath, exec)(
        { ...capture, description: '   ' },
        'local-task',
        'p1',
      );
      expect(result).toMatchObject({
        plan: { ok: false, reasonKey: 'reportNeedsDescription' },
        commandResults: [],
        taskCreated: false,
      });
      expect(exec).not.toHaveBeenCalled();
      expect(taskRows(dbPath)).toHaveLength(0);
    } finally {
      cleanupDir(dir);
    }
  });
});
