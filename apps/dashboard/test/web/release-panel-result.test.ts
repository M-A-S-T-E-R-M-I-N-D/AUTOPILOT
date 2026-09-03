// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the RELEASE EXECUTE result-message math
 * (`web/release-panel.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2, forty-first cut. `release-panel.test.ts`'s
 * "RELEASE EXECUTE" suite already exercises every branch indirectly through
 * the real client bundle; these tests cover the same branches directly,
 * without DOM/fetch, isolating the message-formatting logic itself.
 */

import { describe, it, expect } from 'vitest';
import { releaseExecuteResult } from '../../src/web/release-panel.js';

describe('releaseExecuteResult', () => {
  it('renders a bare success message when there is nothing to note', () => {
    const result = releaseExecuteResult({ ok: true, details: 'released v1.3.0 (minor)' });

    expect(result.text).toBe('✓ Released — released v1.3.0 (minor)');
    expect(result.className).toBe('release-result release-result-ok');
  });

  it('falls back to "tagged." when a success response carries no details', () => {
    const result = releaseExecuteResult({ ok: true });

    expect(result.text).toBe('✓ Released — tagged.');
  });

  it('appends a non-fatal note when the attestation failed to attach', () => {
    const result = releaseExecuteResult({
      ok: true,
      details: 'released v1.3.0 (minor)',
      attestation: { ok: false, details: "a note already exists on 'HEAD'" },
    });

    expect(result.text).toBe(
      "✓ Released — released v1.3.0 (minor) (note: attestation not attached — a note already exists on 'HEAD')",
    );
    expect(result.className).toBe('release-result release-result-ok');
  });

  it('omits the attestation note when the attestation succeeded', () => {
    const result = releaseExecuteResult({
      ok: true,
      details: 'released v1.3.0 (minor)',
      attestation: { ok: true, details: 'attestation attached' },
    });

    expect(result.text).toBe('✓ Released — released v1.3.0 (minor)');
  });

  it('appends a milestone-tag note when the tag attached', () => {
    const result = releaseExecuteResult({
      ok: true,
      details: 'released v1.3.0 (minor)',
      milestoneTag: { ok: true, details: "created annotated tag 'm4' at HEAD" },
    });

    expect(result.text).toBe(
      "✓ Released — released v1.3.0 (minor) created annotated tag 'm4' at HEAD.",
    );
  });

  it('appends a non-fatal note when the milestone tag failed to attach', () => {
    const result = releaseExecuteResult({
      ok: true,
      details: 'released v1.3.0 (minor)',
      milestoneTag: { ok: false, details: 'tag already exists' },
    });

    expect(result.text).toBe(
      '✓ Released — released v1.3.0 (minor) (note: milestone tag not attached — tag already exists)',
    );
  });

  it('appends a note when the GitHub Release published successfully', () => {
    const result = releaseExecuteResult({
      ok: true,
      details: 'released v1.3.0 (minor)',
      ghRelease: { ok: true, details: 'https://github.com/x/x/releases/tag/v1.3.0' },
    });

    expect(result.text).toBe(
      '✓ Released — released v1.3.0 (minor) https://github.com/x/x/releases/tag/v1.3.0.',
    );
  });

  it('appends a non-fatal note when the GitHub Release failed to publish', () => {
    const result = releaseExecuteResult({
      ok: true,
      details: 'released v1.3.0 (minor)',
      ghRelease: {
        ok: false,
        details: 'no GitHub remote configured — sync this project to GitHub first',
      },
    });

    expect(result.text).toBe(
      '✓ Released — released v1.3.0 (minor) (note: GitHub Release not published — no GitHub remote configured — sync this project to GitHub first)',
    );
    expect(result.className).toBe('release-result release-result-ok');
  });

  it('renders a failure message from details', () => {
    const result = releaseExecuteResult({
      ok: false,
      details: 'no release-worthy commits since the last release',
    });

    expect(result.text).toBe('✗ no release-worthy commits since the last release');
    expect(result.className).toBe('release-result release-result-fail');
  });

  it('falls back to error, then a generic message, when a failure carries no details', () => {
    expect(releaseExecuteResult({ ok: false, error: 'boom' }).text).toBe('✗ boom');
    expect(releaseExecuteResult({ ok: false }).text).toBe('✗ release failed.');
  });

  it('treats a null/undefined response as a failure', () => {
    expect(releaseExecuteResult(null).text).toBe('✗ release failed.');
    expect(releaseExecuteResult(undefined).className).toBe('release-result release-result-fail');
  });
});
