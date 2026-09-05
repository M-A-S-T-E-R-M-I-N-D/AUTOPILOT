// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the RELEASE EXECUTE button's `window.confirm()`
 * message math (`web/release-panel.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2, eighty-second cut. `release-panel.test.ts`'s
 * "Cut release" suite only ever asserts `window.confirm` was called, never
 * with what message — a genuine coverage gap on both the base warning and
 * the milestone-tag clause.
 *
 * The English expectations below are byte-identical to the literals this
 * message was built from before it read STRINGS, so they double as the
 * proof that routing it through `tr()` changed no English output.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { releaseConfirmMessage, type ReleasePanelTranslator } from '../../src/web/release-panel.js';

/** A translator over one real STRINGS table, substituting `{…}` slots the
 *  way the bundle's `tr()` (`web/features/locale.ts`) does — the same helper
 *  shape `pr-review-panel.test.ts` uses for the sibling confirm dialog. */
function translatorFor(locale: 'en' | 'he'): ReleasePanelTranslator {
  return (key, subs) => {
    const text: string = STRINGS[locale][key];
    if (!subs) return text;
    return Object.keys(subs).reduce((t, k) => t.split('{' + k + '}').join(String(subs[k])), text);
  };
}
const trEn = translatorFor('en');
const trHe = translatorFor('he');

describe('releaseConfirmMessage', () => {
  it('warns this cannot be undone when no milestone tag was typed', () => {
    expect(releaseConfirmMessage('', false, trEn)).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. This cannot be undone by this dashboard.',
    );
  });

  it('names the milestone tag it will also attach, between the base warning and the undo notice', () => {
    expect(releaseConfirmMessage('v2-beta', false, trEn)).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. Also tags "v2-beta" at the same commit. This cannot be undone by this dashboard.',
    );
  });

  it('names the GitHub Release publish leg when ghRelease is requested', () => {
    expect(releaseConfirmMessage('', true, trEn)).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. Also pushes the new tag and publishes it as a GitHub Release. This cannot be undone by this dashboard.',
    );
  });

  it('names both the milestone tag and the GitHub Release leg when both are requested', () => {
    expect(releaseConfirmMessage('m4', true, trEn)).toBe(
      'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation. Also tags "m4" at the same commit. Also pushes the new tag and publishes it as a GitHub Release. This cannot be undone by this dashboard.',
    );
  });

  it('composes the same four parts in Hebrew, with no English left in the dialog', () => {
    const message = releaseConfirmMessage('m4', true, trHe);

    expect(message).toBe(
      STRINGS.he.releaseConfirmBase +
        STRINGS.he.releaseConfirmMilestoneClause.replace('{milestoneTag}', 'm4') +
        STRINGS.he.releaseConfirmGhReleaseClause +
        STRINGS.he.releaseConfirmSuffix,
    );
    // The operator-typed tag and the proper nouns stay verbatim; nothing else
    // should survive from the English table.
    expect(message).not.toContain('Cut this release?');
    expect(message).not.toContain('cannot be undone');
    expect(message).toContain('m4');
  });

  it('substitutes the milestone tag rather than emitting the raw placeholder', () => {
    // Regression guard for the whole {placeholder} family: a translator that
    // forgets substitution still returns a plausible-looking sentence.
    for (const tr of [trEn, trHe]) {
      expect(releaseConfirmMessage('v9', false, tr)).not.toContain('{milestoneTag}');
    }
  });
});
