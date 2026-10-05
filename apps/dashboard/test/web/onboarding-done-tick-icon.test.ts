// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 law 1 (board web-mtywp7zq-55f3o9): the Getting started
 * checklist's done tick. Each open step's mark draws its vendored icon from
 * the ladder's own splice of `icons.ts`, but a done step's mark drew a
 * hand-copied Feather check, a `polyline` whose points `obTick()` typed out
 * by hand. The hand-inlined census only matches server-printed `<svg
 * viewBox=…>` markup, so it never saw a shape built with `createElementNS`.
 *
 * The mark draws the vendored `check` the Docs editor's Save and the task
 * row's done button draw now, spliced beside the steps' icons. It keeps the
 * 20px and the 2.5 stroke the old tick's attributes gave it, from one CSS
 * rule, so it still reads bold on the filled mark. It stays decorative: the
 * step's "Done" status says the state in words. Executes the ACTUAL client
 * bundle (`clientJs()`) in jsdom, the convention `onboarding-head-icons.test.ts`
 * uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';
import { LADDER_ICONS } from '../../src/web/features/onboarding.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

/** Boots the page with the sample already added, so the first step is done
 *  and the second is the current one. */
async function boot(): Promise<void> {
  localStorage.setItem('ap-ob-marks', JSON.stringify({ 'add-sample': 1 }));
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const doneStep = (): HTMLElement =>
  document.querySelector('#ob-steps .ob-step[data-step="add-sample"]') as HTMLElement;

describe('the Getting started checklist’s done tick draws the vendored check (epic 0025 law 1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('ap-tour-seen', '1');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('splices the check beside the steps’ own icons, shape for shape', () => {
    expect(LADDER_ICONS['check']).toEqual(ICON_SHAPES['check']);
  });

  it('marks a done step with the vendored check, decorative, beside its Done status', async () => {
    await boot();
    const step = doneStep();
    expect(step.classList.contains('is-done')).toBe(true);

    const mark = step.querySelector('.ob-step-mark') as HTMLElement;
    expect(mark.children).toHaveLength(1);
    const svg = mark.firstElementChild!;
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('class')).toBe('icon icon-check');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect([...svg.children].map((c) => [c.tagName.toLowerCase(), c.getAttribute('d')])).toEqual(
      ICON_SHAPES['check']!.map(([tag, attrs]) => [tag, attrs['d']]),
    );
    expect(svg.querySelector('polyline')).toBeNull();
    expect(step.querySelector('.ob-step-status')?.textContent).toBe(STRINGS.en.obStepDone);
  });

  it('names each open step’s icon the same way, so the two marks read as one family', async () => {
    await boot();
    const open = document.querySelector('#ob-steps .ob-step.is-current') as HTMLElement;
    const svg = open.querySelector('.ob-step-mark > svg')!;
    expect(svg.getAttribute('class')).toMatch(/^icon icon-[a-z0-9-]+$/);
    const name = svg.getAttribute('class')!.slice('icon icon-'.length);
    expect(name).not.toBe('check');
    expect(LADDER_ICONS[name]).toBeDefined();
  });

  it('keeps the old tick’s 20px and bold stroke on the filled mark', () => {
    expect(layoutCss()).toContain(
      '.ob-step-mark > .icon-check { inline-size: 1.25rem; block-size: 1.25rem; stroke-width: 2.5; }',
    );
  });

  it('leaves the checklist’s steps axe-clean with the tick drawn (WCAG A/AA)', async () => {
    await boot();
    const list = document.getElementById('ob-steps') as HTMLElement;
    expect(list.querySelector('.ob-step.is-done .icon-check')).not.toBeNull();

    vi.useRealTimers();
    const results = await axe.run(list, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
