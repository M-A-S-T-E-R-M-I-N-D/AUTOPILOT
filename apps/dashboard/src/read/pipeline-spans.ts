// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, span-source slice (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `readPipelineSpans` rebuilds, server-side, the exact OTLP spans the
 * flight exporter emits (`toOtlpResourceSpans` over each firing's durable `FiringRecord`
 * payload), so the pipeline panel can feed `spansToGraph` without requiring an external OTLP
 * collector to be configured. Export stays off-by-default and outbound-only
 * (`flight/otlp.ts`); this read path is the dashboard's OWN copy of the same projection —
 * deterministic span/trace ids (the exporter seeds them from firing/ts/sha), so a collector
 * that DID receive the export and this endpoint agree byte-for-byte on identity.
 *
 * Same on-demand, honest-degrade contract as `read/project-detail.ts`: opens its own
 * readonly store handle per call, returns `null` for an unknown project or unreadable store,
 * and silently skips firings whose payload is missing or malformed (a span fabricated from a
 * broken record would poison the graph's determinism; an honest gap does not).
 */

import { existsSync } from 'node:fs';
import { openStore, listProjects, recentFirings, type Store } from '@autopilot/store';
import { toOtlpResourceSpans, type FiringRecord, type OtlpSpan } from '@autopilot/engine';

/** How many most-recent firings feed the pipeline graph — matches the store's own page cap
 *  order of magnitude, far above `FLIGHT_LOG_PAGE_SIZE`'s 20-row cockpit window. */
const PIPELINE_SPAN_WINDOW = 200;

/**
 * One firing's durable `events.payload` JSON → the single OTLP span the exporter would emit
 * for it, or `null` when the payload is absent, unparseable, not a record, or carries an
 * invalid `ts` (the one field `toOtlpResourceSpans` cannot tolerate — `Date.parse` NaN would
 * throw inside its nanosecond math rather than degrade).
 */
export function firingPayloadSpan(payload: string | null): OtlpSpan | null {
  if (payload === null) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as FiringRecord;
    if (typeof record.ts !== 'string' || !Number.isFinite(Date.parse(record.ts))) return null;
    return toOtlpResourceSpans(record).resourceSpans[0]?.scopeSpans[0]?.spans[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The pipeline view's span window for one project, oldest-first (the graph's natural reading
 * order; `spansToGraph` re-sorts by start time internally, so order is presentation-only).
 * Returns `null` for an unknown project or a missing/unreadable store — the same contract as
 * `readFiringsPage`, so the endpoint can 404 "unknown" distinctly from an empty history.
 */
export function readPipelineSpans(dbPath: string, projectId: string): readonly OtlpSpan[] | null {
  if (!existsSync(dbPath)) return null;
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    const project = listProjects(store.db).find((x) => x.id === projectId);
    if (!project) return null;
    const rows = recentFirings(store.db, project.id, PIPELINE_SPAN_WINDOW);
    return rows
      .map((row) => firingPayloadSpan(row.payload))
      .filter((span): span is OtlpSpan => span !== null)
      .reverse();
  } catch {
    return null;
  } finally {
    store?.close();
  }
}
