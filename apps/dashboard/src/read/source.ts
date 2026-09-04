// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The DB gather seam: read the store and build the Fleet view model. All SQLite
 * access is confined here so read/fleet.ts stays pure. Every failure mode (no
 * DB file yet, unmigrated, corrupt JSON) degrades to an honest empty/partial
 * view — the read-only dashboard must never crash the way in.
 */

import { existsSync } from 'node:fs';
import {
  openStore,
  listProjects,
  getIndexMeta,
  firingStats,
  openSeverityGauge,
  getFleetWisdom,
  lastActivityAt,
  backupTiers,
  recentFirings,
  firingDayCounts,
  evaluationLabelDayCounts,
  recentActivityEvents,
  recentTasks,
  doraSnapshot,
  gateParallelSavings,
  warmSessionSavings,
  orientLengths,
  taskEconomics,
  type Store,
  type ProjectIndexMetaRow,
  type ActivityEventRow,
} from '@autopilot/store';
import { classifyNoop, type NoopClass, type TaskProposal } from '@autopilot/engine';
import {
  buildFleetView,
  type FleetView,
  activityPhase,
  firstFailedGateCheck,
  wasAutoformatRescued,
  type ProjectAggregate,
  type LanguageCount,
  type DirCount,
  type ActivityEntry,
  type TaskEntry,
  type FlightEntry,
  type GateCheckSummary,
} from './fleet.js';
import {
  parseFamilyRunaways,
  parseIntentCollisions,
  parseNearMissRecurring,
  parseGuardDenialEvents,
  parseSyncBackRefusalEvents,
  parseLandGateAlarmEvents,
  parseConvergenceRedEvents,
  parseE2eLandBlockEvents,
  parseLandedEvents,
} from './persisted-events.js';
import { proposedWisdomKindLabel } from '../flight/fleet-wisdom-mining.js';

const HOT_FILE_LIMIT = 5;
const TOP_DIR_LIMIT = 5;
/** The flight log's default window, and the page size for `/api/firings`
 *  "Load more" (web-msnf2heh-2znbbu — a slice-heavy day used to push older
 *  firings past this cap with no way back to them). Exported: ./project-detail.ts's
 *  `readFiringsPage` "Load more" reads the SAME page size as this module's own
 *  polled gather, so the two never drift apart into a page-boundary mismatch. */
export const FLIGHT_LOG_PAGE_SIZE = 20;

interface RawLang {
  readonly language?: unknown;
  readonly files?: unknown;
  readonly bytes?: unknown;
}
interface RawDir {
  readonly dir?: unknown;
  readonly files?: unknown;
}
interface RawHot {
  readonly path?: unknown;
}
interface RawCommand {
  readonly label?: unknown;
  readonly bin?: unknown;
  readonly args?: unknown;
}

export function parseLanguages(meta: ProjectIndexMetaRow | null): LanguageCount[] {
  if (!meta) return [];
  try {
    const summary = JSON.parse(meta.summary) as { languages?: unknown };
    if (!Array.isArray(summary.languages)) return [];
    const langs: LanguageCount[] = [];
    for (const entry of summary.languages as RawLang[]) {
      if (typeof entry?.language === 'string' && typeof entry.files === 'number') {
        langs.push({
          language: entry.language,
          files: entry.files,
          bytes: typeof entry.bytes === 'number' ? entry.bytes : 0,
        });
      }
    }
    return langs;
  } catch {
    return [];
  }
}

export function parseTopDirs(meta: ProjectIndexMetaRow | null): DirCount[] {
  if (!meta) return [];
  try {
    const summary = JSON.parse(meta.summary) as { topDirs?: unknown };
    if (!Array.isArray(summary.topDirs)) return [];
    const dirs: DirCount[] = [];
    for (const entry of summary.topDirs as RawDir[]) {
      if (typeof entry?.dir === 'string' && typeof entry.files === 'number') {
        dirs.push({ dir: entry.dir, files: entry.files });
      }
      if (dirs.length >= TOP_DIR_LIMIT) break;
    }
    return dirs;
  } catch {
    return [];
  }
}

export function parseHotFiles(meta: ProjectIndexMetaRow | null): string[] {
  if (!meta) return [];
  try {
    const hot = JSON.parse(meta.hot_files) as unknown;
    if (!Array.isArray(hot)) return [];
    const paths: string[] = [];
    for (const entry of hot as (string | RawHot)[]) {
      if (typeof entry === 'string') paths.push(entry);
      else if (typeof entry?.path === 'string') paths.push(entry.path);
      if (paths.length >= HOT_FILE_LIMIT) break;
    }
    return paths;
  } catch {
    return [];
  }
}

