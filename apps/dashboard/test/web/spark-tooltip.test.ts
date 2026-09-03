// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The cost sparkline used to be a plain SVG bar chart with only a whole-chart
 * aria-label — no way to tell which firing a bar was, or why it shipped or
 * reverted, without leaving the fleet view. Each bar is now focusable/hoverable
 * and carries its own accessible label plus a shared visual tooltip (cost,
 * resolved task title, verdict, turns, sha).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 2,
  shipped: 1,
  cost: 0.3,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 0.5,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 2,
  flightLog: [
    {
      id: 'f1',
      item: 'web-abc123',
      kind: 'feat',
      sha: 'deadbeef1234',
      shipped: true,
      gateResult: 'pass',
      cost: 0.1,
      tokensIn: 1,
      tokensOut: 1,
      turns: 12,
      commitSubject: 'feat: add thing',
      failedCheck: null,
      died: null,
      at: 1,
    },
    {
      id: 'f2',
      item: null,
      kind: 'fix',
      sha: null,
      shipped: false,
      gateResult: 'reverted',
      cost: 0.2,
      tokensIn: 1,
      tokensOut: 1,
      turns: 3,
      commitSubject: null,
      failedCheck: 'typecheck',
      died: null,
      at: 2,
    },
    {
      id: 'f3',
      item: null,
      kind: 'fix',
      sha: null,
      shipped: false,
      gateResult: 'unverifiable',
      cost: 0.05,
      tokensIn: 1,
      tokensOut: 1,
      turns: 2,
      commitSubject: null,
      failedCheck: null,
      died: null,
      at: 3,
    },
    {
      id: 'f4',
      item: null,
      kind: 'fix',
      sha: null,
      shipped: false,
      gateResult: null,
      cost: 0.02,
      tokensIn: 1,
      tokensOut: 1,
      turns: 1,
      commitSubject: null,
      failedCheck: null,
      died: null,
      at: 4,
    },
    {
      id: 'f5',
      item: null,
      kind: null,
      sha: null,
      shipped: false,
      gateResult: 'checkpointed',
      cost: 0.08,
      tokensIn: 1,
      tokensOut: 1,
      turns: 120,
      commitSubject:
        'wip(autopilot): checkpoint — firing 163 died mid-unit; next firing resumes it',
      failedCheck: null,
      died: 'turn-cap',
      at: 5,
    },
  ],
  activity: [],
  tasks: [{ id: 'web-abc123', title: 'Fix the thing', status: 'done' }],
};

function stateWith(overrides: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 2,
      shipped: 1,
      openFindings: 0,
      cost: 0.3,
    },
    projects: [PROJECT],
    empty: false,
    ...overrides,
  };
}

