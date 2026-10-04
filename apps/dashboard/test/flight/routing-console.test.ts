// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0019 slice 4 (board web-mtrh1hn3-8x9f0z): the routing console's model
 * — what the GitHub page says about milestones, the steering label queues
 * and claims, derived purely from `gh` reads so the dashboard can show it
 * beside the board.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ROUTING_QUEUE_LABELS,
  fetchOpenMilestones,
  parseMilestoneRows,
  planRoutingConsole,
  type RoutingIssue,
  type RoutingMilestone,
} from '../../src/flight/routing-console.js';
import { MAX_MILESTONE_PAGES, MILESTONE_PAGE_SIZE } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function milestone(overrides: Partial<RoutingMilestone> & { title: string }): RoutingMilestone {
  return { openIssues: 0, closedIssues: 0, dueOn: null, ...overrides };
}

function issue(number: number, labels: readonly string[] = [], assignees?: readonly string[]) {
  const row: RoutingIssue = { number, labels, ...(assignees ? { assignees } : {}) };
  return row;
}

describe('parseMilestoneRows', () => {
  it('reads the REST fields a milestone row carries', () => {
    const rows = parseMilestoneRows([
      {
        title: 'V1',
        open_issues: 3,
        closed_issues: 9,
        due_on: '2026-11-01T07:00:00Z',
        html_url: 'https://github.com/o/r/milestone/2',
      },
    ]);
    expect(rows).toEqual([
      {
        title: 'V1',
        openIssues: 3,
        closedIssues: 9,
        dueOn: '2026-11-01T07:00:00Z',
        url: 'https://github.com/o/r/milestone/2',
      },
    ]);
  });

  it('keeps an undated milestone with a null due date and no link when none is https', () => {
    const rows = parseMilestoneRows([
      {
        title: 'Hardening',
        open_issues: 0,
        closed_issues: 0,
        due_on: null,
        html_url: 'javascript:x',
      },
    ]);
    expect(rows).toEqual([{ title: 'Hardening', openIssues: 0, closedIssues: 0, dueOn: null }]);
  });

  it('drops rows it cannot read whole rather than guessing at counts', () => {
    const rows = parseMilestoneRows([
      null,
      'V1',
      { open_issues: 1, closed_issues: 1 },
      { title: 'neg', open_issues: -1, closed_issues: 0 },
      { title: 'frac', open_issues: 1.5, closed_issues: 0 },
      { title: 'str', open_issues: '2', closed_issues: 0 },
      { title: 'kept', open_issues: 2, closed_issues: 0 },
    ]);
    expect(rows.map((row) => row.title)).toEqual(['kept']);
  });

  it('reads a non-array payload as no milestones', () => {
    expect(parseMilestoneRows({ message: 'Not Found' })).toEqual([]);
  });
});

describe('planRoutingConsole — milestone progress', () => {
  it('orders milestones soonest-due first, undated last, ties by title', () => {
    const plan = planRoutingConsole(
      [
        milestone({ title: 'Undated B' }),
        milestone({ title: 'Later', dueOn: '2026-12-01T00:00:00Z' }),
        milestone({ title: 'Undated A' }),
        milestone({ title: 'Sooner', dueOn: '2026-10-15T00:00:00Z' }),
      ],
      [],
    );
    expect(plan.milestones.map((row) => row.title)).toEqual([
      'Sooner',
      'Later',
      'Undated A',
      'Undated B',
    ]);
  });

  it('reports percent done rounded down, so an open issue never reads as 100%', () => {
    const plan = planRoutingConsole(
      [
        milestone({ title: 'almost', openIssues: 1, closedIssues: 199 }),
        milestone({ title: 'third', openIssues: 2, closedIssues: 1 }),
        milestone({ title: 'done', openIssues: 0, closedIssues: 4 }),
      ],
      [],
    );
    const percent = Object.fromEntries(plan.milestones.map((row) => [row.title, row.percentDone]));
    expect(percent).toEqual({ almost: 99, third: 33, done: 100 });
  });

  it('gives an empty milestone no percent at all rather than 0% or 100%', () => {
    const plan = planRoutingConsole([milestone({ title: 'empty' })], []);
    expect(plan.milestones[0]?.percentDone).toBeNull();
  });
});

