// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Docs reader's editor
 * actions. The Edit toggle that opens the split-preview editor leads with
 * `pencil`, but the Save and Cancel under the editor were bare words beside
 * the Plan editor's iconed Publish and Discard draft.
 *
 * Save writes the draft and Cancel throws it away, the same decision over a
 * draft that Publish and Discard draft make, so they take that pair's `check`
 * and `x`; nothing is newly vendored. Each icon is decorative, so a button's
 * name stays its words, and each label already sits in an inner `[data-i18n]`
 * span, so a locale switch rewrites the words beside the icon.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

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
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

const DOC_PATH = 'docs/hello.md';

const ACTIONS = [
  ['data-doc-edit-save', 'check', 'docsEditSave'],
  ['data-doc-edit-cancel', 'x', 'docsEditCancel'],
] as const satisfies readonly (readonly [string, string, StringKey])[];

/** Boots the project page with one Markdown doc; a save is refused. */
function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/api/docs/write')) {
      return {
        ok: true,
        json: async () => ({ ok: false, reason: 'outside the allow-list' }),
      } as unknown as Response;
    }
    if (url.includes('/api/file')) {
      return {
        ok: true,
        json: async () => ({
          path: DOC_PATH,
          content: '# Hello world',
          touchedAt: null,
          brokenLinks: [],
          linksHere: [],
        }),
      } as unknown as Response;
    }
    if (url.includes('/api/docs')) {
      return { ok: true, json: async () => ({ files: [DOC_PATH] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function openEditor(): Promise<void> {
  await settle();
  (document.querySelector('.docs-list .docs-file') as HTMLButtonElement).click();
  await settle();
  (document.querySelector('[data-doc-edit-toggle]') as HTMLButtonElement).click();
  await settle();
}

function expectIconButton(
  attr: (typeof ACTIONS)[number][0],
  icon: string,
  key: StringKey,
  locale: 'en' | 'he',
): void {
  const button = document.querySelector(`[${attr}]`) as HTMLButtonElement;
  expect(button).not.toBeNull();
  const svg = button.firstElementChild;
  expect(svg?.getAttribute('class')).toBe('icon icon-' + icon);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path, line, circle, polyline').length).toBeGreaterThan(0);
  expect(button.querySelectorAll('svg')).toHaveLength(1);
  expect(button.querySelector('[data-i18n]')?.getAttribute('data-i18n')).toBe(key);
  expect(button.textContent).toBe(STRINGS[locale][key]);
  expect(button.hasAttribute('aria-label')).toBe(false);
}

describe('the Docs reader editor actions lead with vendored icons (epic 0025 slice 2)', () => {
  afterEach(() => {
    // applyLocale() persists a Hebrew switch (ADR 0012).
    localStorage.clear();
    vi.restoreAllMocks();
  });

  for (const [attr, icon, key] of ACTIONS) {
    it(`${key} draws ${icon} before its words, which stay its name`, async () => {
      boot();
      await openEditor();

      expectIconButton(attr, icon, key, 'en');
    });
  }

  it('keeps each icon beside Hebrew words after a locale switch', async () => {
    boot();
    await openEditor();
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const [attr, icon, key] of ACTIONS) expectIconButton(attr, icon, key, 'he');
  });

  it('Save keeps its icon through a refused save', async () => {
    boot();
    await openEditor();
    const save = document.querySelector('[data-doc-edit-save]') as HTMLButtonElement;
    save.click();

    expect(save.disabled).toBe(true);
    expectIconButton('data-doc-edit-save', 'check', 'docsEditSave', 'en');
    await settle();
    await settle();

    expect(document.querySelector('.docs-editor-result')?.textContent).toBe(
      '✗ outside the allow-list',
    );
    expect(save.disabled).toBe(false);
    expectIconButton('data-doc-edit-save', 'check', 'docsEditSave', 'en');
  });

  it('sits each icon a gap before the words, like the Plan editor actions', () => {
    expect(layoutCss()).toContain(
      '.docs-editor-save > .icon, .docs-editor-cancel > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the editor actions axe-clean (WCAG A/AA)', async () => {
    boot();
    await openEditor();
    const actions = document.querySelector('.docs-editor-actions') as Element;
    expect(actions).not.toBeNull();

    const results = await axe.run(actions, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
