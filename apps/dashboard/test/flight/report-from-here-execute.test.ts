// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  createReportFromHerePreviewApi,
  createReportFromHereExecuteApi,
} from '../../src/flight/report-from-here-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import type { ReportRegionCapture } from '../../src/flight/report-from-here.js';

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
});
