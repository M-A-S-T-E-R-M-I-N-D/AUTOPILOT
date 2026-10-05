// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Fly bar's browse-folder
 * dialog's actions. Its title leads with `folder-open`, but the buttons that
 * end it were bare words: Cancel and "Use this folder" under a listing, and
 * Close under the error paint.
 *
 * Cancel and Close lead with the `x` the Docs editor's Cancel, the What's new
 * Close and the replay's Exit draw, since each puts the dialog away and
 * changes nothing; "Use this folder" leads with the `check` the Docs editor's
 * Save draws, since it accepts the folder into the Fly bar. Nothing is newly
 * vendored. Each icon is decorative, so a button's name stays its words, and
 * the buttons are built fresh with `tr()` on every paint, so a Hebrew page
 * paints Hebrew words beside the same icons.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

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

function boot(browseOk: boolean): void {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    if (href.startsWith('/api/browse-folder')) {
      return browseOk
        ? ({ ok: true, json: async () => LISTING } as unknown as Response)
        : ({ ok: false, json: async () => ({}) } as unknown as Response);
    }
    return { ok: true, json: async () => FLEET_STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  document.open();
  document.write(renderShell());
  document.close();
  new Function(clientJs())();
}

async function openBrowse(): Promise<HTMLElement> {
  await vi.waitFor(() => {
    expect(document.getElementById('fly-browse-btn')).not.toBeNull();
  });
  (document.getElementById('fly-browse-btn') as HTMLButtonElement).click();
  await vi.waitFor(() => {
    expect(document.querySelector('.browse-actions')).not.toBeNull();
  });
  return document.querySelector('.browse-actions') as HTMLElement;
}

function actionButtons(actions: HTMLElement): HTMLButtonElement[] {
  return Array.from(actions.querySelectorAll('button'));
}

function expectLeadingIcon(button: HTMLButtonElement, name: string, words: string): void {
  const icon = button.firstElementChild;
  expect(icon?.getAttribute('class')).toBe(`icon icon-${name}`);
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.querySelectorAll('path').length).toBeGreaterThan(0);
  expect(button.querySelectorAll('svg')).toHaveLength(1);
  expect(button.textContent).toBe(words);
  expect(button.hasAttribute('aria-label')).toBe(false);
}

describe('the browse-folder dialog actions (epic 0025 slice 2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Cancel with x and Use this folder with check under a listing', async () => {
    boot(true);

    const [cancel, use] = actionButtons(await openBrowse());

    expectLeadingIcon(cancel as HTMLButtonElement, 'x', STRINGS.en.cancel);
    expectLeadingIcon(use as HTMLButtonElement, 'check', STRINGS.en.useThisFolder);
    expect(use?.className).toBe('browse-use');
  });

  it('leads the error paint Close with x', async () => {
    boot(false);

    const buttons = actionButtons(await openBrowse());

    expect(buttons).toHaveLength(1);
    expectLeadingIcon(buttons[0] as HTMLButtonElement, 'x', STRINGS.en.close);
  });

  it('still hands the listed folder to the Fly bar when Use this folder is clicked', async () => {
    boot(true);
    const [, use] = actionButtons(await openBrowse());

    (use as HTMLButtonElement).click();

    expect((document.getElementById('fly-folder') as HTMLInputElement).value).toBe(LISTING.path);
    expect((document.querySelector('.browse-overlay') as HTMLElement).hidden).toBe(true);
  });

  it('paints Hebrew words beside the same icons on a Hebrew page', async () => {
    boot(true);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-lang-btn="he"]')).not.toBeNull();
    });
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const [cancel, use] = actionButtons(await openBrowse());

    expectLeadingIcon(cancel as HTMLButtonElement, 'x', STRINGS.he.cancel);
    expectLeadingIcon(use as HTMLButtonElement, 'check', STRINGS.he.useThisFolder);
  });

  it('sits each icon a gap before the words, like the other icon-led buttons', () => {
    expect(layoutCss()).toContain('.browse-actions button > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the dialog axe-clean (WCAG A/AA)', async () => {
    boot(true);
    await openBrowse();
    const dialog = document.querySelector('.browse-dialog') as Element;

    const results = await axe.run(dialog, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
