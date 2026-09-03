// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure LANDING panel math — client-only (no server counterpart;
 * `server.ts`/`landing/execute.ts` return raw `ok`/`details`, and composing
 * those into the "✓ Landed — ..." sentence is purely a client presentation
 * concern, same reasoning `release-panel.ts`'s `releaseExecuteResult` used),
 * so it lives in `web/` rather than `shared/` (epic 0002 "shell
 * decomposition", slice 2). `landingDiffstatItems`/`landingCommitFilesMeta`
 * (fifty-third cut) format the diffstat chips and each commit row's files
 * span/tip that `renderLandingBody` previously computed inline.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The shape `landingExecuteResult` reads off `POST /api/landing/execute`'s
 *  JSON response. `error` covers the non-`LandingExecuteApiResult` shapes a
 *  rejected request (rate limit, bad content-type, unavailable) returns
 *  instead — the client falls back to it when `details` is absent. */
export interface LandingExecuteResponse {
  readonly ok: boolean;
  readonly details?: string;
  readonly error?: string;
}

/** The `.landing-result` element's class + message text for one `POST
 *  /api/landing/execute` response. */
export interface LandingExecuteResult {
  readonly className: string;
  readonly text: string;
}

/** Formats the LANDING EXECUTE result — on success: "✓ Landed — <details>"
 *  (falling back to "merged." when the response carries no details); on
 *  failure: "✗ <details or error>" (falling back to "landing failed."). */
export function landingExecuteResult(
  data: LandingExecuteResponse | null | undefined,
): LandingExecuteResult {
  const ok = !!(data && data.ok);
  const className = 'landing-result ' + (ok ? 'landing-result-ok' : 'landing-result-fail');
  if (!ok) {
    return {
      className,
      text: '✗ ' + ((data && (data.details || data.error)) || 'landing failed.'),
    };
  }
  return {
    className,
    text: '✓ Landed — ' + (data!.details || 'merged.'),
  };
}

/** The subset of `landing/job.ts`'s `LandingJobState` the panel renders —
 *  duck-typed rather than imported so this stays a pure client module with no
 *  server-side type dependency, the same `*Like` convention `report-panel.ts`
 *  already uses for the server's real shapes. */
export interface LandingJobLike {
  readonly phase: string;
  readonly startedAt: number;
  readonly steps?: readonly { label: string; state: string; durationMs?: number }[];
  readonly stepIndex?: number;
  readonly stepTotal?: number;
  readonly note?: string;
  readonly result?: LandingExecuteResponse;
}

/** A live landing's rendered line: what it is doing, whether the LAND button
 *  should stay disabled, and whether polling should continue. */
export interface LandingJobLine {
  readonly className: string;
  readonly text: string;
  /** True while the job still owns the button — a second press would only
   *  join the same job, so the UI says so instead of inviting the click. */
  readonly busy: boolean;
}

/**
 * Formats a landing job's live state for the panel — the honest answer to
 * "I pressed LAND, what is happening?" at any moment, including after a
 * reload (the state lives on the server, not in the click's own closure).
 *
 * A running gate reports the step it is ON and how long the whole run has
 * taken so far, because the one thing an operator cannot otherwise tell is
 * the difference between "the 140-second test leg is running" and "nothing is
 * happening at all" — which is exactly how the old silent button read. The
 * self-healing wait reports itself in the same line rather than as an error,
 * since a queued landing is working as intended, not failing.
 */
export function landingJobLine(
  job: LandingJobLike | null | undefined,
  nowMs: number,
): LandingJobLine | null {
  if (!job) return null;
  const elapsed = Math.max(0, Math.round((nowMs - job.startedAt) / 1000));
  const elapsedText =
    elapsed >= 60 ? Math.floor(elapsed / 60) + 'm' + (elapsed % 60) + 's' : elapsed + 's';

  if (job.phase === 'finished') {
    const result = landingExecuteResult(job.result);
    return { className: result.className, text: result.text, busy: false };
  }
  if (job.phase === 'waiting-for-flight') {
    return {
      className: 'landing-result landing-result-waiting',
      text:
        '⏳ Queued — ' +
        (job.note || 'waiting for the running flight to finish, then landing automatically') +
        ' (' +
        elapsedText +
        ')',
      busy: true,
    };
  }
  const running = (job.steps || []).find((s) => s.state === 'running');
  const position = job.stepIndex && job.stepTotal ? ' ' + job.stepIndex + '/' + job.stepTotal : '';
  const stepText = running ? 'running ' + running.label + position : 'starting the gate';
  return {
    className: 'landing-result landing-result-running',
    text:
      '🛬 Landing — ' +
      stepText +
      ' (' +
      elapsedText +
      ') — nothing merges until the gate is green',
    busy: true,
  };
}

/** The subset of `read/source.ts`'s `LandingInfo.diffstat` {@link
 *  landingDiffstatItems} reads. */
export interface LandingDiffstatLike {
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
}

/** One LANDING diffstat `tipChip`'s text/tip/aria-label/extra-class
 *  quadruple, in `tipChip`'s own argument order — distinct from
 *  `stat-tiles.ts`'s `RoundStatItem` since two of the three chips here also
 *  carry a `className` for their ± color. */
export type LandingDiffstatItem = readonly [
  text: string,
  tip: string,
  ariaLabel: string,
  className?: string,
];

/** The LANDING card's diffstat line — three `tipChip` triples/quadruples
 *  (pluralized "N file(s) changed", "+N insertions", "-N deletions") that
 *  `renderLandingBody` previously built inline before appending each chip. */
export function landingDiffstatItems(ds: LandingDiffstatLike): readonly LandingDiffstatItem[] {
  return [
    [
      ds.filesChanged + ' file' + (ds.filesChanged === 1 ? '' : 's'),
      'Files touched across every unmerged commit',
      ds.filesChanged + ' files changed',
    ],
    ['+' + ds.insertions, 'Lines added', ds.insertions + ' insertions', 'landing-ins'],
    ['-' + ds.deletions, 'Lines removed', ds.deletions + ' deletions', 'landing-del'],
  ];
}

/** One LANDING commit row's files span: its pluralized "N file(s)" label,
 *  and its hover/focus tip — the first 8 file paths joined by ", " with a
 *  trailing "…" once truncated, or "No file list for this commit" when the
 *  commit carries no file list at all. */
export interface LandingCommitFilesMeta {
  readonly label: string;
  readonly tip: string;
}

/** The LANDING card's per-commit files span text + tip that
 *  `renderLandingBody`'s commit loop previously built inline before writing
 *  the `<span>`'s textContent and `data-tip`. */
export function landingCommitFilesMeta(files: readonly string[]): LandingCommitFilesMeta {
  return {
    label: files.length + ' file' + (files.length === 1 ? '' : 's'),
    tip: files.length
      ? files.slice(0, 8).join(', ') + (files.length > 8 ? '…' : '')
      : 'No file list for this commit',
  };
}

/** The subset of `read/source.ts`'s `LandingInfo.overlaps` entries {@link
 *  landingOverlapItems} reads. */
export interface LandingOverlapLike {
  readonly branch: string;
  readonly files: readonly string[];
}

/** One LANDING overlap warning row's message + hover/focus tip (fleet
 *  anti-duplication, defense-stack item 3): a sibling flight branch's own
 *  unlanded commits touch the same file(s) this landing is about to bring
 *  into base — landing first would leave the sibling heading toward a
 *  conflict, or a silent duplicate-work collision, the moment it lands too. */
export interface LandingOverlapItem {
  readonly text: string;
  readonly tip: string;
}

/** The LANDING card's overlap-warning rows — `[]` when `overlaps` is empty,
 *  same "nothing to render" convention every other LANDING list follows. */
export function landingOverlapItems(
  overlaps: readonly LandingOverlapLike[],
): readonly LandingOverlapItem[] {
  return overlaps.map((o) => ({
    text:
      '⚠ ' +
      o.branch +
      ' also touches ' +
      o.files.length +
      ' file' +
      (o.files.length === 1 ? '' : 's') +
      ' here, unlanded',
    tip: o.files.join(', '),
  }));
}

/** The LANDING EXECUTE button's `window.confirm()` message (BOARD
 *  web-msw5zxfi-oa2olf, "flag for lead consolidation instead of blind
 *  merge"): the `.landing-overlaps` warning row rendered above the button
 *  was easy to scroll past, and the confirm dialog it gated on said nothing
 *  about it — the exact same "Land this branch?" prompt an operator flying
 *  solo would see. `overlapBranches` (each `LandingOverlapWarning.branch`
 *  from `landing.overlaps`, in `read/source.ts`'s `gatherLandingOverlaps`
 *  order) gets folded into the prompt itself when non-empty, so the
 *  collision risk with a sibling's own unlanded work is the LAST thing an
 *  operator reads before confirming, not something they had to have already
 *  noticed above. Same base "cannot be undone" clause either way, matching
 *  `release-panel.ts`'s `releaseConfirmMessage` pattern. */
export function landingExecuteConfirmMessage(overlapBranches: readonly string[]): string {
  const base =
    'Land this branch?\n\nThis runs the full verification gate, then (only if it passes) a real git merge into the base branch. This cannot be undone by this dashboard.';
  if (overlapBranches.length === 0) return base;
  const plural = overlapBranches.length > 1;
  return (
    '⚠ ' +
    overlapBranches.join(', ') +
    (plural ? ' have' : ' has') +
    ' unlanded work touching the same file(s) as this landing — merging now risks a ' +
    'collision, or a silent duplicate-work collision, the moment ' +
    (plural ? 'they land' : 'it lands') +
    ' too. Consider flagging for lead consolidation instead of a blind merge.\n\n' +
    base
  );
}

/** The LANDING EXECUTE button's `[data-tip]`/`aria-label` (app-wide
 *  interactivity audit v2, web-msm66jlc-gm4oom) — unlike the RELEASE panel's
 *  sibling EXECUTE button ({@link releaseExecuteTip} in `release-panel.ts`),
 *  this button carried no explanation of what landing does before the
 *  operator's click triggered {@link landingExecuteConfirmMessage}'s confirm
 *  dialog. Names the base branch so hover/focus previews match the button's
 *  own "Execute landing → <base>" label. */
export function landingExecuteTip(base: string): string {
  return (
    'Lands into ' +
    base +
    ' — runs the full verification gate, then (only if it passes) a real git merge. Cannot be undone by this dashboard.'
  );
}

/** The subset of `read/source.ts`'s `LandingInfo.worktreeAhead` entries
 *  {@link landingWorktreeDivergence} counts. */
export interface LandingWorktreeAheadLike {
  readonly sha: string;
}

/**
 * The LANDING card's checkout-vs-worktree divergence warning
 * (web-msvbzahx-uiemjb, follow-up of web-msupuosk-gjll3p / `a81221f`): a
 * flight's Bash runs inside a linked worktree, and each firing's sync-back
 * fast-forwards this checked-out branch onto the worktree branch — but
 * sync-back refuses outright whenever this checkout is dirty at that
 * instant, and a persistently dirty checkout can silently strand commits on
 * the worktree branch for days (the motivating incident: 144 commits,
 * invisible on this exact card since it previously only ever read the
 * checked-out branch, never the worktree). `null` when nothing is stranded
 * — in sync, or this project has never flown with worktree isolation.
 */
export function landingWorktreeDivergence(
  worktreeAhead: readonly LandingWorktreeAheadLike[],
): string | null {
  if (worktreeAhead.length === 0) return null;
  const n = worktreeAhead.length;
  return (
    `⚠ ${n} commit${n === 1 ? '' : 's'} stranded on the flight worktree, ` +
    `not yet synced back to this checkout — sync-back may be refusing ` +
    `(check for uncommitted changes here).`
  );
}

/** A commit {@link landingCommitRuns} groups by its subject line alone —
 *  the only field a run-boundary decision needs. */
export interface LandingRunCommit {
  readonly subject: string;
}

/** A run of 2+ consecutive commits sharing the same `(BOARD <task-id>)`
 *  trailer or the same Conventional-Commits type — collapses to one
 *  expandable group row instead of repeating the same task/type once per
 *  commit (COCKPIT 2/6, RESEARCH-LIBRARY cost anatomy: "85 commits must
 *  read as a handful of rows"). `kind` distinguishes a task-id run from a
 *  type run for callers that want to style them differently. */
export interface LandingCommitGroupRow<T> {
  readonly isGroup: true;
  readonly kind: 'task' | 'type';
  readonly label: string;
  readonly commits: readonly T[];
}

/** A single commit with no run partner — renders its own row. */
export interface LandingCommitSingleRow<T> {
  readonly isGroup: false;
  readonly commit: T;
}

export type LandingCommitDisplayRow<T> = LandingCommitGroupRow<T> | LandingCommitSingleRow<T>;

/** Walks a project's unmerged commits (as `readLandingInfo` orders them —
 *  newest or oldest doesn't matter, only adjacency does) and folds runs of
 *  2+ consecutive commits sharing the same `(BOARD <task-id>)` trailer (the
 *  same trailer format `PICK DISCIPLINE`'s firing prompt writes onto every
 *  board-linked commit) or the same Conventional-Commits type prefix (the
 *  same shape `packages/engine/src/release.ts`'s `CONVENTIONAL_SUBJECT`
 *  matches — task-id is checked first since it's the more specific, more
 *  useful grouping: an epic's slices share a type but not a task) into one
 *  group row; every other commit (including an isolated run of one) stays
 *  its own row — the exact `flightLogDisplayRows` (`flight-log-rows.ts`)
 *  shape, applied to LANDING's commit list instead of the flight log. The
 *  key-matching regexes live inline rather than as module-level constants:
 *  this function is embedded into the browser bundle via `.toString()` (see
 *  `shell.ts`'s `fleetJs()`), which carries only the function's own source
 *  text — no imports, and no surrounding module scope survives the splice. */
export function landingCommitRuns<T extends LandingRunCommit>(
  commits: readonly T[],
): LandingCommitDisplayRow<T>[] {
  function keyOf(subject: string): { kind: 'task' | 'type'; label: string } | null {
    const task = /\(BOARD ([^)]+)\)/.exec(subject);
    if (task && task[1]) return { kind: 'task', label: task[1] };
    const type = /^([a-z]+)(\([^)]*\))?!?:\s/.exec(subject);
    if (type && type[1]) return { kind: 'type', label: type[1] };
    return null;
  }
  const rows: LandingCommitDisplayRow<T>[] = [];
  let i = 0;
  while (i < commits.length) {
    const first = commits[i]!;
    const key = keyOf(first.subject);
    let j = i + 1;
    if (key) {
      while (j < commits.length) {
        const next = keyOf(commits[j]!.subject);
        if (!next || next.kind !== key.kind || next.label !== key.label) break;
        j++;
      }
    }
    if (j - i > 1) {
      rows.push({
        isGroup: true,
        kind: key!.kind,
        label: key!.label,
        commits: commits.slice(i, j),
      });
    } else {
      rows.push({ isGroup: false, commit: first });
    }
    i = j;
  }
  return rows;
}

/** A collapsed commit-group row's header text — the "Show all (N)"/"Hide"
 *  toggle's closed/open text and its aria-label — that the group-row
 *  renderer needs before building any DOM, the same `flightGroupHeadMeta`
 *  split (`flight-log-rows.ts`). */
export interface LandingGroupHeadMeta {
  readonly headline: string;
  readonly toggleClosedText: string;
  readonly toggleOpenText: string;
  readonly ariaLabel: string;
  readonly tip: string;
}

export function landingGroupHeadMeta(
  row: Pick<LandingCommitGroupRow<unknown>, 'kind' | 'label' | 'commits'>,
): LandingGroupHeadMeta {
  const count = row.commits.length;
  const headline = row.label + ' — ' + count + ' commit' + (count === 1 ? '' : 's');
  const sharedBy = row.kind === 'task' ? 'the same board task' : 'the same commit type';
  return {
    headline,
    toggleClosedText: 'Show all (' + count + ')',
    toggleOpenText: 'Hide',
    ariaLabel: headline,
    tip:
      count +
      ' commit' +
      (count === 1 ? '' : 's') +
      ' sharing ' +
      sharedBy +
      ', collapsed into one row — expand to see each individually',
  };
}
