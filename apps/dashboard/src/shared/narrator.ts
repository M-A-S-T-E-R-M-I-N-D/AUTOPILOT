// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure logic shared by the server read-model (`read/fleet.ts`) and the
 * hand-authored client bundle (`web/shell.ts`, no bundler, CSP `self`-only —
 * epic 0002 "shell decomposition", slice 1). Same treatment as
 * `shared/callsign.ts`/`shared/turns.ts`: `web/shell.ts` embeds this module's
 * real compiled source into the generated `/app.js` text via `.toString()` —
 * see `fleetJs()` — instead of hand-retyping the narrator's classification
 * and phrasing logic, so the two copies can no longer drift apart.
 * `apps/dashboard/test/web/narrator-parity.test.ts` regression-tests that the
 * served bundle's output matches this module's own function.
 */

/** The activity fields the narrator reads — a narrow view of `read/fleet.ts`'s `ActivityEntry`. */
export interface NarratorActivity {
  readonly tool: string;
  readonly target: string;
  readonly kind: string;
  readonly phase: string;
}

/** Longest raw target the one-line narrator sentence will quote verbatim. */
export const NARRATOR_TARGET_CAP = 60;

/** Trim a target string for the one-line narrator sentence (never invents text). */
export function narratorTarget(target: string): string {
  return target.length > NARRATOR_TARGET_CAP
    ? `${target.slice(0, NARRATOR_TARGET_CAP - 1)}…`
    : target;
}

/** The basename of a path under either slash style (falls back to the raw string). */
export function basename(target: string): string {
  const parts = target.split(/[/\\]/);
  const last = parts[parts.length - 1];
  if (!last) return target;
  return last;
}

/** The narrator's rough bucket for one activity — consecutive same-bucket
 *  actions report as a streak instead of repeating the same sentence. */
export type NarratorKind =
  'edit' | 'read' | 'search' | 'gate' | 'commit' | 'orient' | 'command' | 'other';

export function narratorKind(a: NarratorActivity): NarratorKind {
  if (a.kind === 'file') {
    return a.tool === 'Write' || a.tool === 'Edit' || a.tool === 'NotebookEdit' ? 'edit' : 'read';
  }
  if (a.kind === 'search') return 'search';
  if (a.kind === 'command') {
    if (a.phase === 'gate') return 'gate';
    if (a.phase === 'commit') return 'commit';
    if (a.phase === 'orient') return 'orient';
    return 'command';
  }
  // Stryker disable next-line StringLiteral: this return value is never
  // compared against the literal 'other' — narratorPhrase's switch only
  // matches it via `default` (any unrecognized value lands there) and
  // narratorLine's streak loop only checks kind-to-kind equality, so any
  // placeholder consistently returned here is unobservable by a black-box
  // test on narratorLine's output.
  return 'other';
}

export function narratorPhrase(a: NarratorActivity): string {
  const raw = a.target || '';
  switch (narratorKind(a)) {
    case 'edit':
      return raw ? `Editing ${basename(raw)}` : 'Editing a file';
    case 'read':
      return raw ? `Reading ${basename(raw)}` : 'Reading a file';
    case 'search':
      return raw ? `Searching for "${narratorTarget(raw)}"` : 'Searching the codebase';
    case 'gate':
      return raw ? `Running the gate: ${narratorTarget(raw)}` : 'Running the gate';
    case 'commit':
      return raw ? `Committing: ${narratorTarget(raw)}` : 'Committing the change';
    case 'orient':
      return raw ? `Looking around: ${narratorTarget(raw)}` : 'Looking around the repo';
    case 'command': {
      // Known noisy shape (board web-msqgnkdw-s7zlmm): a shell loop over many
      // board-task ids reads as opaque command soup at any cap — count the
      // ids and say what the loop is doing instead.
      const taskIds = raw.match(/web-[a-z0-9]+-[a-z0-9]+/g);
      if (taskIds && taskIds.length > 1) return `Updating ${taskIds.length} tasks`;
      return raw ? `Running: ${narratorTarget(raw)}` : `Running ${a.tool}`;
    }
    default:
      return raw ? `Using ${a.tool} on ${narratorTarget(raw)}` : `Using ${a.tool}`;
  }
}

/**
 * A deterministic, model-free one-sentence summary of what a firing is doing
 * right now — built purely from the last few activities of that firing (newest
 * first), no LLM call. Consecutive same-kind actions (e.g. three edits in a
 * row) collapse into one sentence with a streak count instead of repeating.
 */
export function narratorLine(recent: readonly NarratorActivity[]): string {
  const [latest, ...rest] = recent;
  if (!latest) return 'Getting oriented — no activity captured yet.';
  const kind = narratorKind(latest);
  let streak = 0;
  for (const a of rest) {
    if (narratorKind(a) !== kind) break;
    streak++;
  }
  const phrase = narratorPhrase(latest);
  const line = streak > 0 ? `${phrase} (${streak + 1} in a row).` : `${phrase}.`;
  // Compose-time overflow cap (board web-msqgnkdw-s7zlmm): the worker card
  // shows ONE sentence, but a long tool name plus a capped target can still
  // compose past it. Declared inside the body because `web/shell.ts` embeds
  // this function's compiled source verbatim via `.toString()` — a module-
  // level constant would not travel with it into the served bundle.
  const NARRATOR_LINE_CAP = 90;
  return line.length > NARRATOR_LINE_CAP ? `${line.slice(0, NARRATOR_LINE_CAP - 1)}…` : line;
}
