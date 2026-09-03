// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure tooltip/aria-label text math for the fleet card's "Remove" button and
 * the project detail page's "Start over" button — client-only (no server
 * counterpart), so it lives in `web/` rather than `shared/` (epic 0002
 * "shell decomposition", slice 2: feature-module split of `shell.ts`),
 * following the same pattern `card-facts.ts`'s `factsMeta` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The fleet card's "Remove" button's `data-tip` sentence that `cardActions`
 *  previously built inline before writing it to the button's attributes. */
export function cardRemoveTip(name: string): string {
  return 'Remove ' + name + ' from the dashboard';
}

/** The fleet card's "Remove" button's concise `aria-label` — just the
 *  action + target name, never {@link cardRemoveTip}'s "from the dashboard"
 *  clause duplicated verbatim (D1 ATTRIBUTE PAYLOAD, epic 0015,
 *  web-mtd1wmqc-v7h6cq — same split 189137e0 gave the task-row chips). The
 *  button's own visible text is just "Remove", so without this the fleet
 *  list's per-card Remove buttons would be indistinguishable by accessible
 *  name alone. */
export function cardRemoveAriaLabel(name: string): string {
  return 'Remove ' + name;
}

/** The project detail page's "Start over" button's tip (shared as both
 *  `data-tip` and `aria-label`) that `renderProjectPage` previously built
 *  inline before writing it to the button's attributes. */
export function startOverTip(name: string): string {
  return 'Reset ' + name + "'s firings + ship-rate counters to 0/0";
}

/** The project detail page's "Sync to GitHub" button's tip (shared as both
 *  `data-tip` and `aria-label`, BOARD web-mss4lpwi-p0w1d0 "GITHUB 2/5") —
 *  same pattern as {@link startOverTip}, phrased action-first since the
 *  button itself doesn't yet know whether this will create a new repo or
 *  re-sync an existing one (that's decided server-side, per project). */
export function githubSyncTip(name: string): string {
  return 'Sync ' + name + ' to GitHub — creates a private repo, or pushes if one exists';
}

/** The GitHub-sync button's English `window.confirm()` message (epic 0002
 *  "shell decomposition") — private/public phrasing that the
 *  `[data-github-sync]` click handler previously built inline with a
 *  ternary before calling `window.confirm`. The public branch is
 *  deliberately more severe: it only fires when the adjacent visibility
 *  checkbox is explicitly checked. i18n foundation (board web-msnsndki-dz3vn1):
 *  the click handler itself now reads the translated text straight from
 *  `@autopilot/tokens`' `STRINGS.githubSyncConfirmPrivate`/
 *  `githubSyncConfirmPublic` via `tr(key, name)`, the same `{name}`-template
 *  pattern `taskDeleteConfirm`/`removeProjectConfirm`/`startOverConfirm`
 *  established — this function is kept as the English source of truth those
 *  two STRINGS entries mirror, and stays covered by its own unit tests
 *  below, but is no longer called from the generated client bundle. */
export function githubSyncConfirmMessage(name: string, visibility: 'public' | 'private'): string {
  return visibility === 'public'
    ? 'Make ' +
        name +
        ' PUBLIC on GitHub?\n\nAnyone on the internet will be able to see this code and its full history. This creates a public GitHub repo and pushes (first sync), or pushes to the existing remote (re-sync), using your own authenticated gh/git. This cannot be undone by this dashboard.'
    : 'Sync ' +
        name +
        ' to GitHub?\n\nThis creates a private GitHub repo and pushes (first sync), or pushes to the existing remote (re-sync), using your own authenticated gh/git. This cannot be undone by this dashboard.';
}

/** The shape `githubSyncExecuteResult` reads off `POST
 *  /api/github-sync/execute`'s JSON response. */
export interface GithubSyncExecuteResponse {
  readonly ok: boolean;
  readonly details?: string;
  readonly error?: string;
}

/** The `.github-sync-result` element's class + message text for one `POST
 *  /api/github-sync/execute` response (epic 0002 "shell decomposition") —
 *  same `className`/`text` shape `release-panel.ts`'s `releaseExecuteResult`
 *  uses — that the click handler's fetch `.then` previously built inline. */
export interface GithubSyncExecuteResult {
  readonly className: string;
  readonly text: string;
}

export function githubSyncExecuteResult(
  data: GithubSyncExecuteResponse | null | undefined,
): GithubSyncExecuteResult {
  const ok = !!(data && data.ok);
  return {
    className: 'github-sync-result ' + (ok ? 'github-sync-result-ok' : 'github-sync-result-fail'),
    text:
      (ok ? '✓ ' : '✗ ') +
      ((data && (data.details || data.error)) || (ok ? 'synced.' : 'sync failed.')),
  };
}

/** The project detail page's "Contribute upstream" form's label text (epic
 *  0006 "GitHub connected mode", slice 5 "contribute upstream" — the fork +
 *  branch-push + `gh pr create` half; the sibling issue-report half's
 *  `.gh-issue-form` lives in the CONNECT popover instead, since a bug
 *  report isn't tied to any one project's branch). Names the project so the
 *  operator knows whose current branch is about to travel upstream. */
export function githubPrLabel(name: string): string {
  return 'Contribute ' + name + "'s current branch upstream as a pull request";
}

