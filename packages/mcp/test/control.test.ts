// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  safetyAnnotations,
  tasksList,
  taskSetStatus,
  tasksCreate,
  tasksReorder,
  tasksDelete,
  projectReset,
  createControlServer,
} from '../src/control.js';

let store: Store;

function insertProject(id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'registered', ?, ?)`,
    )
    .run(id, id, id, `/tmp/${id}`, 1, 1);
}

function insertTask(id: string, projectId: string, status: string, severity: string | null): void {
  store.db
    .prepare(
      `INSERT INTO tasks (id, project_id, title, status, severity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, projectId, `task ${id}`, status, severity, 1, 1);
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
});

afterEach(() => {
  store.close();
});

describe('safetyAnnotations', () => {
  it('marks read tools read-only and never destructive', () => {
    expect(safetyAnnotations('read')).toEqual({ readOnlyHint: true, destructiveHint: false });
  });

  it('marks write tools neither read-only nor destructive', () => {
    expect(safetyAnnotations('write')).toEqual({ readOnlyHint: false, destructiveHint: false });
  });

  it('marks destructive tools destructive and not read-only', () => {
    expect(safetyAnnotations('destructive')).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });
});

describe('tasksList', () => {
  it("delegates to the store's true work order for the given project", () => {
    insertProject('p1');
    insertProject('p2');
    insertTask('t1', 'p1', 'queued', 'high');
    insertTask('t2', 'p2', 'queued', 'critical'); // other project — must not leak in
    const rows = tasksList(store, { projectId: 'p1' });
    expect(rows.map((r) => r.id)).toEqual(['t1']);
  });
});

describe('taskSetStatus', () => {
  it('moves a known task to the given status and reports ok: true', () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'high');
    const result = taskSetStatus(store, { taskId: 't1', status: 'in_progress' });
    expect(result).toEqual({ ok: true, taskId: 't1', status: 'in_progress' });
    const row = store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('t1') as {
      status: string;
    };
    expect(row.status).toBe('in_progress');
  });

  it('reports ok: false for an unknown task id, without throwing', () => {
    const result = taskSetStatus(store, { taskId: 'missing', status: 'done' });
    expect(result).toEqual({ ok: false, taskId: 'missing', status: 'done' });
  });
});

describe('tasksCreate', () => {
  it('inserts a queued, dashboard-sourced task and reports ok: true with the new id', () => {
    insertProject('p1');
    const result = tasksCreate(store, { projectId: 'p1', title: 'new task' });
    expect(result.ok).toBe(true);
    expect(result.taskId).toMatch(/^web-[0-9a-z]+-[0-9a-z]{6}$/);
    const row = store.db
      .prepare('SELECT title, status, source, severity, dimension FROM tasks WHERE id = ?')
      .get(result.taskId) as {
      title: string;
      status: string;
      source: string;
      severity: string | null;
      dimension: string | null;
    };
    expect(row).toEqual({
      title: 'new task',
      status: 'queued',
      source: 'dashboard',
      severity: null,
      dimension: null,
    });
  });

  it('carries an explicit severity/dimension through to the row', () => {
    insertProject('p1');
    const result = tasksCreate(store, {
      projectId: 'p1',
      title: 'new task',
      severity: 'high',
      dimension: 'cybersecurity',
    });
    expect(result.ok).toBe(true);
    const row = store.db
      .prepare('SELECT severity, dimension FROM tasks WHERE id = ?')
      .get(result.taskId) as { severity: string; dimension: string };
    expect(row).toEqual({ severity: 'high', dimension: 'cybersecurity' });
  });

  it('reports ok: false for an unknown project id, without throwing', () => {
    const result = tasksCreate(store, { projectId: 'missing', title: 'new task' });
    expect(result.ok).toBe(false);
  });

  it('refuses a title over 300 chars — the same cap the dashboard form enforces (server.ts MAX_TASK_TITLE_CHARS)', () => {
    // Without this, the MCP surface silently bypassed the HTTP layer's cap:
    // "indistinguishable from an operator-typed task" must include the limits.
    insertProject('p1');
    const result = tasksCreate(store, { projectId: 'p1', title: 'x'.repeat(301) });
    expect(result.ok).toBe(false);
    expect(store.db.prepare('SELECT count(*) c FROM tasks').get()).toEqual({ c: 0 });
  });

  it('accepts a title of exactly 300 chars (the cap is inclusive)', () => {
    insertProject('p1');
    const result = tasksCreate(store, { projectId: 'p1', title: 'x'.repeat(300) });
    expect(result.ok).toBe(true);
  });
});

