// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  REPORT_ACTIONS,
  isReportAction,
  planReportFromHere,
  reportTaskId,
  executeReportCommands,
  applyReportTask,
  runReportFromHereRitual,
  type ReportRegionCapture,
  type ReportTaskPlan,
} from '../../src/flight/report-from-here.js';
import { classifyIssueDimension } from '../../src/flight/issue-triage.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function capture(overrides: Partial<ReportRegionCapture> = {}): ReportRegionCapture {
  return {
    regionId: 'fly-bar',
    regionLabel: 'Fly bar',
    description: 'The launch button stays disabled after a flight lands.',
    moduleSources: ['apps/dashboard/src/web/features/fly.ts', 'apps/dashboard/src/web/shell.ts'],
    hasScreenshot: false,
    ...overrides,
  };
}

function project(s: Store, id: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, '/tmp/' + id, 100, 100);
}

function tasks(
  s: Store,
  projectId: string,
): { id: string; title: string; status: string; source: string }[] {
  return s.db
    .prepare('SELECT id, title, status, source FROM tasks WHERE project_id = ? ORDER BY id')
    .all(projectId) as { id: string; title: string; status: string; source: string }[];
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

describe('isReportAction', () => {
  it('accepts every declared report action', () => {
    for (const action of REPORT_ACTIONS) expect(isReportAction(action)).toBe(true);
  });

  it('rejects strings outside the action enum', () => {
    expect(isReportAction('merge')).toBe(false);
    expect(isReportAction('')).toBe(false);
    expect(isReportAction('Issue')).toBe(false);
  });
});

describe('planReportFromHere — validation', () => {
  it('rejects a blank description with reasoning instead of a degenerate report', () => {
    const plan = planReportFromHere(capture({ description: '   \n ' }), 'issue', 'p1', 1);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reasoning).toContain('description');
  });

  it('rejects a blank regionId — a report must say where it came from', () => {
    const plan = planReportFromHere(capture({ regionId: ' ' }), 'local-task', 'p1', 1);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reasoning).toContain('regionId');
  });

  it('rejects a task-shaped action when projectId is blank', () => {
    const plan = planReportFromHere(capture(), 'quick-fix-pr', '  ', 1);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reasoning).toContain('projectId');
  });

  it('plans an issue without needing a projectId — upstream reports ignore it', () => {
    const plan = planReportFromHere(capture(), 'issue', '', 1);
    expect(plan.ok).toBe(true);
  });
});

describe('planReportFromHere — bug issue', () => {
  it('plans the exact gh argv with title, full body, and the stock bug label', () => {
    const plan = planReportFromHere(capture(), 'issue', 'p1', 1);
    expect(plan.ok).toBe(true);
    if (!plan.ok || plan.action !== 'issue') throw new Error('expected an issue plan');
    expect(plan.title).toBe('The launch button stays disabled after a flight lands.');
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]!.args).toEqual([
      'issue',
      'create',
      '--title',
      plan.title,
      '--body',
      plan.body,
      '--label',
      'bug',
    ]);
    expect(plan.summary).toContain('bug issue');
  });

  it('composes region, module sources, and description into the body', () => {
    const plan = planReportFromHere(capture(), 'issue', 'p1', 1);
    if (!plan.ok || plan.action !== 'issue') throw new Error('expected an issue plan');
    expect(plan.body).toContain('"Fly bar" region (`fly-bar`)');
    expect(plan.body).toContain('- `apps/dashboard/src/web/features/fly.ts`');
    expect(plan.body).toContain('The launch button stays disabled');
  });

  it('says so when no module sources were captured', () => {
    const plan = planReportFromHere(capture({ moduleSources: [] }), 'issue', 'p1', 1);
    if (!plan.ok || plan.action !== 'issue') throw new Error('expected an issue plan');
    expect(plan.body).toContain('(none captured)');
  });

  it('notes an existing screenshot honestly — gh cannot attach it', () => {
    const withShot = planReportFromHere(capture({ hasScreenshot: true }), 'issue', 'p1', 1);
    const without = planReportFromHere(capture(), 'issue', 'p1', 1);
    if (!withShot.ok || withShot.action !== 'issue') throw new Error('expected an issue plan');
    if (!without.ok || without.action !== 'issue') throw new Error('expected an issue plan');
    expect(withShot.body).toContain('screenshot');
    expect(without.body).not.toContain('screenshot');
  });

  it('uses only the first line of a multi-line description as the title, bounded to 200 chars', () => {
    const longTail = 'x'.repeat(400);
    const plan = planReportFromHere(
      capture({ description: `Headline line ${longTail}\nSecond line detail` }),
      'issue',
      'p1',
      1,
    );
    if (!plan.ok || plan.action !== 'issue') throw new Error('expected an issue plan');
    expect(plan.title).toHaveLength(200);
    expect(plan.title.startsWith('Headline line ')).toBe(true);
    expect(plan.title).not.toContain('Second line');
  });
});

describe('planReportFromHere — pool offer', () => {
  it('plans a pool-labeled issue whose label matches the classified dimension', () => {
    const cap = capture({ description: 'XSS vulnerability in the notes field lets scripts run.' });
    const plan = planReportFromHere(cap, 'pool-offer', 'p1', 1);
    if (!plan.ok || plan.action !== 'pool-offer') throw new Error('expected a pool plan');
    const expected = `pool: ${classifyIssueDimension(`${cap.regionLabel} ${cap.description}`)}`;
    expect(plan.commands[0]!.args).toContain(expected);
    expect(plan.title.startsWith('[pool] ')).toBe(true);
    expect(plan.body).toContain('any co-pilot may claim it');
  });
});

