// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ARCHITECT chat v2 slice 1 (`docs/epics/0011-architect-chat-v2.md`, board
 * web-msnqmgge-oijj8x) — wires the previously-dormant `@autopilot/mcp`
 * control-tool handlers (`packages/mcp/src/control.ts`) into the dashboard
 * server in-process: opens a fresh `Store` per call and always closes it,
 * the same open-store-per-call shape `read/source.ts`'s `*InStore` helpers
 * (`createTaskInStore`, `setTaskStatusInStore`, ...) already use for the
 * dashboard's own task-board form — not `createControlServer`'s MCP stdio/
 * HTTP transport, which stays out of scope (see the epic's "Out of scope";
 * `docs/THREAT-MODEL.md` T9). Every tool's argument validation happens
 * here, not in `server/server.ts`, mirroring how `flight/pr-review-
 * execute.ts` owns its own domain checks and leaves the HTTP handler only
 * the framing concerns (method, content-type, rate limit, JSON parse).
 * Slices 2-3 (shipped) are this endpoint's UI consumer: the Ask panel's
 * ARCHITECT persona proposes a call via `ask/architect-proposal.ts`, and
 * `web/features/search.ts`'s action card POSTs here once the operator
 * confirms (or immediately for a `read`-tier tool).
 */

import { existsSync } from 'node:fs';
import { openStore, SEVERITIES, DIMENSIONS, type Store } from '@autopilot/store';
import {
  tasksList,
  taskSetStatus,
  tasksCreate,
  tasksReorder,
  tasksDelete,
  projectReset,
  TASK_STATUS_VALUES,
  type ControlSafety,
} from '@autopilot/mcp';

/** The dashboard task form's own title cap (`server.ts` MAX_TASK_TITLE_CHARS)
 *  — mirrored here the same way `control.ts`'s own `tasksCreate` mirrors it,
 *  so an ARCHITECT-proposed title is refused before it ever reaches the store. */
const MAX_TASK_TITLE_CHARS = 300;
/** The dashboard reorder form's own cap (`server.ts` MAX_REORDER_IDS). */
const MAX_REORDER_IDS = 500;

/** The six control-tool names ARCHITECT chat v2 wires up (`control.ts`'s
 *  MCP tool names, unchanged — a future action-card UI sends these same
 *  strings, so there is exactly one vocabulary for "which tool"). */
export const CONTROL_TOOLS = [
  'tasks_list',
  'tasks_set_status',
  'tasks_create',
  'tasks_reorder',
  'tasks_delete',
  'project_reset',
] as const;
export type ControlTool = (typeof CONTROL_TOOLS)[number];

export function isControlTool(value: string): value is ControlTool {
  return (CONTROL_TOOLS as readonly string[]).includes(value);
}

/** MCP tool-annotation safety tier per tool (`control.ts`'s own
 *  `safetyAnnotations` tiers) — read auto-runs once confirmed present, write/
 *  destructive require an explicit operator click, per the epic's
 *  acceptance criteria. Slice 1 ships no UI; this table is what the future
 *  action-card client (slice 3) reads to decide whether to auto-run. */
export const CONTROL_TOOL_SAFETY: Record<ControlTool, ControlSafety> = {
  tasks_list: 'read',
  tasks_set_status: 'write',
  tasks_create: 'write',
  tasks_reorder: 'write',
  tasks_delete: 'destructive',
  project_reset: 'destructive',
};

/** One control-tool execute attempt's outcome. `ok: false` covers both a
 *  validation refusal (bad/missing args) and a handler-reported failure
 *  (unknown task/project id) — never a throw; `error` is set only for the
 *  former, since the handler's own result already explains the latter. */
export interface ControlExecuteOutcome {
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

export type ControlExecuteApi = (
  tool: ControlTool,
  args: Record<string, unknown>,
) => ControlExecuteOutcome;

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value : '';
}

function dispatch(
  store: Store,
  tool: ControlTool,
  args: Record<string, unknown>,
): ControlExecuteOutcome {
  switch (tool) {
    case 'tasks_list': {
      const projectId = str(args, 'projectId');
      if (projectId.length === 0) return { ok: false, error: 'a project id is required' };
      const rawLimit = args['limit'];
      const limit = typeof rawLimit === 'number' ? rawLimit : undefined;
      return { ok: true, result: tasksList(store, { projectId, limit }) };
    }
    case 'tasks_set_status': {
      const taskId = str(args, 'taskId');
      const status = str(args, 'status');
      if (taskId.length === 0 || !(TASK_STATUS_VALUES as readonly string[]).includes(status)) {
        return { ok: false, error: 'a task id and a valid status are required' };
      }
      return {
        ok: true,
        result: taskSetStatus(store, {
          taskId,
          status: status as (typeof TASK_STATUS_VALUES)[number],
        }),
      };
    }
    case 'tasks_create': {
      const projectId = str(args, 'projectId');
      const title = str(args, 'title').trim();
      if (projectId.length === 0 || title.length === 0 || title.length > MAX_TASK_TITLE_CHARS) {
        return {
          ok: false,
          error: `a project id and a task title (<= ${MAX_TASK_TITLE_CHARS} chars) are required`,
        };
      }
      const severity = str(args, 'severity');
      const dimension = str(args, 'dimension');
      return {
        ok: true,
        result: tasksCreate(store, {
          projectId,
          title,
          severity: (SEVERITIES as readonly string[]).includes(severity) ? severity : undefined,
          dimension: (DIMENSIONS as readonly string[]).includes(dimension) ? dimension : undefined,
        }),
      };
    }
    case 'tasks_reorder': {
      const projectId = str(args, 'projectId');
      const rawIds = args['orderedIds'];
      const orderedIds = Array.isArray(rawIds)
        ? rawIds.filter((x): x is string => typeof x === 'string')
        : [];
      if (
        projectId.length === 0 ||
        orderedIds.length === 0 ||
        orderedIds.length > MAX_REORDER_IDS
      ) {
        return {
          ok: false,
          error: `a project id and an ordered ids array (<= ${MAX_REORDER_IDS}) are required`,
        };
      }
      return { ok: true, result: tasksReorder(store, { projectId, orderedIds }) };
    }
    case 'tasks_delete': {
      const taskId = str(args, 'taskId');
      const projectId = str(args, 'projectId');
      if (taskId.length === 0 || projectId.length === 0) {
        return { ok: false, error: 'a task id and a project id are required' };
      }
      return { ok: true, result: tasksDelete(store, { taskId, projectId }) };
    }
    case 'project_reset': {
      const projectId = str(args, 'projectId');
      if (projectId.length === 0) return { ok: false, error: 'a project id is required' };
      return { ok: true, result: projectReset(store, { projectId }) };
    }
  }
}

/** Builds the real control-execute API against a dashboard SQLite db — opens
 *  a fresh `Store` per call and always closes it (same shape `read/
 *  source.ts`'s `*InStore` helpers use). A missing db file reports
 *  `{ok:false}` rather than throwing, same convention as those helpers. */
export function createControlExecuteApi(dbPath: string): ControlExecuteApi {
  return (tool, args) => {
    if (!existsSync(dbPath)) return { ok: false, error: 'store unavailable' };
    let store: Store | undefined;
    try {
      store = openStore(dbPath);
      return dispatch(store, tool, args);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'control execute failed',
      };
    } finally {
      store?.close();
    }
  };
}
