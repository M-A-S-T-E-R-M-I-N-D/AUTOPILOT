// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fleet card's Inbox "Drop a note" form (`shell.ts`'s `tasksSection()`,
 * backlog I) had its heading and `<summary>` trigger translated in earlier
 * i18n slices (board web-msnsndki-dz3vn1), but the form behind that
 * disclosure — label, textarea placeholder, submit button, the button's
 * `data-tip`/`aria-label` — and the two `aria-live` status messages its
 * submit handler paints were still plain English. `pnpm i18n:untagged`
 * never flagged them: the form is built with DOM calls (`el()` /
 * `createElement`), not an HTML template the tag scanner can see. This
 * pins the tagging plus the `tr()`-at-paint-time route for the status text.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
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

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function inboxForm(): HTMLFormElement {
  return document.querySelector('[data-inbox-add]') as HTMLFormElement;
}

function expectKeyInEveryLocale(key: string | null): void {
  expect(key).toBeTruthy();
  for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
    expect(STRINGS[locale][key as StringKey]).toBeTruthy();
  }
}

describe('INBOX "Drop a note" form i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the label, placeholder, button, and button tip/aria with STRINGS keys present in every locale', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const form = inboxForm();
    const label = form.querySelector('label');
    const textarea = form.querySelector('textarea[name="message"]');
    const btn = form.querySelector('button');

    expect(label?.getAttribute('data-i18n')).toBe('inboxNoteLabel');
    expect(textarea?.getAttribute('data-i18n-placeholder')).toBe('inboxNotePlaceholder');
    expect(btn?.getAttribute('data-i18n')).toBe('inboxDropNote');
    expect(btn?.getAttribute('data-i18n-tip')).toBe('inboxDropNoteTip');
    expect(btn?.getAttribute('data-i18n-aria')).toBe('inboxDropNoteTip');

    expectKeyInEveryLocale(label?.getAttribute('data-i18n') ?? null);
    expectKeyInEveryLocale(textarea?.getAttribute('data-i18n-placeholder') ?? null);
    expectKeyInEveryLocale(btn?.getAttribute('data-i18n') ?? null);
    expectKeyInEveryLocale(btn?.getAttribute('data-i18n-tip') ?? null);

    // English defaults still match the STRINGS.en entries the tags point at.
    expect(label?.textContent).toBe(STRINGS.en.inboxNoteLabel);
    expect(textarea?.getAttribute('placeholder')).toBe(STRINGS.en.inboxNotePlaceholder);
    expect(btn?.textContent).toBe(STRINGS.en.inboxDropNote);
    expect(btn?.getAttribute('data-tip')).toBe(STRINGS.en.inboxDropNoteTip);
  });

  it('switching to Hebrew translates the form and keeps the button tip equal to its aria-label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const form = inboxForm();
    const label = form.querySelector('label');
    const textarea = form.querySelector('textarea[name="message"]');
    const btn = form.querySelector('button');

    expect(label?.textContent).toBe(STRINGS.he.inboxNoteLabel);
    expect(textarea?.getAttribute('placeholder')).toBe(STRINGS.he.inboxNotePlaceholder);
    expect(btn?.textContent).toBe(STRINGS.he.inboxDropNote);
    expect(btn?.getAttribute('data-tip')).toBe(STRINGS.he.inboxDropNoteTip);
    // inbox-add.test.ts's accessibility contract: tip text === aria-label.
    expect(btn?.getAttribute('aria-label')).toBe(btn?.getAttribute('data-tip'));
  });

  it("paints the submit status via tr('inboxNoteDropped') / tr('inboxNoteDropFailed'), not hardcoded literals", () => {
    const js = clientJs();
    expect(js).toContain("tr('inboxNoteDropped')");
    expect(js).toContain("tr('inboxNoteDropFailed')");
    expect(js).not.toContain("'Note dropped — the next firing will read it.'");
    expect(js).not.toContain("'Could not drop the note — try again.'");
  });

  it('reports a successful drop in Hebrew once the locale is Hebrew', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/inbox/add') {
        return {
          ok: true,
          json: async () => ({ ok: true, file: 'note.md' }),
        } as unknown as Response;
      }
      return realFetch(url, init);
    }) as unknown as typeof fetch;

    const form = inboxForm();
    const textarea = form.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    textarea.value = 'a note for the next firing';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const status = document.getElementById('inbox-status-p1');
    await vi.waitFor(() => expect(status?.textContent).toBe(STRINGS.he.inboxNoteDropped));
    expect(STRINGS.he.inboxNoteDropped).not.toBe(STRINGS.en.inboxNoteDropped);
  });
});
