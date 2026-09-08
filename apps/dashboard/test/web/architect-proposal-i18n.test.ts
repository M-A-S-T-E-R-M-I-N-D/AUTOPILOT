// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The search palette's Ask flow, follow-up slice (board web-msnsndki-dz3vn1,
 * flagged in the prior slice's commit body, fd617a93): the ARCHITECT
 * proposal card's "ARCHITECT proposes: <tool>" summary, its Running…/Done./
 * Failed: <reason> status swap, and its Confirm/Confirm (destructive) button
 * + tip; the completed answer's "sources: <files>" line and its tip/aria;
 * and the live tool-activity chip's tip/aria prefix —
 * `web/features/search.ts`'s `renderProposal()`/`renderAnswer()`/
 * `renderActivity()`. All were plain literals, invisible to
 * `pnpm i18n:untagged`, stuck in English under the Hebrew locale.
 *
 * The status pill swaps between three states over one run (Running…, then
 * Done. or Failed: <reason>) while the card stays mounted — tagged with
 * whichever key/template matches its CURRENT state, the busy/idle key-swap
 * `setAskLabel()` already established for the Ask button, so a mid-run
 * locale toggle repaints the state actually showing and not a stale one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

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
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

type ExecMode = 'ok' | 'appError' | 'reject';

function frame(payload: unknown): string {
  return 'data: ' + JSON.stringify(payload) + '\n\n';
}

function streamBody(proposal: unknown): string {
  return (
    frame({ delta: 'Hello' }) +
    frame({ activity: { tool: 'Read', target: 'src/x.ts' } }) +
    frame({ done: true, sources: ['src/a.ts', 'src/b.ts'], proposal })
  );
}

