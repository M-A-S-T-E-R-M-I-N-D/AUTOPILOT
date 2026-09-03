// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the publicity panel's pure formatting math
 * (`web/publicity-panel.ts`) — the dashboard UI surface for `GET
 * /api/publicity` (epic 0007, "PLATFORM 7/7", slice 7's publicity
 * affordances).
 */

import { describe, it, expect } from 'vitest';
import { publicityAffordanceTip } from '../../src/web/publicity-panel.js';

describe('publicityAffordanceTip', () => {
  it('names the affordance and its live reasoning', () => {
    expect(
      publicityAffordanceTip({
        label: 'View repo',
        url: 'https://github.com/octocat/hello-world',
        dormant: false,
        reasoning: 'octocat/hello-world is public — publicity affordances are live',
      }),
    ).toBe('View repo — octocat/hello-world is public — publicity affordances are live');
  });

  it('names the affordance and its dormant reasoning', () => {
    expect(
      publicityAffordanceTip({
        label: 'Watch',
        url: 'https://github.com/octocat/hello-world',
        dormant: true,
        reasoning:
          'octocat/hello-world is private — publicity affordances stay dormant until it goes public',
      }),
    ).toBe(
      'Watch — octocat/hello-world is private — publicity affordances stay dormant until it goes public',
    );
  });
});
