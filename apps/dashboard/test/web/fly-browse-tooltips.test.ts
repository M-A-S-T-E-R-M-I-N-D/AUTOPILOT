// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the browse-folder
 * modal's buttons carried no [data-tip] — the drive switcher, the cryptic
 * ".. (up)" entry, each subfolder entry, "Use this folder", and the
 * Cancel/Close actions all relied on their visible text alone, while every
 * other Fly-bar control (Pause/Stop/Cancel/Resume, the flight status span,
 * the total-progress bar) already explains itself on hover/focus.
 * i18n (board web-msnsndki-dz3vn1): the tip TEXT now lives in STRINGS —
 * `fly-tooltips-i18n.test.ts` locks the tr()-at-build-time wiring and its
 * {drive}/{name}/{path} templates; this file keeps the audit's real
 * promise, that each English tip still explains its button's consequence.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { flyJs } from '../../src/web/features/fly.js';

describe('the browse-folder modal buttons explain themselves on hover/focus', () => {
  const out = flyJs();

  it('tips the drive-switcher buttons with the drive they load', () => {
    expect(out).toContain(
      "driveBtn.setAttribute('data-tip', tr('browseDriveTip', { drive: data.drives[d] }));",
    );
    expect(STRINGS.en.browseDriveTip).toContain('Switch to drive {drive}');
  });

  it("tips and aria-labels the cryptic '.. (up)' button", () => {
    expect(out).toContain("up.setAttribute('aria-label', tr('browseUpParent'));");
    expect(out).toContain("up.setAttribute('data-tip', tr('browseUpTip'));");
    expect(STRINGS.en.browseUpTip).toContain('up one level');
  });

  it('tips each subfolder entry with what clicking it opens', () => {
    expect(out).toContain(
      "entryBtn.setAttribute('data-tip', tr('browseEntryTip', { name: entry.name }));",
    );
    expect(STRINGS.en.browseEntryTip).toContain('Open {name}');
  });

  it('tips "Use this folder" with the exact path it sets as the fly folder', () => {
    expect(out).toContain("use.setAttribute('data-tip', tr('browseUseTip', { path: data.path }));");
    expect(STRINGS.en.browseUseTip).toContain('Sets {path} as the fly folder');
  });

  it('tips Cancel and the error dialog Close as no-change exits', () => {
    expect(out).toContain("cancel.setAttribute('data-tip', tr('browseCloseTip'));");
    expect(out).toContain("close.setAttribute('data-tip', tr('browseCloseTip'));");
    expect(STRINGS.en.browseCloseTip).toContain('without changing the fly folder');
  });
});
