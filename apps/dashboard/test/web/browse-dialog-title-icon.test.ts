// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Fly bar's browse-folder
 * dialog title. The Ask sheet, the command palette and the report dialog head
 * with a stroke icon beside their words, but "Browse a folder" headed its
 * modal with bare words on both paints, the listing and the error. It leads
 * with a newly vendored `folder-open` now, since the dialog opens a folder
 * and lists what is inside it.
 *
 * The icon is decorative, so the name the dialog takes through
 * `aria-labelledby` stays the words alone. The title is built fresh with
 * `tr()` on every paint (no `[data-i18n]` sweep revisits it), so a Hebrew
 * page paints Hebrew words beside the same icon.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
    expect(document.getElementById('browse-title')).not.toBeNull();
  });
  return document.getElementById('browse-title') as HTMLElement;
}

function expectIconedTitle(title: HTMLElement, words: string): void {
  expect(title.tagName).toBe('H2');
  const icon = title.firstElementChild;
  expect(icon?.getAttribute('class')).toBe('icon icon-folder-open');
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.querySelectorAll('path').length).toBeGreaterThan(0);
  expect(title.querySelectorAll('svg')).toHaveLength(1);
  expect(title.textContent).toBe(words);
  expect(title.closest('.browse-dialog')?.getAttribute('aria-labelledby')).toBe('browse-title');
}

describe('the browse-folder dialog title (epic 0025 slice 2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    { paint: 'listing', ok: true },
    { paint: 'error', ok: false },
  ])('leads with the decorative folder-open icon on the $paint paint', async ({ ok }) => {
    boot(ok);

    const title = await openBrowse();

    expectIconedTitle(title, STRINGS.en.browseFolderTitle);
  });

  it('paints Hebrew words beside the same icon on a Hebrew page', async () => {
    boot(true);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-lang-btn="he"]')).not.toBeNull();
    });
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const title = await openBrowse();

    expectIconedTitle(title, STRINGS.he.browseFolderTitle);
  });
});
