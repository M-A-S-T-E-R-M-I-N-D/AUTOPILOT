// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The persisted-event parsers: each takes a project's raw `events` rows for
 * one `type` (family-runaway, intent-collision, ...) and turns them into a
 * typed, validated array for the Fleet view — split out of ./source.ts (SHELL
 * DECOMP 5/5, board web-msr0ufzj-kkjac1's per-domain read-model follow-on)
 * since this cluster shares no state with the DB-gather seam beyond the
 * `Store` handle itself. Defensive by convention: a malformed payload is
 * always skipped, never thrown — the read-only dashboard must never crash the
 * way in.
 */

import {
  familyRunawayEvents,
  intentCollisionEvents,
  nearMissRecurringEvents,
  guardDenialEvents,
  syncBackRefusalEvents,
  landGateAlarmEvents,
  convergenceRedEvents,
  e2eLandBlockEvents,
  landedEvents,
  type Store,
} from '@autopilot/store';
import type { NearMissClass } from '../flight/near-miss.js';

interface RawFamilyRunaway {
  readonly family?: unknown;
  readonly spendUsd?: unknown;
  readonly firings?: unknown;
}

/**
 * The flagged runaway commit-subject families (TASK ECONOMICS v2, board
 * web-mstxk2vm-g446is) from the store's `family-runaway` events. A
 * still-active pattern gets re-flagged every flight, so the same family
 * repeats across many rows — rows arrive newest first, so keeping the FIRST
 * occurrence per family keeps its newest spend/firings verdict. Defensive
 * like the other parsers here: a malformed payload is skipped, never thrown.
 */
export function parseFamilyRunaways(
  store: Store,
  projectId: string,
): { family: string; spendUsd: number; firings: number }[] {
  const seen = new Set<string>();
  const entries: { family: string; spendUsd: number; firings: number }[] = [];
  for (const row of familyRunawayEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    try {
      const f = JSON.parse(row.payload) as RawFamilyRunaway;
      if (
        typeof f.family === 'string' &&
        typeof f.spendUsd === 'number' &&
        typeof f.firings === 'number' &&
        !seen.has(f.family)
      ) {
        seen.add(f.family);
        entries.push({ family: f.family, spendUsd: f.spendUsd, firings: f.firings });
      }
    } catch {
      /* skip a malformed family-runaway payload */
    }
  }
  return entries;
}

interface RawIntentCollision {
  readonly file?: unknown;
  readonly sibling?: unknown;
  readonly intent?: unknown;
}

/**
 * The persisted FLEET INTENT CLAIMS breaches (board web-mswo4x1u-kl2qsw) from
 * the store's `intent-collision` events, deduped by file+sibling keeping the
 * newest (rows arrive newest first, so first occurrence wins). Defensive like
 * the other parsers here: a malformed payload is skipped, never thrown.
 */
/** How long a persisted intent-collision keeps nagging the card. Collisions
 *  are resolved at merge time (the twin gets dropped or unioned) — a breach
 *  from a past era carries no action for the operator TODAY, and the
 *  accumulated history once wore a card with twelve identical chips
 *  (operator report, 2026-08-21). Two days covers "since roughly the last
 *  couple of working sessions" without a schema change. */
const INTENT_COLLISION_WINDOW_MS = 48 * 60 * 60 * 1000;

export function parseIntentCollisions(
  store: Store,
  projectId: string,
): { file: string; sibling: string; intent: string }[] {
  const seen = new Set<string>();
  const entries: { file: string; sibling: string; intent: string }[] = [];
  const freshSince = Date.now() - INTENT_COLLISION_WINDOW_MS;
  for (const row of intentCollisionEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    if (row.created_at < freshSince) continue; // stale era — resolved at merge long ago
    try {
      const c = JSON.parse(row.payload) as RawIntentCollision;
      if (
        typeof c.file === 'string' &&
        typeof c.sibling === 'string' &&
        typeof c.intent === 'string'
      ) {
        const key = c.file + String.fromCharCode(1) + c.sibling;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ file: c.file, sibling: c.sibling, intent: c.intent });
        }
      }
    } catch {
      /* skip a malformed intent-collision payload */
    }
  }
  return entries;
}