describe('planReportFromHere — local task and quick-fix PR', () => {
  it('plans a queued dashboard-sourced task carrying region context in its title', () => {
    const plan = planReportFromHere(capture(), 'local-task', 'proj-9', 4242);
    if (!plan.ok || plan.action !== 'local-task') throw new Error('expected a task plan');
    expect(plan.taskInput.source).toBe('dashboard');
    expect(plan.taskInput.status).toBe('queued');
    expect(plan.taskInput.projectId).toBe('proj-9');
    expect(plan.taskInput.createdAt).toBe(4242);
    expect(plan.taskInput.title).toContain('[from Fly bar]');
    expect(plan.taskInput.dimension).toBe(
      classifyIssueDimension('Fly bar The launch button stays disabled after a flight lands.'),
    );
  });

  it('marks a quick-fix task with its PR deliverable in the title and summary', () => {
    const plan = planReportFromHere(capture(), 'quick-fix-pr', 'proj-9', 4242);
    if (!plan.ok || plan.action !== 'quick-fix-pr') throw new Error('expected a task plan');
    expect(plan.taskInput.title.startsWith('QUICK-FIX (deliver as PR): ')).toBe(true);
    expect(plan.summary).toContain('PR');
  });

  it('content-addresses the task id so a retried capture cannot mint a second task', () => {
    const same = capture();
    expect(reportTaskId(same, 'local-task')).toBe(reportTaskId(capture(), 'local-task'));
    expect(reportTaskId(same, 'local-task')).not.toBe(reportTaskId(same, 'quick-fix-pr'));
    expect(reportTaskId(same, 'local-task')).not.toBe(
      reportTaskId(capture({ description: 'A different report entirely.' }), 'local-task'),
    );
    expect(reportTaskId(same, 'local-task').startsWith('report-fly-bar-')).toBe(true);
  });
});

describe('executeReportCommands', () => {
  it('runs every planned command through exec, in order, and pairs each with its result', async () => {
    const plan = planReportFromHere(capture(), 'issue', 'p1', 1);
    if (!plan.ok || plan.action !== 'issue') throw new Error('expected an issue plan');
    const exec: CliExec = vi.fn().mockResolvedValueOnce({ code: 0, stdout: 'created #42' });

    const results = await executeReportCommands(plan.commands, exec);

    expect(exec).toHaveBeenCalledWith('gh', plan.commands[0]!.args);
    expect(results).toEqual([{ command: plan.commands[0], code: 0, stdout: 'created #42' }]);
  });

  it('returns an empty array for an empty command list without calling exec', async () => {
    const exec: CliExec = vi.fn();

    expect(await executeReportCommands([], exec)).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('applyReportTask', () => {
  it('creates the board task a local-task plan carries', () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-report-apply-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');
      const plan = planReportFromHere(capture(), 'local-task', 'p1', 100);
      if (!plan.ok || plan.action !== 'local-task') throw new Error('expected a task plan');

      expect(applyReportTask(s, plan)).toBe(true);

      const rows = tasks(s, 'p1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'queued', source: 'dashboard' });
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('is a harmless no-op on a retried capture — the content-addressed id collides', () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-report-apply-repeat-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');
      const plan = planReportFromHere(capture(), 'local-task', 'p1', 100) as ReportTaskPlan;

      applyReportTask(s, plan);
      const second = applyReportTask(s, plan);

      expect(second).toBe(false);
      expect(tasks(s, 'p1')).toHaveLength(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });
});

describe('runReportFromHereRitual', () => {
  it('files the gh issue and creates no board task for an "issue" report', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-report-ritual-issue-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');
      const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'created #7' });

      const result = await runReportFromHereRitual(exec, s, capture(), 'issue', 'p1', 100);

      expect(result.plan.ok).toBe(true);
      expect(result.commandResults).toHaveLength(1);
      expect(result.taskCreated).toBe(false);
      expect(tasks(s, 'p1')).toHaveLength(0);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('creates a board task and runs no gh commands for a "local-task" report', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-report-ritual-task-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');
      const exec: CliExec = vi.fn();

      const result = await runReportFromHereRitual(exec, s, capture(), 'local-task', 'p1', 100);

      expect(result.commandResults).toEqual([]);
      expect(result.taskCreated).toBe(true);
      expect(exec).not.toHaveBeenCalled();
      expect(tasks(s, 'p1')).toHaveLength(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('applies nothing for a rejected plan', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-report-ritual-reject-db-'));
    try {
      const s = openStore(join(dbDir, 'a.db'));
      migrate(s);
      project(s, 'p1');
      const exec: CliExec = vi.fn();

      const result = await runReportFromHereRitual(
        exec,
        s,
        capture({ description: '   ' }),
        'issue',
        'p1',
        100,
      );

      expect(result.plan.ok).toBe(false);
      expect(result.commandResults).toEqual([]);
      expect(result.taskCreated).toBe(false);
      expect(exec).not.toHaveBeenCalled();
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });
});
