// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { contributorIssueTierBadge } from '../../src/web/contributor-issue-list-panel.js';

describe('contributorIssueTierBadge', () => {
  it('badges a good-first-issue tier', () => {
    expect(contributorIssueTierBadge('good first issue')).toBe('🌱 good first issue');
  });

  it('badges a help-wanted tier', () => {
    expect(contributorIssueTierBadge('help wanted')).toBe('🙋 help wanted');
  });

  it('echoes back an unrecognized tier verbatim rather than throwing', () => {
    expect(contributorIssueTierBadge('bug')).toBe('bug');
  });
});
