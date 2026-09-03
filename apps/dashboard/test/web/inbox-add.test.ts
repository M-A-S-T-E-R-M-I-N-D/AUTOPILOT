// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * INBOX message box (backlog I, web-msnt26uk-osohaz): the dashboard's write
 * side of the INBOX/ convention already read by every firing
 * (packages/engine/src/inbox.ts). Verifies the form renders accessibly on
 * the project detail panel and POSTs a trimmed note to /api/inbox/add.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [],
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

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('INBOX message box', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a labelled textarea and a self-explaining submit button', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const form = document.querySelector('[data-inbox-add]');
    expect(form?.getAttribute('data-inbox-add')).toBe('p1');
    const textarea = form?.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    const label = form?.querySelector('label');
    expect(label?.getAttribute('for')).toBe(textarea.id);

    const btn = form?.querySelector('button');
    const tip = btn?.getAttribute('data-tip');
    expect(tip).toBeTruthy();
    expect(tip).toBe(btn?.getAttribute('aria-label'));
  });

  it('POSTs the trimmed message to /api/inbox/add and reports success', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const calls: { url: string; body: unknown }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/inbox/add') {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return {
          ok: true,
          json: async () => ({ ok: true, file: 'note.md' }),
        } as unknown as Response;
      }
      return realFetch(url, init);
    }) as unknown as typeof fetch;

    const form = document.querySelector('[data-inbox-add]') as HTMLFormElement;
    const textarea = form.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    textarea.value = '  a note for the next firing  ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    // >=1, not ===1: this suite's document-level `submit` listener is
    // registered once per `boot()` call and jsdom's `document` (unlike its
    // body) survives across `it()` blocks in one file, so an earlier test's
    // listener can still be attached — the LAST call is what this submit
    // actually produced, which is what matters here.
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));

    expect(calls[calls.length - 1]?.body).toEqual({
      project: 'p1',
      message: 'a note for the next firing',
    });
    await vi.waitFor(() => expect(textarea.value).toBe(''));
    const status = document.getElementById('inbox-status-p1');
    expect(status?.textContent).toBe('Note dropped — the next firing will read it.');
  });

  it('does not submit a blank note', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => STATE } as unknown as Response;
    }) as unknown as typeof fetch;

    const form = document.querySelector('[data-inbox-add]') as HTMLFormElement;
    const textarea = form.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    textarea.value = '   ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(calls).not.toContain('/api/inbox/add');
  });
});
