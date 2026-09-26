// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE BENCHMARK PAGE (operator, 2026-09-26): the scoreboard per tier, the
 * cost-against-quality bubbles, every firing, and the leaderboard — drawn
 * from `/api/benchmark`, in the interface's language, accessible.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axe from 'axe-core';
import { benchmarkClientJs, BENCHMARK_STRINGS } from '../../src/web/benchmark-page.js';

const PAYLOAD = {
  generatedAt: Date.UTC(2026, 8, 26, 12),
  windowDays: 90,
  models: [
    {
      modelId: 'claude-opus-5-5',
      label: 'Opus 5.5',
      vendor: 'Anthropic',
      vendorId: 'anthropic',
      firings: 33,
      shipped: 32,
      died: 0,
      costUsd: 99,
      costPerShipUsd: 3.09,
      shipRate: 0.97,
      medianMinutes: 12.5,
      medianTurns: 40,
      firstAt: 1,
      lastAt: 2,
    },
    {
      modelId: 'local-model',
      label: 'local-model',
      vendor: 'Unknown',
      vendorId: 'unknown',
      firings: 2,
      shipped: 0,
      died: 1,
      costUsd: 0.4,
      costPerShipUsd: null,
      shipRate: 0,
      medianMinutes: 3,
      medianTurns: 8,
      firstAt: 1,
      lastAt: 2,
    },
  ],
  points: [
    { modelId: 'claude-opus-5-5', costUsd: 3, minutes: 12, turns: 40, outcome: 'shipped', at: 1 },
    { modelId: 'local-model', costUsd: 0.2, minutes: 3, turns: 8, outcome: 'died', at: 2 },
    { modelId: 'local-model', costUsd: 0.2, minutes: 3, turns: 8, outcome: 'no-ship', at: 3 },
  ],
  tiers: [
    {
      tier: 'escalated',
      phase: 'exploit',
      leader: 'opus',
      arms: [
        {
          alias: 'fable',
          modelId: 'claude-fable-5-1',
          firings: 15,
          shipped: 14,
          shipRate: 0.93,
          costPerShipUsd: 5.2,
        },
        {
          alias: 'opus',
          modelId: 'claude-opus-5-5',
          firings: 15,
          shipped: 15,
          shipRate: 1,
          costPerShipUsd: 2.7,
        },
      ],
    },
    {
      tier: 'mechanical',
      phase: 'explore',
      leader: null,
      arms: [
        {
          alias: 'haiku',
          modelId: null,
          firings: 0,
          shipped: 0,
          shipRate: null,
          costPerShipUsd: null,
        },
      ],
    },
  ],
  rule: { minFirings: 15, shipRateTolerance: 0.05, watchOneIn: 5 },
};

let intervals: ReturnType<typeof vi.spyOn>;

function boot(): void {
  new Function(benchmarkClientJs())();
}

