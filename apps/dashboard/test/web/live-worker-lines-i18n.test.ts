// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The live worker card's OWN remaining lines (`shell.ts`'s `liveWorkerCard()`,
 * board web-msnsndki-dz3vn1): after the tool/target line was translated, the
 * card still said "live — firing in progress" in English, its phase pill's
 * "current phase: <phase>" prefix, the narrator/task/count/turns/progress
 * tips, the "🎯 working: <task>" / "probably working: <task>" lines, and the
 * "recent actions: <count>" prefix were all plain English regardless of the
 * active locale. The tool/target slice named these as the next targets.
 *
 * This pins the tags that close that gap: the label rides `[data-i18n]`, the
 * static tips ride `[data-i18n-tip]`, and every line that wraps a live value
 * (phase name, task title, count label) is painted via `tr()` at build AND
 * tagged `[data-i18n-template]` / `[data-i18n-aria-template]` with the value
 * in `data-i18n-name`, so a mid-session switch flips it in place. Phase
 * names, task titles and the count label itself stay as-is in the `{name}`
 * slot — they are live values, never translated.
 *
 * It also pins that a task title is substituted LITERALLY: `substituteName()`
 * used `String.replaceAll(string, string)`, whose replacement argument
 * interprets `$&`/`$$`-style patterns — harmless while only project names
 * reached it, but this slice is the first to route a user-typed task title
 * through it as visible text.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

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
  lastActivityAt: 1,
  activity: [
    {
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      phase: 'gate',
      at: NOW - 60_000,
      firingId: 'f1',
      model: 'claude-sonnet-5',
    },
    // An OLDER row from a distinct firing: with it, the live firing's action
    // count is a true (uncapped) total; without it, every loaded row belongs
    // to f1 and the count is capped (see the capped case below).
    {
      tool: 'Read',
      target: 'src/a.ts',
      kind: 'file',
      phase: 'orient',
      at: NOW - 125_000,
      firingId: 'f0',
      model: 'claude-sonnet-5',
    },
  ],
  // Two past durations so the progress label + bar render (an 80s average).
  flightLog: [
    { id: 'p1:firing-1', durationMs: 100_000 },
    { id: 'p1:firing-2', durationMs: 60_000 },
  ],
  tasks: [{ id: 't1', title: 'Add docs', status: 'queued', focus: true }],
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

function boot(state: ReturnType<typeof stateWith>): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

function q(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  return node as HTMLElement;
}

function expectKeyInEveryLocale(key: string): void {
  for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
    expect(STRINGS[locale][key as StringKey], `${locale}.${key}`).toBeTruthy();
  }
  // The Hebrew table actually translates rather than mirroring English.
  expect(STRINGS.he[key as StringKey]).not.toBe(STRINGS.en[key as StringKey]);
}

const STATIC_KEYS = [
  'liveLabel',
  'liveNarratorTip',
  'liveFocusTaskTip',
  'liveProbableTaskTip',
  'liveCountTip',
  'liveCountTipCapped',
  'liveTurnsTip',
  'liveProgressTip',
];
const TEMPLATE_KEYS = ['livePhaseAria', 'liveFocusTask', 'liveProbableTask', 'liveCountAria'];