describe('tasksReorder', () => {
  it('applies position-as-priority to every listed id and reports ok: true with the count', () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'high');
    insertTask('t2', 'p1', 'queued', 'high');
    insertTask('t3', 'p1', 'queued', 'high');
    const result = tasksReorder(store, { projectId: 'p1', orderedIds: ['t3', 't1', 't2'] });
    expect(result).toEqual({ ok: true, projectId: 'p1', reordered: 3 });
    const rows = store.db
      .prepare('SELECT id, priority FROM tasks WHERE project_id = ? ORDER BY priority ASC')
      .all('p1') as Array<{ id: string; priority: number }>;
    expect(rows.map((r) => r.id)).toEqual(['t3', 't1', 't2']);
  });

  it('silently skips ids from another project, counting only the ones that land', () => {
    insertProject('p1');
    insertProject('p2');
    insertTask('t1', 'p1', 'queued', 'high');
    insertTask('t2', 'p2', 'queued', 'high'); // wrong project — must not be reordered
    const result = tasksReorder(store, { projectId: 'p1', orderedIds: ['t1', 't2'] });
    expect(result).toEqual({ ok: true, projectId: 'p1', reordered: 1 });
  });

  it('reports ok: false and reordered: 0 when nothing in the list belongs to the project, without throwing', () => {
    insertProject('p1');
    const result = tasksReorder(store, { projectId: 'p1', orderedIds: ['missing'] });
    expect(result).toEqual({ ok: false, projectId: 'p1', reordered: 0 });
  });
});

describe('tasksDelete', () => {
  it('removes a known task belonging to the given project and reports ok: true', () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'high');
    const result = tasksDelete(store, { taskId: 't1', projectId: 'p1' });
    expect(result).toEqual({ ok: true, taskId: 't1' });
    const row = store.db.prepare('SELECT id FROM tasks WHERE id = ?').get('t1');
    expect(row).toBeUndefined();
  });

  it('reports ok: false for an unknown task id, without throwing', () => {
    const result = tasksDelete(store, { taskId: 'missing', projectId: 'p1' });
    expect(result).toEqual({ ok: false, taskId: 'missing' });
  });

  it('refuses to delete a task belonging to a DIFFERENT project — no cross-project deletion', () => {
    // Every other write/destructive tool (tasksCreate, tasksReorder, projectReset)
    // scopes to the caller's own projectId; tasks_delete must too, or an MCP
    // client that knows/guesses another project's task id can delete it.
    insertProject('p1');
    insertProject('p2');
    insertTask('t1', 'p1', 'queued', 'high');
    const result = tasksDelete(store, { taskId: 't1', projectId: 'p2' });
    expect(result).toEqual({ ok: false, taskId: 't1' });
    const row = store.db.prepare('SELECT id FROM tasks WHERE id = ?').get('t1');
    expect(row).toEqual({ id: 't1' });
  });
});