describe('planRoutingConsole — label queues', () => {
  it('lists every house priority and status label, priority first, in taxonomy order', () => {
    expect(ROUTING_QUEUE_LABELS).toEqual([
      'priority: critical',
      'priority: high',
      'priority: medium',
      'priority: low',
      'status: awaiting-human',
      'status: blocked',
      'status: needs-format',
    ]);
    const plan = planRoutingConsole([], []);
    expect(plan.labelQueues.map((queue) => queue.label)).toEqual(ROUTING_QUEUE_LABELS);
    expect(plan.labelQueues.every((queue) => queue.issues.length === 0)).toBe(true);
  });

  it('queues issues under a label in any casing or hyphenation, numbers ascending', () => {
    const plan = planRoutingConsole(
      [],
      [
        issue(12, ['Priority: High']),
        issue(3, ['priority: high', 'status: blocked']),
        issue(7, ['status: needs format']),
        issue(9, ['area: ci', 'bug']),
      ],
    );
    const queues = Object.fromEntries(plan.labelQueues.map((queue) => [queue.label, queue.issues]));
    expect(queues['priority: high']).toEqual([3, 12]);
    expect(queues['status: blocked']).toEqual([3]);
    expect(queues['status: needs-format']).toEqual([7]);
    expect(queues['priority: low']).toEqual([]);
  });

  it('names the open issues no priority label has routed yet', () => {
    const plan = planRoutingConsole(
      [],
      [issue(5, ['priority: low']), issue(8, ['status: blocked']), issue(2), issue(4, ['bug'])],
    );
    expect(plan.unprioritized).toEqual([2, 4, 8]);
  });
});

describe('planRoutingConsole — claims', () => {
  it('groups claimed issues by assignee, busiest first, then by login', () => {
    const plan = planRoutingConsole(
      [],
      [
        issue(4, [], ['zed']),
        issue(1, [], ['amy', 'zed']),
        issue(9, [], ['bob']),
        issue(2, [], ['amy']),
      ],
    );
    expect(plan.claims).toEqual([
      { login: 'amy', issues: [1, 2] },
      { login: 'zed', issues: [1, 4] },
      { login: 'bob', issues: [9] },
    ]);
  });

  it('counts an issue with no assignee — or no assignee field — as unclaimed', () => {
    const plan = planRoutingConsole([], [issue(6, [], []), issue(3), issue(1, [], ['amy'])]);
    expect(plan.unclaimed).toEqual([3, 6]);
  });

  it('lists an assignee named twice on one issue only once', () => {
    const plan = planRoutingConsole([], [issue(1, [], ['amy', 'amy'])]);
    expect(plan.claims).toEqual([{ login: 'amy', issues: [1] }]);
  });
});

describe('fetchOpenMilestones', () => {
  function rowsOf(count: number, prefix: string): unknown[] {
    return Array.from({ length: count }, (_, index) => ({
      title: `${prefix}${index}`,
      open_issues: 1,
      closed_issues: 1,
      due_on: null,
    }));
  }

  it('asks for open milestones only and stops at the first short page', async () => {
    const calls: string[] = [];
    const exec: CliExec = vi.fn(async (_bin: string, args: readonly string[]) => {
      calls.push(args.join(' '));
      const page = calls.length;
      const rows = page === 1 ? rowsOf(MILESTONE_PAGE_SIZE, 'a') : rowsOf(2, 'b');
      return { code: 0, stdout: JSON.stringify(rows) };
    });
    const result = await fetchOpenMilestones(exec);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.includes('milestones?state=open&'))).toBe(true);
    expect(calls[1]).toContain('page=2');
    expect(result).toHaveLength(MILESTONE_PAGE_SIZE + 2);
  });

  it('never walks past the page ceiling', async () => {
    const exec: CliExec = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify(rowsOf(MILESTONE_PAGE_SIZE, 'm')),
    }));
    await fetchOpenMilestones(exec);
    expect(exec).toHaveBeenCalledTimes(MAX_MILESTONE_PAGES);
  });

  it('reads a failed page as unknown, never as a repo with no milestones', async () => {
    let call = 0;
    const exec: CliExec = vi.fn(async () => {
      call += 1;
      return call === 1
        ? { code: 0, stdout: JSON.stringify(rowsOf(MILESTONE_PAGE_SIZE, 'm')) }
        : { code: 1, stdout: '' };
    });
    expect(await fetchOpenMilestones(exec)).toBeUndefined();
  });

  it('reads unparseable output as unknown too', async () => {
    const exec: CliExec = vi.fn(async () => ({ code: 0, stdout: 'not json' }));
    expect(await fetchOpenMilestones(exec)).toBeUndefined();
  });
});
