// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Composer language doctrine (operator addendum, 2026-09-06), rule 2, on the
 * CONNECT popover's "Report a bug or request a feature upstream" form: the
 * report language is CHOOSABLE there too, not only in the right-click report
 * dialog (`report-menu.test.ts` pins that one). The select defaults to the
 * page's locale, offers "Same as my note", travels with Compose as the
 * `language` field, and a note that reads as another language is surfaced in
 * the compose status line. Boots the FULL `clientJs()` bundle, the way
 * `report-menu.test.ts` does: the select is built by the same hoisted
 * `reportLanguageSelect()` the dialog uses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  ) as unknown as typeof fetch;
  new Function(clientJs())();
}

function languageSelect(): HTMLSelectElement {
  return document.getElementById('gh-issue-language') as HTMLSelectElement;
}

function openReportForm(): void {
  const details = document.querySelector('details.gh-report') as HTMLDetailsElement;
  details.open = true;
  details.dispatchEvent(new Event('toggle'));
}

describe('the CONNECT report form lets the reporter choose the report language', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.lang = 'en';
  });

  it('offers a labelled select, each locale named in its own script, beside the note', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const select = languageSelect();
    expect(select).not.toBeNull();
    expect(select.form?.id).toBe('gh-issue-form');
    expect(document.querySelector('label[for="gh-issue-language"]')?.textContent).toBe(
      STRINGS.en.reportLanguageLabel,
    );
    expect(select.getAttribute('data-tip')).toBe(STRINGS.en.reportLanguageTip);
    expect(Array.from(select.options, (o) => [o.value, o.lang, o.textContent])).toEqual([
      ['', '', STRINGS.en.reportLanguageNote],
      ['en', 'en', 'English'],
      ['he', 'he', 'עברית'],
    ]);
    // It sits between the note and the Compose button it governs.
    const compose = document.getElementById('gh-issue-compose');
    expect(select.nextElementSibling).toBe(compose);
    expect(
      document.getElementById('gh-issue-note')!.compareDocumentPosition(select) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('retranslates with the page: the label, note option and tip carry their STRINGS keys', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const select = languageSelect();
    expect(
      document.querySelector('label[for="gh-issue-language"]')?.getAttribute('data-i18n'),
    ).toBe('reportLanguageLabel');
    expect(select.options[0]?.getAttribute('data-i18n')).toBe('reportLanguageNote');
    expect(select.getAttribute('data-i18n-tip')).toBe('reportLanguageTip');
  });

  it("defaults to the page's locale, following it until the reporter picks one", async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const select = languageSelect();
    expect(select.value).toBe('en');

    document.documentElement.lang = 'he';
    openReportForm();
    expect(select.value).toBe('he');

    select.value = '';
    select.dispatchEvent(new Event('change'));
    document.documentElement.lang = 'en';
    openReportForm();
    expect(select.value).toBe('');
  });

  it('Compose posts the chosen report language, and none for "Same as my note"', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    (document.getElementById('gh-issue-note') as HTMLTextAreaElement).value = 'raw note';
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return { ok: true, json: async () => ({ ok: false, reasoning: 'nope' }) } as Response;
    }) as unknown as typeof fetch;
    const select = languageSelect();
    const compose = document.getElementById('gh-issue-compose') as HTMLButtonElement;

    select.value = 'he';
    compose.click();
    await vi.advanceTimersByTimeAsync(1);
    select.value = '';
    compose.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(bodies[0]).toEqual({ description: 'raw note', language: 'he' });
    expect(bodies[1]).toEqual({ description: 'raw note' });
  });

  it('a compose whose note reads as another language says so, naming the way back', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    (document.getElementById('gh-issue-note') as HTMLTextAreaElement).value = 'הכפתור מושבת';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        title: 'The button is disabled',
        body: 'Detailed body text.',
        labels: ['bug'],
        noteLanguageDiffers: true,
      }),
    })) as unknown as typeof fetch;

    (document.getElementById('gh-issue-compose') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    const status = document.getElementById('gh-issue-compose-status')?.textContent ?? '';
    expect(status.endsWith('then submit. ' + STRINGS.en.composeNoteLanguageDiffers)).toBe(true);
    expect((document.getElementById('gh-issue-title') as HTMLInputElement).value).toBe(
      'The button is disabled',
    );
  });
});
