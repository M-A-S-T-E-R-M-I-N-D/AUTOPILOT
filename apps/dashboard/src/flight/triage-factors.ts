// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Factor layer under board triage (founder directive: "the pilot knows what is
 * right to focus on at any moment, and how it affects further development —
 * always sorting itself correctly on every run").
 *
 * Two kinds of knowledge feed the sort, deliberately separated:
 *  - JUDGMENT (model): leverage, unblocking effects, urgency — expressed
 *    through the triage prompt, which this module enriches with per-task
 *    evidence lines (age, cumulative spend, slice streak, severity).
 *  - GUARDS (code, never model): the runaway rule distilled from the $240
 *    mutation-testing lesson (docs/RESEARCH-LIBRARY.md, "runaway-task
 *    economics") — a task that has consumed heavy budget across many firings
 *    without ever completing is demoted to the queue's tail for operator
 *    review, regardless of how attractive the model finds it. Deterministic,
 *    inspectable, un-fakeable.
 */

/** Cumulative per-task economics, derived from the metrics projection. */
export interface TaskEconomics {
  /** Lifetime cumulative spend — informational only; {@link isRunaway} no
   *  longer reads this directly (see {@link streakSpendUsd}). */
  readonly spendUsd: number;
  /** Lifetime firing count — informational only; {@link isRunaway} no longer
   *  reads this directly (see {@link sliceStreak}). */
  readonly firings: number;
  /** TRAILING run of slice-completions — a 'complete' (or untagged ship of a
   *  different kind) resets it; a long streak means the task keeps advancing
   *  without ever finishing. */
  readonly sliceStreak: number;
  /** Spend accumulated within the current {@link sliceStreak} only — resets
   *  alongside it. Kept separate from lifetime {@link spendUsd} so an old
   *  completion can't launder dollars spent AFTER it: {@link isRunaway}
   *  checks this trailing figure, not the lifetime total. */
  readonly streakSpendUsd: number;
}

/** One metrics row's slice relevant to economics (ordered oldest→newest). */
export interface EconomicsRow {
  readonly item: string | null;
  readonly costUsd: number;
  readonly completion: string | null;
}

/** The runaway thresholds (RESEARCH-LIBRARY "runaway-task economics"). */
export const RUNAWAY_SPEND_USD = 50;
export const RUNAWAY_FIRINGS = 10;

/** Fold one more row into a key's running economics — the shared step behind
 *  both {@link taskEconomicsFromRows} (keyed by item id) and {@link
 *  familyEconomicsFromRows} (keyed by normalized commit-subject family), so
 *  the two aggregations can never drift apart on what "trailing" means. */
function foldEconomics(
  prev: TaskEconomics | undefined,
  costUsd: number,
  completion: string | null,
): TaskEconomics {
  const base = prev ?? { spendUsd: 0, firings: 0, sliceStreak: 0, streakSpendUsd: 0 };
  // CONSERVATIVE by design: only an explicit 'slice' continues the streak —
  // an untagged (`null`) completion resets it, unlike the sibling predicate
  // `taskEconomics` (packages/store/src/read.ts) which treats null as
  // continuing. Both cite the same TASK ECONOMICS v2 doctrine but serve
  // different consumers on purpose: this one gates an autonomous
  // board-triage demotion (a false positive here wrongly buries a real
  // task, so it stays conservative and also requires BOTH thresholds via
  // `&&` in isRunaway below), while the sibling feeds an eager,
  // informational dashboard chip (`||`, either threshold). Do not "fix" one
  // to match the other — each has tests locking its own reading in.
  const isSlice = completion === 'slice';
  return {
    spendUsd: base.spendUsd + (costUsd || 0),
    firings: base.firings + 1,
    sliceStreak: isSlice ? base.sliceStreak + 1 : 0,
    streakSpendUsd: isSlice ? base.streakSpendUsd + (costUsd || 0) : 0,
  };
}

/** Fold ordered metrics rows into per-task economics. */
export function taskEconomicsFromRows(
  rows: readonly EconomicsRow[],
): ReadonlyMap<string, TaskEconomics> {
  const out = new Map<string, TaskEconomics>();
  for (const row of rows) {
    if (!row.item) continue;
    out.set(row.item, foldEconomics(out.get(row.item), row.costUsd, row.completion));
  }
  return out;
}

/** True when the TRAILING streak since a task's last completion — not its
 *  lifetime total — has crossed both thresholds. Deliberately trailing: a
 *  task that completed once must not earn permanent immunity if it gets
 *  reopened and keeps burning firings/dollars past the thresholds again (the
 *  "attribution to a CLOSED task" evasion — TASK ECONOMICS v2). */
export function isRunaway(econ: TaskEconomics): boolean {
  return econ.streakSpendUsd > RUNAWAY_SPEND_USD && econ.sliceStreak > RUNAWAY_FIRINGS;
}

/** One metrics row's slice relevant to FAMILY economics (ordered
 *  oldest→newest) — same shape as {@link EconomicsRow} but keyed by the raw
 *  commit subject instead of the self-reported item id, since the whole
 *  point is to catch a pattern that keeps changing item ids. */
export interface FamilyEconomicsRow {
  readonly commitSubject: string | null;
  readonly costUsd: number;
  readonly completion: string | null;
}

const CONVENTIONAL_PREFIX_RE = /^\w+(\([^)]*\))?:\s*/;
const TRAILING_PAREN_RE = /\s*\([^)]*\)\s*$/;
/** Requires a non-empty `\S+` AFTER the `.`/`/` so an ordinary
 *  sentence-terminal period ("...delivered.") never counts as path-like —
 *  a real extension or path segment always has something after the
 *  separator, a trailing full stop never does. */
