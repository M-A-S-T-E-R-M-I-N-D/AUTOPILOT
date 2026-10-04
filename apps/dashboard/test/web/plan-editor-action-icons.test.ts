// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Plan editor's action
 * bar. Its heading leads with `pen-line` and the steps between are joined by
 * `arrow-right` strokes, but Publish, Undo, Redo and Discard draft were bare
 * words beside the SOUL card's iconed ratify/dismiss and un-ratify buttons.
 *
 * Publish and Discard draft are the same decision over a draft that ratify
 * and dismiss are over a proposal, so they take that pair's `check` and `x`;
 * Undo takes the un-ratify chip's `undo-2` and Redo a newly vendored `redo-2`,
 * both mirrored under `dir="rtl"` like the un-ratify chip. Each icon is
 * decorative, so a button's name stays its words, and `setSweptText()` keeps
 * the icon across a locale switch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

// Every boot re-registers the client's document/window listeners; strip them
// after each test so a stale bundle's delegate never answers a later click.
type Tracked = [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const trackedListeners: Tracked[] = [];
for (const target of [document, window] as EventTarget[]) {
  const native = target.addEventListener.bind(target);
  target.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ) => {
    trackedListeners.push([target, type, listener, options]);
    return native(type, listener, options as AddEventListenerOptions | undefined);
  }) as typeof target.addEventListener;
}
afterEach(() => {
  for (const [target, type, listener, options] of trackedListeners.splice(0)) {
    target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
  }
});

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

const SPEC = {
  ecosystem: 'js',
  typecheck: { bin: 'pnpm', args: ['run', 'typecheck'], label: 'pnpm run typecheck' },
  test: { bin: 'pnpm', args: ['run', 'test'], label: 'pnpm run test' },
};

const ACTIONS = [
  ['data-plan-publish', 'check', 'planEditorPublish'],
  ['data-plan-undo', 'undo-2', 'planEditorUndo'],
  ['data-plan-redo', 'redo-2', 'planEditorRedo'],
  ['data-plan-discard', 'x', 'planEditorDiscard'],
] as const;

async function bootWithPlan(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.startsWith('/api/plan/publish')) {
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    if (u.startsWith('/api/plan')) {
      return {
        ok: true,
        json: async () => ({ ok: true, spec: SPEC, gate: null }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function editTestCommand(): void {
  (document.querySelector('[data-plan-step="test"]') as HTMLElement).click();
  const cmd = document.querySelector('[data-plan-command="test"]') as HTMLInputElement;
  cmd.value = 'pnpm run test -- --coverage';
  cmd.dispatchEvent(new Event('change', { bubbles: true }));
}

function expectIconButton(
  attr: string,
  icon: string,
  key: (typeof ACTIONS)[number][2],
  locale: 'en' | 'he',
): void {
  const button = document.querySelector(`[${attr}]`) as HTMLButtonElement;
  expect(button).not.toBeNull();
  const svg = button.firstElementChild;
  expect(svg?.getAttribute('class')).toBe('icon icon-' + icon);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path, line, circle').length).toBeGreaterThan(0);
  expect(button.querySelectorAll('svg')).toHaveLength(1);
  expect(button.getAttribute('data-i18n')).toBe(key);
  expect(button.textContent).toBe(STRINGS[locale][key]);
}

describe('the Plan editor action bar (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Publish, Undo, Redo and Discard draft each lead with a decorative icon', async () => {
    await bootWithPlan();

    for (const [attr, icon, key] of ACTIONS) expectIconButton(attr, icon, key, 'en');
  });

  it('keeps every icon through an edit, an undo and a publish', async () => {
    await bootWithPlan();
    editTestCommand();
    for (const [attr, icon, key] of ACTIONS) expectIconButton(attr, icon, key, 'en');

    (document.querySelector('[data-plan-undo]') as HTMLButtonElement).click();
    (document.querySelector('[data-plan-redo]') as HTMLButtonElement).click();
    (document.querySelector('[data-plan-publish]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.plan-status')?.textContent).toBe(
      STRINGS.en['planEditorPublishedNow'],
    );
    for (const [attr, icon, key] of ACTIONS) expectIconButton(attr, icon, key, 'en');
  });

  it('keeps every icon beside Hebrew words, before and after a redraw', async () => {
    await bootWithPlan();
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const [attr, icon, key] of ACTIONS) expectIconButton(attr, icon, key, 'he');
    editTestCommand();
    for (const [attr, icon, key] of ACTIONS) expectIconButton(attr, icon, key, 'he');
  });

  it('spaces each icon from its words and mirrors Undo and Redo right to left', () => {
    const css = layoutCss();

    expect(css).toContain('.plan-actions button > .icon { margin-inline-end: 0.35em; }');
    expect(css).toContain(
      "[dir='rtl'] .plan-undo > .icon, [dir='rtl'] .plan-redo > .icon { transform: scaleX(-1); }",
    );
  });
});
