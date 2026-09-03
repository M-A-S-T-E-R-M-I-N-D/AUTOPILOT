// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The M3 DoD accessibility bar: axe-core clean. We render the ACTUAL served shell
 * and then execute the ACTUAL client script (with a mocked /api/state) so axe
 * inspects the real rendered fleet cards, not a hand-built mock. We assert zero
 * WCAG 2.0/2.1/2.2 A+AA violations. Color-contrast is asserted separately by the
 * token package's contrast tests (jsdom has no layout engine to compute it).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { renderPipelinePanel } from '../../src/web/pipeline-panel.js';
import type { SpanGraph } from '../../src/read/pipeline-graph.js';

const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

// jsdom's document.open()/write()/close() (loadShell() below) resets the
// document's content but — matching real browser behavior — does NOT remove
// listeners already registered directly on the `document` object. Every test
// in this file calls `new Function(clientJs())()`, which re-registers the
// client bundle's `document.addEventListener('click', ...)` handler; left in
// place, a stale handler from an earlier test keeps firing alongside the
// current test's on every later click, racing it and corrupting DOM state
// the newer handler just built (reproduced 100% of the time: the "claimable
// issue" test's dormant handler rebuilds the whole pool-client panel out from
// under the "fly locally" test's freshly-appended button, moments after it
// was appended — a real bug, not the timing flake it looked like; widening
// the assertion's wait timeout never helped no matter how long, since the
// button really was gone, not merely slow to appear). Track and strip every
// listener the bundle attaches to `document` after each test so none can
// outlive it.
const trackedDocumentListeners: Array<
  [
    type: string,
    listener: EventListenerOrEventListenerObject,
    options: boolean | AddEventListenerOptions | undefined,
  ]
> = [];
const nativeDocumentAddEventListener = document.addEventListener.bind(document);
document.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => {
  trackedDocumentListeners.push([type, listener, options]);
  return nativeDocumentAddEventListener(type, listener, options);
}) as typeof document.addEventListener;

afterEach(() => {
  while (trackedDocumentListeners.length) {
    const [type, listener, options] = trackedDocumentListeners.pop()!;
    document.removeEventListener(type, listener, options);
  }
});

const SAMPLE_STATE = {
  generatedAt: Date.now(),
  totals: {
    projects: 2,
    flying: 1,
    needsYou: 0,
    firings: 3,
    shipped: 2,
    openFindings: 3,
    cost: 0.76,
  },
  projects: [
    {
      id: 'p1',
      slug: 'checkout',
      name: 'checkout-web',
      status: 'flying',
      createdAt: 1,
      primaryLanguage: 'typescript',
      fileCount: 5,
      totalBytes: 2048,
      languages: [
        { language: 'typescript', files: 4, bytes: 1800 },
        { language: 'json', files: 1, bytes: 248 },
      ],
      topDirs: [{ dir: 'src', files: 4 }],
      gate: 'js · vitest run',
      backedUp: true,
      hotFiles: ['src/index.ts', 'src/cart.ts'],
      firings: 3,
      shipped: 2,
      cost: 0.76,
      tokensIn: 20605,
      tokensOut: 2534,
      shipRate: 0.66,
      openFindings: 3,
      gauge: { critical: 1, high: 1, medium: 0, low: 1 },
      lastActivityAt: Date.now(),
      activity: [
        { tool: 'Read', target: 'src/index.js', kind: 'file', phase: 'orient', at: Date.now() },
        { tool: 'Edit', target: 'src/index.js', kind: 'file', phase: 'do', at: Date.now() },
        { tool: 'Bash', target: 'pnpm run test', kind: 'command', phase: 'gate', at: Date.now() },
      ],
      flightLog: [
        {
          id: 'p1:firing-2',
          item: 'AP-2',
          kind: 'feat',
          sha: 'abc1234',
          shipped: true,
          gateResult: 'passed',
          cost: 0.51,
          tokensIn: 12000,
          tokensOut: 1500,
          turns: 11,
          durationMs: 302000,
          at: Date.now(),
        },
        {
          id: 'p1:firing-1',
          item: 'AP-1',
          kind: 'fix',
          sha: 'def5678',
          shipped: false,
          gateResult: 'reverted',
          cost: 0.25,
          tokensIn: 8000,
          tokensOut: 1000,
          turns: 6,
          durationMs: 145000,
          at: Date.now(),
        },
      ],
    },
    {
      id: 'p2',
      slug: 'edge',
      name: 'edge-router',
      status: 'registered',
      createdAt: 1,
      primaryLanguage: 'unknown',
      fileCount: 4,
      totalBytes: 1024,
      languages: [],
      topDirs: [],
      gate: null,
      backedUp: false,
      hotFiles: [],
      firings: 0,
      shipped: 0,
      shipRate: null,
      openFindings: 0,
      gauge: { critical: 0, high: 0, medium: 0, low: 0 },
      lastActivityAt: null,
      flightLog: [],
    },
  ],
  empty: false,
};

