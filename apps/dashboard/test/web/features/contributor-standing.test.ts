// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Contributor standing explainer panel client
 * (`web/features/contributor-standing.ts`) — a self-init region under
 * `web/features/` (epic 0002 "shell decomposition", the same shape
 * `web/features/publicity.ts`/`web/features/tour.ts` already establish).
 */

import { describe, it, expect } from 'vitest';
import {
  CONTRIBUTOR_STANDING_APPLY_URL,
  CONTRIBUTOR_STANDING_TIERS,
  contributorStandingTierSummary,
} from '../../../src/web/contributor-standing-panel.js';
import { contributorStandingJs } from '../../../src/web/features/contributor-standing.js';

describe('contributorStandingJs', () => {
  it('embeds CONTRIBUTOR_STANDING_TIERS real value via JSON.stringify()', () => {
    expect(contributorStandingJs()).toContain(JSON.stringify(CONTRIBUTOR_STANDING_TIERS));
  });

  it('embeds contributorStandingTierSummary real compiled source via .toString()', () => {
    expect(contributorStandingJs()).toContain(contributorStandingTierSummary.toString());
  });

  it('declares renderContributorStandingPanel and self-initializes once', () => {
    const out = contributorStandingJs();
    expect(out).toContain('function renderContributorStandingPanel() {');
    expect(out).toContain('renderContributorStandingPanel();');
  });

  it('renders into #contributor-standing-panel with no fetch and no poll timer', () => {
    const out = contributorStandingJs();
    expect(out).toContain("document.getElementById('contributor-standing-panel')");
    expect(out).not.toContain('fetch(');
    expect(out).not.toContain('setInterval');
  });

  it('unhides the panel and sweeps i18n after rendering', () => {
    const out = contributorStandingJs();
    expect(out).toContain('section.hidden = false;');
    expect(out).toContain("translateDom(document.documentElement.lang || 'en');");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = contributorStandingJs();
    expect(out).toBe(out.trim());
  });
});

describe('contributorStandingJs — apply deep-link', () => {
  it('embeds the real CONTRIBUTOR_STANDING_APPLY_URL value via JSON.stringify()', () => {
    const out = contributorStandingJs();
    expect(out).toContain(JSON.stringify(CONTRIBUTOR_STANDING_APPLY_URL));
  });

  it('builds a real external anchor, not an internal chip', () => {
    const out = contributorStandingJs();
    expect(out).toContain("document.createElement('a')");
    expect(out).toContain("apply.target = '_blank'");
    expect(out).toContain("apply.rel = 'noopener noreferrer'");
    expect(out).toContain('apply.href = CONTRIBUTOR_STANDING_APPLY_URL');
  });

  it('appends the apply link into the panel before unhiding it', () => {
    const out = contributorStandingJs();
    const appendIndex = out.indexOf('section.appendChild(apply);');
    const unhideIndex = out.indexOf('section.hidden = false;');

    expect(appendIndex).toBeGreaterThan(-1);
    expect(appendIndex).toBeLessThan(unhideIndex);
  });
});