/** The "Contribute upstream" form's "Open pull request" submit button's tip
 *  (shared as both `data-tip` and `aria-label`, app-wide interactivity audit
 *  web-msm66jlc-gm4oom) — leads with the action so it still reads as an
 *  accessible name, then spells out the fork + branch-push + `gh pr create`
 *  sequence the button label alone doesn't reveal, BEFORE the click. */
export function githubPrSubmitTip(name: string): string {
  return (
    'Opens a real pull request against the upstream AUTOPILOT repo — forks it, pushes ' +
    name +
    "'s current branch to that fork, and runs gh pr create with your own gh. Asks for confirmation first."
  );
}

/** The "Contribute upstream" form's `window.confirm()` message — same
 *  every-GitHub-write-is-visible stance {@link githubSyncConfirmMessage}
 *  takes, phrased for the fork + branch-push + `gh pr create` sequence.
 *  `issueNumber` — epic 0007 "PLATFORM 6/7" pool-client's PR-delivery leg —
 *  names the pool issue the PR will close on merge (`github-pr-contribute.ts`'s
 *  `planGithubPr` already appends the `Closes #<n>` trailer once a caller
 *  passes it through), so the operator sees that consequence before
 *  confirming rather than discovering it only in the PR body afterward.
 *  i18n foundation (board web-msnsndki-dz3vn1): the click handler itself
 *  now reads the translated text straight from `@autopilot/tokens`'
 *  `STRINGS.githubPrConfirm` (base sentence, `{name}`/`{title}` placeholders)
 *  plus `githubPrConfirmIssueClause` (`{issueNumber}`, appended only when
 *  one exists) via `tr(key, subs)` — this function is kept as the English
 *  source of truth those two STRINGS entries mirror, and stays covered by
 *  its own unit tests below, but is no longer called from the generated
 *  client bundle. */
export function githubPrConfirmMessage(name: string, title: string, issueNumber?: number): string {
  return (
    'Open a pull request titled "' +
    title +
    '" against the upstream AUTOPILOT repo from ' +
    name +
    "'s current branch?\n\nThis forks the upstream repo, pushes your branch to that fork, and runs a real `gh pr create` using your own authenticated gh/git. This cannot be undone by this dashboard." +
    (issueNumber === undefined ? '' : `\n\nThis will close issue #${issueNumber} on merge.`)
  );
}

/** The subset of a task row {@link poolDeliveryIssueNumber} reads — the same
 *  shape `read/source.ts` sends the client for every project's `tasks`. */
export interface PoolDeliveryTaskLike {
  readonly id: string;
  readonly source: string;
  readonly status: string;
}

/**
 * Epic 0007 "PLATFORM 6/7" pool-client's PR-delivery leg: which pool issue
 * (if any) the "Contribute upstream" form should prefill as the `Closes #`
 * target for `projectId`'s current work. Considers every `source: 'github'`
 * task not `'deferred'` (a co-pilot gave up on it, so contributing a PR for
 * it would be a false close) and extracts the issue number its id encodes
 * — a `source: 'github'` task's id is always `github-<n>`, the
 * `issueTaskId(issueNumber)` scheme `issue-triage.ts`/`pool-client.ts` share
 * (matched here rather than re-derived from title/labels, the same
 * read-the-existing-classifier stance the rest of this epic's modules take).
 * Exactly one candidate prefills; zero candidates (no pool-linked work) or
 * more than one (which of several issues does THIS branch's PR actually
 * close? guessing wrong ships a false "Closes #") both return `undefined`
 * and leave the field for the operator to fill in by hand — a missing
 * prefill is a minor inconvenience, a wrong one is a silently mislinked PR.
 * The matcher is a literal inline regex, not a shared module const — this
 * function is spliced into the client bundle by its own `.toString()`
 * (`web/shell.ts`'s "Contribute upstream" form), which carries no free
 * variables with it, so any dependency has to live inside the function body.
 */
export function poolDeliveryIssueNumber(
  tasks: readonly PoolDeliveryTaskLike[],
): number | undefined {
  const candidates = tasks
    .filter((t) => t.source === 'github' && t.status !== 'deferred')
    .map((t) => /^github-(\d+)$/.exec(t.id))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Shape of the `POST /api/github-pr/execute` JSON response
 *  {@link githubPrExecuteResult} reads. */
export interface GithubPrExecuteResponse {
  readonly ok: boolean;
  readonly details?: string;
  readonly url?: string;
  readonly error?: string;
}

/** The "Contribute upstream" form's `.github-pr-result` element's class +
 *  message text for one `POST /api/github-pr/execute` response — same
 *  `className`/`text` shape {@link githubSyncExecuteResult} uses. Appends
 *  the created PR's URL when the response carries one. */
export function githubPrExecuteResult(
  data: GithubPrExecuteResponse | null | undefined,
): GithubSyncExecuteResult {
  const ok = !!(data && data.ok);
  const message =
    (data && (data.details || data.error)) ||
    (ok ? 'pull request opened.' : 'failed to open pull request.');
  return {
    className: 'github-pr-result ' + (ok ? 'github-pr-result-ok' : 'github-pr-result-fail'),
    text: (ok ? '✓ ' : '✗ ') + message + (ok && data && data.url ? ' ' + data.url : ''),
  };
}
