// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The store side of THE FLEET REPORT (`read/fleet-report.ts`): every firing a
 * project's lanes recorded since a moment, with its board task's title, and
 * every convergence verdict. A fleet's lanes record firings under their own
 * project ids (`<base>--fleet-N`) but share the base project's board and
 * event stream, so both are read here. Read-only.
 */

import type { Store } from '@autopilot/store';

type Db = Store['db'];
import { parseFiringDeath, parseNoopClass } from './source.js';
import type { ReportConvergence, ReportFiring } from './fleet-report.js';

interface FiringRow {
  readonly firing_id: string;
  readonly title: string | null;
  readonly commit_subject: string | null;
  readonly shipped: 0 | 1;
  readonly gate_result: string | null;
  readonly cost_usd: number;
  readonly duration_ms: number;
  readonly model: string | null;
  readonly payload: string | null;
}

export function readReportFirings(db: Db, baseProjectId: string, sinceMs: number): ReportFiring[] {
  const rows = db
    .prepare(
      `SELECT m.firing_id, t.title, m.commit_subject, m.shipped, m.gate_result,
              m.cost_usd, m.duration_ms, m.model, e.payload
         FROM metrics m
         LEFT JOIN tasks t ON t.id = m.item AND t.project_id = ?
         LEFT JOIN events e ON e.firing_id = m.firing_id AND e.type = 'firing'
        WHERE (m.project_id = ? OR m.project_id LIKE ? ESCAPE '\\')
          AND m.created_at >= ?
        ORDER BY m.created_at, m.id`,
    )
    .all(
      baseProjectId,
      baseProjectId,
      `${likeEscape(baseProjectId)}--fleet-%`,
      sinceMs,
    ) as FiringRow[];
  return rows.map((r) => ({
    firingId: r.firing_id,
    title: r.title,
    subject: r.commit_subject,
    shipped: r.shipped === 1,
    died: r.shipped === 1 || r.gate_result === 'reverted' ? null : parseFiringDeath(r.payload),
    noopClass: parseNoopClass(r.gate_result, r.payload),
    gateResult: r.gate_result,
    costUsd: r.cost_usd,
    durationMs: r.duration_ms,
    model: r.model,
  }));
}

export function readReportConvergence(
  db: Db,
  baseProjectId: string,
  sinceMs: number,
): ReportConvergence[] {
  const rows = db
    .prepare(
      `SELECT type, payload FROM events
        WHERE (project_id = ? OR project_id LIKE ? ESCAPE '\\')
          AND type IN ('convergence-green', 'convergence-red')
          AND created_at >= ?
        ORDER BY created_at, id`,
    )
    .all(baseProjectId, `${likeEscape(baseProjectId)}--fleet-%`, sinceMs) as {
    type: string;
    payload: string | null;
  }[];
  return rows.map((r) => {
    let p: { check?: unknown; merge?: unknown; queuedMs?: unknown } = {};
    try {
      p = JSON.parse(r.payload ?? '{}') as typeof p;
    } catch {
      p = {};
    }
    return {
      verdict: r.type === 'convergence-red' ? 'red' : 'green',
      check: typeof p.check === 'string' ? p.check : null,
      merge: typeof p.merge === 'string' ? p.merge : null,
      ...(typeof p.queuedMs === 'number' ? { queuedMs: p.queuedMs } : {}),
    };
  });
}

/** `%` and `_` in a project id are literal, not LIKE wildcards. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
