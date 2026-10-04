// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  routingIssueListText,
  routingMilestoneProgressText,
} from '../../src/web/routing-console-panel.js';

describe('routingMilestoneProgressText', () => {
  it('reads closed of total with the percent, then the due day', () => {
    expect(
      routingMilestoneProgressText({
        openIssues: 3,
        closedIssues: 7,
        dueOn: '2026-10-15T07:00:00Z',
        percentDone: 70,
      }),
    ).toBe('7 of 10 closed (70%) · due 2026-10-15');
  });

  it('says a milestone with no issues has none, never 0%', () => {
    expect(
      routingMilestoneProgressText({
        openIssues: 0,
        closedIssues: 0,
        dueOn: null,
        percentDone: null,
      }),
    ).toBe('No issues yet');
  });

  it('leaves the due part off an undated milestone', () => {
    expect(
      routingMilestoneProgressText({ openIssues: 1, closedIssues: 0, dueOn: null, percentDone: 0 }),
    ).toBe('0 of 1 closed (0%)');
  });
});

describe('routingIssueListText', () => {
  it('lists the issue numbers in the order given', () => {
    expect(routingIssueListText([3, 7, 12])).toBe('#3, #7, #12');
  });

  it('reads an empty queue as None rather than a blank', () => {
    expect(routingIssueListText([])).toBe('None');
  });

  it('shows the first twelve and counts the rest', () => {
    const issues = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(routingIssueListText(issues)).toBe(
      '#1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12 +3 more',
    );
  });

  it('shows exactly twelve with no remainder', () => {
    const issues = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(routingIssueListText(issues)).not.toContain('more');
  });
});