describe('cost sparkline tooltip', () => {
  beforeEach(async () => {
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = async () =>
      ({ ok: true, json: async () => stateWith({}) }) as unknown as Response;
    new Function(clientJs())();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  function bars(): Element[] {
    return Array.from(document.querySelectorAll('.spark-bar'));
  }

  it("resolves the task title into each shipped bar's accessible label", () => {
    const shippedBar = bars().find((b) => b.classList.contains('spark-shipped'));
    expect(shippedBar).toBeTruthy();
    expect(shippedBar!.getAttribute('aria-label')).toContain('Fix the thing');
    expect(shippedBar!.getAttribute('aria-label')).toContain('shipped');
    expect(shippedBar!.getAttribute('aria-label')).toContain('12 turns');
    expect(shippedBar!.getAttribute('aria-label')).toContain('deadbee');
  });

  it("names the failing gate check in a reverted bar's label", () => {
    const revertedBar = bars().find((b) => b.getAttribute('aria-label')?.includes('reverted'));
    expect(revertedBar).toBeTruthy();
    expect(revertedBar!.getAttribute('aria-label')).toContain('reverted — typecheck');
  });

  it("labels a crashed-gate bar 'unverified', never the fixed 'reverted' string it used to fall back to", () => {
    // f3 has no gateResult of 'reverted' and no failedCheck — the old hand-rolled
    // flightVerdict() defaulted any non-shipped, non-died row straight to
    // 'reverted', which is exactly the drift the shared flightVerdictOf() fixed
    // for the flight-log and trace; the sparkline must not regress it back.
    const unverifiedBar = bars().find((b) => b.getAttribute('aria-label')?.includes('unverified'));
    expect(unverifiedBar).toBeTruthy();
    expect(unverifiedBar!.getAttribute('aria-label')).not.toContain('reverted');
  });

  it('colors each bar by its own verdict, not a shipped/reverted binary', () => {
    // The tooltip text was fixed to the shared verdict once already, but the
    // bar's CSS class stayed a hand-rolled `shipped ? 'spark-shipped' :
    // 'spark-reverted'` — so every non-ship bar still rendered red ('reverted')
    // regardless of what its own tooltip said. Each verdict must get its own class.
    const all = bars();
    const revertedBar = all.find((b) => b.getAttribute('aria-label')?.includes('reverted'));
    const unverifiedBar = all.find((b) => b.getAttribute('aria-label')?.includes('unverified'));
    const noCommitBar = all.find((b) => b.getAttribute('aria-label')?.includes('no commit'));
    expect(revertedBar!.classList.contains('spark-reverted')).toBe(true);
    expect(unverifiedBar!.classList.contains('spark-unverified')).toBe(true);
    expect(unverifiedBar!.classList.contains('spark-reverted')).toBe(false);
    // f4: no gateResult, no death — 'no commit' verdict; split(' ')[0] must not
    // leak the space into the class name (would regress to the 'spark-reverted'
    // fallback this whole fix is removing).
    expect(noCommitBar!.classList.contains('spark-no')).toBe(true);
    expect(noCommitBar!.classList.contains('spark-reverted')).toBe(false);
  });

  it('shows a tooltip on hover and hides it on mouseout', () => {
    const bar = bars()[0]!;
    bar.dispatchEvent(new Event('mouseover', { bubbles: true }));
    const tip = document.querySelector('.spark-tip') as HTMLElement | null;
    expect(tip).not.toBeNull();
    expect(tip!.hidden).toBe(false);
    expect(tip!.textContent).toContain(bar.getAttribute('data-tip-title'));

    bar.dispatchEvent(new Event('mouseout', { bubbles: true }));
    expect(tip!.hidden).toBe(true);
  });

  it('shows the same tooltip on focusin and hides it on focusout (keyboard access)', () => {
    const bar = bars()[1]!;
    bar.dispatchEvent(new Event('focusin', { bubbles: true }));
    const tip = document.querySelector('.spark-tip') as HTMLElement | null;
    expect(tip).not.toBeNull();
    expect(tip!.hidden).toBe(false);
    expect(tip!.textContent).toContain(bar.getAttribute('data-tip-verdict'));

    bar.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(tip!.hidden).toBe(true);
  });

  it("labels a checkpointed bar honestly — WIP was packed, never 'nothing committed'", () => {
    // f5 hit the turn cap mid-unit but its WIP got packed into a real
    // checkpoint commit (ZERO-WORK-LOSS) — the old shared verdict/headline
    // collapsed this into the same 'turn-capped' bucket as a firing that
    // committed nothing at all, producing a false "nothing committed"
    // headline live in production (firing 163). It must get its own verdict
    // and surface the real checkpoint commit subject instead.
    const checkpointedBar = bars().find((b) => b.classList.contains('spark-checkpointed'));
    expect(checkpointedBar).toBeTruthy();
    expect(checkpointedBar!.classList.contains('spark-turn-capped')).toBe(false);
    const label = checkpointedBar!.getAttribute('aria-label') ?? '';
    expect(label).toContain('checkpointed');
    expect(label).not.toContain('nothing committed');
    expect(checkpointedBar!.getAttribute('data-tip-title')).toContain('checkpoint');
  });

  it('gives only the first bar in each spark group a Tab stop (roving tabindex, D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi), all still role=button', () => {
    const groups = Array.from(document.querySelectorAll('.spark'));
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      const groupBars = Array.from(group.querySelectorAll('.spark-bar'));
      expect(groupBars.length).toBeGreaterThan(0);
      groupBars.forEach((bar, i) => {
        expect(bar.getAttribute('tabindex')).toBe(i === 0 ? '0' : '-1');
        expect(bar.getAttribute('role')).toBe('button');
      });
    }
  });

  function costSparkGroup(): HTMLElement {
    const group = document.querySelector('.spark[aria-label*="Cost per firing"]');
    if (!group) throw new Error('expected the cost sparkline group to render');
    return group as HTMLElement;
  }

  it('moves the roving Tab stop within one spark group with ArrowRight/ArrowLeft/Home/End, clamped at the ends, never crossing into another group', () => {
    const group = costSparkGroup();
    const groupBars = () => Array.from(group.querySelectorAll('.spark-bar')) as HTMLElement[];
    const [bar0, bar1, bar2] = groupBars();
    if (!bar0 || !bar1 || !bar2)
      throw new Error('expected at least 3 bars in the cost spark group');

    bar0.focus();
    bar0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(groupBars().map((b) => b.getAttribute('tabindex'))).toEqual(
      groupBars().map((b, i) => (i === 1 ? '0' : '-1')),
    );
    expect(document.activeElement).toBe(bar1);

    bar1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const last = groupBars()[groupBars().length - 1]!;
    expect(document.activeElement).toBe(last);
    expect(last.getAttribute('tabindex')).toBe('0');

    // ArrowRight at the last bar clamps instead of wrapping into another group.
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(last);

    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(bar0);
    expect(bar0.getAttribute('tabindex')).toBe('0');

    // A different spark group's own roving stop is untouched.
    const otherGroups = Array.from(document.querySelectorAll('.spark')).filter((g) => g !== group);
    for (const other of otherGroups) {
      expect(other.querySelectorAll('.spark-bar')[0]?.getAttribute('tabindex')).toBe('0');
    }
  });

  it('moves the roving tab stop to whichever bar gets mouse/programmatic focus, scoped to its own spark group', () => {
    const group = costSparkGroup();
    const groupBars = Array.from(group.querySelectorAll('.spark-bar')) as HTMLElement[];
    const target = groupBars[2];
    if (!target) throw new Error('expected at least 3 bars in the cost spark group');

    target.focus();
    expect(groupBars.map((b) => b.getAttribute('tabindex'))).toEqual(
      groupBars.map((b) => (b === target ? '0' : '-1')),
    );
  });
});
