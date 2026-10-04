// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 (board web-mtywp7zq-55f3o9): the What's new message's Close. The
 * title and every section heading lead with a stroke icon, and the Settings
 * row that reopens the message leads with `sparkles`, yet the accent-filled
 * Close in its footer was bare words. It leads with the `x` the Docs
 * editor's Cancel and the Plan editor's Discard draft draw, since it puts the
 * message away; nothing is newly vendored. The icon is decorative, so the
 * button's name stays its words, and the chunk splices the shape itself the
 * way it does the headings'. Executes the ACTUAL chunk
 * (`whatsNewClientJs()`) in jsdom, the convention `whats-new-client.test.ts`
 * uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import {
  whatsNewClientJs,
  whatsNewCss,
  WHATS_NEW_SEEN_KEY,
  WHATS_NEW_STRINGS,
} from '../../src/web/whats-new.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

const VERSION = '0.54.0';

/** Boots the chunk for a returning viewer on a new version, so it opens. */
function boot(): void {
  new Function(whatsNewClientJs(VERSION))();
}

const close = (): HTMLButtonElement => document.querySelector('.wn-close') as HTMLButtonElement;

/** The button leads with the decorative `x`, drawn shape for shape from the
 *  vendored data, and is named by its words. */
function expectIconed(b: HTMLButtonElement): void {
  const first = b.firstElementChild;
  expect(first).not.toBeNull();
  expect(first!.tagName.toLowerCase()).toBe('svg');
  expect(first!.getAttribute('class')).toBe('icon icon-x');
  expect(first!.getAttribute('aria-hidden')).toBe('true');
  expect(first!.getAttribute('focusable')).toBe('false');
  const shapes = ICON_SHAPES['x']!;
  expect([...first!.children].map((c) => c.tagName.toLowerCase())).toEqual(
    shapes.map(([tag]) => tag),
  );
  shapes.forEach(([, attrs], i) => {
    for (const [k, v] of Object.entries(attrs)) {
      expect(first!.children[i]!.getAttribute(k), k).toBe(v);
    }
  });
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.hasAttribute('aria-label')).toBe(false);
}

describe("the What's new Close leads with a stroke icon (epic 0025)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ap-tour-seen', '1');
    localStorage.setItem(WHATS_NEW_SEEN_KEY, '0.53.0');
    document.documentElement.lang = 'en';
    document.head.innerHTML = '<title>AUTOPILOT</title>';
    document.body.innerHTML =
      '<main><h1>Fleet</h1><details id="settings-menu"><summary>Settings</summary><div class="settings-body"></div></details></main>';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leads Close with x and keeps its words as its name', () => {
    boot();

    expectIconed(close());
    expect(close().textContent).toBe(WHATS_NEW_STRINGS.en.close);
    expect(document.activeElement).toBe(close());
  });

  it('paints Hebrew words beside the same icon when the interface speaks Hebrew', () => {
    document.documentElement.lang = 'he';
    boot();

    expectIconed(close());
    expect(close().textContent).toBe(WHATS_NEW_STRINGS.he.close);
  });

  it('a click on the icon still closes the message and records the version', () => {
    boot();

    close().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.wn-dialog')).toBeNull();
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe(VERSION);
  });

  it('ships the x shape spliced from the vendored set, never hand-written markup (law 1)', () => {
    const chunk = whatsNewClientJs(VERSION);
    expect(chunk).toContain(JSON.stringify(ICON_SHAPES['x']));
    expect(chunk).not.toContain('<svg');
  });

  it('spaces the icon from its words', () => {
    expect(whatsNewCss()).toContain('.wn-close > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the open message axe-clean (WCAG A/AA)', async () => {
    boot();
    const results = await axe.run(document.querySelector('.wn-dialog') as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
