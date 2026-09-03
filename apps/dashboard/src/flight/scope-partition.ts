// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLEET SCOPE PARTITIONER (EVALUATION-2026-08-20-sota lever 5): the fifth
 * consensus defense against parallel-agent duplicate work — spec-scoped
 * decomposition — for a board that was pull-based until now. Research basis
 * (RESEARCH-LIBRARY "Where SOTA actually is"): Co-Coder's cohesion-aware
 * partitioning groups work so intra-partition dependency stays high and
 * cross-partition overlap ~0; naive file-based parallelism measured +60% cost
 * with NO quality gain from "conflicting interfaces", while cohesion grouping
 * eliminates most cross-agent conflicts BY CONSTRUCTION.
 *
 * Our adaptation, board-task granularity:
 * 1. COHESION SIGNAL — `areaKeyOf` maps a task title to its area (primary
 *    path prefix when the title names one, else the board's leading-tag
 *    naming convention: "SHELL …", "COCKPIT …", "SLICE-RELAY …").
 * 2. HUB RULE — an area group is NEVER split across instances (the same-area
 *    tasks are exactly the ones that touch the same files — the relay-twin
 *    class). Assigning the whole group to one instance internalizes those
 *    dependencies, Co-Coder's structural-hub isolation at task granularity.
 * 3. LPT BALANCE — biggest group first, to the least-loaded instance.
 * 4. PARTITION-THEN-PULL — an instance whose scope is exhausted falls back
 *    to the ordinary pull (`scopeFilterCandidates`), Co-Coder's greedy list
 *    scheduling: a fast agent proceeds to the next ready task, never idles.
 *
 * The partition is computed by the LAUNCHER (the coordinator role in the
 * consensus pattern) and rides to each instance as the
 * `AUTOPILOT_FLEET_TASK_SCOPE` env var — a comma-joined task-id list — via
 * `StartFlightInput.taskScope`. Solo flights never set it and behave
 * byte-for-byte as before.
 */

import { likelyPrimaryPathFromTitle } from './intent-claims.js';

/** Parse the env-var form of a scope. Null (not empty-set) when absent or
 *  blank so callers can distinguish "no partitioning" from "empty scope". */