function streamResponse(body: string): Response {
  const bytes = new TextEncoder().encode(body);
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

function buildFetch(proposal: unknown, execMode: { value: ExecMode }): typeof fetch {
  return vi.fn(async (url: unknown) => {
    const href = String(url);
    if (href.includes('/api/ask/stream')) return streamResponse(streamBody(proposal));
    if (href.includes('/api/control/execute')) {
      if (execMode.value === 'reject') throw new Error('network down');
      if (execMode.value === 'appError') {
        return { ok: true, json: async () => ({ ok: false, error: 'bad args' }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
}

async function boot(proposal: unknown, execMode: { value: ExecMode } = { value: 'ok' }): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = buildFetch(proposal, execMode);
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

function switchTo(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function proposalSummary(): HTMLElement | null {
  return document.querySelector('#ask-proposal .control-proposal-summary');
}
function proposalStatus(): HTMLElement | null {
  return document.querySelector('#ask-proposal .control-proposal-status');
}
function confirmBtn(): HTMLButtonElement | null {
  return document.querySelector('#ask-proposal .control-proposal-confirm');
}
function activityChip(): HTMLElement | null {
  return document.querySelector('#ask-activity .ask-activity-chip');
}
function sourcesLine(): HTMLElement | null {
  return document.querySelector('#ask-answer .ask-sources');
}

const WRITE_PROPOSAL = { tool: 'fs_write', safety: 'write', args: { path: 'x' } };
const DESTRUCTIVE_PROPOSAL = { tool: 'fs_delete', safety: 'destructive', args: { path: 'x' } };
const READ_PROPOSAL = { tool: 'tasks_list', safety: 'read', args: {} };

describe('search palette proposal/sources/activity i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('paints the ARCHITECT proposal summary in English by default', async () => {
    await boot(WRITE_PROPOSAL);
    await ask();
    const summary = proposalSummary();
    expect(summary?.textContent).toBe('ARCHITECT proposes: fs_write');
    expect(summary?.getAttribute('data-i18n-template')).toBe('architectProposes');
    expect(summary?.getAttribute('data-i18n-name')).toBe('fs_write');
  });

  it('a page that boots in Hebrew paints the proposal summary in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot(WRITE_PROPOSAL);
    await ask();
    expect(proposalSummary()?.textContent).toBe(STRINGS.he.architectProposes.replace('{name}', 'fs_write'));
  });

  it('switching to Hebrew mid-render translates the proposal summary in place', async () => {
    await boot(WRITE_PROPOSAL);
    await ask();
    const summary = proposalSummary();
    switchTo('he');
    expect(proposalSummary()).toBe(summary);
    expect(summary?.textContent).toBe(STRINGS.he.architectProposes.replace('{name}', 'fs_write'));
  });

  it("renders a write proposal's Confirm button + tip in English by default", async () => {
    await boot(WRITE_PROPOSAL);
    await ask();
    const btn = confirmBtn();
    expect(btn?.textContent).toBe('Confirm');
    expect(btn?.getAttribute('data-i18n')).toBe('proposalConfirm');
    expect(btn?.getAttribute('data-tip')).toBe(STRINGS.en.proposalConfirmTip);
    expect(btn?.getAttribute('aria-label')).toBe(STRINGS.en.proposalConfirmTip);
  });

  it("renders a destructive proposal's Confirm button + tip in English by default", async () => {
    await boot(DESTRUCTIVE_PROPOSAL);
    await ask();
    const btn = confirmBtn();
    expect(btn?.textContent).toBe('Confirm (destructive)');
    expect(btn?.getAttribute('data-i18n')).toBe('proposalConfirmDestructive');
    expect(btn?.getAttribute('data-tip')).toBe(STRINGS.en.proposalConfirmDestructiveTip);
  });

  it('a page that boots in Hebrew paints the Confirm button in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot(WRITE_PROPOSAL);
    await ask();
    expect(confirmBtn()?.textContent).toBe(STRINGS.he.proposalConfirm);
  });

  it('confirming a write proposal shows Running… then Done., tagged so a mid-run switch repaints it', async () => {
    await boot(WRITE_PROPOSAL, { value: 'ok' });
    await ask();
    confirmBtn()?.click();
    const status = proposalStatus();
    expect(status?.textContent).toBe('Running…');
    expect(status?.getAttribute('data-i18n')).toBe('proposalRunning');

    switchTo('he');
    expect(status?.textContent).toBe(STRINGS.he.proposalRunning);

    await vi.waitFor(() => expect(status?.textContent).toBe(STRINGS.he.proposalDone));
    expect(status?.getAttribute('data-i18n')).toBe('proposalDone');
  });

  it('a failed proposal shows "Failed: <server reason>" with the server text embedded untranslated', async () => {
    await boot(WRITE_PROPOSAL, { value: 'appError' });
    await ask();
    confirmBtn()?.click();
    await vi.waitFor(() => expect(proposalStatus()?.textContent).toBe('Failed: bad args'));
    expect(proposalStatus()?.getAttribute('data-i18n-template')).toBe('proposalFailed');
    expect(proposalStatus()?.getAttribute('data-i18n-name')).toBe('bad args');
  });

  it('a rejected proposal request shows the request-error failure text', async () => {
    await boot(WRITE_PROPOSAL, { value: 'reject' });
    await ask();
    confirmBtn()?.click();
    await vi.waitFor(() => expect(proposalStatus()?.textContent).toBe('Failed: request error.'));
  });

  it('a read-safety proposal auto-runs with no confirm button and lands on Done.', async () => {
    await boot(READ_PROPOSAL, { value: 'ok' });
    await ask();
    expect(confirmBtn()).toBeNull();
    await vi.waitFor(() => expect(proposalStatus()?.textContent).toBe('Done.'));
  });

  it("paints the activity chip's tip and aria-label in English by default", async () => {
    await boot(WRITE_PROPOSAL);
    await ask();
    const chip = activityChip();
    expect(chip?.textContent).toBe('Read: src/x.ts');
    expect(chip?.getAttribute('data-tip')).toBe(STRINGS.en.askActivityTip);
    expect(chip?.getAttribute('aria-label')).toBe('Tool call: Read: src/x.ts');
    expect(chip?.getAttribute('data-i18n-aria-template')).toBe('askActivityAria');
  });

  it('a page that boots in Hebrew paints the activity chip tip/aria in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot(WRITE_PROPOSAL);
    await ask();
    const chip = activityChip();
    expect(chip?.getAttribute('data-tip')).toBe(STRINGS.he.askActivityTip);
    expect(chip?.getAttribute('aria-label')).toBe(
      STRINGS.he.askActivityAria.replace('{name}', 'Read: src/x.ts'),
    );
  });

  it("paints the sources line's text, tip, and aria-label in English by default", async () => {
    await boot(WRITE_PROPOSAL);
    await ask();
    const src = sourcesLine();
    expect(src).not.toBeNull();
    expect(src?.textContent).toBe('sources: src/a.ts · src/b.ts');
    expect(src?.getAttribute('data-tip')).toBe(STRINGS.en.askSourcesTip);
    expect(src?.getAttribute('aria-label')).toBe('Sources: src/a.ts · src/b.ts');
  });

  it('a page that boots in Hebrew paints the sources line in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot(WRITE_PROPOSAL);
    await ask();
    expect(sourcesLine()?.textContent).toBe(
      STRINGS.he.askSources.replace('{name}', 'src/a.ts · src/b.ts'),
    );
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const key of [
      'architectProposes',
      'proposalRunning',
      'proposalDone',
      'proposalFailed',
      'proposalUnknownError',
      'proposalRequestError',
      'proposalConfirm',
      'proposalConfirmDestructive',
      'proposalConfirmTip',
      'proposalConfirmDestructiveTip',
      'askActivityTip',
      'askActivityAria',
      'askSources',
      'askSourcesTip',
      'askSourcesAria',
    ] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
    }
    expect(STRINGS.he.proposalRunning.endsWith('…')).toBe(true);
  });

  it('paints every new label via tr(), with none of the old literals left in the assembled bundle', () => {
    const js = clientJs();
    expect(js).not.toContain("'ARCHITECT proposes: '");
    expect(js).not.toContain("statusEl.textContent = 'Running…'");
    expect(js).not.toContain("'Failed: request error.'");
    expect(js).not.toContain("'Confirm (destructive)' : 'Confirm'");
    expect(js).not.toContain("'sources: ' + sources.join");
    expect(js).not.toContain("'A tool call the model made while researching this answer'");
  });
});