/**
 * A short human label for the detected gate: `<ecosystem> · <test command>`.
 * `gate_config` stores `JSON.stringify(GateSpec)` (onboard.ts) — a FLAT object
 * (`{ecosystem, typecheck?, test?, build?, lint?, format?}`, packages/onboarding/
 * src/gate/types.ts), not `{ecosystem, commands: {...}}`. Read `test` straight
 * off the root; a nested `commands` lookup here silently degraded every
 * project's label to just the bare ecosystem id forever.
 */
function parseGate(gateConfig: string | null): string | null {
  if (!gateConfig) return null;
  try {
    const g = JSON.parse(gateConfig) as { ecosystem?: unknown; test?: unknown };
    const eco = typeof g.ecosystem === 'string' ? g.ecosystem : null;
    let testLabel: string | null = null;
    const test = g.test as RawCommand | undefined;
    if (typeof test?.label === 'string') testLabel = test.label;
    else if (typeof test?.bin === 'string') {
      const args = Array.isArray(test.args)
        ? test.args.filter((a): a is string => typeof a === 'string')
        : [];
      testLabel = [test.bin, ...args].join(' ');
    }
    if (eco && testLabel) return `${eco} · ${testLabel}`;
    return eco;
  } catch {
    return null;
  }
}

interface RawActivity {
  readonly tool?: unknown;
  readonly target?: unknown;
  readonly kind?: unknown;
  readonly reasoning?: unknown;
  readonly model?: unknown;
  readonly tokensIn?: unknown;
  readonly tokensOut?: unknown;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseActivityRows(rows: readonly ActivityEventRow[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const row of rows) {
    if (row.payload === null) continue;
    try {
      const a = JSON.parse(row.payload) as RawActivity;
      if (typeof a.tool === 'string') {
        const target = typeof a.target === 'string' ? a.target : '';
        const kind = typeof a.kind === 'string' ? a.kind : 'other';
        entries.push({
          tool: a.tool,
          target,
          kind,
          phase: activityPhase(a.tool, target, kind),
          at: row.created_at,
          firingId: row.firing_id,
          reasoning: typeof a.reasoning === 'string' ? a.reasoning : null,
          model: typeof a.model === 'string' ? a.model : null,
          tokensIn: numOrNull(a.tokensIn),
          tokensOut: numOrNull(a.tokensOut),
        });
      }
    } catch {
      /* skip a malformed activity payload */
    }
  }
  return entries;
}

export function parseActivities(store: Store, projectId: string): ActivityEntry[] {
  return parseActivityRows(recentActivityEvents(store.db, projectId));
}

interface RawGateCheck {
  readonly label?: unknown;
  readonly pass?: unknown;
}

/**
 * The per-check gate results from a firing's full JSON record (events.payload,
 * type='firing') — the `metrics` table only ever got the overall gate_result,
 * never the individual commands, so a REVERTED row's reason lives here. Defensive
 * like the other parsers here: a missing/malformed payload yields [], never throws.
 */
function parseGateChecks(payload: string | null): GateCheckSummary[] {
  if (payload === null) return [];
  try {
    const record = JSON.parse(payload) as { gateChecks?: unknown };
    if (!Array.isArray(record.gateChecks)) return [];
    const checks: GateCheckSummary[] = [];
    for (const entry of record.gateChecks as RawGateCheck[]) {
      if (typeof entry?.label === 'string' && typeof entry.pass === 'boolean') {
        checks.push({ label: entry.label, pass: entry.pass });
      }
    }
    return checks;
  } catch {
    return [];
  }
}

/**
 * Count of PreToolUse guard denials (containment / read-hygiene) this
 * firing's final model attempt saw, from the full firing record
 * (events.payload) — `FiringRecord.guardDenials` (headless surfacing sweep,
 * board web-msnqqjmd-9bx0wd). Defensive like parseGateChecks: a missing or
 * malformed payload, or a non-number field, yields 0 — the same "none
 * observed" default the engine itself writes.
 */
function parseGuardDenials(payload: string | null): number {
  if (payload === null) return 0;
  try {
    const record = JSON.parse(payload) as { guardDenials?: unknown };
    return typeof record.guardDenials === 'number' ? record.guardDenials : 0;
  } catch {
    return 0;
  }
}

/**
 * WHY a no-commit firing died, from the full firing record (events.payload):
 * `timedOut` means the CLI driver's OWN wall-clock cap killed it (THIRD CAP
 * surfacing, board web-mt1w1ime-pohh9d — the cap that killed firings
 * envelope-less under contention with no other explanation); otherwise
 * `maxTurnsHit` means the CLI was cut off at the per-firing turn cap mid-work
 * (the record that explained firing 47's "empty" row); otherwise an error exit
 * or an unreadable envelope is 'error'. Checked in that priority order since a
 * hard-killed timeout death also carries no envelope (`iterMetrics ===
 * 'envelope-error'`) and would otherwise be misread as a generic error.
 * Defensive like parseGateChecks — malformed payload yields null, never throws.
 */
function parseFiringDeath(payload: string | null): 'turn-cap' | 'timeout' | 'error' | null {
  if (payload === null) return null;
  try {
    const record = JSON.parse(payload) as {
      maxTurnsHit?: unknown;
      isError?: unknown;
      iterMetrics?: unknown;
      timedOut?: unknown;
    };
    if (record.timedOut === true) return 'timeout';
    if (record.maxTurnsHit === true) return 'turn-cap';
    if (record.isError === true || record.iterMetrics === 'envelope-error') return 'error';
    return null;
  } catch {
    return null;
  }
}

/**
 * NOOP→VERDICT (lever 6, board web-mt1kv2au-8suw6u): whether a TRUE no-commit
 * firing still named a verdict on the work it considered (PROPOSALS) or
 * stayed silent — `classifyNoop`'s own classification, reconstructed from the
 * raw firing record (events.payload) since `metrics` never grew a column for
 * it (the `died` field above uses the same reconstruct-from-payload shape).
 * Defensive like `parseFiringDeath`: a missing/malformed payload reads as no
 * proposals, i.e. 'silent' — never throws.
 */
function parseNoopClass(gateResult: string | null, payload: string | null): NoopClass | null {
  if (gateResult !== 'no-commit') return null;
  if (payload === null) return classifyNoop('no-commit', undefined);
  try {
    const record = JSON.parse(payload) as { proposals?: unknown };
    const proposals = Array.isArray(record.proposals)
      ? (record.proposals as readonly TaskProposal[])
      : undefined;
    return classifyNoop('no-commit', proposals);
  } catch {
    return classifyNoop('no-commit', undefined);
  }
}

export function mapFlightEntries(
  db: Store['db'],
  projectId: string,
  limit?: number,
  offset?: number,
): FlightEntry[] {
  return recentFirings(db, projectId, limit, offset).map((f) => ({
    id: f.firing_id,
    item: f.item,
    kind: f.kind,
    sha: f.sha,
    shipped: f.shipped === 1,
    gateResult: f.gate_result,
    cost: f.cost_usd,
    realCostUsd: f.real_cost_usd,
    tokensIn: f.input_tokens,
    tokensOut: f.output_tokens,
    cacheReadTokens: f.cache_read_tokens,
    cacheWriteTokens: f.cache_write_tokens,
    turns: f.turns,
    durationMs: f.duration_ms,
    commitSubject: f.commit_subject,
    completion: f.completion,
    model: f.model,
    failedCheck: firstFailedGateCheck(parseGateChecks(f.payload)),
    autoformatRescued:
      f.gate_result === 'passed' && wasAutoformatRescued(parseGateChecks(f.payload)),
    guardDenials: parseGuardDenials(f.payload),
    // Only a row that neither shipped nor reverted needs a death explanation —
    // a reverted commit already has its own explanation (failedCheck/gateResult);
    // without this a firing that hit the turn cap AFTER landing a commit that
    // then failed the gate would wrongly carry a death explanation too.
    died: f.shipped === 1 || f.gate_result === 'reverted' ? null : parseFiringDeath(f.payload),
    noopClass: parseNoopClass(f.gate_result, f.payload),
    at: f.created_at,
  }));
}

export function mapTaskEntries(db: Store['db'], projectId: string): TaskEntry[] {
  const economicsById = new Map(taskEconomics(db, projectId).map((e) => [e.taskId, e]));
  return recentTasks(db, projectId).map((t) => {
    const economics = economicsById.get(t.id);
    return {
      id: t.id,
      title: t.title,
      body: t.body,
      status: t.status,
      severity: t.severity,
      dimension: t.dimension,
      focus: t.focus === 1,
      priority: t.priority,
      source: t.source,
      at: t.created_at,
      cumulativeCostUsd: economics?.cumulativeCostUsd ?? 0,
      firingCount: economics?.firingCount ?? 0,
      isRunaway: economics?.isRunaway ?? false,
    };
  });
}

function gather(store: Store, now: number): ProjectAggregate[] {
  const db = store.db;
  return listProjects(db).map((p) => {
    const meta = getIndexMeta(db, p.id);
    const stats = firingStats(db, p.id);
    // Fetch one extra row past the page size to detect "more history exists"
    // without a separate COUNT query — trimmed back down before it reaches the view.
    const flightPage = mapFlightEntries(db, p.id, FLIGHT_LOG_PAGE_SIZE + 1, 0);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      rootPath: p.root_path,
      status: p.status,
      createdAt: p.created_at,
      fileCount: meta?.file_count ?? 0,
      totalBytes: meta?.total_bytes ?? 0,
      languages: parseLanguages(meta),
      topDirs: parseTopDirs(meta),
      hotFiles: parseHotFiles(meta),
      gate: parseGate(p.gate_config),
      backedUp: backupTiers(db, p.id).length > 0,
      soul: p.soul,
      soulReviewed: p.soul_reviewed === 1,
      soulProposed: p.soul_proposed,
      soulPrevious: p.soul_previous,
      firings: stats.firings,
      shipped: stats.shipped,
      cost: stats.cost,
      realCost: stats.realCost,
      tokensIn: stats.tokensIn,
      tokensOut: stats.tokensOut,
      cacheReadTokens: stats.cacheReadTokens,
      cacheWriteTokens: stats.cacheWriteTokens,
      turns: stats.turns,
      gauge: openSeverityGauge(db, p.id),
      lastActivityAt: lastActivityAt(db, p.id),
      flightLog: flightPage.slice(0, FLIGHT_LOG_PAGE_SIZE),
      // Full-history per-day tallies — the heatmap must NOT bucket the capped log window.
      dayCounts: firingDayCounts(db, p.id),
      // Full-history operator verdict tallies — the evolution-over-time trend's data plane.
      evaluationLabelDayCounts: evaluationLabelDayCounts(db, p.id),
      flightLogHasMore: flightPage.length > FLIGHT_LOG_PAGE_SIZE,
      activity: parseActivities(store, p.id),
      tasks: mapTaskEntries(db, p.id),
      dora: doraSnapshot(db, p.id, now),
      gateParallel: gateParallelSavings(db, p.id),
      warmSessions: warmSessionSavings(db, p.id),
      orientLengths: orientLengths(db, p.id),
      familyRunaways: parseFamilyRunaways(store, p.id),
      intentCollisions: parseIntentCollisions(store, p.id),
      nearMissRecurring: parseNearMissRecurring(store, p.id),
      guardDenialEvents: parseGuardDenialEvents(store, p.id),
      syncBackRefusalEvents: parseSyncBackRefusalEvents(store, p.id),
      landGateAlarmEvents: parseLandGateAlarmEvents(store, p.id),
      convergenceRedEvents: parseConvergenceRedEvents(store, p.id),
      e2eLandBlockEvents: parseE2eLandBlockEvents(store, p.id),
      landedEvents: parseLandedEvents(store, p.id),
    };
  });
}

