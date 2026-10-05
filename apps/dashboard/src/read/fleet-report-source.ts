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
import { parseFiringDeath, parseNoopClass, recordsNoPrice } from './source.js';
import { isQuotaDeath } from '../flight/model-scoreboard.js';
import { LANE_DEMOTED_EVENT } from '../flight/firing-engine.js';
import { execFileSync } from 'node:child_process';
import {
  QUOTA_DEATH,
  laneOf,
  type ParkedLane,
  type ReportConvergence,
  type ReportDemotion,
  type ReportEscalation,
  type ReportFiring,
} from './fleet-report.js';

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
    died: r.shipped === 1 || r.gate_result === 'reverted' ? null : firingDeath(r.payload),
    noopClass: parseNoopClass(r.gate_result, r.payload),
    gateResult: r.gate_result,
    costUsd: recordsNoPrice(r.payload) ? null : r.cost_usd,
    durationMs: r.duration_ms,
    model: r.model,
    engine: recordedEngine(r.payload),
    effort: recordedEffort(r.payload),
  }));
}

/** An event payload's fields, or `null` for a missing or unreadable one. */
function payloadFieldsOf(payload: string | null): Readonly<Record<string, unknown>> | null {
  try {
    const fields = JSON.parse(payload ?? 'null') as unknown;
    return fields !== null && typeof fields === 'object'
      ? (fields as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function integerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** The CLI the firing record says it flew on (epic 0036). No metrics column
 *  holds it, so a record that is missing, unreadable or written before the
 *  field existed names none. */
function recordedEngine(payload: string | null): string | null {
  const engine = payloadFieldsOf(payload)?.['engine'];
  return typeof engine === 'string' ? engine : null;
}

/** The `--effort` a Claude firing's record says it ran at (web-muutby8r-h4p0dw).
 *  No metrics column holds it, so a missing, unreadable or Codex/Gemini record
 *  (whose CLI takes no effort) names none. */
function recordedEffort(payload: string | null): string | null {
  const effort = payloadFieldsOf(payload)?.['effort'];
  return typeof effort === 'string' ? effort : null;
}

/** How a firing died: a quota death when the account-wide quota killed it
 *  before it could work — its record also reads as an error exit, which
 *  would blame the model it was routed to — otherwise `parseFiringDeath`'s
 *  reading. */
function firingDeath(payload: string | null): string | null {
  return isQuotaDeath(payload) ? QUOTA_DEATH : parseFiringDeath(payload);
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

/**
 * Every rung-4 attempt since the moment, oldest first: the `merge-escalation`
 * events `fly.ts` writes at a lane's flight-end sync-back. A payload without
 * a string `kind` still counts as an attempt, as `unrecorded`.
 */
export function readReportEscalations(
  db: Db,
  baseProjectId: string,
  sinceMs: number,
): ReportEscalation[] {
  const rows = db
    .prepare(
      `SELECT payload FROM events
        WHERE (project_id = ? OR project_id LIKE ? ESCAPE '\\')
          AND type = 'merge-escalation'
          AND created_at >= ?
        ORDER BY created_at, id`,
    )
    .all(baseProjectId, `${likeEscape(baseProjectId)}--fleet-%`, sinceMs) as {
    payload: string | null;
  }[];
  return rows.map((r) => {
    const p = parseEscalationPayload(r.payload);
    return typeof p?.kind === 'string'
      ? { kind: p.kind, details: typeof p.details === 'string' ? p.details : '' }
      : { kind: 'unrecorded', details: '' };
  });
}

/** A payload's fields, or `null` for one that is not JSON or is JSON `null`. */
function parseEscalationPayload(
  payload: string | null,
): { kind?: unknown; details?: unknown } | null {
  try {
    return JSON.parse(payload ?? 'null') as { kind?: unknown; details?: unknown } | null;
  } catch {
    return null;
  }
}

/**
 * Every lane demoted since the moment, oldest first: the `lane-demoted`
 * events `fly.ts` writes when the gate reverted a lane's firings off Claude
 * twice in a row (epic 0036). The lane is the one the event names, since
 * every lane records its events under the base project id; an event naming
 * none has its lane read off that project id. A payload it cannot read still
 * counts, its engine `unrecorded`.
 */
export function readReportDemotions(
  db: Db,
  baseProjectId: string,
  sinceMs: number,
): ReportDemotion[] {
  const rows = db
    .prepare(
      `SELECT project_id, payload FROM events
        WHERE (project_id = ? OR project_id LIKE ? ESCAPE '\\')
          AND type = ?
          AND created_at >= ?
        ORDER BY created_at, id`,
    )
    .all(baseProjectId, `${likeEscape(baseProjectId)}--fleet-%`, LANE_DEMOTED_EVENT, sinceMs) as {
    project_id: string;
    payload: string | null;
  }[];
  return rows.map((r) => {
    const p = payloadFieldsOf(r.payload);
    const lane = p?.['lane'];
    const engine = p?.['engine'];
    const model = p?.['model'];
    return {
      lane: typeof lane === 'string' && lane !== '' ? lane : laneOf(r.project_id),
      engine: typeof engine === 'string' ? engine : 'unrecorded',
      model: typeof model === 'string' ? model : null,
      reverted: integerOrNull(p?.['reverted']),
      firings: integerOrNull(p?.['firings']),
    };
  });
}

/** `%` and `_` in a project id are literal, not LIKE wildcards. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Every lane branch of `projectId` in the repository at `repoPath`, with
 * the number of its commits the flight branch does not have. Read-only git;
 * an empty list when the repository or the flight branch cannot be read.
 */
export function readParkedLanes(
  repoPath: string,
  projectId: string,
  flightBranch = 'autopilot/flight',
): ParkedLane[] {
  const git = (args: readonly string[]): string =>
    execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8', windowsHide: true });
  try {
    const branches = git([
      'for-each-ref',
      '--format=%(refname:short)',
      `refs/heads/autopilot/flight-worktree-${projectId}`,
      `refs/heads/autopilot/flight-worktree-${projectId}--*`,
    ])
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b !== '');
    return branches.map((branch) => ({
      branch,
      commits: Number(
        git([
          'rev-list',
          '--count',
          '--no-merges',
          // a commit brought over by hand as a copy is not parked work
          '--cherry-pick',
          '--right-only',
          `${flightBranch}...${branch}`,
        ]).trim(),
      ),
    }));
  } catch {
    return [];
  }
}