const NEAR_MISS_CLASS_VALUES = new Set<NearMissClass>([
  'guardDenials',
  'intentCollisions',
  'rescues',
  'syncBackRefusals',
  'checkpointErrors',
]);

interface RawNearMissRecurring {
  readonly nearMissClass?: unknown;
  readonly streak?: unknown;
}

/**
 * The persisted SAFETY-II near-miss-recurring verdicts (board
 * web-mt1qat5h-nxzgjs) from the store's `near-miss-recurring` events, deduped
 * by class keeping the newest (rows arrive newest first, so first occurrence
 * wins) — same convention as {@link parseFamilyRunaways}. Defensive like the
 * other parsers here: a malformed payload is skipped, never thrown.
 */
export function parseNearMissRecurring(
  store: Store,
  projectId: string,
): { nearMissClass: NearMissClass; streak: number }[] {
  const seen = new Set<NearMissClass>();
  const entries: { nearMissClass: NearMissClass; streak: number }[] = [];
  for (const row of nearMissRecurringEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    try {
      const r = JSON.parse(row.payload) as RawNearMissRecurring;
      if (
        typeof r.nearMissClass === 'string' &&
        NEAR_MISS_CLASS_VALUES.has(r.nearMissClass as NearMissClass) &&
        typeof r.streak === 'number' &&
        !seen.has(r.nearMissClass as NearMissClass)
      ) {
        const nearMissClass = r.nearMissClass as NearMissClass;
        seen.add(nearMissClass);
        entries.push({ nearMissClass, streak: r.streak });
      }
    } catch {
      /* skip a malformed near-miss-recurring payload */
    }
  }
  return entries;
}

const GUARD_DENIAL_KIND_VALUES = new Set(['containment', 'read-hygiene']);

interface RawGuardDenial {
  readonly kind?: unknown;
  readonly target?: unknown;
}

/**
 * The persisted PreToolUse guard denials (board web-msr0ug27-hj1w27) from the
 * store's `guard-denial` events, newest first (no dedup — unlike
 * {@link parseIntentCollisions}, a repeated `{kind, target}` across separate
 * firings is a separate real denial, not a duplicate of the same breach).
 * Defensive like the other parsers here: a malformed payload is skipped,
 * never thrown.
 */
export function parseGuardDenialEvents(
  store: Store,
  projectId: string,
): { kind: 'containment' | 'read-hygiene'; target: string }[] {
  const entries: { kind: 'containment' | 'read-hygiene'; target: string }[] = [];
  for (const row of guardDenialEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    try {
      const d = JSON.parse(row.payload) as RawGuardDenial;
      if (
        typeof d.kind === 'string' &&
        GUARD_DENIAL_KIND_VALUES.has(d.kind) &&
        typeof d.target === 'string'
      ) {
        entries.push({ kind: d.kind as 'containment' | 'read-hygiene', target: d.target });
      }
    } catch {
      /* skip a malformed guard-denial payload */
    }
  }
  return entries;
}

interface RawSyncBackRefusal {
  readonly details?: unknown;
}

/**
 * The persisted worktree-branch sync-back refusals (board web-mtb8i2mj-i0n1c7)
 * from the store's `sync-back-refusal` events, newest first (no dedup —
 * same convention as {@link parseGuardDenialEvents}: a repeated refusal
 * across separate firings is a separate real refusal, not a duplicate of the
 * same breach). Defensive like the other parsers here: a malformed payload is
 * skipped, never thrown.
 */
export function parseSyncBackRefusalEvents(store: Store, projectId: string): { details: string }[] {
  const entries: { details: string }[] = [];
  for (const row of syncBackRefusalEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    try {
      const d = JSON.parse(row.payload) as RawSyncBackRefusal;
      if (typeof d.details === 'string') {
        entries.push({ details: d.details });
      }
    } catch {
      /* skip a malformed sync-back-refusal payload */
    }
  }
  return entries;
}

interface RawLandGateAlarm {
  readonly details?: unknown;
}

