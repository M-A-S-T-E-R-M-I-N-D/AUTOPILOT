// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): the publicity
 * affordances row gave every link its own unconditional Tab stop — the same
 * anti-pattern already fixed for the fleet-card meta chips, language bar,
 * and search-hits list. Only the first link is a real Tab stop now;
 * Left/Right/Home/End move it, matching the chip-row pattern (wireRoving).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 0,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [],
  empty: true,
};

const AFFORDANCES = [
  {
    id: 'repo',
    label: 'View repo',
    url: 'https://github.com/octocat/hello-world',
    dormant: false,
    reasoning: 'octocat/hello-world is public — publicity affordances are live',
  },
  {
    id: 'watch',
    label: 'Watch',
    url: '#',
    dormant: true,
    reasoning:
      'octocat/hello-world is private — publicity affordances stay dormant until it goes public',
  },
  {
    id: 'star',
    label: 'Star',
    url: '#',
    dormant: true,
    reasoning:
      'octocat/hello-world is private — publicity affordances stay dormant until it goes public',
  },
];

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const href = String(url);
    if (href.includes('/api/publicity')) {
      return { ok: true, json: async () => ({ affordances: AFFORDANCES }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  await Promise.resolve();
  await Promise.resolve();
}

function links(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.publicity-link'));
}

describe('publicity affordances row uses roving tabindex', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('only the first link is a real Tab stop; the rest start at -1', async () => {
    await boot();
    const items = links();
    expect(items).toHaveLength(3);
    expect(items[0]?.getAttribute('tabindex')).toBe('0');
    expect(items[1]?.getAttribute('tabindex')).toBe('-1');
    expect(items[2]?.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight moves the Tab stop to the next link and focuses it', async () => {
    await boot();
    const items = links();
    items[0]?.focus();
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(items[0]?.getAttribute('tabindex')).toBe('-1');
    expect(items[1]?.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(items[1]);
  });

  it('ArrowLeft on the first link stays put (clamped)', async () => {
    await boot();
    const items = links();
    items[0]?.focus();
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(items[0]?.getAttribute('tabindex')).toBe('0');
    expect(items[1]?.getAttribute('tabindex')).toBe('-1');
  });

  it('End jumps to the last link, Home jumps back to the first', async () => {
    await boot();
    const items = links();
    items[0]?.focus();
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(items[2]?.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(items[2]);
    items[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(items[0]?.getAttribute('tabindex')).toBe('0');
    expect(items[2]?.getAttribute('tabindex')).toBe('-1');
  });
});
