// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the three write forms'
 * submit buttons. The task board's Add, the inbox's Drop note and the SOUL
 * editor's Propose edit share one accent-filled button style, yet each was
 * bare words beside the iconed execute buttons, and beside the Unlock to edit
 * toggle that sits next to Propose edit with its `lock`.
 *
 * Add leads with the zoom bar's `plus`, since it puts a new row on the board.
 * Drop note and Propose edit take the icon their own disclosure's summary
 * draws, the way the triage runs take their heading's: `inbox` and `pencil`.
 * Nothing is newly vendored. Each icon is decorative, so a button's name stays
 * its tip; a submit only disables the button, and the locale sweep keeps a
 * leading icon, so the icon survives both.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

// Every boot re-registers the client's document/window listeners; strip them
// after each test so a stale bundle's delegate never answers a later submit.
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
  soul: '# SOUL\n',
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

interface FormCase {
  name: string;
  page: string;
  form: string;
  icon: string;
  key: StringKey;
}

const CASES: FormCase[] = [
  {
    name: 'Add',
    page: 'p1',
    form: '[data-task-add="p1"]',
    icon: 'plus',
    key: 'taskAdd',
  },
  {
    name: 'Drop note',
    page: 'p1',
    form: '[data-inbox-add="p1"]',
    icon: 'inbox',
    key: 'inboxDropNote',
  },
  {
    name: 'Propose edit',
    page: '',
    form: '[data-soul-edit="p1"]',
    icon: 'pencil',
    key: 'soulEditorSubmit',
  },
];

/** The write endpoints never answer, so a submit stays in flight. */
async function boot(page: string): Promise<void> {
  document.open();
  document.write(renderShell(page));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(async (url: unknown) => {
    if (/\/api\/(task\/create|inbox\/add|project\/soul-propose)/.test(String(url))) {
      return new Promise<Response>(() => {});
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function submitButton(c: FormCase): HTMLButtonElement {
  const button = document.querySelector(`${c.form} button[type="submit"]`) as HTMLButtonElement;
  expect(button).not.toBeNull();
  return button;
}

function expectIconButton(c: FormCase, locale: 'en' | 'he'): void {
  const button = submitButton(c);
  const svg = button.firstElementChild;
  expect(svg?.getAttribute('class')).toBe(`icon icon-${c.icon}`);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path, line, rect, circle, polyline').length).toBeGreaterThan(0);
  expect(button.querySelectorAll('svg')).toHaveLength(1);
  expect(button.getAttribute('data-i18n')).toBe(c.key);
  expect(button.textContent).toBe(STRINGS[locale][c.key]);
}

/** Fills the form's field (unlocking the SOUL editor first) and submits it. */
function fillAndSubmit(c: FormCase): void {
  const form = document.querySelector(c.form) as HTMLFormElement;
  const unlock = form.querySelector('[data-soul-unlock]') as HTMLButtonElement | null;
  if (unlock) unlock.click();
  const field = form.querySelector('input[name="title"], textarea') as
    HTMLInputElement | HTMLTextAreaElement;
  field.value = 'a new line';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('the write forms’ submit buttons lead with vendored icons (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    // applyLocale() persists a Hebrew switch (ADR 0012).
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  for (const c of CASES) {
    it(`${c.name} draws ${c.icon} before its words, keeping its tip as its name`, async () => {
      await boot(c.page);

      expectIconButton(c, 'en');
      const button = submitButton(c);
      expect(button.getAttribute('aria-label')).toBe(button.getAttribute('data-tip'));
    });

    it(`${c.name} keeps its icon beside Hebrew words, tick after tick`, async () => {
      await boot(c.page);
      (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

      expectIconButton(c, 'he');
      await vi.advanceTimersByTimeAsync(5000);
      expectIconButton(c, 'he');
    });

    it(`${c.name} keeps its icon while a submit is in flight`, async () => {
      await boot(c.page);
      fillAndSubmit(c);

      expect(submitButton(c).disabled).toBe(true);
      expectIconButton(c, 'en');
    });
  }

  it('sits each icon a gap before the words, like the execute buttons', () => {
    expect(layoutCss()).toContain(
      '.task-add button > .icon, .inbox-add button > .icon, .soul-editor-form button > .icon { margin-inline-end: 0.35em; }',
    );
  });

  for (const c of CASES) {
    it(`leaves the ${c.name} form axe-clean (WCAG A/AA)`, async () => {
      await boot(c.page);
      const form = document.querySelector(c.form) as Element;
      const disclosure = form.closest('details');
      if (disclosure) disclosure.open = true;
      // Real timers for axe's own scheduling; the form is already painted.
      vi.useRealTimers();

      const results = await axe.run(form, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results.violations).toEqual([]);
    });
  }
});