/**
 * The persisted out-of-band LANDING gate failures (board web-mtbeu5ga-22baso)
 * from the store's `land-gate-alarm` events, newest first (no dedup — same
 * convention as {@link parseSyncBackRefusalEvents}: a repeated red result
 * across separate firings is a separate real alarm, not a duplicate of the
 * same breach). Defensive like the other parsers here: a malformed payload is
 * skipped, never thrown.
 */
export function parseLandGateAlarmEvents(store: Store, projectId: string): { details: string }[] {
  const entries: { details: string }[] = [];
  for (const row of landGateAlarmEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    try {
      const d = JSON.parse(row.payload) as RawLandGateAlarm;
      if (typeof d.details === 'string') {
        entries.push({ details: d.details });
      }
    } catch {
      /* skip a malformed land-gate-alarm payload */
    }
  }
  return entries;
}

interface RawConvergenceRed {
  readonly check?: unknown;
  readonly merge?: unknown;
}

/**
 * The persisted CONVERGENCE GATE alarms (board web-mtbeu5d3-n09acx
 * "CONVERGENCE FULL GATE") from the store's `convergence-red` events, newest
 * first (no dedup — same convention as {@link parseLandGateAlarmEvents}: a
 * repeated red result across separate firings is a separate real alarm, not
 * a duplicate of the same breach). Defensive like the other parsers here: a
 * malformed payload is skipped, never thrown. fly.ts's `recordConvergenceRed`
 * writes the merge details under the `merge` key; this parser surfaces it as
 * `details`, the same field name every other alarm-shaped `*Like` type here
 * uses.
 */
export function parseConvergenceRedEvents(
  store: Store,
  projectId: string,
): { check: string; details: string }[] {
  const entries: { check: string; details: string }[] = [];
  for (const row of convergenceRedEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    try {
      const d = JSON.parse(row.payload) as RawConvergenceRed;
      if (typeof d.check === 'string' && typeof d.merge === 'string') {
        entries.push({ check: d.check, details: d.merge });
      }
    } catch {
      /* skip a malformed convergence-red payload */
    }
  }
  return entries;
}

interface RawE2eLandBlock {
  readonly detail?: unknown;
}

/**
 * The persisted pre-land e2e guard refusals (epic 0010 slice 4 / ADR 0008
 * "option A") from the store's `e2e-land-block` events, newest first (no
 * dedup — same convention as {@link parseLandGateAlarmEvents}: a repeated
 * refusal across separate landing attempts is a separate real refusal, not a
 * duplicate of the same red run). Defensive like the other parsers here: a
 * malformed payload is skipped, never thrown.
 */
export function parseE2eLandBlockEvents(store: Store, projectId: string): { detail: string }[] {
  const entries: { detail: string }[] = [];
  for (const row of e2eLandBlockEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    try {
      const d = JSON.parse(row.payload) as RawE2eLandBlock;
      if (typeof d.detail === 'string') {
        entries.push({ detail: d.detail });
      }
    } catch {
      /* skip a malformed e2e-land-block payload */
    }
  }
  return entries;
}

interface RawLandedEvent {
  readonly details?: unknown;
}

/**
 * Persisted flight-landed events (Notifications channel, board
 * web-msnsndlk-exw3t9) from the store's `landed` events —
 * `landing/execute.ts` writes one per green gate-then-merge, both the manual
 * EXECUTE button and the automatic land-watchdog go through it. No dedup —
 * unlike {@link parseIntentCollisions}, each landing is its own real event,
 * not a duplicate of the same breach. Defensive like the other parsers here:
 * a malformed payload is skipped, never thrown.
 */
export function parseLandedEvents(
  store: Store,
  projectId: string,
): { details: string; at: number }[] {
  const entries: { details: string; at: number }[] = [];
  for (const row of landedEvents(store.db, projectId)) {
    if (row.payload === null) continue;
    try {
      const d = JSON.parse(row.payload) as RawLandedEvent;
      if (typeof d.details === 'string') {
        entries.push({ details: d.details, at: row.created_at });
      }
    } catch {
      /* skip a malformed landed payload */
    }
  }
  return entries;
}
