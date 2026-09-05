// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fleet card's "Add a task" form (`shell.ts`'s `tasksSection()`, the
 * human side of the board) sits directly above the Inbox "Drop a note" form
 * that `inbox-add-i18n.test.ts` covers — same builder, same DOM-call
 * construction the `pnpm i18n:untagged` scanner cannot see — yet its label
 * ("New task"), placeholder ("what should this autopilot do?"), "Add" button,
 * and the button's shared `data-tip`/`aria-label` were still plain English
 * after the Inbox form beside it was translated (board web-msnsndki-dz3vn1).
 * This pins the same tagging contract: keys present in every locale, English
 * defaults matching `STRINGS.en`, a Hebrew switch translating all four, and
 * the button's tip staying equal to its aria-label across the switch
 * (`task-add-button-tooltip.test.ts`'s accessibility contract).
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

function taskAddForm(): HTMLFormElement {
  return document.querySelector('[data-task-add]') as HTMLFormElement;
}

function expectKeyInEveryLocale(key: string | null): void {
  expect(key).toBeTruthy();
  for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
    expect(STRINGS[locale][key as StringKey]).toBeTruthy();
  }
}

describe('Tasks "Add a task" form i18n (board web-msnsndki-dz3vn1)', () => {
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

    const form = taskAddForm();
    const label = form.querySelector('label');
    const input = form.querySelector('input[name="title"]');
    const btn = form.querySelector('button');

    expect(label?.getAttribute('data-i18n')).toBe('taskNewLabel');
    expect(input?.getAttribute('data-i18n-placeholder')).toBe('taskNewPlaceholder');
    expect(btn?.getAttribute('data-i18n')).toBe('taskAdd');
    expect(btn?.getAttribute('data-i18n-tip')).toBe('taskAddTip');
    expect(btn?.getAttribute('data-i18n-aria')).toBe('taskAddTip');

    expectKeyInEveryLocale(label?.getAttribute('data-i18n') ?? null);
    expectKeyInEveryLocale(input?.getAttribute('data-i18n-placeholder') ?? null);
    expectKeyInEveryLocale(btn?.getAttribute('data-i18n') ?? null);
    expectKeyInEveryLocale(btn?.getAttribute('data-i18n-tip') ?? null);

    // English defaults still match the STRINGS.en entries the tags point at.
    expect(label?.textContent).toBe(STRINGS.en.taskNewLabel);
    expect(input?.getAttribute('placeholder')).toBe(STRINGS.en.taskNewPlaceholder);
    expect(btn?.textContent).toBe(STRINGS.en.taskAdd);
    expect(btn?.getAttribute('data-tip')).toBe(STRINGS.en.taskAddTip);
  });

  it('switching to Hebrew translates the form and keeps the button tip equal to its aria-label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const form = taskAddForm();
    const label = form.querySelector('label');
    const input = form.querySelector('input[name="title"]');
    const btn = form.querySelector('button');

    expect(label?.textContent).toBe(STRINGS.he.taskNewLabel);
    expect(input?.getAttribute('placeholder')).toBe(STRINGS.he.taskNewPlaceholder);
    expect(btn?.textContent).toBe(STRINGS.he.taskAdd);
    expect(btn?.getAttribute('data-tip')).toBe(STRINGS.he.taskAddTip);
    // task-add-button-tooltip.test.ts's accessibility contract: tip === aria-label.
    expect(btn?.getAttribute('aria-label')).toBe(btn?.getAttribute('data-tip'));
    // The Hebrew table actually translates rather than mirroring English.
    expect(STRINGS.he.taskNewLabel).not.toBe(STRINGS.en.taskNewLabel);
    expect(STRINGS.he.taskAddTip).not.toBe(STRINGS.en.taskAddTip);
  });

  it('the label keeps pointing at the input it names across the locale switch', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const form = taskAddForm();
    const label = form.querySelector('label');
    const input = form.querySelector('input[name="title"]');
    expect(label?.getAttribute('for')).toBe(input?.id);
  });
});
