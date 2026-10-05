// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The ROUTING CONSOLE panel (epic 0019 S4, board web-mtrh1hn3-8x9f0z), run
 * for real: the shell boots, `GET /api/routing-console` answers, and the
 * panel shows milestone progress, the label queues and the claims — or says
 * it could not read the milestones, never "no milestones". axe-clean.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { renderShell, clientJs } from '../../../src/web/shell.js';
import { routingConsoleJs } from '../../../src/web/features/routing-console.js';
import {
  routingIssueListText,
  routingMilestoneProgressText,
} from '../../../src/web/routing-console-panel.js';

const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

const FLEET_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
  wisdomProposed: null,
};

const SNAPSHOT = {
  milestones: [
    {
      title: 'v0.59',
      openIssues: 3,
      closedIssues: 7,
      dueOn: '2026-10-15T07:00:00Z',
      url: 'https://github.com/o/r/milestone/3',
      percentDone: 70,
    },
    {
      title: 'Someday',
      openIssues: 0,
      closedIssues: 0,
      dueOn: null,
      url: null,
      percentDone: null,
    },
  ],
  labelQueues: [
    { label: 'priority: critical', issues: [] },
    { label: 'priority: high', issues: [4, 9] },
  ],
  unprioritized: [12],
  claims: [{ login: 'amy', issues: [4, 9] }],
  unclaimed: [12],
};

type Answer = { ok: boolean; body?: unknown };

/** Every routing-console URL the panel asked for since the last boot. */
const consoleRequests: string[] = [];

function boot(answer: () => Answer, project?: string): void {
  document.open();
  document.write(renderShell(project));
  document.close();
  consoleRequests.length = 0;
  globalThis.fetch = vi.fn(async (url: string) => {
    const isConsole = url.startsWith('/api/routing-console');
    if (isConsole) consoleRequests.push(url);
    const reply = isConsole ? answer() : { ok: true, body: FLEET_STATE };
    return { ok: reply.ok, json: async () => reply.body } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

const REPO_MISMATCH = {
  skippedReason: 'repo-mismatch',
  projectRepo: 'someone-else/their-project',
  ghRepo: 'octocat/hello-world',
};

function panel(): HTMLElement {
  return document.getElementById('routing-console-panel') as HTMLElement;
}

function rowTexts(): string[] {
  return [...panel().querySelectorAll('.routing-console-row')].map((row) =>
    [...row.querySelectorAll('span')].map((span) => span.textContent).join(' | '),
  );
}

describe('ROUTING CONSOLE panel (epic 0019 S4)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('embeds the pure formatters as their real compiled source', () => {
    const out = routingConsoleJs();
    expect(out).toContain(routingMilestoneProgressText.toString());
    expect(out).toContain(routingIssueListText.toString());
  });

  it('shows milestone progress, every label queue and every claim', async () => {
    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);

    expect(panel().hidden).toBe(false);
    expect(panel().querySelector('.routing-console-title')?.textContent).toBe('Routing console');
    expect(rowTexts()).toEqual([
      'v0.59 | 7 of 10 closed (70%) · due 2026-10-15',
      'Someday | No issues yet',
      'priority: critical | None',
      'priority: high | #4, #9',
      'No priority yet | #12',
      '@amy | #4, #9',
      'Unclaimed | #12',
    ]);
    const bar = panel().querySelector('progress') as HTMLProgressElement;
    expect(bar.value).toBe(70);
    expect(bar.max).toBe(100);
    expect(bar.getAttribute('aria-label')).toBe('v0.59');
    // An empty milestone draws no bar: it is neither done nor not started.
    expect(panel().querySelectorAll('progress')).toHaveLength(1);
  });

  it('links each milestone title to its GitHub page, safely targeted, and leaves a linkless one as text', async () => {
    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);

    const links = [...panel().querySelectorAll<HTMLAnchorElement>('.routing-console-name a')];
    expect(links.map((link) => link.textContent)).toEqual(['v0.59']);
    const [link] = links;
    expect(link?.getAttribute('href')).toBe('https://github.com/o/r/milestone/3');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
    const names = [...panel().querySelectorAll('.routing-console-name')];
    expect(names.map((name) => name.textContent)).toContain('Someday');
  });

  it('says it could not read the milestones, never that there are none', async () => {
    boot(() => ({ ok: true, body: { ...SNAPSHOT, milestones: null } }));
    await vi.advanceTimersByTimeAsync(1);

    const text = panel().textContent ?? '';
    expect(text).toContain("Couldn't read the open milestones");
    expect(text).not.toContain('No open milestones.');
    expect(rowTexts()).toContain('priority: high | #4, #9');
  });

  it('says so when the page has no open milestones', async () => {
    boot(() => ({ ok: true, body: { ...SNAPSHOT, milestones: [] } }));
    await vi.advanceTimersByTimeAsync(1);

    expect(panel().textContent).toContain('No open milestones.');
  });

  it('stays hidden until a read succeeds, then keeps the last render through a failed poll', async () => {
    let answer: Answer = { ok: false };
    boot(() => answer);
    await vi.advanceTimersByTimeAsync(1);
    expect(panel().hidden).toBe(true);

    answer = { ok: true, body: SNAPSHOT };
    await vi.advanceTimersByTimeAsync(60000);
    expect(panel().hidden).toBe(false);

    answer = { ok: false };
    await vi.advanceTimersByTimeAsync(60000);
    expect(panel().hidden).toBe(false);
    expect(rowTexts()).toContain('@amy | #4, #9');
  });

  it('is axe-clean', async () => {
    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);
    // axe schedules its own work on timers, which fake timers never fire.
    vi.useRealTimers();

    const results = await axe.run(panel(), AXE_OPTIONS);
    expect(results.violations).toEqual([]);
  });

  it("names a project page's own id on its read, and none on the home page", async () => {
    boot(() => ({ ok: true, body: SNAPSHOT }), 'p 1');
    await vi.advanceTimersByTimeAsync(1);
    expect(consoleRequests).toEqual(['/api/routing-console?project=p%201']);

    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);
    expect(consoleRequests).toEqual(['/api/routing-console']);
  });

  it("says a project page is a checkout of another repository, never that page's queues as its own", async () => {
    boot(() => ({ ok: true, body: REPO_MISMATCH }), 'p1');
    await vi.advanceTimersByTimeAsync(1);

    expect(panel().hidden).toBe(false);
    expect(panel().querySelector('.routing-console-title')?.textContent).toBe('Routing console');
    const line = panel().querySelector('.routing-console-repo-mismatch');
    expect(line?.textContent).toBe(
      'Not read — this project is a checkout of someone-else/their-project, but gh is acting on octocat/hello-world.',
    );
    expect(line?.getAttribute('data-i18n-template')).toBe('routingConsoleRepoMismatch');
    expect(JSON.parse(line?.getAttribute('data-i18n-args') ?? '{}')).toEqual({
      projectRepo: 'someone-else/their-project',
      ghRepo: 'octocat/hello-world',
    });
    expect(rowTexts()).toEqual([]);
    expect(panel().textContent).not.toContain('Unclaimed');
  });

  it('is axe-clean saying the repository mismatch', async () => {
    boot(() => ({ ok: true, body: REPO_MISMATCH }), 'p1');
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();

    const results = await axe.run(panel(), AXE_OPTIONS);
    expect(results.violations).toEqual([]);
  });
});