describe('projectReset', () => {
  it('removes a known project (and its tasks) and reports ok: true', () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'high');
    const result = projectReset(store, { projectId: 'p1' });
    expect(result).toEqual({ ok: true, projectId: 'p1' });
    expect(store.db.prepare('SELECT id FROM projects WHERE id = ?').get('p1')).toBeUndefined();
    // FK ON DELETE CASCADE also took the project's tasks with it.
    expect(store.db.prepare('SELECT id FROM tasks WHERE id = ?').get('t1')).toBeUndefined();
  });

  it('reports ok: false for an unknown project id, without throwing', () => {
    const result = projectReset(store, { projectId: 'missing' });
    expect(result).toEqual({ ok: false, projectId: 'missing' });
  });
});

describe('createControlServer over MCP', () => {
  it('exposes tasks_list as a read-only, non-destructive tool', async () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'medium');
    const server = createControlServer(store);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const tasksListTool = tools.find((t) => t.name === 'tasks_list');
    expect(tasksListTool?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });

    const result = await client.callTool({ name: 'tasks_list', arguments: { projectId: 'p1' } });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]).toBeDefined();
    const parsed = JSON.parse(content[0]!.text) as Array<{ id: string }>;
    expect(parsed.map((t) => t.id)).toEqual(['t1']);

    await client.close();
    await server.close();
  });

  it('exposes tasks_set_status as a write, non-destructive, non-read-only tool', async () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'medium');
    const server = createControlServer(store);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const setStatusTool = tools.find((t) => t.name === 'tasks_set_status');
    expect(setStatusTool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });

    const result = await client.callTool({
      name: 'tasks_set_status',
      arguments: { taskId: 't1', status: 'done' },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]).toBeDefined();
    const parsed = JSON.parse(content[0]!.text) as { ok: boolean; status: string };
    expect(parsed).toEqual({ ok: true, taskId: 't1', status: 'done' });

    await client.close();
    await server.close();
  });

  it('exposes tasks_reorder as a write, non-destructive, non-read-only tool', async () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'medium');
    insertTask('t2', 'p1', 'queued', 'medium');
    const server = createControlServer(store);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const reorderTool = tools.find((t) => t.name === 'tasks_reorder');
    expect(reorderTool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });

    const result = await client.callTool({
      name: 'tasks_reorder',
      arguments: { projectId: 'p1', orderedIds: ['t2', 't1'] },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]).toBeDefined();
    const parsed = JSON.parse(content[0]!.text) as {
      ok: boolean;
      projectId: string;
      reordered: number;
    };
    expect(parsed).toEqual({ ok: true, projectId: 'p1', reordered: 2 });

    await client.close();
    await server.close();
  });

  it('exposes tasks_delete as a destructive, non-read-only tool that removes the row', async () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'medium');
    const server = createControlServer(store);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const deleteTool = tools.find((t) => t.name === 'tasks_delete');
    expect(deleteTool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });

    const result = await client.callTool({
      name: 'tasks_delete',
      arguments: { taskId: 't1', projectId: 'p1' },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]).toBeDefined();
    const parsed = JSON.parse(content[0]!.text) as { ok: boolean; taskId: string };
    expect(parsed).toEqual({ ok: true, taskId: 't1' });
    expect(store.db.prepare('SELECT id FROM tasks WHERE id = ?').get('t1')).toBeUndefined();

    await client.close();
    await server.close();
  });

  it('exposes project_reset as a destructive, non-read-only tool that removes the project', async () => {
    insertProject('p1');
    insertTask('t1', 'p1', 'queued', 'medium');
    const server = createControlServer(store);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const resetTool = tools.find((t) => t.name === 'project_reset');
    expect(resetTool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });

    const result = await client.callTool({
      name: 'project_reset',
      arguments: { projectId: 'p1' },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]).toBeDefined();
    const parsed = JSON.parse(content[0]!.text) as { ok: boolean; projectId: string };
    expect(parsed).toEqual({ ok: true, projectId: 'p1' });
    expect(store.db.prepare('SELECT id FROM projects WHERE id = ?').get('p1')).toBeUndefined();

    await client.close();
    await server.close();
  });
});
