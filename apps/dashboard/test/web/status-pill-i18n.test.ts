// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The status pills' i18n (board web-msnsndki-dz3vn1): the fleet card header's
 * project-status badge (`.card-head .pill`) and the task board's per-task
 * status pill (`.tasks .pill`) — `shell.ts`'s `statusPill()` — still said
 * "flying" / "needs approval" and explained themselves with English-only tips
 * and "Status: <label> — <tip>" aria-labels regardless of the active locale,
 * even after every other line on the fleet card was translated.
 *
 * This pins the tags that close that gap: the label rides `[data-i18n]`, the
 * tip rides `[data-i18n-tip]`, and the aria-label — composed of TWO
 * translatable atoms, not one live value — rides `[data-i18n-aria-template]`
 * on the shared `statusAria` template, whose `{label}`/`{tip}` slots the
 * sweep fills from the pill's own two keys, so a mid-session switch
 * recomposes it in place from the translated atoms rather than from a third
 * hand-synced string per status. The English text is byte-identical to what
 * the pills said before this slice.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
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
  flightLog: [],
  activity: [],
  tasks: [
    { id: 't1', title: 'Queued task', status: 'queued' },
    { id: 't2', title: 'Approval-pending task', status: 'needs_approval', source: 'self' },
  ],
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
    projects: [{ ...PROJECT, ...project }],
    empty: false,
  };
}

