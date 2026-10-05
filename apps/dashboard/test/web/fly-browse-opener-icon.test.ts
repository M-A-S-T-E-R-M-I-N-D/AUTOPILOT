// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the fly bar's Browse…
 * button. The "Browse a folder" dialog it opens heads with `folder-open` and
 * ends with icon-led Cancel, Close and "Use this folder", but the button that
 * opens it, first in the launch settings, was bare words.
 *
 * It leads with that same `folder-open`, since it opens the dialog that
 * opens a folder. Nothing is newly vendored, and the icon is decorative, so
 * the button's name stays its words. It is server-printed markup the locale
 * sweep keeps a leading icon in, so a Hebrew switch rewrites only the words.
 * Drives the REAL client bundle in jsdom, the way
 * browse-dialog-action-icons.test.ts does.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

const LISTING = {
  path: '/srv/projects',
  parent: '/srv',
  entries: [{ name: 'checkout-web', path: '/srv/projects/checkout-web' }],
};

const FLEET_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [] as unknown[],
  empty: true,
};

function boot(): void {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    if (href.startsWith('/api/browse-folder')) {
      return { ok: true, json: async () => LISTING } as unknown as Response;
    }
    return { ok: true, json: async () => FLEET_STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  document.open();
  document.write(renderShell());
  document.close();
  new Function(clientJs())();
}

const browseBtn = (): HTMLButtonElement =>
  document.getElementById('fly-browse-btn') as HTMLButtonElement;

/** The button leads with the decorative folder-open, drawn shape for shape
 *  from the vendored data, and is named by its words. */
function expectFolderOpen(words: string): void {
  const b = browseBtn();
  const first = b.firstElementChild;
  expect(first).not.toBeNull();
  expect(first!.tagName.toLowerCase()).toBe('svg');
  expect(first!.getAttribute('class')).toBe('icon icon-folder-open');
  expect(first!.getAttribute('aria-hidden')).toBe('true');
  expect(first!.getAttribute('focusable')).toBe('false');
  expect([...first!.children].map((c) => c.tagName.toLowerCase())).toEqual(
    ICON_SHAPES['folder-open']!.map(([tag]) => tag),
  );
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.textContent).toBe(words);
  expect(b.hasAttribute('aria-label')).toBe(false);
}

describe('the fly bar’s Browse… leads with the vendored folder-open (epic 0025)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Browse… with folder-open, decorative, named by its words', () => {
    boot();

    expectFolderOpen(STRINGS.en.browse);
    expect(browseBtn().getAttribute('data-i18n')).toBe('browse');
  });

  it('draws the same icon the dialog it opens heads with', async () => {
    boot();
    const opener = browseBtn().querySelector('svg')!.outerHTML;

    browseBtn().click();
    await vi.waitFor(() => {
      expect(document.querySelector('.browse-actions')).not.toBeNull();
    });

    const title = document.querySelector('.browse-dialog svg.icon-folder-open');
    expect(title).not.toBeNull();
    expect([...title!.children].map((c) => c.outerHTML)).toEqual(
      [...browseBtn().querySelector('svg')!.children].map((c) => c.outerHTML),
    );
    // Opening the dialog leaves the opener's icon where it was.
    expect(browseBtn().querySelector('svg')!.outerHTML).toBe(opener);
  });

  it('a Hebrew switch rewrites the words beside the same icon, and back', async () => {
    boot();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-lang-btn="he"]')).not.toBeNull();
    });

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expectFolderOpen(STRINGS.he.browse);

    (document.querySelector('[data-lang-btn="en"]') as HTMLButtonElement).click();
    expectFolderOpen(STRINGS.en.browse);
  });

  it('spaces the icon from its words, like the other icon-led buttons', () => {
    expect(layoutCss()).toContain('#fly-browse-btn > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the open launch settings axe-clean (WCAG A/AA)', async () => {
    boot();
    (document.getElementById('fly-options-toggle') as HTMLButtonElement).click();
    expect((document.getElementById('fly-options') as HTMLElement).hidden).toBe(false);

    const results = await axe.run(document.getElementById('fly-form') as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
