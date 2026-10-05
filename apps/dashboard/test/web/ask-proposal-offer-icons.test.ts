// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the search bar's Ask answer.
 * Its Search and Ask lead with `search` and `message-circle`, and every
 * KEEPER execute button leads with an icon, yet the two buttons an answer
 * can add under itself were bare words: the ARCHITECT proposal card's
 * Confirm, which runs a proposed write, and the low-confidence offer, which
 * re-asks the question with Deep on.
 *
 * Confirm leads with the `check` the Plan editor's Publish and the SOUL
 * card's ratify draw, the decision over a proposal; a destructive proposal's
 * "Confirm (destructive)" leads with the `triangle-alert` the landing panel's
 * warnings draw instead, so the icon says what the words' "(destructive)"
 * does. The offer leads with the search bar's `search`, since Deep is the
 * read-only agent that goes looking for the answer (Read/Grep/Glob) instead
 * of trusting the indexed excerpts. Nothing is newly vendored; each icon is
 * decorative, so a button's name stays its tip or its words. Both buttons
 * carry a `data-i18n` tag the locale sweep rewrites with `setSweptText()`,
 * which keeps a leading icon. Executes the ACTUAL client bundle
 * (`clientJs()`) in jsdom, the convention `architect-proposal-i18n.test.ts`
 * uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

// Every boot re-registers the client's document/window listeners; strip them
// after each test so a stale bundle's delegate never answers a later click.
type Tracked = [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const trackedListeners: Tracked[] = [];
for (const target of [document, window] as EventTarget[]) {
  const native = target.addEventListener.bind(target);
  target.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ) => {
    trackedListeners.push([target, type, listener, options]);
    return native(type, listener, options as AddEventListenerOptions | undefined);
  }) as typeof target.addEventListener;
}
afterEach(() => {
  for (const [target, type, listener, options] of trackedListeners.splice(0)) {
    target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
  }
});

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  flightLog: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const WRITE_PROPOSAL = { tool: 'fs_write', safety: 'write', args: { path: 'x' } };
const DESTRUCTIVE_PROPOSAL = { tool: 'fs_delete', safety: 'destructive', args: { path: 'x' } };

interface Answer {
  proposal?: unknown;
  lowConfidence?: boolean;
}

function frame(payload: unknown): string {
  return 'data: ' + JSON.stringify(payload) + '\n\n';
}

function streamResponse(answer: Answer): Response {
  const payload: Record<string, unknown> = { done: true, sources: ['src/a.ts'] };
  if (answer.proposal !== undefined) payload['proposal'] = answer.proposal;
  if (answer.lowConfidence !== undefined) payload['lowConfidence'] = answer.lowConfidence;
  const bytes = new TextEncoder().encode(frame({ delta: 'the answer' }) + frame(payload));
  let handed = false;
  const reader = {
    read: async () => {
      if (handed) return { done: true, value: undefined };
      handed = true;
      return { done: false, value: bytes };
    },
  };
  return { ok: true, body: { getReader: () => reader } } as unknown as Response;
}

async function boot(answer: Answer): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const href = String(url);
    if (href.includes('/api/ask/stream')) return streamResponse(answer);
    // A confirmed proposal stays in flight, so its disabled state can be read.
    if (href.includes('/api/control/execute')) return new Promise<Response>(() => {});
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

async function ask(): Promise<void> {
  (document.getElementById('search-project') as HTMLSelectElement).value = 'p1';
  (document.getElementById('search-q') as HTMLInputElement).value = 'why?';
  (document.getElementById('ask-go') as HTMLButtonElement).click();
  await vi.advanceTimersByTimeAsync(10);
  await vi.waitFor(() =>
    expect((document.getElementById('ask-go') as HTMLButtonElement).disabled).toBe(false),
  );
}

const confirmBtn = (): HTMLButtonElement =>
  document.querySelector('#ask-proposal .control-proposal-confirm') as HTMLButtonElement;
const offerBtn = (): HTMLButtonElement =>
  document.querySelector('#ask-offer .ask-offer-btn') as HTMLButtonElement;

/** The button leads with the named decorative icon, drawn shape for shape
 *  from the vendored data. */
