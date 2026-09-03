// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The SOUL evolution loop's "proposed" surface (packages/store schema v14,
 * B5 closure) is only a real feature once the operator can actually read
 * the pending text and ratify/dismiss it from the fleet card — this is
 * that expression's regression test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 6,
  shipped: 1,
  cost: 9,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.16,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
};

function stateWith(projectOverrides: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 6,
      shipped: 1,
      openFindings: 0,
      cost: 9,
    },
    projects: [{ ...PROJECT, ...projectOverrides }],
    empty: false,
  };
}

function boot(state: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('SOUL-proposal panel on the fleet card', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders no panel while nothing is pending', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.soul-proposal')).toBeNull();
  });

  it('renders the proposed text with keyboard-reachable ratify/dismiss buttons when a proposal is pending', async () => {
    boot(stateWith({ soulProposed: 'a mined amendment' }));
    await vi.advanceTimersByTimeAsync(1);

    const panel = document.querySelector('.soul-proposal');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('.soul-proposal-text')?.textContent).toBe('a mined amendment');

    const ratifyBtn = panel?.querySelector('[data-soul-ratify]');
    expect(ratifyBtn?.tagName).toBe('BUTTON');
    expect(ratifyBtn?.getAttribute('data-soul-ratify')).toBe('p1');
    expect(ratifyBtn?.getAttribute('data-tip')).toBeTruthy();
    expect(ratifyBtn?.getAttribute('aria-label')).toBeTruthy();

    const dismissBtn = panel?.querySelector('[data-soul-dismiss]');
    expect(dismissBtn?.tagName).toBe('BUTTON');
    expect(dismissBtn?.getAttribute('data-soul-dismiss')).toBe('p1');
    expect(dismissBtn?.getAttribute('data-tip')).toBeTruthy();
    expect(dismissBtn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('ratify asks for confirmation, then POSTs to /api/project/soul-ratify and disables itself', async () => {
    boot(stateWith({ soulProposed: 'a mined amendment' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-soul-ratify]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(STRINGS.en.soulRatifyConfirm);
    expect(btn.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/project/soul-ratify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'p1' }),
      }),
    );
  });

  it('ratify does nothing when the confirmation is declined', async () => {
    boot(stateWith({ soulProposed: 'a mined amendment' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-soul-ratify]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(btn.disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dismiss POSTs to /api/project/soul-dismiss without a confirmation and disables itself', async () => {
    boot(stateWith({ soulProposed: 'a mined amendment' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-soul-dismiss]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm');

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(btn.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/project/soul-dismiss',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'p1' }),
      }),
    );
  });
});

describe('SOUL un-ratify affordance on the fleet card (board web-mswqemor-ab3jsu)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders no un-ratify chip while there is nothing to undo', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('[data-soul-unratify]')).toBeNull();
  });

  it('renders a keyboard-reachable un-ratify button once a ratification leaves something to undo', async () => {
    boot(stateWith({ soulPrevious: 'the old soul text' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-soul-unratify]');
    expect(btn?.tagName).toBe('BUTTON');
    expect(btn?.getAttribute('data-soul-unratify')).toBe('p1');
    expect(btn?.getAttribute('data-tip')).toBeTruthy();
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('un-ratify asks for confirmation, then POSTs to /api/project/soul-unratify and disables itself', async () => {
    boot(stateWith({ soulPrevious: 'the old soul text' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-soul-unratify]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(STRINGS.en.soulUnratifyConfirm);
    expect(btn.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/project/soul-unratify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'p1' }),
      }),
    );
  });

  it('un-ratify does nothing when the confirmation is declined', async () => {
    boot(stateWith({ soulPrevious: 'the old soul text' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-soul-unratify]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(btn.disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SOUL editor entry on the fleet card (board web-mswqemor-ab3jsu)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is always rendered, even with no live SOUL text, with an empty keyboard-reachable textarea', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const details = document.querySelector('.soul-editor');
    expect(details).not.toBeNull();
    const form = details?.querySelector('[data-soul-edit]');
    expect(form?.getAttribute('data-soul-edit')).toBe('p1');
    const textarea = form?.querySelector('textarea[name="text"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('');
    const label = form?.querySelector('label');
    expect(label?.getAttribute('for')).toBe(textarea.id);
  });

  it('prefills the textarea with the live SOUL text', async () => {
    boot(stateWith({ soul: 'the current live soul text' }));
    await vi.advanceTimersByTimeAsync(1);

    const textarea = document.querySelector(
      '[data-soul-edit] textarea[name="text"]',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('the current live soul text');
  });

  it('submitting POSTs the trimmed text to /api/project/soul-propose and disables the button', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const calls: { url: string; body: unknown }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/project/soul-propose') {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return {
          ok: true,
          json: async () => ({ proposed: true, id: 'p1' }),
        } as unknown as Response;
      }
      return realFetch(url, init);
    }) as unknown as typeof fetch;

    const form = document.querySelector('[data-soul-edit]') as HTMLFormElement;
    const textarea = form.querySelector('textarea[name="text"]') as HTMLTextAreaElement;
    textarea.value = '  a hand-written amendment  ';
    const btn = form.querySelector('button') as HTMLButtonElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(btn.disabled).toBe(true);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    expect(calls[calls.length - 1]?.body).toEqual({ id: 'p1', text: 'a hand-written amendment' });

    const status = document.getElementById('soul-editor-status-p1');
    await vi.waitFor(() =>
      expect(status?.textContent).toBe('Proposed — review it above to ratify or dismiss.'),
    );
    await vi.waitFor(() => expect(btn.disabled).toBe(false));
  });

  it('does not submit blank text', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => stateWith({}) } as unknown as Response;
    }) as unknown as typeof fetch;

    const form = document.querySelector('[data-soul-edit]') as HTMLFormElement;
    const textarea = form.querySelector('textarea[name="text"]') as HTMLTextAreaElement;
    textarea.value = '   ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(calls).not.toContain('/api/project/soul-propose');
  });
});

