// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Control-as-MCP — the dashboard's own task/fly/project APIs, exposed as MCP
 * tools any harness can drive (REACTIVITY §1.1; ARCHITECT chat v2, board
 * web-msnqmgge-oijj8x, is this surface's first real consumer). Built
 * incrementally: `tasks_list` (read) and `tasks_set_status` (write) landed
 * first; `tasks_create`/`tasks_reorder` (write) and `tasks_delete`/
 * `project_reset` (destructive) follow the same `registerControlTools`
 * pattern — each handler stays a plain, Store-in/data-out function so it is
 * testable without a live transport. Still open from the task/fly/reorder
 * set: an "approve" tool (today's `tasks_set_status` already covers moving a
 * task off `needs_approval`) and `fly_start`/`fly_stop`.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  recentTasks,
  setTaskStatus,
  deleteTask,
  deleteProject,
  createTask,
  reorderTasks,
  SEVERITIES,
  DIMENSIONS,
  type Store,
  type TaskSummaryRow,
} from '@autopilot/store';

export const CONTROL_SERVER_NAME = 'autopilot-control';
export const CONTROL_SERVER_VERSION = '0.1.0';

/** The three MCP tool-annotation tiers a control tool can carry (MCP spec's own hints — not a bespoke scheme). */
export type ControlSafety = 'read' | 'write' | 'destructive';

/** Maps our safety tag onto the standard MCP tool-annotation hints clients already understand. */
export function safetyAnnotations(safety: ControlSafety): {
  readOnlyHint: boolean;
  destructiveHint: boolean;
} {
  return {
    readOnlyHint: safety === 'read',
    destructiveHint: safety === 'destructive',
  };
}

const TASKS_LIST_INPUT = {
  projectId: z.string().min(1),
  limit: z.number().int().positive().max(200).optional(),
};

/** tasks_list's handler — plain function so it is testable without a transport. */
export function tasksList(
  store: Store,
  args: { projectId: string; limit?: number | undefined },
): TaskSummaryRow[] {
  return recentTasks(store.db, args.projectId, args.limit);
}

/** The task board's state-machine values (schema.ts's CHECK constraint on
 *  tasks.status) — exported so an in-process caller (ARCHITECT chat v2 slice
 *  1's dashboard-server wiring) can validate a status value the same way
 *  `registerControlTools`'s zod schema does, without duplicating the list. */
export const TASK_STATUS_VALUES = [
  'queued',
  'in_progress',
  'done',
  'needs_approval',
  'deferred',
] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

const TASKS_SET_STATUS_INPUT = {
  taskId: z.string().min(1),
  status: z.enum(TASK_STATUS_VALUES),
};

export interface TaskSetStatusResult {
  readonly ok: boolean;
  readonly taskId: string;
  readonly status: TaskStatus;
}

/**
 * tasks_set_status's handler — a write action: it executes immediately and
 * reports what happened (`ok: false` for an unknown task id, never a throw).
 */
export function taskSetStatus(
  store: Store,
  args: { taskId: string; status: TaskStatus },
): TaskSetStatusResult {
  const ok = setTaskStatus(store, args.taskId, args.status, Date.now());
  return { ok, taskId: args.taskId, status: args.status };
}

/** The same `web-<ts36>-<rand6>` scheme `server/main.ts`'s `tasks.create` API
 *  uses for a dashboard-form task — kept identical so a task's id origin
 *  (MCP tool vs. dashboard form) is never distinguishable from its shape. */
