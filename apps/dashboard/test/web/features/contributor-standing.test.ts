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
  standingPanelOffer,
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

  it('declares a ROLE-taking renderContributorStandingPanel and self-initializes once', () => {
    const out = contributorStandingJs();
    expect(out).toContain('function renderContributorStandingPanel(role, tier) {');
    expect(out).toContain("renderContributorStandingPanel('unknown', null);");
  });

  it('renders into #contributor-standing-panel, resolves the viewer once, and never polls', () => {
    // The panel USED to be a pure static render. It now asks who is
    // looking, exactly once — because rendering "Apply for Active partner
    // standing" to the repo's own maintainer was the bug that prompted
    // this (operator, 2026-09-09). Still no timer: a role does not change
    // while the page is open.
    const out = contributorStandingJs();
    expect(out).toContain("document.getElementById('contributor-standing-panel')");
    expect(out).toContain('socialIdentity()');
    expect(out).not.toContain('setInterval');
  });

  it('renders newcomer-safe FIRST, so a failed identity lookup still onboards a visitor', () => {
    const out = contributorStandingJs();
    // The synchronous first render passes 'unknown', which standingPanelOffer
    // maps to showApply — withholding the one onboarding affordance from a
    // real newcomer is the worse failure of the two.
    expect(out).toContain("renderContributorStandingPanel('unknown', null);");
    expect(out).toContain('.catch(function () {});');
  });

  it('splices standingPanelOffer so the role decision cannot drift from the panel module', () => {
    expect(contributorStandingJs()).toContain(standingPanelOffer.toString());
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
    expect(out).toContain("a.target = '_blank'");
    expect(out).toContain("a.rel = 'noopener noreferrer'");
    // The href now arrives as standingLink()'s argument.
    expect(out).toContain('CONTRIBUTOR_STANDING_APPLY_URL,');
    expect(out).toContain('a.href = href;');
  });

  it('appends its links into the panel before unhiding it', () => {
    const out = contributorStandingJs();
    // Both links are built by one shared standingLink() now — the two
    // anchor builders were byte-for-byte the same but for text/href/tip.
    const appendIndex = out.indexOf('section.appendChild(a);');
    const unhideIndex = out.indexOf('section.hidden = false;');

    expect(appendIndex).toBeGreaterThan(-1);
    expect(appendIndex).toBeLessThan(unhideIndex);
  });
});