/** Build the Fleet view from an open store (pure w.r.t. the DB handle). */
export function readFleet(store: Store, now: number): FleetView {
  const view = buildFleetView(now, gather(store, now));
  const fleetRow = getFleetWisdom(store.db);
  const wisdomProposed = fleetRow?.wisdom_proposed ?? null;
  return {
    ...view,
    wisdomProposed,
    wisdomKind:
      wisdomProposed === null
        ? null
        : proposedWisdomKindLabel(fleetRow?.wisdom ?? '', wisdomProposed),
  };
}

/**
 * Open the store at `dbPath` (if it exists yet), gather, and build the Fleet
 * view. A missing file — the normal state before the first onboard — is an
 * empty fleet, not an error; any read failure also degrades to empty.
 */
export function readFleetFromStore(dbPath: string, now: number): FleetView {
  if (!existsSync(dbPath)) return buildFleetView(now, []);
  let store: Store | undefined;
  try {
    store = openStore(dbPath, { readonly: true });
    return readFleet(store, now);
  } catch {
    return buildFleetView(now, []);
  } finally {
    store?.close();
  }
}

// Store-mutation wrappers (createTaskInStore, ensureStoreMigrated, and their
// siblings) live in ./mutate.ts. The on-demand single-project reads (firing
// drill-downs, LANDING/ROUND/RELEASE/BACKLOG previews, ask/search context)
// live in ./project-detail.ts, which imports the parse/map helpers above.
// The nine persisted-event parsers (familyRunaways .. landedEvents) live in
// ./persisted-events.ts — a self-contained seam sharing no state with this
// gather loop beyond the Store handle itself.
// This module stays the polled DB-gather-into-FleetView seam (SHELL DECOMP
// 3/5, board web-msr0ufzj-kkjac1).
