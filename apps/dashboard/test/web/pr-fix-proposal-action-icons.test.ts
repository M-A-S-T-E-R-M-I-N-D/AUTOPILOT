// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the KEEPER PR review card's
 * fix proposal. A `defect` verdict's Diagnose can lay a proposed fix commit
 * under the card, and its own Apply, Merge as maintainer, Re-run failed,
 * Diagnose and Update branch all lead with a stroke icon, yet the proposal's
 * Approve and Discard were bare words.
 *
 * They are the decision over a proposed commit that the SOUL card's ratify and
 * dismiss are over a proposal and the Plan editor's Publish and Discard draft
 * are over a draft, so they take that pair's `check` and `x`; nothing is newly
 * vendored. Each icon is decorative, so a button's name stays its tip (the
 * disabled Approve's reason, Discard's tip). `renderFixProposal()` rebuilds
 * the box on every Diagnose, so a second proposal draws the same icons.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import axe from 'axe-core';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

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

const QUEUED_WITH_FAILED_CHECK = [
  {
    pr: {
      number: 7,
      title: 'fix: flaky test',
      checkRuns: [{ name: 'ci', state: 'fail' }],
    },
    decision: { decision: 'queue-for-human', reasoning: 'red check' },
  },
];

const FIX_PROPOSAL = {
  title: 'Fix the off-by-one in add()',
  summary: 'add() returns a + b + 1; the PR touches this exact line.',
  diff:
    'diff --git a/src/add.ts b/src/add.ts\n' +
    '--- a/src/add.ts\n' +
    '+++ b/src/add.ts\n' +
    '@@ -1,3 +1,3 @@\n' +
    '-export function add(a, b) { return a + b + 1; }\n' +
    '+export function add(a, b) { return a + b; }',
  filesChanged: ['src/add.ts'],
};

const DEFECT = {
  diagnosis: { verdict: 'defect', reasoning: ['evidence'], fixProposal: FIX_PROPOSAL },
};

const ACTIONS = [
  ['data-pr-fix-approve', 'check', 'Approve'],
  ['data-pr-fix-discard', 'x', 'Discard'],
] as const;

function boot(diagnosisResponses: readonly unknown[]): void {
  document.open();
  document.write(renderShell());
  document.close();
  let call = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pr-review/diagnose')) {
      const body = diagnosisResponses[Math.min(call, diagnosisResponses.length - 1)];
      call += 1;
      return { ok: true, json: async () => body } as unknown as Response;
    }
    if (url.includes('/api/pr-review')) {
      return {
        ok: true,
        json: async () => ({ plans: QUEUED_WITH_FAILED_CHECK }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

const diagnoseBtn = (): HTMLButtonElement =>
  document.querySelector('[data-pr-diagnose="7"]') as HTMLButtonElement;

async function diagnose(): Promise<void> {
  await vi.waitFor(() => {
    expect(diagnoseBtn()).not.toBeNull();
    expect(diagnoseBtn().disabled).toBe(false);
  });
  diagnoseBtn().click();
  await vi.waitFor(() => {
    expect(document.querySelector('.pr-fix-proposal')).not.toBeNull();
  });
}

function expectIconButton(attr: string, icon: keyof typeof ICON_SHAPES, words: string): void {
  const button = document.querySelector(`[${attr}="7"]`) as HTMLButtonElement;
  expect(button).not.toBeNull();
  const svg = button.firstElementChild;
  expect(svg?.tagName.toLowerCase()).toBe('svg');
  expect(svg?.getAttribute('class')).toBe('icon icon-' + icon);
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  // The vendored shape, element for element — not a hand-drawn look-alike.
  const drawn = Array.from(svg?.children ?? []).map((child) => child.tagName.toLowerCase());
  expect(drawn).toEqual((ICON_SHAPES[icon] ?? []).map(([tag]) => tag));
  expect(button.querySelectorAll('svg')).toHaveLength(1);
  expect(button.textContent).toBe(words);
}

describe('the PR fix proposal actions (epic 0025 slice 2)', () => {
  afterEach(() => {
    for (const [target, type, listener, options] of trackedListeners.splice(0)) {
      target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Approve leads with check and Discard with x, each decorative beside its words', async () => {
    boot([DEFECT]);
    await diagnose();

    for (const [attr, icon, words] of ACTIONS) expectIconButton(attr, icon, words);
  });

  it("keeps each button's name its tip, and Approve disabled with its reason", async () => {
    boot([DEFECT]);
    await diagnose();

    const approve = document.querySelector('[data-pr-fix-approve="7"]') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(approve.getAttribute('aria-label')).toBe(approve.getAttribute('data-tip'));
    expect(approve.getAttribute('aria-label')).toContain('Nothing is pushed to the PR branch');

    const discard = document.querySelector('[data-pr-fix-discard="7"]') as HTMLButtonElement;
    expect(discard.getAttribute('aria-label')).toBe(discard.getAttribute('data-tip'));
  });

  it('a click on the x itself still discards the proposal', async () => {
    boot([DEFECT]);
    await diagnose();

    const icon = document.querySelector('[data-pr-fix-discard="7"] > svg') as SVGElement;
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('.pr-fix-proposal')).toBeNull();
  });

  it('draws the same icons on the proposal a second Diagnose brings back', async () => {
    boot([DEFECT, DEFECT]);
    await diagnose();
    (document.querySelector('[data-pr-fix-discard="7"]') as HTMLButtonElement).click();
    expect(document.querySelector('.pr-fix-proposal')).toBeNull();

    await diagnose();

    expect(document.querySelectorAll('.pr-fix-proposal')).toHaveLength(1);
    for (const [attr, icon, words] of ACTIONS) expectIconButton(attr, icon, words);
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain(
      '.pr-fix-approve > .icon, .pr-fix-discard > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the card with its proposal axe-clean (WCAG A/AA)', async () => {
    boot([DEFECT]);
    await diagnose();

    const results = await axe.run(document.getElementById('pr-review-panel') as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
