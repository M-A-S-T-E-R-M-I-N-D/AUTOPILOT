// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's post-flight LANDING panel (board web-msnsndki-dz3vn1):
 * `landing.ts`'s `landingJs()` builds this panel via `el()` DOM calls, fetched
 * once per open and never re-rendered on a poll tick — the same "tr() at
 * build time is the sweep" shape `connect-i18n.test.ts` documents, not a
 * `data-i18n` markup sweep. Only the panel's persistent on-screen text moves
 * this slice (title, status lines, debrief labels, the Execute button); the
 * per-commit `data-tip`/`aria-label` hover text stays English by the same
 * stance every prior slice took for per-project hover text.
 * `client-tr-keys.test.ts` resolves every key asserted here against STRINGS.
 */

import { describe, it, expect } from 'vitest';
import { landingJs } from '../../src/web/features/landing.js';

describe('the LANDING panel reads its persistent on-screen text from STRINGS', () => {
  const out = landingJs();

  it('translates the panel title and status lines', () => {
    expect(out).toContain("el('h3', 'landing-title', tr('landingTitle'))");
    expect(out).toContain("el('p', 'muted', tr('landingChecking'))");
    expect(out).toContain("el('p', 'muted', tr('landingUnavailable'))");
    expect(out).toContain("el('p', 'muted', tr('landingNothingToLand'))");
    expect(out).toContain("'muted landing-restarting', tr('landingRestarting')");
    expect(out).not.toContain("'🛬 Landing'");
    expect(out).not.toContain("'Checking for unmerged work…'");
  });

  it('translates the Execute button, keeping the live base branch name as a substitution', () => {
    expect(out).toContain(
      "execBtn.textContent = tr('landingExecuteButton', { base: landing.base });",
    );
    expect(out).not.toContain("'🛬 Execute landing → '");
  });

  it('translates the flight debrief title and best/worst labels', () => {
    expect(out).toContain("el('h4', 'flight-debrief-title', tr('landingDebriefTitle'))");
    expect(out).toContain("el('span', 'flight-debrief-label', tr('landingDebriefBestLabel'))");
    expect(out).toContain("el('span', 'flight-debrief-label', tr('landingDebriefWorstLabel'))");
    expect(out).not.toContain("'📋 Flight debrief'");
    expect(out).not.toContain("'🏆 Best: '");
    expect(out).not.toContain("'💀 Worst: '");
  });
});