function boot(state: ReturnType<typeof stateWith>): void {
  document.open();
  document.write(renderShell('p1'));
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

function composedAria(locale: 'en' | 'he', labelKey: string, tipKey: string): string {
  return STRINGS[locale].statusAria
    .split('{label}')
    .join(STRINGS[locale][labelKey as StringKey])
    .split('{tip}')
    .join(STRINGS[locale][tipKey as StringKey]);
}

const PROJECT_STATUSES = ['Registered', 'Flying', 'Paused', 'Hibernating', 'NeedsYou'];
const TASK_STATUSES = ['Queued', 'InProgress', 'Done', 'NeedsApproval', 'Deferred'];

function clickHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

describe('status pill i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('every status has a label + tip key in every locale, and the aria template carries both slots', () => {
    expectKeyInEveryLocale('statusAria');
    for (const locale of ['en', 'he'] as const) {
      expect(STRINGS[locale].statusAria).toContain('{label}');
      expect(STRINGS[locale].statusAria).toContain('{tip}');
    }
    for (const s of PROJECT_STATUSES) {
      expectKeyInEveryLocale(`projectStatus${s}`);
      expectKeyInEveryLocale(`projectStatus${s}Tip`);
    }
    for (const s of TASK_STATUSES) {
      expectKeyInEveryLocale(`taskStatus${s}`);
      expectKeyInEveryLocale(`taskStatus${s}Tip`);
    }
  });

  it('tags the project status pill, English defaults byte-identical to the pre-i18n text', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const pill = q('.card-head .pill');
    expect(pill.classList.contains('pill-flying')).toBe(true);
    expect(pill.textContent).toBe('flying');
    expect(pill.getAttribute('data-i18n')).toBe('projectStatusFlying');
    expect(pill.getAttribute('data-tip')).toBe('A firing is in progress right now');
    expect(pill.getAttribute('data-i18n-tip')).toBe('projectStatusFlyingTip');
    expect(pill.getAttribute('aria-label')).toBe(
      'Status: flying — A firing is in progress right now',
    );
    expect(pill.getAttribute('data-i18n-aria-template')).toBe('statusAria');
    expect(pill.getAttribute('tabindex')).toBe('0');
  });

  it('tags every task status pill the same way, spacing the underscore in the English label', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const pills = Array.from(document.querySelectorAll<HTMLElement>('.tasks .pill'));
    expect(pills.length).toBe(2);

    const queued = pills[0] as HTMLElement;
    expect(queued.classList.contains('task-queued')).toBe(true);
    expect(queued.textContent).toBe('queued');
    expect(queued.getAttribute('data-i18n')).toBe('taskStatusQueued');
    expect(queued.getAttribute('data-tip')).toBe('Queued — waiting its turn in the flight queue');
    expect(queued.getAttribute('data-i18n-tip')).toBe('taskStatusQueuedTip');
    expect(queued.getAttribute('aria-label')).toBe(
      'Status: queued — Queued — waiting its turn in the flight queue',
    );

    const approval = pills[1] as HTMLElement;
    expect(approval.classList.contains('task-needs_approval')).toBe(true);
    expect(approval.textContent).toBe('needs approval');
    expect(approval.getAttribute('data-i18n')).toBe('taskStatusNeedsApproval');
    expect(approval.getAttribute('data-i18n-tip')).toBe('taskStatusNeedsApprovalTip');
    expect(approval.getAttribute('aria-label')).toBe(
      'Status: needs approval — Self-proposed — waiting on your approve/reject decision',
    );
    expect(approval.getAttribute('data-i18n-aria-template')).toBe('statusAria');
  });

  it('switching to Hebrew flips label, tip, and the composed aria in place, with no re-render in between', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    clickHebrew();

    const pill = q('.card-head .pill');
    expect(pill.textContent).toBe(STRINGS.he.projectStatusFlying);
    expect(pill.getAttribute('data-tip')).toBe(STRINGS.he.projectStatusFlyingTip);
    expect(pill.getAttribute('aria-label')).toBe(
      composedAria('he', 'projectStatusFlying', 'projectStatusFlyingTip'),
    );
    // Still color-coded by the raw status — the class never follows the locale.
    expect(pill.classList.contains('pill-flying')).toBe(true);

    const approval = q('.tasks .pill.task-needs_approval');
    expect(approval.textContent).toBe(STRINGS.he.taskStatusNeedsApproval);
    expect(approval.getAttribute('data-tip')).toBe(STRINGS.he.taskStatusNeedsApprovalTip);
    expect(approval.getAttribute('aria-label')).toBe(
      composedAria('he', 'taskStatusNeedsApproval', 'taskStatusNeedsApprovalTip'),
    );
  });

  it('switching back to English restores the exact pre-i18n text', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);
    clickHebrew();
    (document.querySelector('[data-lang-btn="en"]') as HTMLButtonElement).click();

    const pill = q('.card-head .pill');
    expect(pill.textContent).toBe('flying');
    expect(pill.getAttribute('aria-label')).toBe(
      'Status: flying — A firing is in progress right now',
    );
  });

  it('a saved Hebrew locale paints the pills in Hebrew at build, before any switch', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot(stateWith({ status: 'needs_you' }));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.documentElement.lang).toBe('he');
    const pill = q('.card-head .pill');
    expect(pill.classList.contains('pill-needs_you')).toBe(true);
    expect(pill.textContent).toBe(STRINGS.he.projectStatusNeedsYou);
    expect(pill.getAttribute('data-tip')).toBe(STRINGS.he.projectStatusNeedsYouTip);
    expect(pill.getAttribute('aria-label')).toBe(
      composedAria('he', 'projectStatusNeedsYou', 'projectStatusNeedsYouTip'),
    );
    expect(q('.tasks .pill.task-queued').textContent).toBe(STRINGS.he.taskStatusQueued);
  });

  it('a status with no key still renders its spaced raw label, unexplained and untagged', async () => {
    boot(stateWith({ status: 'some_future_status' }));
    await vi.advanceTimersByTimeAsync(1);

    const pill = q('.card-head .pill');
    expect(pill.classList.contains('pill-some_future_status')).toBe(true);
    expect(pill.textContent).toBe('some future_status');
    expect(pill.hasAttribute('data-i18n')).toBe(false);
    expect(pill.hasAttribute('data-tip')).toBe(false);
    expect(pill.hasAttribute('aria-label')).toBe(false);
    expect(pill.hasAttribute('tabindex')).toBe(false);

    // A switch leaves it alone — nothing to translate.
    clickHebrew();
    expect(q('.card-head .pill').textContent).toBe('some future_status');
  });
});
