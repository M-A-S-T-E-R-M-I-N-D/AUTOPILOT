// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's MIRROR PASS panel client
 * (`web/features/mirror-pass.ts`) — same pattern
 * `test/web/features/issue-triage.test.ts` already uses for this class of
 * `.toString()`-spliced panel-JS generator: assert on the generated source
 * text rather than booting a full jsdom page for every wiring detail.
 */

import { describe, it, expect } from 'vitest';
import {
  mirrorPassReconcileItems,
  mirrorPassLandingNoteItems,
  mirrorPassStaleClaimItems,
  mirrorPassDriftItems,
  mirrorPassPriorityFollowItems,
  mirrorPassItems,
  mirrorPassCanExecute,
  mirrorPassExecuteResultMessage,
  mirrorPassCanExecuteDrift,
  mirrorPassDriftExecuteResultMessage,
  mirrorPassCanExecuteLandingNote,
  mirrorPassCanExecuteStaleClaim,
  mirrorPassCanExecutePriorityFollow,
  mirrorPassRepoMismatch,
} from '../../../src/web/mirror-pass-panel.js';
import { mirrorPassJs } from '../../../src/web/features/mirror-pass.js';

describe('mirrorPassJs', () => {
  it('embeds mirrorPassReconcileItems/mirrorPassLandingNoteItems/mirrorPassStaleClaimItems/mirrorPassDriftItems/mirrorPassPriorityFollowItems/mirrorPassItems/mirrorPassCanExecute/mirrorPassExecuteResultMessage/mirrorPassCanExecuteDrift/mirrorPassDriftExecuteResultMessage/mirrorPassCanExecuteLandingNote/mirrorPassCanExecuteStaleClaim/mirrorPassCanExecutePriorityFollow/mirrorPassRepoMismatch real compiled source via .toString()', () => {
    const out = mirrorPassJs();
    expect(out).toContain(mirrorPassReconcileItems.toString());
    expect(out).toContain(mirrorPassLandingNoteItems.toString());
    expect(out).toContain(mirrorPassStaleClaimItems.toString());
    expect(out).toContain(mirrorPassDriftItems.toString());
    expect(out).toContain(mirrorPassPriorityFollowItems.toString());
    expect(out).toContain(mirrorPassItems.toString());
    expect(out).toContain(mirrorPassCanExecute.toString());
    expect(out).toContain(mirrorPassExecuteResultMessage.toString());
    expect(out).toContain(mirrorPassCanExecuteDrift.toString());
    expect(out).toContain(mirrorPassDriftExecuteResultMessage.toString());
    expect(out).toContain(mirrorPassCanExecuteLandingNote.toString());
    expect(out).toContain(mirrorPassCanExecuteStaleClaim.toString());
    expect(out).toContain(mirrorPassCanExecutePriorityFollow.toString());
    expect(out).toContain(mirrorPassRepoMismatch.toString());
  });

  it('declares mirrorPassSection, renderMirrorPassBody, renderMirrorPassRepoMismatch, and loadMirrorPassBody', () => {
    const out = mirrorPassJs();
    expect(out).toContain('function mirrorPassSection(pid, githubRepo) {');
    expect(out).toContain(
      'function renderMirrorPassBody(body, items, canExecute, canExecuteDrift, canExecuteLandingNote, canExecuteStaleClaim, canExecutePriorityFollow, pid) {',
    );
    expect(out).toContain('function renderMirrorPassRepoMismatch(body, mismatch) {');
    expect(out).toContain('function loadMirrorPassBody(body, pid) {');
  });

  it('resolves identity through the shared socialIdentity() core helper BEFORE the five previews, and asks mirrorPassRepoMismatch first (epic 0019 S3 per project)', () => {
    const out = mirrorPassJs();
    // The call sites, not the spliced helper's own declaration text.
    const identityAt = out.indexOf('socialIdentity()');
    const mismatchAt = out.indexOf('var mismatch = mirrorPassRepoMismatch(identity, project);');
    const previewsAt = out.indexOf('fetch(base + qs)');
    expect(identityAt).toBeGreaterThan(-1);
    expect(mismatchAt).toBeGreaterThan(identityAt);
    expect(previewsAt).toBeGreaterThan(mismatchAt);
    expect(out).toContain('mirrorPassCanExecute(identity, reconcile)');
  });

  it("carries the project's own origin repo on the panel body so every reload asks the same per-project question", () => {
    const out = mirrorPassJs();
    expect(out).toContain("body.setAttribute('data-github-repo', githubRepo || '');");
    expect(out).toContain("githubRepo: body.getAttribute('data-github-repo') || null");
  });

  it('renders the repo-mismatch line as a two-value i18n template the locale sweep can re-fill in place', () => {
    const out = mirrorPassJs();
    expect(out).toContain("msg.setAttribute('data-i18n-template', 'mirrorPassRepoMismatch');");
    expect(out).toContain("msg.setAttribute('data-i18n-args', JSON.stringify(args));");
    expect(out).toContain("tr('mirrorPassRepoMismatch', args)");
  });

  it('gates the execute button on mirrorPassCanExecute, not a hand-rolled role check', () => {
    const out = mirrorPassJs();
    expect(out).toContain('if (canExecute) {');
  });

  it('tags the execute button data-i18n and points it at the project id', () => {
    const out = mirrorPassJs();
    expect(out).toContain("runBtn.setAttribute('data-i18n', 'mirrorPassExecute');");
    expect(out).toContain("runBtn.setAttribute('data-mirror-pass-execute', pid);");
  });

  it('tags the execute tip/aria with one shared key and paints the confirm + transient states via tr() (board web-msnsndki-dz3vn1)', () => {
    const out = mirrorPassJs();
    expect(out).toContain("runBtn.setAttribute('data-i18n-tip', 'mirrorPassExecuteTip');");
    expect(out).toContain("runBtn.setAttribute('data-i18n-aria', 'mirrorPassExecuteTip');");
    expect(out).toContain("window.confirm(tr('mirrorPassExecuteConfirm'))");
    expect(out).toContain("b.textContent = tr('mirrorPassExecuting');");
    expect(out).toContain("resultEl.textContent = tr('mirrorPassRequestFailed');");
    expect(out).not.toContain("'Running…'");
  });

  it('posts to /api/mirror-pass/execute with the project id on click', () => {
    const out = mirrorPassJs();
    expect(out).toContain("e.target.closest('[data-mirror-pass-execute]')");
    expect(out).toContain("ritualFetch('mirror-pass', '/api/mirror-pass/execute'");
    expect(out).toContain('body: JSON.stringify({ project: pid })');
  });

  it('reloads the panel on a clean run instead of leaving a stale result message', () => {
    const out = mirrorPassJs();
    expect(out).toContain('loadMirrorPassBody(body, pid);');
  });

  it('sweeps freshly built DOM after every async render (board web-msnsndki-dz3vn1)', () => {
    const out = mirrorPassJs();
    expect(out.match(/translateDom\(document\.documentElement\.lang \|\| 'en'\);/g)?.length).toBe(
      4,
    );
  });

  it('gates the drift-fix button on mirrorPassCanExecuteDrift, independent of the reconcile button', () => {
    const out = mirrorPassJs();
    expect(out).toContain('if (canExecuteDrift) {');
    expect(out).toContain('mirrorPassCanExecuteDrift(identity, drift)');
  });

  it('tags the drift-fix button data-i18n and points it at the project id', () => {
    const out = mirrorPassJs();
    expect(out).toContain("driftBtn.setAttribute('data-i18n', 'mirrorPassDriftExecute');");
    expect(out).toContain("driftBtn.setAttribute('data-mirror-pass-drift-execute', pid);");
  });

  it('tags the drift-fix tip/aria with one shared key and paints the confirm + transient states via tr()', () => {
    const out = mirrorPassJs();
    expect(out).toContain("driftBtn.setAttribute('data-i18n-tip', 'mirrorPassDriftExecuteTip');");
    expect(out).toContain("driftBtn.setAttribute('data-i18n-aria', 'mirrorPassDriftExecuteTip');");
    expect(out).toContain("window.confirm(tr('mirrorPassDriftExecuteConfirm'))");
    expect(out).toContain("b.textContent = tr('mirrorPassDriftExecuting');");
    expect(out).toContain("resultEl.textContent = tr('mirrorPassDriftRequestFailed');");
  });

  it('posts to /api/mirror-pass/drift/execute with the project id on click, independent of the reconcile button', () => {
    const out = mirrorPassJs();
    expect(out).toContain("e.target.closest('[data-mirror-pass-drift-execute]')");
    expect(out).toContain("ritualFetch('mirror-pass', '/api/mirror-pass/drift/execute'");
    expect(out.match(/body: JSON\.stringify\(\{ project: pid \}\),/g)?.length).toBe(5);
  });

  it('gates the landing-note button on mirrorPassCanExecuteLandingNote, independent of the other two', () => {
    const out = mirrorPassJs();
    expect(out).toContain('if (canExecuteLandingNote) {');
    expect(out).toContain('mirrorPassCanExecuteLandingNote(identity, landingNote)');
  });

  it('tags the landing-note button data-i18n and points it at the project id', () => {
    const out = mirrorPassJs();
    expect(out).toContain(
      "landingNoteBtn.setAttribute('data-i18n', 'mirrorPassLandingNoteExecute');",
    );
    expect(out).toContain(
      "landingNoteBtn.setAttribute('data-mirror-pass-landing-note-execute', pid);",
    );
  });

  it('tags the landing-note tip/aria with one shared key and paints the confirm + transient states via tr()', () => {
    const out = mirrorPassJs();
    expect(out).toContain(
      "landingNoteBtn.setAttribute('data-i18n-tip', 'mirrorPassLandingNoteExecuteTip');",
    );
    expect(out).toContain(
      "landingNoteBtn.setAttribute('data-i18n-aria', 'mirrorPassLandingNoteExecuteTip');",
    );
    expect(out).toContain("window.confirm(tr('mirrorPassLandingNoteExecuteConfirm'))");
    expect(out).toContain("b.textContent = tr('mirrorPassLandingNoteExecuting');");
    expect(out).toContain("resultEl.textContent = tr('mirrorPassLandingNoteRequestFailed');");
  });

  it('posts to /api/mirror-pass/landing-note/execute with the project id on click, reusing mirrorPassExecuteResultMessage', () => {
    const out = mirrorPassJs();
    expect(out).toContain("e.target.closest('[data-mirror-pass-landing-note-execute]')");
    expect(out).toContain("ritualFetch('mirror-pass', '/api/mirror-pass/landing-note/execute'");
    expect(
      out.match(/var result = mirrorPassExecuteResultMessage\(r\.status, r\.data\);/g)?.length,
    ).toBe(4);
  });

  it('gates the stale-claim button on mirrorPassCanExecuteStaleClaim, independent of the other three', () => {
    const out = mirrorPassJs();
    expect(out).toContain('if (canExecuteStaleClaim) {');
    expect(out).toContain('mirrorPassCanExecuteStaleClaim(identity, staleClaims)');
  });

  it('tags the stale-claim button data-i18n and points it at the project id', () => {
    const out = mirrorPassJs();
    expect(out).toContain(
      "staleClaimBtn.setAttribute('data-i18n', 'mirrorPassStaleClaimExecute');",
    );
    expect(out).toContain(
      "staleClaimBtn.setAttribute('data-mirror-pass-stale-claim-execute', pid);",
    );
  });

  it('tags the stale-claim tip/aria with one shared key and paints the confirm + transient states via tr()', () => {
    const out = mirrorPassJs();
    expect(out).toContain(
      "staleClaimBtn.setAttribute('data-i18n-tip', 'mirrorPassStaleClaimExecuteTip');",
    );
    expect(out).toContain(
      "staleClaimBtn.setAttribute('data-i18n-aria', 'mirrorPassStaleClaimExecuteTip');",
    );
    expect(out).toContain("window.confirm(tr('mirrorPassStaleClaimExecuteConfirm'))");
    expect(out).toContain("b.textContent = tr('mirrorPassStaleClaimExecuting');");
    expect(out).toContain("resultEl.textContent = tr('mirrorPassStaleClaimRequestFailed');");
  });

  it('posts to /api/mirror-pass/stale-claims/execute with the project id on click, reusing mirrorPassExecuteResultMessage', () => {
    const out = mirrorPassJs();
    expect(out).toContain("e.target.closest('[data-mirror-pass-stale-claim-execute]')");
    expect(out).toContain("ritualFetch('mirror-pass', '/api/mirror-pass/stale-claims/execute'");
  });

  it('gates the priority-follow button on mirrorPassCanExecutePriorityFollow, independent of the other four', () => {
    const out = mirrorPassJs();
    expect(out).toContain('if (canExecutePriorityFollow) {');
    expect(out).toContain('mirrorPassCanExecutePriorityFollow(identity, priorityFollow)');
  });

  it('tags the priority-follow button data-i18n and points it at the project id', () => {
    const out = mirrorPassJs();
    expect(out).toContain(
      "priorityFollowBtn.setAttribute('data-i18n', 'mirrorPassPriorityFollowExecute');",
    );
    expect(out).toContain(
      "priorityFollowBtn.setAttribute('data-mirror-pass-priority-follow-execute', pid);",
    );
  });

  it('tags the priority-follow tip/aria with one shared key and paints the confirm + transient states via tr()', () => {
    const out = mirrorPassJs();
    expect(out).toContain(
      "priorityFollowBtn.setAttribute('data-i18n-tip', 'mirrorPassPriorityFollowExecuteTip');",
    );
    expect(out).toContain(
      "priorityFollowBtn.setAttribute('data-i18n-aria', 'mirrorPassPriorityFollowExecuteTip');",
    );
    expect(out).toContain("window.confirm(tr('mirrorPassPriorityFollowExecuteConfirm'))");
    expect(out).toContain("b.textContent = tr('mirrorPassPriorityFollowExecuting');");
    expect(out).toContain("resultEl.textContent = tr('mirrorPassPriorityFollowRequestFailed');");
  });

  it('fetches /api/mirror-pass/priority-follow and posts to its execute endpoint with the project id on click, reusing mirrorPassExecuteResultMessage', () => {
    const out = mirrorPassJs();
    expect(out).toContain("fetch(base + '/priority-follow' + qs)");
    expect(out).toContain("e.target.closest('[data-mirror-pass-priority-follow-execute]')");
    expect(out).toContain("ritualFetch('mirror-pass', '/api/mirror-pass/priority-follow/execute'");
    expect(
      out.match(/var result = mirrorPassExecuteResultMessage\(r\.status, r\.data\);/g)?.length,
    ).toBe(4);
  });
});