export function parseTaskScope(raw: string | undefined): ReadonlySet<string> | null {
  if (raw === undefined) return null;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

/**
 * The partition-then-pull hybrid: while ANY of this instance's scope tasks is
 * still among the candidates, only scope tasks may be picked; once the scope
 * is exhausted (all shipped/claimed elsewhere/benched away), the instance
 * falls back to the full candidate list rather than idling.
 */
export function scopeFilterCandidates<T extends { readonly id: string }>(
  candidates: readonly T[],
  scope: ReadonlySet<string> | null,
): readonly T[] {
  if (scope === null || scope.size === 0) return candidates;
  const inScope = candidates.filter((t) => scope.has(t.id));
  return inScope.length > 0 ? inScope : candidates;
}

/** Leading uppercase tag per the board naming convention ("SHELL DECOMP …",
 *  "SLICE-RELAY DUP …") — at least two uppercase letters so an ordinary
 *  capitalized sentence never reads as a tag. */
const LEADING_TAG_RE = /^([A-Z][A-Z-]{1,})(?=[\s:])/;

/** "VERDICT <kind> " head + an optional leading run of task ids/connectives
 *  and the colon that follows them — everything BEFORE the verdict's actual
 *  subject text. */
const VERDICT_HEAD_RE = /^VERDICT\s+[a-z]+\s+/i;
const VERDICT_IDS_RE = /^(?:(?:web-[a-z0-9]+-[a-z0-9]+|and|,)\s*)*:?\s*/;

/** Files empirically shown to be edited by many DIFFERENTLY-tagged areas —
 *  board web-mtbp0t95-ho38s4 "INTENT COLLISION SURVIVES AREA PARTITIONING":
 *  REPORT-FROM-HERE, COCKPIT, and SHELL are three distinct area tags, but all
 *  three edit shell.ts, so tag-only grouping put them on different lanes and
 *  the hub-file collision the partitioner exists to prevent fired anyway. */
const HUB_FILE_BASENAMES = ['shell.ts'];

/** A hub file's basename when the title mentions it — bare ("...shell.ts...")
 *  or path-qualified ("apps/dashboard/src/web/shell.ts") — else null. Checked
 *  BEFORE the leading tag and the path-prefix key so every task touching the
 *  same hub file lands in the same group regardless of how its area reads. */
function hubFileKeyOf(title: string): string | null {
  for (const basename of HUB_FILE_BASENAMES) {
    const escaped = basename.replace(/\./g, '\\.');
    if (new RegExp(`(?:^|[\\s/])${escaped}\\b`).test(title)) return basename;
  }
  return null;
}

/** The cohesion key a task groups under — hub file > path prefix > leading tag
 *  > first word.
 *  EXCEPTION 0: a mention of a known {@link HUB_FILE_BASENAMES} entry beats
 *  everything else, including the leading tag — see {@link hubFileKeyOf}.
 *  EXCEPTION 1: a `docs/` path defers to the leading tag when one exists. Epic
 *  slices all cite their spec file (docs/epics/00xx-*.md), so path-first
 *  grouping merged four unrelated epics into one unsplittable mega-hub
 *  (2026-08-21 live board: 13 tasks on one instance, 2-3 on the other nine);
 *  the doc path is where the spec LIVES, not what the task TOUCHES.
 *  EXCEPTION 2: a "VERDICT <kind> …" title keys on its SUBJECT (the text
 *  after the verdict head and the named ids) — VERDICT is a message TYPE,
 *  not an area, and 8 unrelated blocked-verdict work items hub-grouped onto
 *  one instance under it (2026-08-24 live board). A verdict about COCKPIT
 *  work touches COCKPIT's files; that is its real cohesion group. */
export function areaKeyOf(title: string): string {
  const trimmed = title.trim();
  const head = VERDICT_HEAD_RE.exec(trimmed);
  if (head) {
    const subject = trimmed.slice(head[0].length).replace(VERDICT_IDS_RE, '');
    return subject.length > 0 ? areaKeyOf(subject) : 'verdict';
  }
  const hubFile = hubFileKeyOf(trimmed);
  if (hubFile !== null) return hubFile;
  const path = likelyPrimaryPathFromTitle(trimmed);
  const tag = LEADING_TAG_RE.exec(trimmed);
  if (path !== null) {
    const segments = path.split('/');
    const isDocsPath = segments[0] === 'docs';
    if (!isDocsPath || tag?.[1] === undefined) return segments.slice(0, 2).join('/');
  }
  if (tag?.[1] !== undefined) return tag[1];
  const firstWord = trimmed.split(/\s+/)[0] ?? '';
  return firstWord.toLowerCase();
}

/**
 * Tags whose `areaKeyOf` value is textually distinct but which reliably edit
 * the SAME hub file (`apps/dashboard/src/web/shell.ts`, still a monolith —
 * SHELL DECOMP is the epic un-doing that). Board web-mtbp0t95-ho38s4 "INTENT
 * COLLISION SURVIVES AREA PARTITIONING": SHELL, COCKPIT, and REPORT-FROM-HERE
 * are three separate area keys, so `partitionBoardScopes` could (and did)
 * hand them to different instances even though the hub rule's whole premise —
 * "same-area tasks are exactly the ones that touch the same files" — fails
 * for exactly this trio. Grouping by the hub file they share, not the tag
 * text, restores the hub rule for them without changing `areaKeyOf` itself
 * (which other callers/tests still rely on for the plain per-tag key).
 */
const TAG_HUB_FILES: Readonly<Record<string, string>> = {
  SHELL: 'apps/dashboard/src/web/shell.ts',
  COCKPIT: 'apps/dashboard/src/web/shell.ts',
  'REPORT-FROM-HERE': 'apps/dashboard/src/web/shell.ts',
};

/** The key {@link partitionBoardScopes} actually groups by: a registered
 *  hub file when `areaKeyOf` lands on one of {@link TAG_HUB_FILES}'s tags,
 *  else the area key unchanged. */
function hubGroupKeyOf(title: string): string {
  const area = areaKeyOf(title);
  return TAG_HUB_FILES[area] ?? area;
}

/**
 * Partition open board tasks into disjoint per-instance scopes: group by
 * {@link hubGroupKeyOf} (a group is never split — the hub rule), then
 * LPT-assign groups (biggest first) to the least-loaded instance. Instances
 * beyond the group count get empty scopes and simply fall back to pull.
 */
export function partitionBoardScopes(
  tasks: readonly { readonly id: string; readonly title: string }[],
  instances: readonly string[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const t of tasks) {
    const key = hubGroupKeyOf(t.title);
    const bucket = groups.get(key);
    if (bucket) bucket.push(t.id);
    else groups.set(key, [t.id]);
  }
  const scopes = new Map<string, string[]>(instances.map((i) => [i, []]));
  if (instances.length === 0) return scopes;
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  for (const group of ordered) {
    let least = instances[0] as string;
    for (const inst of instances) {
      if ((scopes.get(inst)?.length ?? 0) < (scopes.get(least)?.length ?? 0)) least = inst;
    }
    scopes.get(least)?.push(...group);
  }
  return scopes;
}
