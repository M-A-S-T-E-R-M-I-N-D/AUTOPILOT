// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * self-study/export-dataset — anonymized CSV/JSONL export of the firing
 * dataset (the local `.autopilot/autopilot.db` telemetry store) for academic
 * reuse (SOTA-MAP dataset-release slice). See docs/SELF-STUDY/DATASHEET.md
 * for the full Datasheets-for-Datasets statement covering motivation,
 * composition, collection process, and recommended uses.
 *
 * Anonymization keeps only quantitative/categorical telemetry columns and
 * drops or replaces every column that could identify the private repo or
 * leak its contents: `project_id`, `item` (board task id), `sha` /
 * `head_before` / `head_after` (git commit hashes), `commit_subject` and
 * `deviation_reason` (free text). `firing_id` is replaced by a sequential
 * `row_id` assigned in chronological order, so rows stay orderable without
 * exposing the original opaque identifier.
 *
 * A ONE-TIME/on-demand action like pin-eval-suite.mjs, not part of the
 * automatic post-flight `self-study:update` refresh — an operator runs this
 * deliberately when preparing a release, and reviews the output before
 * publishing it anywhere `.autopilot/autopilot.db` itself is not allowed to go
 * (FLIGHT-CONTAINMENT.md).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, listProjects } from '../../packages/store/dist/index.js';

const DB_ENV_VAR = 'AUTOPILOT_DB';
const OUT_DIR = join(process.cwd(), 'docs', 'SELF-STUDY', 'dataset');
const CSV_PATH = join(OUT_DIR, 'firings.csv');
const JSONL_PATH = join(OUT_DIR, 'firings.jsonl');

/** Mirrors generate-data.mjs / pin-eval-suite.mjs's resolution (kept local —
 *  each self-study script is a standalone entrypoint with no shared runtime
 *  dependency on the dashboard app). */
function resolveDbPath(env = process.env, cwd = process.cwd()) {
  const override = env[DB_ENV_VAR];
  return override && override.length > 0 ? override : join(cwd, '.autopilot', 'autopilot.db');
}

// Quantitative/categorical telemetry only — see the anonymization note above
// for exactly which raw `metrics` columns are excluded and why.
const EXPORT_COLUMNS = [
  'kind',
  'shipped',
  'self_reported',
  'model',
  'cost_usd',
  'real_cost_usd',
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'turns',
  'duration_ms',
  'gate_result',
  'head_advanced',
  'sha_verified',
  'completion',
  'test_first',
  'picked_rank',
  'resumed',
  'extended',
  'created_at',
];

/** Reads every `metrics` row for `projectId` in chronological order and
 *  anonymizes it: only `EXPORT_COLUMNS` survive, prefixed with a sequential
 *  `row_id` standing in for the dropped `firing_id`. */
export function anonymizedRows(db, projectId) {
  const rows = db
    .prepare(
      `SELECT ${EXPORT_COLUMNS.join(', ')} FROM metrics WHERE project_id = @projectId ORDER BY created_at ASC, id ASC`,
    )
    .all({ projectId });
  return rows.map((row, index) => ({ row_id: index + 1, ...row }));
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(rows) {
  const columns = ['row_id', ...EXPORT_COLUMNS];
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c])).join(','));
  return [columns.join(','), ...lines].join('\n') + '\n';
}

export function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
}

function main() {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) {
    console.log(`export-dataset: no store at ${dbPath} — nothing to export.`);
    return;
  }
  const store = openStore(dbPath, { readonly: true });
  try {
    const projects = listProjects(store.db);
    if (projects.length === 0) {
      console.log('export-dataset: no projects recorded yet — nothing to export.');
      return;
    }
    // Single-subject study (MASTER-PLAN §18.1): the same "first project"
    // convention generate-data.mjs and pin-eval-suite.mjs already use.
    const project = projects[0];
    const rows = anonymizedRows(store.db, project.id);
    if (rows.length === 0) {
      console.log('export-dataset: no firings recorded yet — nothing to export.');
      return;
    }
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(CSV_PATH, toCsv(rows));
    writeFileSync(JSONL_PATH, toJsonl(rows));
    console.log(
      `export-dataset: wrote ${rows.length} anonymized firing(s) to ${CSV_PATH} and ${JSONL_PATH}.`,
    );
  } finally {
    store.close();
  }
}

main();
