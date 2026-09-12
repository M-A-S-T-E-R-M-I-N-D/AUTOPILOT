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
  mirrorPassItems,
  mirrorPassCanExecute,
  mirrorPassExecuteResultMessage,
  mirrorPassCanExecuteDrift,
  mirrorPassDriftExecuteResultMessage,
  mirrorPassCanExecuteLandingNote,
} from '../../../src/web/mirror-pass-panel.js';
import { mirrorPassJs } from '../../../src/web/features/mirror-pass.js';

describe('mirrorPassJs', () => {
  it('embeds mirrorPassReconcileItems/mirrorPassLandingNoteItems/mirrorPassStaleClaimItems/mirrorPassDriftItems/mirrorPassItems/mirrorPassCanExecute/mirrorPassExecuteResultMessage/mirrorPassCanExecuteDrift/mirrorPassDriftExecuteResultMessage/mirrorPassCanExecuteLandingNote real compiled source via .toString()', () => {
    const out = mirrorPassJs();
    expect(out).toContain(mirrorPassReconcileItems.toString());
    expect(out).toContain(mirrorPassLandingNoteItems.toString());
    expect(out).toContain(mirrorPassStaleClaimItems.toString());
    expect(out).toContain(mirrorPassDriftItems.toString());
    expect(out).toContain(mirrorPassItems.toString());
    expect(out).toContain(mirrorPassCanExecute.toString());
    expect(out).toContain(mirrorPassExecuteResultMessage.toString());
    expect(out).toContain(mirrorPassCanExecuteDrift.toString());
    expect(out).toContain(mirrorPassDriftExecuteResultMessage.toString());
    expect(out).toContain(mirrorPassCanExecuteLandingNote.toString());
  });

  it('declares mirrorPassSection, renderMirrorPassBody, and loadMirrorPassBody', () => {
    const out = mirrorPassJs();
    expect(out).toContain('function mirrorPassSection(pid) {');
    expect(out).toContain(
      'function renderMirrorPassBody(body, items, canExecute, canExecuteDrift, canExecuteLandingNote, pid) {',
    );
    expect(out).toContain('function loadMirrorPassBody(body, pid) {');
  });

  it('fetches identity alongside the four previews via the shared socialIdentity() core helper', () => {
    const out = mirrorPassJs();
    expect(out).toContain('socialIdentity(),');
    expect(out).toContain('mirrorPassCanExecute(identity, reconcile)');
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
    expect(out).toContain("fetch('/api/mirror-pass/execute'");
    expect(out).toContain('body: JSON.stringify({ project: pid })');
  });

  it('reloads the panel on a clean run instead of leaving a stale result message', () => {
    const out = mirrorPassJs();
    expect(out).toContain('loadMirrorPassBody(body, pid);');
  });

  it('sweeps freshly built DOM after every async render (board web-msnsndki-dz3vn1)', () => {
    const out = mirrorPassJs();
    expect(out.match(/translateDom\(document\.documentElement\.lang \|\| 'en'\);/g)?.length).toBe(
      3,
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
    expect(out).toContain("fetch('/api/mirror-pass/drift/execute'");
    expect(out.match(/body: JSON\.stringify\(\{ project: pid \}\),/g)?.length).toBe(3);
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
    expect(out).toContain("fetch('/api/mirror-pass/landing-note/execute'");
    expect(
      out.match(/var result = mirrorPassExecuteResultMessage\(r\.status, r\.data\);/g)?.length,
    ).toBe(2);
  });
});