const PATH_LIKE_TOKEN_RE = /\S*[./]\S+/g;

/**
 * Normalizes a commit subject into its recurring WORK-PATTERN "family": the
 * conventional-commit type/scope prefix and any trailing parenthetical
 * (a task id, a "(100% score)" note, ...) stripped, then every path/file-like
 * token (contains a `.` or `/`) collapsed to a single `*`. Two commits that
 * differ only in WHICH file they touched and WHICH id they were attributed to
 * collapse to the same family — e.g. "feat(engine): mutation testing widens
 * to telemetry.ts (web-abc123)" and "feat(tokens): mutation testing widens to
 * tokens/css.ts" both normalize to "mutation testing widens to *".
 *
 * This is TASK ECONOMICS v2's other evasion half (the trailing-streak fix
 * above, {@link isRunaway}, closes the "attribution to a CLOSED task" half):
 * a work pattern split across many distinct, individually-small item ids
 * never crosses the PER-ITEM runaway thresholds even though the pattern
 * itself burns real money — this repo's own history has ~45 "mutation
 * testing widens to *" / "wire mutation testing for *" commits split across
 * dozens of ids and several with no id at all, none of which individually
 * tripped the per-item guard.
 */
export function commitSubjectFamily(subject: string): string {
  const withoutPrefix = subject.replace(CONVENTIONAL_PREFIX_RE, '');
  const withoutTrailingNote = withoutPrefix.replace(TRAILING_PAREN_RE, '');
  const withoutPaths = withoutTrailingNote.replace(PATH_LIKE_TOKEN_RE, '*');
  return withoutPaths.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Fold ordered metrics rows into per-FAMILY economics — {@link
 *  taskEconomicsFromRows}'s counterpart, grouped by {@link
 *  commitSubjectFamily} instead of the self-reported item id. A row with no
 *  commit subject (or one that normalizes to an empty family) carries no
 *  attributable pattern and is skipped, same as an itemless row is skipped
 *  by {@link taskEconomicsFromRows}. */
export function familyEconomicsFromRows(
  rows: readonly FamilyEconomicsRow[],
): ReadonlyMap<string, TaskEconomics> {
  const out = new Map<string, TaskEconomics>();
  for (const row of rows) {
    if (!row.commitSubject) continue;
    const family = commitSubjectFamily(row.commitSubject);
    if (!family) continue;
    out.set(family, foldEconomics(out.get(family), row.costUsd, row.completion));
  }
  return out;
}

/** The evidence suffix for one task's prompt line — empty when nothing is
 *  known (a never-worked task carries no history worth model attention). */
export function factorSuffix(
  econ: TaskEconomics | undefined,
  ageDays: number,
  severity: string | null,
): string {
  const parts: string[] = [];
  if (severity) parts.push(`sev:${severity}`);
  if (ageDays >= 1) parts.push(`age:${Math.floor(ageDays)}d`);
  if (econ && econ.firings > 0) {
    parts.push(`$${econ.spendUsd.toFixed(0)}/${econ.firings}f`);
    if (econ.sliceStreak >= 3) parts.push(`slice-streak:${econ.sliceStreak}`);
  }
  return parts.length > 0 ? ` (${parts.join(' · ')})` : '';
}

/**
 * Deterministic composition: the model's order stands, EXCEPT runaways sink to
 * the tail (operator review beats another firing) — and ids the model dropped
 * were already re-appended by parseTriageOrder, so every id survives here too.
 */
export function composeTriageOrder(
  modelOrder: readonly string[],
  runawayIds: ReadonlySet<string>,
): readonly string[] {
  const healthy = modelOrder.filter((id) => !runawayIds.has(id));
  const runaways = modelOrder.filter((id) => runawayIds.has(id));
  return [...healthy, ...runaways];
}

/**
 * TRIAGE vs OPERATOR contract (web-mt1bwkrf-v5pnx2): an operator reorder set
 * some tasks' priority explicitly (`mutate.ts`'s `reorderTasks(..., pin:
 * true)`) — the next takeoff/post-flight triage must never silently re-rank
 * them away. `pinnedIdsInOrder` (the pinned tasks in their CURRENT relative
 * order) leads the result untouched; `modelOrder` never even influences their
 * position, so the model isn't asked to rank them at all. The remainder
 * (whatever `modelOrder` contains that isn't pinned) is ordered exactly as
 * {@link composeTriageOrder} already does — model ranking, runaways sunk to
 * the tail. A pinned task that also happens to be a runaway is exempt from
 * that demotion too: the operator's more recent, more specific decision
 * outranks the guard's generic one.
 */
export function applyOperatorPins(
  pinnedIdsInOrder: readonly string[],
  modelOrder: readonly string[],
  runawayIds: ReadonlySet<string>,
): readonly string[] {
  const pinned = new Set(pinnedIdsInOrder);
  const rest = modelOrder.filter((id) => !pinned.has(id));
  return [...pinnedIdsInOrder, ...composeTriageOrder(rest, runawayIds)];
}
