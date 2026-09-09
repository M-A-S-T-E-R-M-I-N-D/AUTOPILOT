// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Contributor standing explainer panel's pure
 * data and formatting math (`web/contributor-standing-panel.ts`) — one slice
 * of the CONTRIBUTOR JOURNEY board task (web-mtt3hery-l8v0lf).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { UPSTREAM_REPO } from '../../src/info.js';
import {
  CONTRIBUTOR_STANDING_APPLY_URL,
  CONTRIBUTOR_STANDING_TIERS,
  contributorStandingTierSummary,
  partnerApplicationUrl,
} from '../../src/web/contributor-standing-panel.js';

// import.meta.url is an http: URL under jsdom, so resolve from cwd (same fix
// handler-status-lines-i18n.test.ts already uses for a repo-root file read).
const STANDING_DOC = readFileSync(join(process.cwd(), '.github/CONTRIBUTOR-STANDING.md'), 'utf8');

describe('CONTRIBUTOR_STANDING_TIERS', () => {
  it('carries all four tiers named in .github/CONTRIBUTOR-STANDING.md, in order', () => {
    expect(CONTRIBUTOR_STANDING_TIERS.map((t) => t.tier)).toEqual([
      'Newcomer',
      'Contributor',
      'Active partner',
      'Maintainer-delegate',
    ]);
  });

  it('stays in sync with the doctrine file it is ported from', () => {
    for (const tier of CONTRIBUTOR_STANDING_TIERS) {
      expect(STANDING_DOC).toContain(tier.tier);
    }
  });
});

describe('contributorStandingTierSummary', () => {
  it('names who the tier is for, what it unlocks, and how it is earned', () => {
    expect(
      contributorStandingTierSummary({
        tier: 'Newcomer',
        who: 'anyone',
        unlocks: '/claim on good first issue + help wanted',
        earnedBy: 'showing up',
      }),
    ).toBe('anyone — unlocks /claim on good first issue + help wanted — earned by showing up');
  });

  it('renders every real tier without throwing', () => {
    for (const tier of CONTRIBUTOR_STANDING_TIERS) {
      expect(contributorStandingTierSummary(tier)).toContain(tier.who);
    }
  });
});

describe('partnerApplicationUrl', () => {
  it("points at the given repo's issues/new with the partner-application template preselected", () => {
    expect(partnerApplicationUrl('some-owner/some-repo')).toBe(
      'https://github.com/some-owner/some-repo/issues/new?template=partner-application.yml',
    );
  });

  it('names a template file that actually exists under .github/ISSUE_TEMPLATE/', () => {
    const url = partnerApplicationUrl('some-owner/some-repo');
    const templateFile = new URL(url).searchParams.get('template');

    expect(existsSync(join(process.cwd(), '.github/ISSUE_TEMPLATE', templateFile ?? ''))).toBe(
      true,
    );
  });
});

describe('CONTRIBUTOR_STANDING_APPLY_URL', () => {
  it("is the real deep-link for THIS repo's UPSTREAM_REPO", () => {
    expect(CONTRIBUTOR_STANDING_APPLY_URL).toBe(partnerApplicationUrl(UPSTREAM_REPO));
  });
});