function expectIconed(b: HTMLButtonElement, icon: string): void {
  expect(b, icon).not.toBeNull();
  const first = b.firstElementChild;
  expect(first, icon).not.toBeNull();
  expect(first!.tagName.toLowerCase(), icon).toBe('svg');
  expect(first!.getAttribute('class'), icon).toBe('icon icon-' + icon);
  expect(first!.getAttribute('aria-hidden'), icon).toBe('true');
  expect(first!.getAttribute('focusable'), icon).toBe('false');
  expect(
    [...first!.children].map((c) => c.tagName.toLowerCase()),
    icon,
  ).toEqual(ICON_SHAPES[icon]!.map(([tag]) => tag));
  expect(b.querySelectorAll('svg'), icon).toHaveLength(1);
}

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

describe('the Ask answer’s Confirm and try-Deep offer lead with stroke icons (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('a write proposal’s Confirm leads with check, named by its tip', async () => {
    await boot({ proposal: WRITE_PROPOSAL });
    await ask();

    expectIconed(confirmBtn(), 'check');
    expect(confirmBtn().textContent).toBe(STRINGS.en.proposalConfirm);
    expect(confirmBtn().getAttribute('aria-label')).toBe(STRINGS.en.proposalConfirmTip);
  });

  it('a destructive proposal’s Confirm leads with triangle-alert instead', async () => {
    await boot({ proposal: DESTRUCTIVE_PROPOSAL });
    await ask();

    expectIconed(confirmBtn(), 'triangle-alert');
    expect(confirmBtn().textContent).toBe(STRINGS.en.proposalConfirmDestructive);
    expect(confirmBtn().getAttribute('aria-label')).toBe(STRINGS.en.proposalConfirmDestructiveTip);
  });

  it('a locale switch rewrites Confirm’s words and keeps its icon', async () => {
    await boot({ proposal: WRITE_PROPOSAL });
    await ask();

    switchTo('he');
    expect(confirmBtn().textContent).toBe(STRINGS.he.proposalConfirm);
    expectIconed(confirmBtn(), 'check');

    switchTo('en');
    expect(confirmBtn().textContent).toBe(STRINGS.en.proposalConfirm);
    expectIconed(confirmBtn(), 'check');
  });

  it('a page that boots in Hebrew paints the destructive Confirm’s Hebrew words beside the icon', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot({ proposal: DESTRUCTIVE_PROPOSAL });
    await ask();

    expect(confirmBtn().textContent).toBe(STRINGS.he.proposalConfirmDestructive);
    expectIconed(confirmBtn(), 'triangle-alert');
  });

  it('confirming only disables the button, which keeps its icon and words', async () => {
    await boot({ proposal: WRITE_PROPOSAL });
    await ask();

    confirmBtn().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    expect(confirmBtn().disabled).toBe(true);
    expect(confirmBtn().textContent).toBe(STRINGS.en.proposalConfirm);
    expectIconed(confirmBtn(), 'check');
  });

  it('the low-confidence offer leads with search, its words its name, across a locale switch', async () => {
    await boot({ lowConfidence: true });
    await ask();

    expectIconed(offerBtn(), 'search');
    expect(offerBtn().textContent).toBe(STRINGS.en.askLowConfidenceOffer);
    expect(offerBtn().hasAttribute('aria-label')).toBe(false);

    switchTo('he');
    expect(offerBtn().textContent).toBe(STRINGS.he.askLowConfidenceOffer);
    expectIconed(offerBtn(), 'search');
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain(
      '.control-proposal-confirm > .icon, .ask-offer-btn > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the proposal card and the offer axe-clean (WCAG A/AA)', async () => {
    await boot({ proposal: DESTRUCTIVE_PROPOSAL, lowConfidence: true });
    await ask();
    expect(confirmBtn()).not.toBeNull();
    expect(offerBtn()).not.toBeNull();

    vi.useRealTimers();
    for (const id of ['ask-proposal', 'ask-offer']) {
      const results = await axe.run(document.getElementById(id) as HTMLElement, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results.violations, id).toEqual([]);
    }
  });
});
