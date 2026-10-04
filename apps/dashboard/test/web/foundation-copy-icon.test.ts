// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE FOUNDATION PANEL'S COPY ADDRESS LEADS WITH A STROKE ICON (epic 0025
 * slice 2; board web-mtywp7zq-55f3o9). The masthead heart's disclosure
 * lists each verified donation address beside its QR, and the button that
 * copies it was bare words. It leads with the vendored `copy`, and a copy
 * that lands swaps it for the `check` the Docs editor's Save draws while
 * the words read "Copied!", then puts both back. The words change through
 * `setSweptText()`, so the button never loses its icon, and a refused copy
 * changes nothing. Executes the ACTUAL client bundle (`clientJs()`) in
 * jsdom, the convention `pool-client-button-icons.test.ts` uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const ENTRIES = [
  {
    chain: 'btc',
    label: 'Foundation treasury',
    address: 'bc1qexampleaddress0000000000000000000000',
  },
];

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function boot(): void {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/donations')) return json({ entries: ENTRIES });
    return json({ generatedAt: 1, totals: {}, projects: [], empty: true });
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
}

async function copyButton(): Promise<HTMLButtonElement> {
  await vi.waitFor(() => {
    expect(document.querySelector('.foundation-copy')).not.toBeNull();
  });
  return document.querySelector('.foundation-copy') as HTMLButtonElement;
}

/** The button's leading child is the named decorative icon, and the only one. */
function expectLeadingIcon(b: Element, name: string): void {
  const first = b.firstElementChild;
  expect(first?.tagName.toLowerCase()).toBe('svg');
  expect(first?.classList.contains('icon-' + name)).toBe(true);
  expect(first?.getAttribute('aria-hidden')).toBe('true');
  expect(b.querySelectorAll('svg.icon')).toHaveLength(1);
}

describe('the Foundation panel’s Copy address leads with a stroke icon (epic 0025)', () => {
  beforeEach(() => {
    localStorage.removeItem('ap-locale');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.removeItem('ap-locale');
  });

  it('leads with the vendored copy, its words and name unchanged', async () => {
    stubClipboard(async () => {});
    boot();

    const b = await copyButton();

    expectLeadingIcon(b, 'copy');
    expect(b.textContent).toBe('Copy address');
    expect(b.hasAttribute('aria-label')).toBe(false);
  });

  it('a landed copy shows check and Copied, then puts the copy and its words back', async () => {
    stubClipboard(async () => {});
    boot();
    const b = await copyButton();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    b.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ENTRIES[0]!.address);
    expectLeadingIcon(b, 'check');
    expect(b.textContent).toBe(STRINGS.en.foundationCopied);
    await vi.advanceTimersByTimeAsync(2000);
    expectLeadingIcon(b, 'copy');
    expect(b.textContent).toBe('Copy address');
  });

  it('a refused copy leaves the copy icon and its words alone', async () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    boot();
    const b = await copyButton();

    b.click();
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expectLeadingIcon(b, 'copy');
    expect(b.textContent).toBe('Copy address');
  });

  it('a Hebrew page paints its words beside the same icons', async () => {
    localStorage.setItem('ap-locale', 'he');
    stubClipboard(async () => {});
    boot();
    const b = await copyButton();

    expectLeadingIcon(b, 'copy');
    expect(b.textContent).toBe(STRINGS.he.foundationCopyAddress);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    b.click();
    await vi.advanceTimersByTimeAsync(0);
    expectLeadingIcon(b, 'check');
    expect(b.textContent).toBe(STRINGS.he.foundationCopied);
  });

  it('sits the icon a gap before the words, like the other icon-led buttons', () => {
    expect(layoutCss()).toContain('.foundation-copy > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the address row axe-clean (WCAG A/AA)', async () => {
    stubClipboard(async () => {});
    boot();
    await copyButton();
    const row = document.querySelector('.foundation-row') as Element;

    const results = await axe.run(row, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
