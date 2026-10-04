// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Versions panel's row
 * actions. Its heading draws `clock`, and the fleet card's Remove, Start over
 * and every execute button lead with a stroke of what they do, but each
 * version row's Restore and What changed were bare words.
 *
 * Restore leads with a newly vendored `history` (the heading's clock turned
 * back), What changed with a newly vendored `git-compare` (it compares the
 * version with the one before it). Both are decorative, so each button's name
 * stays "<its words> <short sha>" through `aria-labelledby`. Restore's busy
 * "Restoring…" and the toggle's "Hide changes" swap through
 * `setTaggedLabel()`, so the icon survives every swap and a sweep mid-request
 * repaints the busy words instead of the idle ones.
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

const sha = (c: string): string => c.repeat(40);

const TIMELINE = {
  myth: { kind: 'myth', sha: sha('a'), committedAt: '2026-09-01T10:00:00Z', subject: 'import' },
  legacy: { kind: 'legacy', sha: sha('b'), committedAt: '2026-09-02T10:00:00Z', subject: 'lock' },
  flight: [{ kind: 'flight', sha: sha('c'), committedAt: '2026-09-03T10:00:00Z', subject: 'fix' }],
  truncated: false,
};

const DIFF = {
  files: [{ path: 'src/a.ts', added: 3, removed: 1 }],
  totals: { files: 1, added: 3, removed: 1 },
  truncated: false,
};

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 1,
  totalBytes: 1,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [],
  flightLog: [],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 1, shipped: 1, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

type RestoreReply = 'ok' | 'hang' | 'throw';

async function boot(restoreReply: RestoreReply = 'ok'): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.startsWith('/api/versions/diff'))
      return { ok: true, json: async () => ({ diff: DIFF }) };
    if (url.startsWith('/api/versions/restore')) {
      if (restoreReply === 'hang') return new Promise<Response>(() => {});
      if (restoreReply === 'throw') throw new Error('offline');
      const restore = { ok: true, branch: 'autopilot/restore/x', sha: null, reason: null };
      return { ok: true, json: async () => ({ restore }) };
    }
    if (url.startsWith('/api/versions'))
      return { ok: true, json: async () => ({ versions: TIMELINE }) };
    return { ok: true, json: async () => STATE };
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function restoreButton(): HTMLButtonElement {
  return document.querySelector('.versions-panel .version-restore-btn') as HTMLButtonElement;
}

function changesToggle(): HTMLButtonElement {
  return document.querySelector('.versions-panel .diff-toggle') as HTMLButtonElement;
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

/** A button's name as the panel's `aria-labelledby` pair computes it. */
function accessibleName(button: Element): string {
  return (button.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

type RowKey =
  'versionsRestore' | 'versionsRestoring' | 'versionsShowChanges' | 'versionsHideChanges';

function expectIconButton(
  button: HTMLButtonElement,
  icon: 'history' | 'git-compare',
  key: RowKey,
  locale: 'en' | 'he',
): void {
  const svg = button.firstElementChild;
  expect(svg?.getAttribute('class')).toBe(`icon icon-${icon}`);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelectorAll('path, circle').length).toBeGreaterThan(0);
  expect(button.querySelectorAll('svg')).toHaveLength(1);
  expect(button.getAttribute('data-i18n')).toBe(key);
  expect(button.textContent).toBe(STRINGS[locale][key]);
}

function pressRestore(): void {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  restoreButton().click();
}

describe('the Versions panel’s row actions lead with vendored icons (epic 0025 slice 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    // applyLocale() persists a Hebrew switch (ADR 0012).
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('draws history before Restore and git-compare before What changed, keeping each name', async () => {
    await boot();

    expectIconButton(restoreButton(), 'history', 'versionsRestore', 'en');
    expectIconButton(changesToggle(), 'git-compare', 'versionsShowChanges', 'en');
    expect(accessibleName(restoreButton())).toBe('Restore ccccccc');
    expect(accessibleName(changesToggle())).toBe('What changed ccccccc');
  });

  it('keeps git-compare and tags the words as the toggle opens and closes', async () => {
    await boot();
    const toggle = changesToggle();

    toggle.click();
    await vi.advanceTimersByTimeAsync(1);
    expectIconButton(toggle, 'git-compare', 'versionsHideChanges', 'en');
    expect(accessibleName(toggle)).toBe('Hide changes ccccccc');

    toggle.click();
    expectIconButton(toggle, 'git-compare', 'versionsShowChanges', 'en');
  });

  it('keeps both icons beside Hebrew words', async () => {
    await boot();
    changesToggle().click();
    await vi.advanceTimersByTimeAsync(1);
    switchToHebrew();

    expectIconButton(restoreButton(), 'history', 'versionsRestore', 'he');
    expectIconButton(changesToggle(), 'git-compare', 'versionsHideChanges', 'he');
  });

  it('keeps history and tags the busy words while a restore is in flight', async () => {
    await boot('hang');
    pressRestore();

    expect(restoreButton().disabled).toBe(true);
    expectIconButton(restoreButton(), 'history', 'versionsRestoring', 'en');
    expect(accessibleName(restoreButton())).toBe('Restoring… ccccccc');
  });

  it('repaints the busy words, not the idle ones, when the locale switches mid-restore', async () => {
    await boot('hang');
    pressRestore();
    switchToHebrew();

    expectIconButton(restoreButton(), 'history', 'versionsRestoring', 'he');
  });

  it('restores the idle words in the current locale, icon kept, after a restore', async () => {
    await boot('ok');
    pressRestore();
    switchToHebrew();
    await vi.advanceTimersByTimeAsync(1);

    expect(restoreButton().disabled).toBe(false);
    expectIconButton(restoreButton(), 'history', 'versionsRestore', 'he');
  });

  it('restores the idle words, icon kept, when the restore request fails', async () => {
    await boot('throw');
    pressRestore();
    await vi.advanceTimersByTimeAsync(1);

    expect(restoreButton().disabled).toBe(false);
    expectIconButton(restoreButton(), 'history', 'versionsRestore', 'en');
  });

  it('sits each icon a gap before its words', () => {
    expect(layoutCss()).toContain(
      '.diff-toggle > .icon, .version-restore-btn > .icon { margin-inline-end: 0.35em; }',
    );
  });
});