describe('live worker card own-lines i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags every own line with keys present in every locale, English defaults byte-identical', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    for (const key of [...STATIC_KEYS, ...TEMPLATE_KEYS]) expectKeyInEveryLocale(key);
    for (const key of TEMPLATE_KEYS) {
      expect(STRINGS.en[key as StringKey]).toContain('{name}');
      expect(STRINGS.he[key as StringKey]).toContain('{name}');
    }

    const label = q('.live-worker-label');
    expect(label.getAttribute('data-i18n')).toBe('liveLabel');
    expect(label.textContent).toBe('live — firing in progress');
    expect(label.textContent).toBe(STRINGS.en.liveLabel);

    const phase = q('.pill.live-phase-gate');
    expect(phase.getAttribute('data-i18n-aria-template')).toBe('livePhaseAria');
    expect(phase.getAttribute('data-i18n-name')).toBe('gate');
    expect(phase.getAttribute('aria-label')).toBe('current phase: gate');
    // The phase pill's data-tip comes from the shared OFFICE_TIPS map and
    // stays English this slice — no tip tag on it.
    expect(phase.hasAttribute('data-i18n-tip')).toBe(false);

    const narrator = q('.live-worker-narrator');
    expect(narrator.getAttribute('data-i18n-tip')).toBe('liveNarratorTip');
    expect(narrator.getAttribute('data-tip')).toBe(STRINGS.en.liveNarratorTip);

    const focus = q('.live-worker-line[data-i18n-template="liveFocusTask"]');
    expect(focus.getAttribute('data-i18n-name')).toBe('Add docs');
    expect(focus.getAttribute('data-i18n-aria-template')).toBe('liveFocusTask');
    expect(focus.getAttribute('data-i18n-tip')).toBe('liveFocusTaskTip');
    expect(focus.textContent).toBe('🎯 working: Add docs');
    expect(focus.getAttribute('aria-label')).toBe('🎯 working: Add docs');
    expect(focus.getAttribute('data-tip')).toBe(STRINGS.en.liveFocusTaskTip);

    const count = q('.live-worker-count');
    const countLabel = count.textContent ?? '';
    expect(countLabel).not.toBe('');
    expect(count.getAttribute('data-i18n-tip')).toBe('liveCountTip');
    expect(count.getAttribute('data-tip')).toBe(STRINGS.en.liveCountTip);
    expect(count.getAttribute('data-i18n-aria-template')).toBe('liveCountAria');
    expect(count.getAttribute('data-i18n-name')).toBe(countLabel);
    expect(count.getAttribute('aria-label')).toBe('recent actions: ' + countLabel);

    const turns = q('.live-worker-turns');
    expect(turns.getAttribute('data-i18n-tip')).toBe('liveTurnsTip');
    expect(turns.getAttribute('data-tip')).toBe(STRINGS.en.liveTurnsTip);

    const progressLabel = q('.live-worker-progress-label');
    const progressBar = q('.live-progress');
    expect(progressLabel.getAttribute('data-i18n-tip')).toBe('liveProgressTip');
    expect(progressBar.getAttribute('data-i18n-tip')).toBe('liveProgressTip');
    expect(progressLabel.getAttribute('data-tip')).toBe(STRINGS.en.liveProgressTip);
    expect(progressBar.getAttribute('data-tip')).toBe(STRINGS.en.liveProgressTip);
  });

  it('switching to Hebrew flips every own line in place, with no re-render in between', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);
    const countLabel = q('.live-worker-count').textContent ?? '';

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(q('.live-worker-label').textContent).toBe(STRINGS.he.liveLabel);
    expect(q('.pill.live-phase-gate').getAttribute('aria-label')).toBe(
      STRINGS.he.livePhaseAria.replaceAll('{name}', 'gate'),
    );
    expect(q('.live-worker-narrator').getAttribute('data-tip')).toBe(STRINGS.he.liveNarratorTip);

    const focus = q('.live-worker-line[data-i18n-template="liveFocusTask"]');
    expect(focus.textContent).toBe(STRINGS.he.liveFocusTask.replaceAll('{name}', 'Add docs'));
    expect(focus.getAttribute('aria-label')).toBe(focus.textContent);
    expect(focus.getAttribute('data-tip')).toBe(STRINGS.he.liveFocusTaskTip);

    const count = q('.live-worker-count');
    expect(count.getAttribute('data-tip')).toBe(STRINGS.he.liveCountTip);
    expect(count.getAttribute('aria-label')).toBe(
      STRINGS.he.liveCountAria.replaceAll('{name}', countLabel),
    );
    // The count label itself is the live value — still the English helper text.
    expect(count.textContent).toBe(countLabel);

    expect(q('.live-worker-turns').getAttribute('data-tip')).toBe(STRINGS.he.liveTurnsTip);
    expect(q('.live-worker-progress-label').getAttribute('data-tip')).toBe(
      STRINGS.he.liveProgressTip,
    );
    expect(q('.live-progress').getAttribute('data-tip')).toBe(STRINGS.he.liveProgressTip);
  });

  it('the probable-task guess line rides the same template + tip tags and flips on a switch', async () => {
    boot(
      stateWith({
        tasks: [{ id: 't1', title: 'Harden the guard hook', status: 'queued', focus: false }],
      }),
    );
    await vi.advanceTimersByTimeAsync(1);

    const guess = q('.live-worker-guess');
    expect(guess.getAttribute('data-i18n-template')).toBe('liveProbableTask');
    expect(guess.getAttribute('data-i18n-aria-template')).toBe('liveProbableTask');
    expect(guess.getAttribute('data-i18n-name')).toBe('Harden the guard hook');
    expect(guess.getAttribute('data-i18n-tip')).toBe('liveProbableTaskTip');
    expect(guess.textContent).toBe('probably working: Harden the guard hook');
    expect(guess.getAttribute('aria-label')).toBe(guess.textContent);
    expect(guess.getAttribute('data-tip')).toBe(STRINGS.en.liveProbableTaskTip);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const flipped = q('.live-worker-guess');
    expect(flipped.textContent).toBe(
      STRINGS.he.liveProbableTask.replaceAll('{name}', 'Harden the guard hook'),
    );
    expect(flipped.getAttribute('aria-label')).toBe(flipped.textContent);
    expect(flipped.getAttribute('data-tip')).toBe(STRINGS.he.liveProbableTaskTip);
  });

  it('a capped action count carries the capped tip key and flips to its Hebrew twin', async () => {
    // Only f1 rows loaded → the window is entirely this firing → capped.
    boot(stateWith({ activity: [BASE_PROJECT.activity[0]] }));
    await vi.advanceTimersByTimeAsync(1);

    const count = q('.live-worker-count');
    expect(count.textContent).toContain('+');
    expect(count.getAttribute('data-i18n-tip')).toBe('liveCountTipCapped');
    expect(count.getAttribute('data-tip')).toBe(STRINGS.en.liveCountTipCapped);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(q('.live-worker-count').getAttribute('data-tip')).toBe(STRINGS.he.liveCountTipCapped);
  });

  it('a saved Hebrew locale paints the label, phase prefix, and task line in Hebrew at build', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.documentElement.lang).toBe('he');
    expect(q('.live-worker-label').textContent).toBe(STRINGS.he.liveLabel);
    expect(q('.pill.live-phase-gate').getAttribute('aria-label')).toBe(
      STRINGS.he.livePhaseAria.replaceAll('{name}', 'gate'),
    );
    expect(q('.live-worker-line[data-i18n-template="liveFocusTask"]').textContent).toBe(
      STRINGS.he.liveFocusTask.replaceAll('{name}', 'Add docs'),
    );
    const count = q('.live-worker-count');
    expect(count.getAttribute('aria-label')).toBe(
      STRINGS.he.liveCountAria.replaceAll('{name}', count.textContent ?? ''),
    );
  });

  it('substitutes a task title literally — "$&" and "$$" are not replacement patterns', async () => {
    const title = 'pay $& then $$ and $1 done';
    boot(stateWith({ tasks: [{ id: 't1', title, status: 'queued', focus: true }] }));
    await vi.advanceTimersByTimeAsync(1);

    const focus = q('.live-worker-line[data-i18n-template="liveFocusTask"]');
    expect(focus.textContent).toBe('🎯 working: ' + title);
    expect(focus.getAttribute('aria-label')).toBe('🎯 working: ' + title);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(q('.live-worker-line[data-i18n-template="liveFocusTask"]').textContent).toBe(
      STRINGS.he.liveFocusTask.split('{name}').join(title),
    );
  });
});
