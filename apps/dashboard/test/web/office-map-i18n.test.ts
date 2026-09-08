// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The agent office map's own i18n slice (board web-msnsndki-dz3vn1):
 * `web/features/office-map.ts`'s orbiting subagent satellites' tip/
 * aria-label (`officeSubagent`) and the map SVG's own aria-label
 * (`officeMapAria`) — both were plain literals, invisible to
 * `pnpm i18n:untagged`, stuck in English under the Hebrew locale. The zone
 * rects' and the live dot's tips/aria-labels embed the shared `OFFICE_TIPS`
 * map (also read by `liveWorkerCard`/`renderStatTiles`/the activity phase
 * rail) and stay English — a later slice, same as strings.ts already notes
 * for the phase pill's own tip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

const BASE_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
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
  lastActivityAt: null,
  flightLog: [],
  activity: [],
  tasks: [],
};

function stateWith(project: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [{ ...BASE_PROJECT, ...project }],
    empty: false,
  };
}

const SUBAGENT_STATE = stateWith({
  status: 'flying',
  activity: [
    { tool: 'Agent', target: 'Security review', kind: 'other', phase: 'do', at: 2, firingId: 'f1' },
  ],
});

function switchTo(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function satellite(): Element | null {
  return document.querySelector('.office-satellite');
}

function map(): Element | null {
  return document.querySelector('.office-map');
}

async function boot(state: unknown): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(2000);
}

describe('agent office map i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('paints the subagent satellite tip/aria-label in English by default, tagged for the sweep', async () => {
    await boot(SUBAGENT_STATE);
    const sat = satellite();
    expect(sat?.getAttribute('data-tip')).toBe('Subagent — Security review');
    expect(sat?.getAttribute('aria-label')).toBe('Subagent — Security review');
    expect(sat?.getAttribute('data-i18n-name')).toBe('Security review');
    expect(sat?.getAttribute('data-i18n-tip-template')).toBe('officeSubagent');
    expect(sat?.getAttribute('data-i18n-aria-template')).toBe('officeSubagent');
  });

  it('a page that boots in Hebrew paints the subagent satellite in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot(SUBAGENT_STATE);
    const expected = STRINGS.he.officeSubagent.replace('{name}', 'Security review');
    expect(satellite()?.getAttribute('data-tip')).toBe(expected);
    expect(satellite()?.getAttribute('aria-label')).toBe(expected);
  });

  it('switching to Hebrew mid-render translates the subagent satellite and map aria-label in place', async () => {
    await boot(SUBAGENT_STATE);
    const sat = satellite();
    const svg = map();
    switchTo('he');
    expect(satellite()).toBe(sat);
    expect(sat?.getAttribute('data-tip')).toBe(
      STRINGS.he.officeSubagent.replace('{name}', 'Security review'),
    );
    expect(svg?.getAttribute('aria-label')).toBe(STRINGS.he.officeMapAria.replace('{name}', 'do'));
  });

  it('paints the map aria-label in English by default, tagged for the sweep', async () => {
    await boot(SUBAGENT_STATE);
    const svg = map();
    expect(svg?.getAttribute('aria-label')).toBe('Agent office map — currently do');
    expect(svg?.getAttribute('data-i18n-name')).toBe('do');
    expect(svg?.getAttribute('data-i18n-aria-template')).toBe('officeMapAria');
  });

  it('keeps the Hebrew rows native — real Hebrew, not the English text', () => {
    for (const key of ['officeSubagent', 'officeMapAria'] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
    }
  });

  it('paints both labels via tr(), with no old literal concatenation left in the assembled bundle', () => {
    const js = clientJs();
    expect(js).not.toContain("'Subagent — ' + subagents[i].label");
    expect(js).not.toContain("'Agent office map — currently '");
  });
});
