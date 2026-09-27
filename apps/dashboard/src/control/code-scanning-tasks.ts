// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CODE-SCANNING ALERTS REACH THE BOARD (operator, 2026-09-27: "how did you
 * let red land?"). Four high-severity CodeQL alerts sat open on the
 * repository's security page for three days. Nothing local runs CodeQL, and
 * an alert never fails a workflow run, so the post-push watch — which reads
 * only the run's conclusion — saw a green main every time.
 *
 * After every landing the watch now also reads the repository's OPEN
 * code-scanning alerts and files one board task per alert (deduplicated by
 * alert number, `source: 'self'`, so auto mode queues it for the fleet), and
 * closes the task of any alert the scanner no longer reports open. Read-only
 * against GitHub: one `gh api` GET per landing.
 */

import { createTask, setTaskStatus, type Store } from '@autopilot/store';
import type { GhRun } from './ci-status.js';

export interface CodeScanningAlert {
  readonly number: number;
  readonly rule: string;
  readonly severity: string;
  readonly path: string;
  readonly line: number | null;
  readonly message: string;
}

const TITLE_PREFIX = 'CODE-SCANNING #';

/** The open alerts in a `code-scanning/alerts` API page; malformed rows
 *  (a `null`, a non-object, or one missing its number or rule id) dropped. */
export function parseCodeScanningAlerts(json: string): CodeScanningAlert[] {
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: CodeScanningAlert[] = [];
  for (const raw of rows as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const number = row['number'];
    const rule = row['rule'] as Record<string, unknown> | undefined;
    const instance = row['most_recent_instance'] as Record<string, unknown> | undefined;
    const location = instance?.['location'] as Record<string, unknown> | undefined;
    const message = instance?.['message'] as Record<string, unknown> | undefined;
    if (typeof number !== 'number' || typeof rule?.['id'] !== 'string') continue;
    out.push({
      number,
      rule: rule['id'],
      severity: String(rule['security_severity_level'] ?? rule['severity'] ?? 'unknown'),
      path: typeof location?.['path'] === 'string' ? location['path'] : '(unknown file)',
      line: typeof location?.['start_line'] === 'number' ? location['start_line'] : null,
      message: typeof message?.['text'] === 'string' ? message['text'] : '',
    });
  }
  return out;
}

/** The board task's title for one alert — its number first, so it dedupes. */
export function alertTaskTitle(a: CodeScanningAlert): string {
  const at = a.line === null ? a.path : `${a.path}:${a.line}`;
  const text = `${TITLE_PREFIX}${a.number} (${a.severity} ${a.rule}): ${at} — ${a.message}`;
  return text.length > 240 ? `${text.slice(0, 239)}…` : text;
}

/** The alert number an open board task was filed for, if it is one of these. */
function alertNumberOf(title: string): number | null {
  const m = /^CODE-SCANNING #(\d+) /.exec(title);
  return m ? Number(m[1]) : null;
}

/** File a task for each open alert without one; close the task of each
 *  alert no longer open. Returns how many were filed and closed. */
export function syncCodeScanningTasks(
  store: Store,
  projectId: string,
  alerts: readonly CodeScanningAlert[],
  now: number,
): { filed: number; closed: number } {
  const openTasks = store.db
    .prepare(
      `SELECT id, title FROM tasks
        WHERE project_id = ? AND title LIKE ? AND status IN ('queued', 'in_progress', 'needs_approval')`,
    )
    .all(projectId, `${TITLE_PREFIX}%`) as { id: string; title: string }[];
  const tracked = new Map<number, string>();
  for (const t of openTasks) {
    const n = alertNumberOf(t.title);
    if (n !== null) tracked.set(n, t.id);
  }
  let filed = 0;
  for (const a of alerts) {
    if (tracked.has(a.number)) continue;
    const created = createTask(store, {
      id: `codescan-${a.number}-${now.toString(36)}`,
      projectId,
      title: alertTaskTitle(a),
      body:
        `CodeQL reports alert #${a.number} open on the default branch: ${a.rule}, ` +
        `${a.severity}, at ${a.path}${a.line === null ? '' : `:${a.line}`}.\n\n${a.message}\n\n` +
        'Fix the code so the scanner no longer reports it — never dismiss it on GitHub. ' +
        'The task closes by itself once the alert is no longer open after a landing.',
      severity: a.severity === 'critical' || a.severity === 'high' ? 'high' : 'medium',
      dimension: 'cybersecurity',
      source: 'self',
      status: 'needs_approval',
      createdAt: now,
    });
    if (created) filed += 1;
  }
  const open = new Set(alerts.map((a) => a.number));
  let closed = 0;
  for (const [n, id] of tracked) {
    if (!open.has(n) && setTaskStatus(store, id, 'done', now)) closed += 1;
  }
  return { filed, closed };
}

/** The repository's open alerts, one API page (the most any repo here holds). */
export function readOpenCodeScanningAlerts(gh: GhRun, repo: string): CodeScanningAlert[] {
  return parseCodeScanningAlerts(
    gh(['api', `repos/${repo}/code-scanning/alerts?state=open&per_page=100`]),
  );
}
