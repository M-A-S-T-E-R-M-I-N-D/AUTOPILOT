// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure RELEASE EXECUTE result-message formatting — client-only (no server
 * counterpart; `server.ts`/`packages/engine/src/release.ts` return raw
 * `ok`/`details`/`attestation`/`milestoneTag`, and composing those into the
 * "✓ Released — ..." sentence is purely a client presentation concern, same
 * reasoning `fly-hint.ts` used), so it lives in `web/` rather than `shared/`
 * (epic 0002 "shell decomposition", slice 2). `releaseVersionItems`
 * (sixty-fourth cut) formats the RELEASE preview line's version/bump chips
 * that `renderReleaseBody` previously computed inline.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The optional attestation/milestone-tag sub-results `POST
 *  /api/release/execute` may return alongside the release itself. */
export interface ReleaseExecuteSubResult {
  readonly ok: boolean;
  readonly details: string;
}

/** The shape `releaseExecuteResult` reads off `POST /api/release/execute`'s
 *  JSON response. */
export interface ReleaseExecuteResponse {
  readonly ok: boolean;
  readonly details?: string;
  readonly error?: string;
  readonly attestation?: ReleaseExecuteSubResult;
  readonly milestoneTag?: ReleaseExecuteSubResult;
  readonly ghRelease?: ReleaseExecuteSubResult;
}

/** The `.release-result` element's class + message text for one `POST
 *  /api/release/execute` response. */
export interface ReleaseExecuteResult {
  readonly className: string;
  readonly text: string;
}

/** Formats the RELEASE EXECUTE result — on success: "✓ Released — <details>"
 *  plus a non-fatal note when the attestation failed to attach and/or a
 *  milestone-tag note (attached or failed); on failure: "✗ <details or
 *  error>". */
export function releaseExecuteResult(
  data: ReleaseExecuteResponse | null | undefined,
): ReleaseExecuteResult {
  const ok = !!(data && data.ok);
  const className = 'release-result ' + (ok ? 'release-result-ok' : 'release-result-fail');
  if (!ok) {
    return {
      className,
      text: '✗ ' + ((data && (data.details || data.error)) || 'release failed.'),
    };
  }
  const attestation = data!.attestation;
  const attestationNote =
    attestation && !attestation.ok
      ? ' (note: attestation not attached — ' + attestation.details + ')'
      : '';
  const milestoneTag = data!.milestoneTag;
  const milestoneNote = milestoneTag
    ? milestoneTag.ok
      ? ' ' + milestoneTag.details + '.'
      : ' (note: milestone tag not attached — ' + milestoneTag.details + ')'
    : '';
  const ghRelease = data!.ghRelease;
  const ghReleaseNote = ghRelease
    ? ghRelease.ok
      ? ' ' + ghRelease.details + '.'
      : ' (note: GitHub Release not published — ' + ghRelease.details + ')'
    : '';
  return {
    className,
    text:
      '✓ Released — ' +
      (data!.details || 'tagged.') +
      attestationNote +
      milestoneNote +
      ghReleaseNote,
  };
}

/** One RELEASE preview line `tipChip`'s text/tip/aria-label/extra-class
 *  quadruple, in `tipChip`'s own argument order — same shape
 *  `landing-panel.ts`'s `LandingDiffstatItem` uses. */
export type ReleaseVersionItem = readonly [
  text: string,
  tip: string,
  ariaLabel: string,
  className: string,
];

/** The shape `releaseVersionItems` reads off the RELEASE preview's planned
 *  bump — the same `plan` field `GET /api/release` returns once
 *  `packages/engine/src/release.ts`'s `planRelease` finds release-worthy
 *  commits. */
export interface ReleasePlanLike {
  readonly bump: string;
  readonly version: string;
}

/** The RELEASE preview line's two `tipChip`s — current → planned version,
 *  and the bump kind — that `renderReleaseBody` previously computed inline
 *  before appending each chip. */
export function releaseVersionItems(
  currentVersion: string,
  plan: ReleasePlanLike,
): readonly ReleaseVersionItem[] {
  return [
    [
      currentVersion + ' → ' + plan.version,
      'Next release version',
      'SemVer ' + plan.bump + ' bump: ' + currentVersion + ' → ' + plan.version,
      'release-version',
    ],
    [plan.bump, 'Bump kind', 'bump kind: ' + plan.bump, 'release-bump'],
  ];
}

/** The RELEASE EXECUTE button's `window.confirm()` message (eighty-second
 *  cut) — the base "this cannot be undone" warning, plus an extra clause
 *  naming the milestone tag when the operator typed one into the panel's
 *  `.release-milestone-input`, that the `[data-release-execute]` click
 *  handler previously built inline with a ternary-appended string before
 *  calling `window.confirm`. Neither branch had direct coverage — the
 *  existing DOM tests only assert `window.confirm` was called, never with
 *  what message. `ghRelease` (epic 0006 slice 3) adds a third clause naming
 *  the extra publish-upstream leg when the operator checked
 *  `.release-ghrelease-checkbox` — defaults to `false` so every existing
 *  caller/test that only ever passed a `milestoneTag` keeps behaving exactly
 *  as before. */
export function releaseConfirmMessage(milestoneTag: string, ghRelease = false): string {
  return (
    'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation.' +
    (milestoneTag ? ' Also tags "' + milestoneTag + '" at the same commit.' : '') +
    (ghRelease ? ' Also pushes the new tag and publishes it as a GitHub Release.' : '') +
    ' This cannot be undone by this dashboard.'
  );
}

/** The RELEASE EXECUTE button's `[data-tip]`/`aria-label` (app-wide
 *  interactivity audit v2, web-msm66jlc-gm4oom) — the button carried no
 *  explanation of what cutting a release does before the operator's click
 *  triggered {@link releaseConfirmMessage}'s confirm dialog. Names the
 *  planned version so hover/focus previews match the button's own label. */
export function releaseExecuteTip(version: string): string {
  return (
    'Cuts v' +
    version +
    ' — bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. Cannot be undone by this dashboard.'
  );
}
