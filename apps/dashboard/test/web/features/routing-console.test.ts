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
  routingPriorityLabels,
  routingRouteConfirmMessage,
  routingRouteResultText,
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

/** Every routing-console read URL the panel asked for since the last boot. */
const consoleRequests: string[] = [];

/** Every route the panel POSTed since the last boot: its headers and body. */
const routeRequests: { headers: Record<string, string>; body: unknown }[] = [];

const ROUTED: Answer = { ok: true, body: { issue: 12, label: 'priority: high', routed: true } };

function boot(
  answer: () => Answer,
  project?: string,
  routeAnswer: () => Answer = () => ROUTED,
): void {
  document.open();
  document.write(renderShell(project));
  document.close();
  consoleRequests.length = 0;
  routeRequests.length = 0;
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    let reply: Answer;
    if (url === '/api/routing-console/route') {
      routeRequests.push({
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: JSON.parse(String(init?.body)),
      });
      reply = routeAnswer();
    } else if (url.startsWith('/api/routing-console')) {
      consoleRequests.push(url);
      reply = answer();
    } else {
      reply = { ok: true, body: FLEET_STATE };
    }
    return { ok: reply.ok, json: async () => reply.body } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

function picker(issue: number): HTMLSelectElement {
  return panel().querySelector(`[data-routing-console-pick="${issue}"]`) as HTMLSelectElement;
}

function routeButton(issue: number): HTMLButtonElement {
  return panel().querySelector(`[data-routing-console-route="${issue}"]`) as HTMLButtonElement;
}

function routeNote(): HTMLElement {
  return panel().querySelector('.routing-console-route-result') as HTMLElement;
}

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

  it('embeds the route formatters as their real compiled source', () => {
    const out = routingConsoleJs();
    expect(out).toContain(routingPriorityLabels.toString());
    expect(out).toContain(routingRouteConfirmMessage.toString());
    expect(out).toContain(routingRouteResultText.toString());
  });

  it('offers a priority picker and a Route button on each issue with no priority yet', async () => {
    boot(() => ({ ok: true, body: { ...SNAPSHOT, unprioritized: [12, 15] } }));
    await vi.advanceTimersByTimeAsync(1);

    const select = picker(12);
    expect(select.getAttribute('aria-label')).toBe('Priority for #12');
    // A placeholder first, so no priority is ever picked by default; then
    // the priority queues alone, never a status label.
    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual([
      ['', 'Choose a priority'],
      ['priority: critical', 'priority: critical'],
      ['priority: high', 'priority: high'],
    ]);
    expect(select.value).toBe('');
    expect(routeButton(12).textContent).toBe('Route');
    expect(routeButton(12).getAttribute('aria-label')).toBe('Route #12');
    expect(picker(15)).not.toBeNull();
    expect(routeNote().getAttribute('role')).toBe('status');
  });

  it('offers no picker when every open issue has a priority', async () => {
    boot(() => ({ ok: true, body: { ...SNAPSHOT, unprioritized: [] } }));
    await vi.advanceTimersByTimeAsync(1);

    expect(panel().querySelector('[data-routing-console-pick]')).toBeNull();
    expect(panel().querySelector('[data-routing-console-route]')).toBeNull();
  });

  it('asks for a priority before it routes, and sends nothing without one', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);

    routeButton(12).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(confirm).not.toHaveBeenCalled();
    expect(routeRequests).toEqual([]);
    expect(routeNote().textContent).toBe('Choose a priority for #12 first.');
    expect(document.activeElement).toBe(picker(12));
  });

  it('sends nothing when the operator declines the confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);

    picker(12).value = 'priority: high';
    routeButton(12).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(confirm).toHaveBeenCalledWith(routingRouteConfirmMessage(12, 'priority: high'));
    expect(routeRequests).toEqual([]);
  });

  it('routes a confirmed pick as a JSON POST, says so, and re-reads the console', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);
    expect(consoleRequests).toHaveLength(1);

    picker(12).value = 'priority: high';
    routeButton(12).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(routeRequests).toEqual([
      {
        headers: { 'content-type': 'application/json' },
        body: { issue: 12, label: 'priority: high' },
      },
    ]);
    // The route changed the page, so the console reads it again at once
    // rather than waiting out the poll, and the outcome survives that render.
    expect(consoleRequests).toHaveLength(2);
    expect(routeNote().textContent).toBe('Routed #12 as priority: high.');
    expect(routeNote().className).not.toContain('routing-console-route-result-fail');
  });

  it("names a project page's own id on its route", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    boot(() => ({ ok: true, body: SNAPSHOT }), 'p 1');
    await vi.advanceTimersByTimeAsync(1);

    picker(12).value = 'priority: critical';
    routeButton(12).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(routeRequests.map((request) => request.body)).toEqual([
      { issue: 12, label: 'priority: critical', project: 'p 1' },
    ]);
  });

  it('says why a refused route sent no label', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    boot(
      () => ({ ok: true, body: SNAPSHOT }),
      undefined,
      () => ({
        ok: true,
        body: { issue: 12, label: 'priority: high', routed: false, refusedReason: 'guest' },
      }),
    );
    await vi.advanceTimersByTimeAsync(1);

    picker(12).value = 'priority: high';
    routeButton(12).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(routeNote().textContent).toBe(
      "Not routed — only the repository's maintainer routes issues.",
    );
    expect(routeNote().className).toContain('routing-console-route-result-fail');
  });

  it("keeps the operator's pick and focus through a poll's re-render", async () => {
    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);

    picker(12).value = 'priority: high';
    picker(12).focus();
    await vi.advanceTimersByTimeAsync(60000);

    expect(consoleRequests).toHaveLength(2);
    expect(picker(12).value).toBe('priority: high');
    expect(document.activeElement).toBe(picker(12));
  });

  it("names a project page's own id on its read, and none on the home page", async () => {
    boot(() => ({ ok: true, body: SNAPSHOT }), 'p 1');
    await vi.advanceTimersByTimeAsync(1);
    expect(consoleRequests).toEqual(['/api/routing-console?project=p%201']);

    boot(() => ({ ok: true, body: SNAPSHOT }));
    await vi.advanceTimersByTimeAsync(1);
    expect(consoleRequests).toEqual(['/api/routing-console']);
  });
});