function loadShell(project?: string): void {
  document.open();
  document.write(renderShell(project));
  document.close();
}

async function violations(): Promise<axe.Result[]> {
  const results = await axe.run(document, AXE_OPTIONS);
  return results.violations;
}

describe('dashboard accessibility (axe-core, WCAG A/AA)', () => {
  beforeEach(() => {
    loadShell();
  });

  it('the static shell is axe-clean', async () => {
    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('exposes a keyboard skip-link and a labelled main landmark', () => {
    expect(document.querySelector('.skip-link')?.getAttribute('href')).toBe('#fleet');
    const main = document.querySelector('main');
    expect(main?.getAttribute('aria-label')).toBe('Fleet');
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switching to Hebrew flips the document direction, translates the masthead, and stays axe-clean', async () => {
    // The RTL layout audit half of the i18n foundation (board
    // web-msnsndki-dz3vn1, alongside the per-string translation sweeps
    // `shell-i18n.test.ts` covers): every prior i18n test asserts a
    // `data-i18n*` marker exists, never that flipping the live locale
    // actually lands `dir="rtl"` on `<html>` and leaves the masthead
    // both translated and still accessible.
    new Function(clientJs())();
    expect(document.documentElement.dir).not.toBe('rtl');

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.querySelector('[data-lang-btn="he"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(document.querySelector('[data-i18n="connect"]')?.textContent).toBe(STRINGS.he.connect);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the live-rendered fleet cards are axe-clean', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => SAMPLE_STATE,
    })) as unknown as typeof fetch;

    // Execute the real client bundle against this document; refresh() paints cards.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.card')).not.toBeNull();
    });

    expect(document.querySelectorAll('.card')).toHaveLength(2);
    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the REPORT UNIFICATION right-click "Report from here" context menu is axe-clean', async () => {
    // Same verification-gap class as the risk-chip/eval-trend fixes elsewhere
    // in this file: report-menu.ts (epic 0015 course-correction, REPORT
    // UNIFICATION 2/2) builds its `.report-ctx-menu`/`.report-dialog` purely
    // via document.createElement, appended straight to document.body on a
    // real `contextmenu` event — none of it exists in the server-rendered
    // shell markup any other test in this file scans, so no axe run here has
    // ever actually touched it.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => SAMPLE_STATE,
    })) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.card')).not.toBeNull();
    });

    const card = document.querySelector('.card') as HTMLElement;
    card.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }),
    );
    expect(document.querySelector('.report-ctx-menu')).not.toBeNull();

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the REPORT UNIFICATION "Report from here" dialog, opened from the context menu, is axe-clean', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => SAMPLE_STATE,
    })) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.card')).not.toBeNull();
    });

    const card = document.querySelector('.card') as HTMLElement;
    card.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }),
    );
    (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();

    const dialog = document.querySelector('.report-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('role')).toBe('dialog');
    expect(dialog!.getAttribute('aria-modal')).toBe('true');

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the live worker card with an orient-fixation warning chip is axe-clean', async () => {
    const orientTurns = Array.from({ length: 15 }, (_, i) => ({
      tool: 'Read',
      target: 'src/index.js',
      kind: 'file',
      phase: 'orient',
      at: Date.now(),
      firingId: 'p1:firing-3',
      model: 'sonnet-' + i,
    }));
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...SAMPLE_STATE,
        projects: [
          { ...SAMPLE_STATE.projects[0], activity: orientTurns, tasks: [] },
          SAMPLE_STATE.projects[1],
        ],
      }),
    })) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.live-orient-fixation')).not.toBeNull();
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the open first-run tour dialog is axe-clean', async () => {
    new Function(clientJs())();
    (document.getElementById('tour-btn') as HTMLButtonElement).click();
    expect(document.querySelector('.tour-dialog')).not.toBeNull();
    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('a card with a pending SOUL proposal and an undoable ratify (both SOUL evolution loop affordances, board web-mswqemor-ab3jsu) is axe-clean', async () => {
    // Same verification-gap class as the risk-chip/eval-trend fixes elsewhere
    // in this file: no fixture anywhere in this suite ever set soulProposed or
    // soulPrevious, so cardActions()'s conditional soulProposalPanel()/
    // soulUnratifyChip() branches (shell.ts) never actually rendered during
    // any axe scan — an axe-clean claim on markup the scan never touched
    // isn't verified, it's assumed.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...SAMPLE_STATE,
        projects: [
          {
            ...SAMPLE_STATE.projects[0],
            soulProposed: 'Prefer decimal.Decimal over float for money math.',
            soulPrevious: 'The prior live SOUL text.',
          },
          SAMPLE_STATE.projects[1],
        ],
      }),
    })) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.soul-proposal')).not.toBeNull();
    });
    expect(document.querySelector('.soul-unratify-row')).not.toBeNull();

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the FLY-BAR browse-folder modal is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/browse-folder')) {
        return {
          ok: true,
          json: async () => ({
            path: '/srv/projects',
            parent: '/srv',
            entries: [
              { name: 'checkout-web', path: '/srv/projects/checkout-web' },
              { name: 'edge-router', path: '/srv/projects/edge-router' },
            ],
          }),
        };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.getElementById('fly-browse-btn')).not.toBeNull();
    });
    (document.getElementById('fly-browse-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.browse-dialog')).not.toBeNull();
    });
    expect(document.querySelectorAll('.browse-entry')).toHaveLength(3); // "up" + 2 subfolders

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the FLY-BAR browse-folder modal, with multiple drives reported, is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/browse-folder')) {
        return {
          ok: true,
          json: async () => ({
            path: 'C:\\Users\\operator',
            parent: 'C:\\Users',
            entries: [{ name: 'repo', path: 'C:\\Users\\operator\\repo' }],
            drives: ['C:\\', 'D:\\', 'Z:\\'],
          }),
        };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.getElementById('fly-browse-btn')).not.toBeNull();
    });
    (document.getElementById('fly-browse-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.browse-dialog')).not.toBeNull();
    });
    expect(document.querySelectorAll('.browse-drive')).toHaveLength(3);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the Ask panel with the Deep toggle checked and live activity chips rendered is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof url === 'string' && url === '/api/ask/stream') {
        JSON.parse(String(init?.body ?? '{}'));
        const frames =
          `data: ${JSON.stringify({ activity: { tool: 'Read', target: 'src/cart.ts' } })}\n\n` +
          `data: ${JSON.stringify({ done: true, ok: true, answer: 'the answer', sources: ['src/cart.ts'] })}\n\n`;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(frames));
            controller.close();
          },
        });
        return { ok: true, body } as unknown as Response;
      }
      return { ok: true, json: async () => SAMPLE_STATE } as Response;
    }) as unknown as typeof fetch;

    vi.useFakeTimers();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1); // first fleet paint populates the project picker
    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const deepEl = document.getElementById('ask-deep') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    sel.value = 'p1';
    qEl.value = 'where does checkout total get computed?';
    deepEl.checked = true;
    askBtn.click();
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();

    expect(document.querySelectorAll('.ask-activity-chip')).toHaveLength(1);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the BE-RIGHT-BACK overlay, shown after sustained /api/state failure, is axe-clean', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    // BRB_FAIL_THRESHOLD is 2: the initial refresh() (failure #1) plus one
    // fallback-poll tick — jsdom has no EventSource, so startFleetStream
    // falls back to setInterval(refresh, REFRESH_MS) — crosses it. Fake
    // timers only drive that interval; axe.run() below needs real ones.
    vi.useFakeTimers();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(3100);
    vi.useRealTimers();

    const overlay = document.querySelector('.brb-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.hasAttribute('hidden')).toBe(false);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the pool client panel with a claimable issue and its project picker is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/pool-client')) {
        return {
          ok: true,
          json: async () => ({
            entries: [
              {
                issue: {
                  number: 42,
                  title: 'Keyboard nav is broken in the fleet table',
                  url: 'https://github.com/example/repo/issues/42',
                  assignees: [],
                },
                decision: { decision: 'claim', reasoning: 'claiming #42 for octocat' },
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    // Execute the real client bundle; loadPoolClientPanel() fetches
    // /api/pool-client on demand and renders the claim button plus the
    // "fly locally" project picker (epic 0007 slice 6) beside it. The pool
    // panel routinely paints before the fleet state (and its project list)
    // arrives — refreshPoolClientProjectOptions() patches the already-
    // rendered select once state lands, so this waits for the final option
    // count rather than just the button's presence.
    new Function(clientJs())();
    await vi.waitFor(() => {
      const select = document.querySelector('.pool-client-project') as HTMLSelectElement | null;
      expect(select?.options.length).toBe(1 + SAMPLE_STATE.projects.length);
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the pool client panel\'s "fly locally" button, shown after a claim queues a local board task, is axe-clean', async () => {
    // Epic 0007 slice 6's last-noted open item: POST /api/fly already
    // exists, this just adds the operator affordance to invoke it from the
    // pool panel — see web/pool-client-panel.ts's poolClaimFlyTip/
    // poolClaimFlyResult and web/shell.ts's click handler.
    const stateWithRootPath = {
      ...SAMPLE_STATE,
      projects: [{ ...SAMPLE_STATE.projects[0], rootPath: '/repo/checkout-web' }],
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/pool-client/execute')) {
        return {
          ok: true,
          json: async () => ({
            decision: { decision: 'claim', reasoning: 'claiming #42 for octocat' },
            commandResults: [{ command: { details: 'assigning #42 to octocat' }, code: 0 }],
            taskQueued: true,
          }),
        };
      }
      if (url.includes('/api/pool-client')) {
        return {
          ok: true,
          json: async () => ({
            entries: [
              {
                issue: {
                  number: 42,
                  title: 'Keyboard nav is broken in the fleet table',
                  url: 'https://github.com/example/repo/issues/42',
                  assignees: [],
                },
                decision: { decision: 'claim', reasoning: 'claiming #42 for octocat' },
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => stateWithRootPath };
    }) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      const select = document.querySelector('.pool-client-project') as HTMLSelectElement | null;
      expect(select?.options.length).toBe(2);
    });
    (document.querySelector('.pool-client-project') as HTMLSelectElement).value = 'p1';
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (document.querySelector('[data-pool-client-execute="42"]') as HTMLButtonElement).click();
    // A longer timeout than vi.waitFor's 1s default — this claim chains two
    // fetches (execute, then the fly button's own project lookup) through
    // several promise ticks, which the default window can miss under a
    // loaded test run (same reasoning as execute.test.ts:379's 10s wait).
    await vi.waitFor(
      () => {
        expect(document.querySelector('.pool-client-fly')).not.toBeNull();
      },
      { timeout: 10_000 },
    );

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the publicity panel with a mix of live and dormant affordances is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/publicity')) {
        return {
          ok: true,
          json: async () => ({
            affordances: [
              {
                id: 'repo',
                label: 'View repo',
                url: 'https://github.com/octocat/hello-world',
                dormant: false,
                reasoning: 'octocat/hello-world is public — publicity affordances are live',
              },
              {
                id: 'watch',
                label: 'Watch',
                url: '#',
                dormant: true,
                reasoning:
                  'octocat/hello-world is private — publicity affordances stay dormant until it goes public',
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.publicity-link')).toHaveLength(2);
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });
});

describe('project page (single-project full-width variant, axe-core, WCAG A/AA)', () => {
  beforeEach(() => {
    loadShell('p1');
  });

  it('the live-rendered project page — summary, card, and task board — is axe-clean', async () => {
    const withTasks = {
      ...SAMPLE_STATE,
      projects: [
        {
          ...SAMPLE_STATE.projects[0],
          tasks: [
            {
              id: 't1',
              title: 'Wire up the retry queue',
              status: 'open',
              severity: 'high',
              dimension: 'reliability',
              focus: true,
            },
            {
              id: 't2',
              title: 'Document the webhook payload',
              status: 'in_progress',
              severity: null,
              dimension: null,
              focus: false,
            },
            {
              id: 't3',
              title: 'Old cleanup task',
              status: 'done',
              severity: 'low',
              dimension: null,
              focus: false,
            },
          ],
        },
        SAMPLE_STATE.projects[1],
      ],
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => withTasks,
    })) as unknown as typeof fetch;

    // Execute the real client bundle; body[data-project="p1"] routes refresh() to
    // renderProjectPage() instead of the fleet grid.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('#fleet.project-mode')).not.toBeNull();
    });

    expect(document.querySelectorAll('.task')).toHaveLength(3);
    // Real durationMs on both flightLog entries — proves the axe scan below
    // actually exercises the FLIGHT TIMELINE strip's SVG rects, not just the
    // task board (timelineSegments() renders null, skipping the strip
    // entirely, when no firing has real duration data).
    expect(document.querySelectorAll('.timeline-strip rect')).toHaveLength(2);
    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the ADAPTIVE TASK BUDGET risk chip on the project page task board is axe-clean', async () => {
    // Mirrors the gap fixed for the FLIGHT TIMELINE strip above: the prior
    // task-board axe fixture never gave any task a turn-capped flightLog
    // entry, so .chip-budget-risk (task-budget-risk-chip.test.ts, shipped
    // and landed on main already) never actually rendered during this
    // page's axe scan — an axe-clean claim on markup the scan never
    // touched isn't verified, it's assumed.
    const baseProject = SAMPLE_STATE.projects[0];
    const withBudgetRisk = {
      ...SAMPLE_STATE,
      projects: [
        {
          ...baseProject,
          tasks: [
            {
              id: 't1',
              title: 'Wire up the retry queue',
              status: 'open',
              severity: 'high',
              dimension: 'reliability',
              focus: false,
            },
          ],
          flightLog: [
            ...(baseProject?.flightLog ?? []),
            {
              id: 'p1:firing-3',
              item: 't1',
              kind: null,
              sha: null,
              shipped: false,
              gateResult: 'checkpointed',
              cost: 0.08,
              tokensIn: 1,
              tokensOut: 1,
              turns: 120,
              durationMs: 900000,
              died: 'turn-cap',
              at: Date.now(),
            },
          ],
        },
        SAMPLE_STATE.projects[1],
      ],
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => withBudgetRisk,
    })) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.chip-budget-risk')).not.toBeNull();
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the evolution (evaluation trend) panel on the project page is axe-clean', async () => {
    // Same verification-gap class as the risk-chip fix above: the prior
    // project-page axe fixture never gave any project evaluationLabelDayCounts,
    // so .eval-trend-wrap (evaluation-trend.ts's Sun-start weekly approval-rate
    // panel, human-vs-agent evaluation backlog J checkbox 5) never actually
    // rendered during this page's axe scan.
    const baseProject = SAMPLE_STATE.projects[0];
    const withEvalTrend = {
      ...SAMPLE_STATE,
      projects: [
        {
          ...baseProject,
          evaluationLabelDayCounts: [
            { day: new Date(Date.now()).toISOString().slice(0, 10), approved: 3, rejected: 1 },
          ],
        },
        SAMPLE_STATE.projects[1],
      ],
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => withEvalTrend,
    })) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.eval-trend-bar')).not.toBeNull();
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the DORA process-health panel is axe-clean', async () => {
    const withDora = {
      ...SAMPLE_STATE,
      projects: [
        {
          ...SAMPLE_STATE.projects[0],
          dora: {
            landingFrequency: { perDay: 2.3, windowDays: 14 },
            taskLeadTime: { medianLeadTimeMs: 3_600_000, tasksCompleted: 5 },
            changeFailureRate: { rate: 0.1, shipped: 20 },
            mttr: { medianRecoveryMs: 1_800_000, resolved: 3 },
          },
        },
        SAMPLE_STATE.projects[1],
      ],
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => withDora,
    })) as unknown as typeof fetch;

    // Execute the real client bundle; doraSection() renders straight from the
    // project's own `dora` field on the fleet snapshot — no separate fetch.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.dora-panel')).not.toBeNull();
    });
    expect(document.querySelectorAll('#dora-tiles .stat-tile')).toHaveLength(4);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the parallel-gate-savings panel is axe-clean', async () => {
    const withGateParallel = {
      ...SAMPLE_STATE,
      projects: [
        {
          ...SAMPLE_STATE.projects[0],
          gateParallel: { sampledFirings: 6, savedMs: 45_000, savedPct: 0.32 },
        },
        SAMPLE_STATE.projects[1],
      ],
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => withGateParallel,
    })) as unknown as typeof fetch;

    // Execute the real client bundle; gateParallelSection() renders straight
    // from the project's own `gateParallel` field on the fleet snapshot — no
    // separate fetch.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.gate-parallel-panel')).not.toBeNull();
    });
    expect(document.querySelectorAll('#gate-parallel-tiles .stat-tile')).toHaveLength(3);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the warm-sessions panel is axe-clean', async () => {
    const withWarmSessions = {
      ...SAMPLE_STATE,
      projects: [
        {
          ...SAMPLE_STATE.projects[0],
          warmSessions: {
            resumed: { firings: 4 },
            cold: { firings: 9 },
            freshInputDeltaPerFiring: 18_500,
            costDeltaPerFiring: 0.42,
            costPerTurnDeltaPerFiring: 0.03,
          },
        },
        SAMPLE_STATE.projects[1],
      ],
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => withWarmSessions,
    })) as unknown as typeof fetch;

    // Execute the real client bundle; warmSessionsSection() renders straight
    // from the project's own `warmSessions` field on the fleet snapshot — no
    // separate fetch.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.warm-sessions-panel')).not.toBeNull();
    });
    expect(document.querySelectorAll('#warm-sessions-tiles .stat-tile')).toHaveLength(4);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the evolution panel is axe-clean', async () => {
    const withEvolution = {
      ...SAMPLE_STATE,
      projects: [
        {
          ...SAMPLE_STATE.projects[0],
          evaluationLabelDayCounts: [
            { day: '2026-08-14', approved: 3, rejected: 1 },
            { day: '2026-08-20', approved: 4, rejected: 2 },
          ],
        },
        SAMPLE_STATE.projects[1],
      ],
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => withEvolution,
    })) as unknown as typeof fetch;

    // Execute the real client bundle; evolutionSection() renders straight
    // from the project's own `evaluationLabelDayCounts` field on the fleet
    // snapshot — no separate fetch.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.evolution-panel')).not.toBeNull();
    });
    expect(document.querySelectorAll('#evolution-tiles .stat-tile')).toHaveLength(4);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the LANDING card with a real EXECUTE button (unmerged commits) is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/landing')) {
        return {
          ok: true,
          json: async () => ({
            landing: {
              branch: 'autopilot/flight',
              base: 'main',
              commits: [
                {
                  shortSha: 'a1b2c3d',
                  subject: 'feat: add landing card',
                  files: ['a.ts', 'b.ts'],
                },
              ],
              diffstat: { filesChanged: 2, insertions: 12, deletions: 3 },
            },
          }),
        };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    // Execute the real client bundle; landingSection() fetches /api/landing on
    // demand and renders the actual "🛬 Execute landing" button/confirm flow.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-land-execute]')).not.toBeNull();
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the LANDING card worktree-divergence warning (web-msvbzahx-uiemjb) is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/landing')) {
        return {
          ok: true,
          json: async () => ({
            landing: {
              branch: 'autopilot/flight',
              base: 'main',
              commits: [],
              diffstat: { filesChanged: 0, insertions: 0, deletions: 0 },
              worktreeAhead: [{ sha: 'e4f5g6h' }, { sha: 'i7j8k9l' }],
            },
          }),
        };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    // Execute the real client bundle; landingSection() fetches /api/landing on
    // demand and renders the divergence warning even with an empty commit list
    // — the "nothing else to land" case that previously hid it entirely.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.landing-worktree-divergence')).not.toBeNull();
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the Detected backlog panel — both a confirmable and an annotation-only candidate — is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/backlog')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                taskId: 't1',
                taskTitle: 'Wire up the retry queue',
                commitSha: 'a1b2c3d',
                commitSubject: 'feat: add retry queue',
                matchedVia: 'subject',
              },
              {
                taskId: 't2',
                taskTitle: 'Document the webhook payload',
                commitSha: 'e4f5g6h',
                commitSubject: 'docs: assorted cleanup',
                matchedVia: 'path',
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    // Execute the real client bundle; backlogSection() fetches /api/backlog on
    // demand and renders the "✓ confirm done" action for a subject match, plus
    // the annotation-only chip (no button) for a weaker path match.
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.backlog-item')).toHaveLength(2);
    });
    expect(document.querySelectorAll('[data-task-done]')).toHaveLength(1);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the RELEASE card with the optional milestone-tag input is axe-clean', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/release')) {
        return {
          ok: true,
          json: async () => ({
            release: {
              tagName: 'v1.2.0',
              currentVersion: '1.2.0',
              plan: { ok: true, bump: 'minor', version: '1.3.0', changelog: '# Changelog' },
            },
          }),
        };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    // Execute the real client bundle; releaseSection() fetches /api/release on
    // demand and renders the actual "🚀 Cut release" button plus the optional
    // milestone-tag input beside it (web-msnshavs-z0obmh's m<N> reconciliation).
    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('.release-milestone-input')).not.toBeNull();
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the LIVE WORKER card on the project page is axe-clean', async () => {
    // Same verification-gap class as the risk-chip/eval-trend fixes above:
    // liveFiringOf (shared/live-firing.ts) returns null unless the newest
    // activity entry carries a firingId absent from the flight log, and no
    // activity in this suite's base fixture has one — so the live worker
    // card (epic 0005 slice 4's restyled surface: accent-identified raised
    // panel, phase tag, tabular-numeral count/turn lines) never actually
    // rendered during any PROJECT-MODE axe scan; only the fleet-grid
    // variant was ever scanned (the orient-fixation test above).
    const baseProject = SAMPLE_STATE.projects[0]!;
    const liveActivity = baseProject.activity!.map((a) => ({
      ...a,
      firingId: 'p1:firing-9',
    }));
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...SAMPLE_STATE,
        projects: [{ ...baseProject, activity: liveActivity, tasks: [] }, SAMPLE_STATE.projects[1]],
      }),
    })) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('#fleet.project-mode .live-worker')).not.toBeNull();
    });

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the phase rail with an EXPANDED phase-detail view is axe-clean', async () => {
    // The rail's collapsed segment buttons render in every card scan, but
    // the "look INTO a phase" detail view they expand into (phaseDetail() —
    // aria-expanded flips true, actRow entries paint) never rendered during
    // any axe scan in this suite: nothing ever clicked a segment.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => SAMPLE_STATE,
    })) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-phase-toggle="do"]')).not.toBeNull();
    });
    (document.querySelector('[data-phase-toggle="do"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.phase-detail-do')).not.toBeNull();
    });
    expect(document.querySelector('[data-phase-toggle="do"]')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(document.querySelectorAll('.phase-acts li').length).toBeGreaterThan(0);

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the PIPELINE VIEW panel — tree sidebar and SVG canvas, all three status colors — is axe-clean', async () => {
    // Same verification-gap class as the risk-chip/eval-trend/live-worker fixes above:
    // pipelineSection() (epic 0015 D4, web-mtdc6wq3-5wuc6i) fetches /api/pipeline on its
    // own, separately from the page's /api/state fetch this suite's base fixture mocks —
    // so every other project-page axe scan only ever exercised the panel's "Loading…"
    // placeholder, never the actual server-rendered tree items and SVG nodes/edges
    // pipeline-tree-html.ts and pipeline-svg.ts emit (data-status/-selected/-connected
    // hooks the D4 canvas-styling fix just gave real color to).
    const GRAPH: SpanGraph = {
      nodes: [
        { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
        { id: 's2', traceId: 't1', label: 'implement', spanCount: 2, status: 2 },
        { id: 's3', traceId: 't2', label: 'ship', spanCount: 1, status: 1 },
      ],
      edges: [{ from: 's1', to: 's2' }],
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/pipeline')) {
        return { ok: true, json: async () => ({ html: renderPipelinePanel(GRAPH) }) };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.pipeline-item')).toHaveLength(3);
    });
    expect(document.querySelectorAll('.pipeline-node')).toHaveLength(3);
    expect(document.querySelector('.pipeline-edge')).not.toBeNull();

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });

  it('the PIPELINE VIEW panel with a node SELECTED (highlighted + connected neighbours) is axe-clean', async () => {
    // The axe test above scans the panel exactly as server-rendered, before any click —
    // so `.pipeline-item[aria-selected='true']`/`[data-connected='true']` and
    // `.pipeline-node[data-selected='true']`/`[data-connected='true']`, the styled states
    // the D4 canvas-styling fix gave real color (border-color, color-mix background,
    // thicker accent strokes — layout-css.ts), have never actually been axe-scanned. Same
    // verification-gap class as the risk-chip/eval-trend/live-worker/phase-detail fixes
    // above: a state that only exists after a real interaction, scanned only once that
    // interaction actually happens.
    const GRAPH: SpanGraph = {
      nodes: [
        { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
        { id: 's2', traceId: 't1', label: 'implement', spanCount: 2, status: 2 },
        { id: 's3', traceId: 't2', label: 'ship', spanCount: 1, status: 1 },
      ],
      edges: [{ from: 's1', to: 's2' }],
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/pipeline')) {
        return { ok: true, json: async () => ({ html: renderPipelinePanel(GRAPH) }) };
      }
      return { ok: true, json: async () => SAMPLE_STATE };
    }) as unknown as typeof fetch;

    new Function(clientJs())();
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.pipeline-item')).toHaveLength(3);
    });

    const item = document.querySelector('.pipeline-item[data-node-id="s1"]') as HTMLElement;
    item.click();
    await vi.waitFor(() => {
      expect(item.getAttribute('aria-selected')).toBe('true');
    });
    // Prove the scan below genuinely covers the selected/connected styled states, not
    // just the click having no visible effect.
    expect(document.querySelector('.pipeline-item[data-connected="true"]')).not.toBeNull();
    expect(document.querySelector('.pipeline-node[data-selected="true"]')).not.toBeNull();
    expect(document.querySelector('.pipeline-node[data-connected="true"]')).not.toBeNull();
    expect(document.querySelector('.pipeline-edge[data-connected="true"]')).not.toBeNull();

    const found = await violations();
    expect(found.map((v) => v.id)).toEqual([]);
  });
});
