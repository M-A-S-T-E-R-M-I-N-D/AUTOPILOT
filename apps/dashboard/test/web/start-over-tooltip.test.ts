// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2: the project detail page's "Start over"
 * button — unlike its sibling "Remove" button (see card-remove-tooltip.test.ts)
 * — had no [data-tip]/aria-label at all, so neither sighted mouse/keyboard
 * users nor screen readers got any explanation of what the reset actually does.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
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
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('start-over button explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the start-over button a data-tip matching its aria-label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]');
    expect(so).toBeTruthy();
    expect(so?.getAttribute('data-tip')).toBe("Reset Alpha's firings + ship-rate counters to 0/0");
    expect(so?.getAttribute('data-tip')).toBe(so?.getAttribute('aria-label'));
  });

  it('renders the localized label from first paint, tagged for a later locale switch', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]');
    expect(so?.textContent).toBe(STRINGS.en.startOver);
    expect(so?.getAttribute('data-i18n')).toBe('startOver');
  });

  it('renders the Hebrew label from first paint when the locale is Hebrew', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    document.documentElement.lang = 'he';
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]');
    expect(so?.textContent).toBe(STRINGS.he.startOver);
  });

  it('reverts to the localized label, not a hardcoded English literal, when the reset request fails', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    document.documentElement.lang = 'he';
    globalThis.fetch = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.includes('/api/project/reset')) {
        return { ok: false, json: async () => STATE } as unknown as Response;
      }
      return { ok: true, json: async () => STATE } as unknown as Response;
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]') as HTMLButtonElement;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    so.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    expect(so.disabled).toBe(false);
    expect(so.textContent).toBe(STRINGS.he.startOver);
    expect(so.getAttribute('data-i18n')).toBe('startOver');
    expect(so.firstElementChild?.getAttribute('class')).toBe('icon icon-rotate-ccw');
  });

  it("uses tr('resetting') for the in-flight label, not a hardcoded literal", () => {
    expect(clientJs()).toContain("setTaggedLabel(b, 'resetting');");
  });

  it('keeps its icon and tags the busy key while the reset is in flight', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    so.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(so.disabled).toBe(true);
    expect(so.textContent).toBe(STRINGS.en.resetting);
    expect(so.getAttribute('data-i18n')).toBe('resetting');
    expect(so.querySelectorAll('svg.icon-rotate-ccw')).toHaveLength(1);
  });
});

describe('start-over button leads with the vendored rotate-ccw icon (epic 0025)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    // applyLocale() persists the switch below (ADR 0012).
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('draws a decorative rotate-ccw stroke before the label instead of a baked ↺', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]');
    const icon = so?.firstElementChild;
    expect(icon?.tagName.toLowerCase()).toBe('svg');
    expect(icon?.getAttribute('class')).toBe('icon icon-rotate-ccw');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(so?.textContent).not.toContain('↺');
  });

  it('keeps the icon across a switch to Hebrew', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const so = document.querySelector('[data-start-over="p1"]');
    expect(so?.textContent).toBe(STRINGS.he.startOver);
    expect(so?.querySelectorAll('svg.icon-rotate-ccw')).toHaveLength(1);
  });

  it('sits the icon a gap before the label, like the un-ratify chip', () => {
    expect(layoutCss()).toContain('.start-over button > .icon { margin-inline-end: 0.35em; }');
  });

  it('drops the ↺ from the label in every locale', () => {
    for (const table of Object.values(STRINGS)) {
      expect(table.startOver).not.toContain('↺');
      expect(table.startOver).toBe(table.startOver.trim());
    }
  });

  it('confirms with the translated, project-named message before resetting', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const so = document.querySelector('[data-start-over="p1"]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    so.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(STRINGS.en.startOverConfirm.replace('{name}', 'Alpha'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/project/reset',
      expect.objectContaining({ body: JSON.stringify({ id: 'p1' }) }),
    );
  });
});