async function painted(): Promise<void> {
  await vi.waitFor(() => expect(document.querySelector('.bm-table')).not.toBeNull());
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '<main id="benchmark" class="bm-page"></main>';
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => PAYLOAD,
  })) as unknown as typeof fetch;
  intervals = vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the benchmark page', () => {
  it('draws every tier, both charts and the leaderboard from the payload', async () => {
    boot();
    await painted();
    const tiers = [...document.querySelectorAll('.bm-tier')];
    expect(tiers).toHaveLength(2);
    expect(tiers[0]!.textContent).toContain('opus leads');
    expect(tiers[1]!.textContent).toContain('exploring');
    expect(document.querySelector('.bm-arm.is-leader b')!.textContent).toBe('opus');
    // A model that never shipped has no cost per ship, so no bubble.
    expect(
      document.querySelectorAll('.bm-chart')[0]!.querySelectorAll('circle.bm-dot'),
    ).toHaveLength(1);
    // Every firing is a mark: a filled dot, a ring, a cross.
    const firings = document.querySelectorAll('.bm-chart')[1]!;
    expect(firings.querySelectorAll('circle.bm-dot')).toHaveLength(2);
    expect(firings.querySelectorAll('circle.bm-ring')).toHaveLength(1);
    expect(firings.querySelectorAll('path.bm-cross')).toHaveLength(1);
    const rows = [...document.querySelectorAll('.bm-table tbody tr')].map((r) => r.textContent);
    expect(rows[0]).toContain('Opus 5.5');
    expect(rows[0]).toContain('97%');
    expect(rows[0]).toContain('$3.09');
    expect(rows[1]).toContain('-');
    expect(intervals).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it('gives one model one colour on every chart', async () => {
    boot();
    await painted();
    const opusClasses = new Set(
      [...document.querySelectorAll('.bm-chart circle.bm-dot:not(.bm-ring)')].map((c) =>
        [...c.classList].find((k) => /^bm-c\d$/.test(k)),
      ),
    );
    expect(opusClasses.size).toBe(1);
  });

  it('says it could not load rather than drawing empty charts', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => null,
    })) as unknown as typeof fetch;
    boot();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(BENCHMARK_STRINGS.en.failed),
    );
    expect(document.querySelector('.bm-chart')).toBeNull();
  });

  it('says so when nothing has flown yet', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...PAYLOAD, models: [], points: [] }),
    })) as unknown as typeof fetch;
    boot();
    await vi.waitFor(() => expect(document.body.textContent).toContain(BENCHMARK_STRINGS.en.empty));
  });

  it('speaks Hebrew, right to left, when the interface does', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot();
    await painted();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.querySelector('h1')!.textContent).toBe(BENCHMARK_STRINGS.he.title);
    localStorage.removeItem('ap-locale');
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  });

  it('wears the theme the operator chose on the dashboard', async () => {
    localStorage.setItem('ap-theme', 'terminal');
    boot();
    expect(document.documentElement.getAttribute('data-theme')).toBe('terminal');
  });

  it('draws with elements only — no markup strings, no inline style attributes', async () => {
    boot();
    await painted();
    expect(benchmarkClientJs()).not.toMatch(/innerHTML|insertAdjacentHTML/);
    expect(document.querySelector('[style*="fill"]')).toBeNull();
  });

  it('is axe-clean when painted', async () => {
    boot();
    await painted();
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('the benchmark subject inside the dashboard (2026-09-26)', () => {
  function mountInShell(): void {
    document.body.innerHTML =
      '<h1>Fleet</h1><section class="benchmark-panel" id="benchmark-panel" data-subject="benchmark" hidden><div class="bm-page" id="benchmark"></div></section>';
  }

  it('reads nothing until the screen is on screen, then draws in place', async () => {
    mountInShell();
    let seen: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        seen = cb;
      }
      observe(): void {}
    };
    try {
      boot();
      expect(document.getElementById('benchmark-panel')!.hidden).toBe(false);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      seen!([{ isIntersecting: true }]);
      await painted();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      // Scrolling past it again does not read twice.
      seen!([{ isIntersecting: true }]);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    }
  });

  it("sits under the page's own heading, with no way back to a page it never left", async () => {
    mountInShell();
    boot();
    await painted();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h2.bm-title')!.textContent).toBe(BENCHMARK_STRINGS.en.title);
    expect(document.querySelector('h3.bm-card-title')).not.toBeNull();
    expect(document.querySelector('.bm-back')).toBeNull();
  });

  it("leaves the dashboard's theme, direction and title alone, and follows its language live", async () => {
    mountInShell();
    localStorage.setItem('ap-theme', 'terminal');
    localStorage.setItem('ap-locale', 'he');
    document.documentElement.lang = 'en';
    document.title = 'AUTOPILOT — dashboard';
    boot();
    await painted();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(document.title).toBe('AUTOPILOT — dashboard');
    expect(document.querySelector('.bm-title')!.textContent).toBe(BENCHMARK_STRINGS.en.title);
    document.documentElement.lang = 'he';
    await vi.waitFor(() =>
      expect(document.querySelector('.bm-title')!.textContent).toBe(BENCHMARK_STRINGS.he.title),
    );
    document.documentElement.lang = 'en';
  });
});

describe('benchmark — strings', () => {
  it('carries the same keys in English and Hebrew, and every Hebrew line is translated', () => {
    expect(Object.keys(BENCHMARK_STRINGS.he).sort()).toEqual(
      Object.keys(BENCHMARK_STRINGS.en).sort(),
    );
    for (const [key, value] of Object.entries(BENCHMARK_STRINGS.he)) {
      expect(/\p{Script=Hebrew}/u.test(value), key).toBe(true);
    }
  });
});
