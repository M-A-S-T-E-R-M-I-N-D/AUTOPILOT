// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  createControlExecuteApi,
  isControlTool,
  CONTROL_TOOLS,
  CONTROL_TOOL_SAFETY,
} from '../../src/flight/control-execute.js';

let dir: string;
let dbPath: string;

function insertProject(store: Store, id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'registered', ?, ?)`,
    )
    .run(id, id, id, `/tmp/${id}`, 1, 1);
}

function insertTask(store: Store, id: string, projectId: string, status: string): void {
  store.db
    .prepare(
      `INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, projectId, `task ${id}`, status, 1, 1);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ap-control-execute-'));
  dbPath = join(dir, 'a.db');
  const store = openStore(dbPath);
  migrate(store);
  insertProject(store, 'proj1');
  insertTask(store, 't1', 'proj1', 'queued');
  insertTask(store, 't2', 'proj1', 'queued');
  store.close();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('isControlTool / CONTROL_TOOLS / CONTROL_TOOL_SAFETY', () => {
  it('recognizes every control tool name and no others', () => {
    for (const tool of CONTROL_TOOLS) expect(isControlTool(tool)).toBe(true);
    expect(isControlTool('fly_start')).toBe(false);
    expect(isControlTool('')).toBe(false);
  });

  it('tags read/write/destructive tiers matching control.ts (MCP annotation hints)', () => {
    expect(CONTROL_TOOL_SAFETY.tasks_list).toBe('read');
    expect(CONTROL_TOOL_SAFETY.tasks_set_status).toBe('write');
    expect(CONTROL_TOOL_SAFETY.tasks_create).toBe('write');
    expect(CONTROL_TOOL_SAFETY.tasks_reorder).toBe('write');
    expect(CONTROL_TOOL_SAFETY.tasks_delete).toBe('destructive');
    expect(CONTROL_TOOL_SAFETY.project_reset).toBe('destructive');
  });
});

describe('createControlExecuteApi', () => {
  it('reports {ok:false} for a missing db file rather than throwing', () => {
    const api = createControlExecuteApi(join(dir, 'does-not-exist.db'));
    const outcome = api('tasks_list', { projectId: 'proj1' });
    expect(outcome.ok).toBe(false);
  });

  it('reports {ok:false} for an unopenable db (existsSync-true but not a real sqlite file) rather than throwing', () => {
    // existsSync only proves the path exists, not that it's an openable sqlite
    // file — a directory (or a corrupted/truncated .db after a crash mid-write)
    // passes the existsSync guard but makes better-sqlite3's own Database()
    // constructor throw synchronously. The catch/finally below it must turn
    // that into {ok:false}, same convention as the missing-file case above.
    const badPath = join(dir, 'not-a-real.db');
    mkdirSync(badPath);
    const api = createControlExecuteApi(badPath);
    expect(() => api('tasks_list', { projectId: 'proj1' })).not.toThrow();
    const outcome = api('tasks_list', { projectId: 'proj1' });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it("tasks_list returns the project's tasks", () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_list', { projectId: 'proj1' });
    expect(outcome.ok).toBe(true);
    expect(Array.isArray(outcome.result)).toBe(true);
    expect((outcome.result as Array<{ id: string }>).map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('tasks_list refuses a missing project id', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_list', {});
    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.error).toBeTruthy();
  });

  it('tasks_set_status moves a task and persists the change', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_set_status', { taskId: 't1', status: 'done' });
    expect(outcome).toMatchObject({ ok: true, result: { ok: true, taskId: 't1', status: 'done' } });
    const after = api('tasks_list', { projectId: 'proj1' });
    const t1 = (after.result as Array<{ id: string; status: string }>).find((t) => t.id === 't1');
    expect(t1?.status).toBe('done');
  });

  it('tasks_set_status refuses an invalid status value', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_set_status', { taskId: 't1', status: 'not-a-real-status' });
    expect(outcome.ok).toBe(false);
  });

  it('tasks_create adds a task the same way the dashboard form does', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_create', { projectId: 'proj1', title: 'ARCHITECT-proposed task' });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { ok: boolean }).ok).toBe(true);
    const after = api('tasks_list', { projectId: 'proj1' });
    expect((after.result as unknown[]).length).toBe(3);
  });

  it('tasks_create refuses an over-cap title', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_create', { projectId: 'proj1', title: 'x'.repeat(301) });
    expect(outcome.ok).toBe(false);
  });

  it('tasks_reorder applies the given order and reports how many ids applied', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_reorder', { projectId: 'proj1', orderedIds: ['t2', 't1'] });
    expect(outcome).toMatchObject({ ok: true, result: { ok: true, reordered: 2 } });
  });

  it('tasks_reorder refuses an empty ids array', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_reorder', { projectId: 'proj1', orderedIds: [] });
    expect(outcome.ok).toBe(false);
  });

  it('tasks_delete removes a task outright', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_delete', { taskId: 't1', projectId: 'proj1' });
    expect(outcome).toMatchObject({ ok: true, result: { ok: true, taskId: 't1' } });
    const after = api('tasks_list', { projectId: 'proj1' });
    expect((after.result as Array<{ id: string }>).map((t) => t.id)).toEqual(['t2']);
  });

  it('tasks_delete reports {ok:false} for an unknown task id, never a throw', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('tasks_delete', { taskId: 'nope', projectId: 'proj1' });
    expect(outcome).toMatchObject({ ok: true, result: { ok: false } });
  });

  it('project_reset removes the project and its tasks', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('project_reset', { projectId: 'proj1' });
    expect(outcome).toMatchObject({ ok: true, result: { ok: true, projectId: 'proj1' } });
  });

  it('project_reset refuses a missing project id', () => {
    const api = createControlExecuteApi(dbPath);
    const outcome = api('project_reset', {});
    expect(outcome.ok).toBe(false);
  });
});
