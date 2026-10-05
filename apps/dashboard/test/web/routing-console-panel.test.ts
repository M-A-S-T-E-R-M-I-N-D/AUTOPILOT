// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  routingIssueListText,
  routingMilestoneProgressText,
  routingPriorityLabels,
  routingRouteConfirmMessage,
  routingRouteResultText,
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

describe('routingPriorityLabels', () => {
  it("offers the console's priority queues in its own order, and no status queue", () => {
    expect(
      routingPriorityLabels([
        { label: 'priority: critical', issues: [] },
        { label: 'priority: high', issues: [4] },
        { label: 'status: blocked', issues: [9] },
      ]),
    ).toEqual(['priority: critical', 'priority: high']);
  });

  it('offers nothing when the console sent no queues', () => {
    expect(routingPriorityLabels([])).toEqual([]);
  });
});

describe('routingRouteConfirmMessage', () => {
  it('names the issue, the label and the write on GitHub', () => {
    const message = routingRouteConfirmMessage(12, 'priority: high');
    expect(message).toContain('#12');
    expect(message).toContain('"priority: high"');
    expect(message).toContain('GitHub');
  });
});

describe('routingRouteResultText', () => {
  it('reads a route that went through', () => {
    expect(routingRouteResultText({ issue: 12, label: 'priority: high', routed: true })).toEqual({
      text: 'Routed #12 as priority: high.',
      failed: false,
    });
  });

  it.each([
    ['guest', "only the repository's maintainer routes issues"],
    ['identity-unresolved', "couldn't tell who gh is signed in as"],
    ['issue-unreadable', "couldn't read #12 on GitHub"],
    ['issue-closed', '#12 is closed'],
    ['already-prioritized', '#12 already carries a priority label'],
    ['not-a-priority-label', '"priority: high" is not a priority label'],
  ])('says why a %s refusal sent no label', (reason, words) => {
    const result = routingRouteResultText({
      issue: 12,
      label: 'priority: high',
      routed: false,
      refusedReason: reason,
    });
    expect(result.failed).toBe(true);
    expect(result.text).toBe('Not routed — ' + words + '.');
  });

  it("carries gh's own words when the label edit failed", () => {
    expect(
      routingRouteResultText({
        issue: 12,
        label: 'priority: high',
        routed: false,
        error: 'HTTP 403: Resource not accessible',
      }),
    ).toEqual({ text: 'Not routed — gh said: HTTP 403: Resource not accessible', failed: true });
  });

  it('reads a server error or an unknown answer as a failure, never as routed', () => {
    expect(routingRouteResultText({ error: 'a label is required' })).toEqual({
      text: 'Not routed — a label is required',
      failed: true,
    });
    expect(routingRouteResultText(null)).toEqual({
      text: "Not routed — the dashboard didn't answer.",
      failed: true,
    });
  });
});
