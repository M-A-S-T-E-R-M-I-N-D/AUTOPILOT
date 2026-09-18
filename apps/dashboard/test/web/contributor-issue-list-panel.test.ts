// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  contributorIssueTierBadge,
  contributorIssueTierIcon,
  CLAIM_WALKTHROUGH_STEPS,
} from '../../src/web/contributor-issue-list-panel.js';

describe('contributorIssueTierBadge', () => {
  it('badges a good-first-issue tier', () => {
    expect(contributorIssueTierBadge('good first issue')).toBe('good first issue');
  });

  it('badges a help-wanted tier', () => {
    expect(contributorIssueTierBadge('help wanted')).toBe('help wanted');
  });

  it('echoes back an unrecognized tier verbatim rather than throwing', () => {
    expect(contributorIssueTierBadge('bug')).toBe('bug');
  });
});

describe('contributorIssueTierIcon', () => {
  it('gives a good-first-issue tier the sprout icon', () => {
    expect(contributorIssueTierIcon('good first issue')).toBe('sprout');
  });

  it('gives a help-wanted tier the handshake icon', () => {
    expect(contributorIssueTierIcon('help wanted')).toBe('handshake');
  });

  it('gives an unrecognized tier no icon rather than throwing', () => {
    expect(contributorIssueTierIcon('bug')).toBe('');
  });
});

describe('CLAIM_WALKTHROUGH_STEPS', () => {
  it('opens with forking, per CONTRIBUTING.md fork-first etiquette — outside contributors cannot push directly', () => {
    expect(CLAIM_WALKTHROUGH_STEPS[0]?.toLowerCase()).toContain('fork');
  });

  it('names the real /claim comment, not a paraphrase of it', () => {
    const claimStep = CLAIM_WALKTHROUGH_STEPS.find((step) => step.startsWith('Claim it'));
    expect(claimStep).toContain('/claim');
  });

  it('orders fork before claim before build before ship — each step is a prerequisite for the next', () => {
    const openers = CLAIM_WALKTHROUGH_STEPS.map((step) => step.split(' — ')[0]);
    expect(openers).toEqual(['Fork it', 'Claim it', 'Build it', 'Ship it']);
  });

  it('every step is non-empty', () => {
    for (const step of CLAIM_WALKTHROUGH_STEPS) {
      expect(step.length).toBeGreaterThan(0);
    }
  });
});