function genTaskId(): string {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The dashboard form's own title cap (`server.ts` MAX_TASK_TITLE_CHARS) —
 *  mirrored here so the MCP surface can't silently mint what the HTTP layer
 *  refuses: "indistinguishable from an operator-typed task" includes limits. */
const MAX_TASK_TITLE_CHARS = 300;

const TASKS_CREATE_INPUT = {
  projectId: z.string().min(1),
  title: z.string().min(1).max(MAX_TASK_TITLE_CHARS),
  severity: z.enum(SEVERITIES).optional(),
  dimension: z.enum(DIMENSIONS).optional(),
};

export interface TaskCreateResult {
  readonly ok: boolean;
  readonly taskId: string;
}

/**
 * tasks_create's handler — a write action (ARCHITECT chat v2, board
 * web-msnqmgge-oijj8x's "task create/status/approve/reorder" set): adds a
 * `source: 'dashboard'` task the same way the dashboard's own new-task form
 * does (`server/main.ts`'s `tasks.create`), so an ARCHITECT-created task is
 * indistinguishable from an operator-typed one — never auto-mined, never
 * skipping the id scheme. `ok: false` (never a throw) for a missing project,
 * a blank or over-cap title (MAX_TASK_TITLE_CHARS, the dashboard form's own
 * limit), or a CHECK-rejected severity/dimension (createTask's own
 * contract — see `mutate.ts`). The length cap lives in the handler as well
 * as the Zod schema so a direct (non-MCP) caller gets the same refusal.
 */
export function tasksCreate(
  store: Store,
  args: {
    projectId: string;
    title: string;
    severity?: string | undefined;
    dimension?: string | undefined;
  },
): TaskCreateResult {
  const taskId = genTaskId();
  if (args.title.length > MAX_TASK_TITLE_CHARS) return { ok: false, taskId };
  const ok = createTask(store, {
    id: taskId,
    projectId: args.projectId,
    title: args.title,
    severity: args.severity ?? null,
    dimension: args.dimension ?? null,
    createdAt: Date.now(),
  });
  return { ok, taskId };
}

const TASKS_REORDER_INPUT = {
  projectId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
};

export interface TaskReorderResult {
  readonly ok: boolean;
  readonly projectId: string;
  readonly reordered: number;
}

/**
 * tasks_reorder's handler — a write action (ARCHITECT chat v2, board
 * web-msnqmgge-oijj8x's "task create/status/approve/reorder" set): applies
 * the operator's explicit priority ordering by delegating to the store's own
 * `reorderTasks` — the exact function the dashboard's own ↑/↓ reorder API
 * (`read/source.ts`'s `reorderTasksInStore`) calls, so an ARCHITECT reorder
 * is indistinguishable from an operator-driven one. `ok` mirrors that same
 * caller's contract (`reordered > 0`): ids that don't belong to `projectId`
 * are silently skipped rather than thrown on, so a fully-mismatched list
 * reports `ok: false` with `reordered: 0` instead of raising.
 */
export function tasksReorder(
  store: Store,
  args: { projectId: string; orderedIds: readonly string[] },
): TaskReorderResult {
  const reordered = reorderTasks(store, args.projectId, args.orderedIds, Date.now());
  return { ok: reordered > 0, projectId: args.projectId, reordered };
}

const TASKS_DELETE_INPUT = {
  taskId: z.string().min(1),
  projectId: z.string().min(1),
};

export interface TaskDeleteResult {
  readonly ok: boolean;
  readonly taskId: string;
}

/**
 * tasks_delete's handler — destructive: removes the row outright. Every other
 * write/destructive control tool (`tasksCreate`, `tasksReorder`, `projectReset`)
 * scopes its effect to the caller's own `projectId`; this one is no exception —
 * a task that belongs to a DIFFERENT project reports `ok: false` and is left
 * untouched, so an MCP client that knows or guesses another project's task id
 * can never delete across a project boundary. `ok: false` (never a throw) for
 * an unknown task id too.
 */
export function tasksDelete(
  store: Store,
  args: { taskId: string; projectId: string },
): TaskDeleteResult {
  const owner = store.db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(args.taskId) as
    { project_id: string } | undefined;
  if (!owner || owner.project_id !== args.projectId) {
    return { ok: false, taskId: args.taskId };
  }
  const ok = deleteTask(store, args.taskId);
  return { ok, taskId: args.taskId };
}

const PROJECT_RESET_INPUT = {
  projectId: z.string().min(1),
};

export interface ProjectResetResult {
  readonly ok: boolean;
  readonly projectId: string;
}

/** project_reset's handler — destructive: removes the project and everything the store holds for it (never the folder on disk). */
export function projectReset(store: Store, args: { projectId: string }): ProjectResetResult {
  const ok = deleteProject(store, args.projectId);
  return { ok, projectId: args.projectId };
}

/** Registers every currently-implemented control tool on `server` against `store`. */
export function registerControlTools(server: McpServer, store: Store): void {
  server.registerTool(
    'tasks_list',
    {
      title: 'List tasks',
      description:
        "List a project's tasks in AUTOPILOT's true work order — open first, then focus, " +
        'severity band, operator priority, and recency (the same order the dashboard and the ' +
        "flight's pick order read).",
      inputSchema: TASKS_LIST_INPUT,
      annotations: { title: 'List tasks', ...safetyAnnotations('read') },
    },
    (args) => {
      const tasks = tasksList(store, args);
      return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
    },
  );

  server.registerTool(
    'tasks_set_status',
    {
      title: 'Set task status',
      description:
        'Move a task to a new status (queued, in_progress, done, needs_approval, deferred) — ' +
        'a write action: it executes immediately and reports whether the task was found and updated.',
      inputSchema: TASKS_SET_STATUS_INPUT,
      annotations: { title: 'Set task status', ...safetyAnnotations('write') },
    },
    (args) => {
      const result = taskSetStatus(store, args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'tasks_create',
    {
      title: 'Create task',
      description:
        "Add a task to a project's board — the same write path the dashboard's own " +
        'new-task form uses (source: dashboard, status: queued). A write action: it ' +
        'executes immediately and reports the new id and whether the insert succeeded.',
      inputSchema: TASKS_CREATE_INPUT,
      annotations: { title: 'Create task', ...safetyAnnotations('write') },
    },
    (args) => {
      const result = tasksCreate(store, args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'tasks_reorder',
    {
      title: 'Reorder tasks',
      description:
        "Apply an explicit priority order to a project's tasks — position in the given id " +
        "list becomes priority (lower = sooner), the same ordering the dashboard's own ↑/↓ " +
        'controls apply. A write action: it executes immediately and reports how many of the ' +
        'given ids actually belonged to the project and were reordered.',
      inputSchema: TASKS_REORDER_INPUT,
      annotations: { title: 'Reorder tasks', ...safetyAnnotations('write') },
    },
    (args) => {
      const result = tasksReorder(store, args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'tasks_delete',
    {
      title: 'Delete task',
      description:
        'Remove a task outright — the operator\'s "reject / remove" for a dismissed proposal ' +
        'or an obsolete task. Destructive: it executes immediately and reports whether a row ' +
        'was actually removed. Scoped to projectId: a task belonging to a different project ' +
        'is refused, never deleted. Deleting a self-proposed task also records a rejected ' +
        'evaluation label.',
      inputSchema: TASKS_DELETE_INPUT,
      annotations: { title: 'Delete task', ...safetyAnnotations('destructive') },
    },
    (args) => {
      const result = tasksDelete(store, args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'project_reset',
    {
      title: 'Reset project',
      description:
        'Remove a project and everything the store holds for it (tasks, events, metrics, ' +
        'versions, search index). Destructive: it executes immediately and reports whether a ' +
        "project row was removed. Never touches the project's folder on disk or its git backup.",
      inputSchema: PROJECT_RESET_INPUT,
      annotations: { title: 'Reset project', ...safetyAnnotations('destructive') },
    },
    (args) => {
      const result = projectReset(store, args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );
}

/** Builds a ready-to-connect control server with every implemented tool registered. */
export function createControlServer(store: Store): McpServer {
  const server = new McpServer({ name: CONTROL_SERVER_NAME, version: CONTROL_SERVER_VERSION });
  registerControlTools(server, store);
  return server;
}
