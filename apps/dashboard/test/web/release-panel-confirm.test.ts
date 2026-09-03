// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the RELEASE EXECUTE button's `window.confirm()`
 * message math (`web/release-panel.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2, eighty-second cut. `release-panel.test.ts`'s
 * "Cut release" suite only ever asserts `window.confirm` was called, never
 * with what message — a genuine coverage gap on both the base warning and
 * the milestone-tag clause.
 */

import { describe, it, expect } from 'vitest';
import { releaseConfirmMessage } from '../../src/web/release-panel.js';

describe('releaseConfirmMessage', () => {
  it('warns this cannot be undone when no milestone tag was typed', () => {
    expect(releaseConfirmMessage('')).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. This cannot be undone by this dashboard.',
    );
  });

  it('names the milestone tag it will also attach, between the base warning and the undo notice', () => {
    expect(releaseConfirmMessage('v2-beta')).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. Also tags "v2-beta" at the same commit. This cannot be undone by this dashboard.',
    );
  });

  it('names the GitHub Release publish leg when ghRelease is requested', () => {
    expect(releaseConfirmMessage('', true)).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. Also pushes the new tag and publishes it as a GitHub Release. This cannot be undone by this dashboard.',
    );
  });

  it('names both the milestone tag and the GitHub Release leg when both are requested', () => {
    expect(releaseConfirmMessage('m4', true)).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. Also tags "m4" at the same commit. Also pushes the new tag and publishes it as a GitHub Release. This cannot be undone by this dashboard.',
    );
  });

  it('defaults ghRelease to false when omitted, matching every pre-existing caller', () => {
    expect(releaseConfirmMessage('m4')).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. Also tags "m4" at the same commit. This cannot be undone by this dashboard.',
    );
  });
});
