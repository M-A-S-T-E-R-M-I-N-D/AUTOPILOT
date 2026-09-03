// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure decision-item head text math
 * (`web/decision-item.ts`) shared by the KEEPER issue-triage and PR-review
 * panels — extracted under epic 0002 "shell decomposition", slice 2,
 * eighty-fourth cut. `keeper-panel-number-tooltips.test.ts` already
 * regression-tests this indirectly through the rendered DOM in
 * `clientJs()`, but only ever asserts `data-tip`/`aria-label` CONTAIN a
 * substring of the number/title — never the exact text, and never the
 * decision badge's own tip/aria-label/class. These tests exercise the real
 * function directly.
 */

import { describe, it, expect } from 'vitest';
import { decisionItemHeadMeta } from '../../src/web/decision-item.js';

describe('decisionItemHeadMeta', () => {
  it('builds the issue-triage flavor exactly as renderIssueTriageBody used to hand-retype it', () => {
    const meta = decisionItemHeadMeta(
      'GitHub issue',
      'issue',
      'issue-triage',
      { number: 42, title: 'Widget renders blank on load' },
      'accept',
      '✓ accept',
      'No matching open task.',
    );
    expect(meta).toEqual({
      numberTip: 'GitHub issue #42: Widget renders blank on load',
      numberAriaLabel: 'issue #42: Widget renders blank on load',
      badgeText: '✓ accept',
      badgeTip: 'No matching open task.',
      badgeAriaLabel: 'decision: ✓ accept — No matching open task.',
      badgeClass: 'issue-triage-badge issue-triage-badge-accept',
    });
  });

  it('builds the pr-review flavor exactly as renderPrReviewPanel used to hand-retype it', () => {
    const meta = decisionItemHeadMeta(
      'GitHub PR',
      'pull request',
      'pr-review',
      { number: 7, title: 'Fix widget blank render' },
      'merge',
      '✓ merge',
      'Gate green, fixes #42.',
    );
    expect(meta).toEqual({
      numberTip: 'GitHub PR #7: Fix widget blank render',
      numberAriaLabel: 'pull request #7: Fix widget blank render',
      badgeText: '✓ merge',
      badgeTip: 'Gate green, fixes #42.',
      badgeAriaLabel: 'decision: ✓ merge — Gate green, fixes #42.',
      badgeClass: 'pr-review-badge pr-review-badge-merge',
    });
  });

  it('keeps the badge tip as the raw reasoning string, unmodified', () => {
    const meta = decisionItemHeadMeta(
      'GitHub PR',
      'pull request',
      'pr-review',
      { number: 1, title: 'x' },
      'request-changes',
      '✗ request changes',
      'Lint failing on CI.',
    );
    expect(meta.badgeTip).toBe('Lint failing on CI.');
  });
});