describe('Fleet card i18n — Remove button + SOUL editor entry (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the Remove button and SOUL editor entry with their STRINGS keys', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.card-remove')?.getAttribute('data-i18n')).toBe('removeCard');
    expect(document.querySelector('.soul-editor-summary')?.getAttribute('data-i18n')).toBe(
      'soulEditorSummary',
    );
    const label = document.querySelector('.soul-editor-form label');
    expect(label?.getAttribute('data-i18n')).toBe('soulEditorLabel');
    const submit = document.querySelector('.soul-editor-form button[type="submit"]');
    expect(submit?.getAttribute('data-i18n')).toBe('soulEditorSubmit');
  });

  it('tags the SOUL proposal panel and un-ratify chip with their STRINGS keys', async () => {
    boot(stateWith({ soulProposed: 'a mined amendment', soulPrevious: 'the old soul text' }));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.soul-proposal-summary')?.getAttribute('data-i18n')).toBe(
      'soulProposalSummary',
    );
    expect(document.querySelector('[data-soul-ratify]')?.getAttribute('data-i18n')).toBe(
      'soulRatify',
    );
    expect(document.querySelector('[data-soul-dismiss]')?.getAttribute('data-i18n')).toBe(
      'soulDismiss',
    );
    expect(document.querySelector('[data-soul-unratify]')?.getAttribute('data-i18n')).toBe(
      'soulUnratify',
    );
  });

  it('switching to Hebrew via the language switcher translates the card immediately', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const langBtn = document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement;
    expect(langBtn).not.toBeNull();
    langBtn.click();

    expect(document.querySelector('.card-remove')?.textContent).toBe(STRINGS.he.removeCard);
    expect(document.querySelector('.soul-editor-summary')?.textContent).toBe(
      STRINGS.he.soulEditorSummary,
    );
  });

  it('switching to Hebrew translates the SOUL proposal panel and un-ratify chip', async () => {
    boot(stateWith({ soulProposed: 'a mined amendment', soulPrevious: 'the old soul text' }));
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(document.querySelector('.soul-proposal-summary')?.textContent).toBe(
      STRINGS.he.soulProposalSummary,
    );
    expect(document.querySelector('[data-soul-ratify]')?.textContent).toBe(STRINGS.he.soulRatify);
    expect(document.querySelector('[data-soul-dismiss]')?.textContent).toBe(STRINGS.he.soulDismiss);
    expect(document.querySelector('[data-soul-unratify]')?.textContent).toBe(
      STRINGS.he.soulUnratify,
    );
  });

  it('a card actions section rebuilt by a live refresh after a locale switch still renders in the active locale', async () => {
    let current = stateWith({});
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => current }) as unknown as Response,
    );
    document.open();
    document.write(renderShell('p1'));
    document.close();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(document.querySelector('.card-remove')?.textContent).toBe(STRINGS.he.removeCard);

    // soulProposed changes the actions section's diff signature (see
    // card-sections.ts), forcing cardActions()/soulEditorPanel() to rebuild
    // fresh DOM nodes — exactly the case the English-only regression covered.
    current = stateWith({ soulProposed: 'a mined amendment' });
    await vi.advanceTimersByTimeAsync(4000);

    expect(document.querySelector('.card-remove')?.textContent).toBe(STRINGS.he.removeCard);
    expect(document.querySelector('.soul-editor-summary')?.textContent).toBe(
      STRINGS.he.soulEditorSummary,
    );
  });
});
