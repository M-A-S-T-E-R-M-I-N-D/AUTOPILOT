// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE PIPELINE STRIP (operator, 2026-09-09: "אם אנחנו מביאים מידע
 * מהGITHUB למה אנחנו לא יכולים לקשר באופן ישיר... לתת יותר ביטוי לטסטים
 * שמתרחשים, השלבים... כמו שהם עושים").
 *
 * Both facts were already fetched and both were thrown away at the client
 * boundary: `gh pr list --json statusCheckRollup` returns every check run
 * with its own name, state, timing and log URL, and `deriveGateStatus`
 * collapsed all of it into one word. The panel showed "#33" as dead text
 * next to "pending" — no link, no stages, no sense of movement.
 *
 * These lock the strip: a state icon per check, GitHub-shaped durations,
 * a summary line that answers "where is this PR", and a deep link on the
 * PR number and on every check that reported one.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import axe from 'axe-core';
import {
  prCheckStateIcon,
  formatCheckDuration,
  prCheckRunTip,
  prCheckSummary,
  prDiffStat,
  prUnlistedFilesNote,
  humanMergeReadiness,
} from '../../src/web/pr-review-panel.js';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { ICON_NAMES } from '../../src/web/icons.js';

const CHECKS = [
  { name: 'commitlint (PR)', state: 'pass', elapsedMs: 17_000, url: 'https://github.com/o/r/1' },
  { name: 'verify (ubuntu-latest)', state: 'pass', elapsedMs: 649_000 },
  { name: 'verify (windows-latest)', state: 'running', elapsedMs: 260_000 },
  { name: 'e2e (dashboard, real browser)', state: 'queued' },
  { name: 'reuse lint (optional)', state: 'fail', optional: true },
];

describe('prCheckStateIcon — a shape per state, not colour alone', () => {
  const STATES = ['pass', 'fail', 'running', 'queued', 'skipped', 'unknown'];

  it('gives every state its own vendored icon', () => {
    const icons = STATES.map(prCheckStateIcon);
    expect(new Set(icons).size).toBe(icons.length);
    for (const name of icons) expect(ICON_NAMES).toContain(name);
  });

  it('draws the task row’s circle family, so a running check reads like an in-progress task', () => {
    expect(STATES.map(prCheckStateIcon)).toEqual([
      'circle-check',
      'circle-x',
      'circle-dot',
      'circle',
      'ban',
      'circle-question-mark',
    ]);
  });

  it('degrades an unrecognized future state to a question mark, not a crash', () => {
    expect(prCheckStateIcon('some-new-github-state')).toBe('circle-question-mark');
  });
});

describe('formatCheckDuration — the shape GitHub’s own checks list uses', () => {
  it('reads seconds under a minute and m+s above it', () => {
    expect(formatCheckDuration(17_000)).toBe('17s');
    expect(formatCheckDuration(284_000)).toBe('4m44s');
    expect(formatCheckDuration(1_051_000)).toBe('17m31s');
  });

  it('never renders a negative or fractional duration', () => {
    expect(formatCheckDuration(-5)).toBe('0s');
    expect(formatCheckDuration(1499)).toBe('1s');
  });
});

describe('prCheckSummary — answers “where is this PR” without counting chips', () => {
  it('counts only gating checks and names what is still moving', () => {
    expect(prCheckSummary(CHECKS)).toBe('2/4 checks passed · 1 running, 1 queued');
  });

  it('leads with failures when any gating check is red', () => {
    const red = [...CHECKS, { name: 'verify (macos-latest)', state: 'fail' }];
    expect(prCheckSummary(red)).toContain('1 failed');
  });

  it('says so honestly when nothing gating has reported', () => {
    expect(prCheckSummary([{ name: 'reuse lint (optional)', state: 'pass', optional: true }])).toBe(
      'No gating checks reported on this head yet.',
    );
  });

  it('reports a clean sweep with no trailing clause', () => {
    expect(prCheckSummary([{ name: 'a', state: 'pass' }])).toBe('1/1 checks passed');
  });
});

describe('prCheckRunTip — every chip explains itself', () => {
  it('names the check, its state, its elapsed time and its workflow', () => {
    const tip = prCheckRunTip({
      name: 'verify (windows-latest)',
      state: 'running',
      elapsedMs: 260_000,
      workflow: 'CI',
      url: 'https://github.com/o/r/2',
    });
    expect(tip).toContain('verify (windows-latest)');
    expect(tip).toContain('still running');
    expect(tip).toContain('4m20s elapsed');
    expect(tip).toContain('workflow: CI');
  });

  it('says plainly when a check does not gate the merge', () => {
    expect(
      prCheckRunTip({ name: 'reuse lint (optional)', state: 'fail', optional: true }),
    ).toContain('does not gate the merge');
  });
});

const PLANS = [
  {
    pr: {
      number: 33,
      title: 'feat(engine): deterministic diff-size gate',
      url: 'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/pull/33',
      checkRuns: CHECKS,
    },
    decision: { decision: 'queue-for-human', reasoning: 'Security-hard path.' },
  },
];

function bootWithPlans(plans: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pr-review')) {
      return { ok: true, json: async () => ({ plans }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ projects: [], empty: true }) } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('the rendered card links out and shows its stages', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes the PR number a real link to GitHub, safely targeted', async () => {
    bootWithPlans(PLANS);

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-number-link')).not.toBeNull();
    });
    const link = document.querySelector('.pr-review-number-link') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(
      'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/pull/33',
    );
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toBe('#33');
  });

  it('renders one chip per check with its state class, and links the ones that reported a log', async () => {
    bootWithPlans(PLANS);

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.pr-review-check').length).toBe(5);
    });
    expect(document.querySelector('.pr-review-check-running')).not.toBeNull();
    expect(document.querySelector('.pr-review-check-queued')).not.toBeNull();
    expect(document.querySelector('.pr-review-check-optional')).not.toBeNull();
    const linked = document.querySelectorAll('a.pr-review-check');
    expect(linked).toHaveLength(1);
    expect(linked[0]?.getAttribute('href')).toBe('https://github.com/o/r/1');
  });

  it('shows the summary line and per-chip durations', async () => {
    bootWithPlans(PLANS);

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-checks-summary')).not.toBeNull();
    });
    expect(document.querySelector('.pr-review-checks-summary')?.textContent).toBe(
      '2/4 checks passed · 1 running, 1 queued',
    );
    const times = [...document.querySelectorAll('.pr-review-check-time')].map((t) => t.textContent);
    expect(times).toContain('17s');
    expect(times).toContain('10m49s');
  });

  it('leads every chip with its state icon, hidden from screen readers so a chip is not read twice', async () => {
    bootWithPlans(PLANS);

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.pr-review-check')).toHaveLength(5);
    });
    const chips = [...document.querySelectorAll('.pr-review-check')];
    const leading = chips.map((chip) => chip.firstElementChild);
    expect(leading.map((icon) => icon?.getAttribute('class'))).toEqual([
      'icon icon-circle-check',
      'icon icon-circle-check',
      'icon icon-circle-dot',
      'icon icon-circle',
      'icon icon-circle-x',
    ]);
    for (const icon of leading) {
      expect(icon?.tagName.toLowerCase()).toBe('svg');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    }
    // Epic 0025: the old ✓/✗/◐/◌ glyphs are gone from the chip text, so the
    // name and the elapsed time are all a chip's text says.
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'commitlint (PR)17s',
      'verify (ubuntu-latest)10m49s',
      'verify (windows-latest)4m20s',
      'e2e (dashboard, real browser)',
      'reuse lint (optional)',
    ]);
  });

  it('falls back to plain text — never a dead link — when gh reported no url', async () => {
    bootWithPlans([{ pr: { number: 7, title: 'No url' }, decision: PLANS[0]!.decision }]);

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-number')).not.toBeNull();
    });
    expect(document.querySelector('.pr-review-number')?.tagName).toBe('SPAN');
    expect(document.querySelector('.pr-review-number-link')).toBeNull();
    expect(document.querySelector('.pr-review-checks')).toBeNull();
  });
});

/**
 * WHAT THE PR TOUCHES (board ap-mujmnnqt-1): gh already sends the diff's
 * line totals, its file count, every file path and every label — and the
 * card discarded all of it at the client boundary. A reviewer had to open
 * GitHub to learn whether #33 was a one-liner or a 40-file rewrite.
 */
describe('prDiffStat — GitHub’s own +N −M · N files shape', () => {
  it('reads the three gh totals the way GitHub’s own PR header does', () => {
    expect(
      prDiffStat({ number: 1, title: 'x', additions: 120, deletions: 34, changedFiles: 5 }),
    ).toBe('+120 −34 · 5 files');
  });

  it('says “file”, not “files”, for a one-file PR', () => {
    expect(prDiffStat({ number: 1, title: 'x', additions: 1, deletions: 0, changedFiles: 1 })).toBe(
      '+1 −0 · 1 file',
    );
  });

  it('leaves out a total gh did not confirm instead of painting it as 0', () => {
    expect(prDiffStat({ number: 1, title: 'x', changedFiles: 3 })).toBe('3 files');
    expect(prDiffStat({ number: 1, title: 'x', additions: 7, deletions: 2 })).toBe('+7 −2');
    expect(prDiffStat({ number: 1, title: 'x' })).toBe('');
  });
});

describe('prUnlistedFilesNote — gh lists at most 100 paths, and the card says so', () => {
  it('names how many files the enumerated list is missing', () => {
    expect(
      prUnlistedFilesNote({ number: 1, title: 'x', changedFiles: 112, touchedPaths: ['a', 'b'] }),
    ).toBe('…and 110 more gh did not list.');
  });

  it('stays silent when the list is complete or the total is unknown', () => {
    expect(
      prUnlistedFilesNote({ number: 1, title: 'x', changedFiles: 1, touchedPaths: ['a'] }),
    ).toBe('');
    expect(prUnlistedFilesNote({ number: 1, title: 'x', touchedPaths: ['a'] })).toBe('');
  });
});

describe('the rendered card shows what the PR touches', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const TOUCHING = {
    pr: {
      number: 40,
      title: 'fix(engine): tighten the diff gate',
      additions: 120,
      deletions: 34,
      changedFiles: 3,
      touchedPaths: ['packages/engine/src/diff-size-gate.ts', 'packages/engine/test/a.test.ts'],
      labels: ['security', 'do-not-merge'],
    },
    decision: { decision: 'queue-for-human', reasoning: 'Carries a hold label.' },
  };

  it('puts the diff size on a native, keyboard-operable disclosure that lists every path', async () => {
    bootWithPlans([TOUCHING]);

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-files')).not.toBeNull();
    });
    const files = document.querySelector('.pr-review-files') as HTMLDetailsElement;
    expect(files.tagName).toBe('DETAILS');
    expect(files.open).toBe(false);
    expect(files.querySelector('summary')?.textContent).toBe('+120 −34 · 3 files');
    const paths = [...files.querySelectorAll('.pr-review-files li')].map((li) => li.textContent);
    expect(paths).toEqual([
      'packages/engine/src/diff-size-gate.ts',
      'packages/engine/test/a.test.ts',
    ]);
    expect(files.querySelector('.pr-review-files p')?.textContent).toBe(
      '…and 1 more gh did not list.',
    );
  });

  it('shows every label by name as a labelled list', async () => {
    bootWithPlans([TOUCHING]);

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-labels')).not.toBeNull();
    });
    const list = document.querySelector('.pr-review-labels') as HTMLElement;
    expect(list.tagName).toBe('UL');
    expect(list.getAttribute('aria-label')).toBe('Labels');
    expect([...list.querySelectorAll('li')].map((l) => l.textContent)).toEqual([
      'security',
      'do-not-merge',
    ]);
  });

  it('is axe-clean with the file list open', async () => {
    bootWithPlans([TOUCHING]);

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-files')).not.toBeNull();
    });
    (document.querySelector('.pr-review-files') as HTMLDetailsElement).open = true;
    const panel = document.getElementById('pr-review-panel') as HTMLElement;
    // The a11y suite's options (a11y.test.ts): WCAG A/AA, contrast off since
    // jsdom paints no pixels to measure.
    const results = await axe.run(panel, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);
    // Not vacuous: the new list and disclosure were among the nodes axe checked.
    const passed = results.passes.flatMap((p) => p.nodes.map((n) => n.target.join(' ')));
    expect(passed.some((t) => t.includes('pr-review-labels'))).toBe(true);
    expect(passed).toContain('.pr-review-diffstat');
    expect(passed).toContain('.pr-review-files > ul > li:nth-child(1)');
  });

  it('keeps a hostile path or label as inert text, never markup', async () => {
    bootWithPlans([
      {
        ...TOUCHING,
        pr: {
          ...TOUCHING.pr,
          touchedPaths: ['<img src=x onerror=alert(1)>.ts'],
          labels: ['<b>x</b>'],
        },
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-files li')).not.toBeNull();
    });
    expect(document.querySelector('.pr-review-files img')).toBeNull();
    expect(document.querySelector('.pr-review-labels b')).toBeNull();
    expect(document.querySelector('.pr-review-files li')?.textContent).toBe(
      '<img src=x onerror=alert(1)>.ts',
    );
  });

  it('shows the size alone when gh listed no paths, and nothing at all when gh sent nothing', async () => {
    bootWithPlans([
      { ...TOUCHING, pr: { number: 41, title: 'Size only', additions: 2, deletions: 1 } },
      { ...TOUCHING, pr: { number: 42, title: 'Bare' } },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.pr-review-item')).toHaveLength(2);
    });
    const [sizeOnly, bare] = [...document.querySelectorAll('.pr-review-item')];
    expect(sizeOnly?.querySelector('.pr-review-files')).toBeNull();
    expect(sizeOnly?.querySelector('.pr-review-diffstat')?.textContent).toBe('+2 −1');
    expect(bare?.querySelector('.pr-review-diffstat')).toBeNull();
    expect(bare?.querySelector('.pr-review-labels')).toBeNull();
  });
});

/**
 * The client-side readiness mirror — the button must never invite a click
 * the server will refuse, and a refusal that names an action must offer
 * that action (operator, 2026-09-09: the merge refusal on #34 read
 * "update the branch first" with nothing in the app that could).
 */
describe('humanMergeReadiness — the button says what the server would', () => {
  const ALL_GREEN = { number: 33, title: 'x', checkRuns: [{ name: 'verify', state: 'pass' }] };

  it('is ready when every gating check passed and nothing blocks the merge', () => {
    expect(humanMergeReadiness(ALL_GREEN).ready).toBe(true);
  });

  it('offers the branch update when that is the only thing left', () => {
    const behind = { ...ALL_GREEN, behindBase: true };
    const readiness = humanMergeReadiness(behind);
    expect(readiness.ready).toBe(false);
    expect(readiness.behindBase).toBe(true);
    expect(readiness.reason).toContain('button beside this');
  });

  it('does not call a behind-base branch conflicting — that sends you hunting a conflict that is not there', () => {
    const behind = { ...ALL_GREEN, behindBase: true, mergeable: false };
    expect(humanMergeReadiness(behind).reason).not.toContain('conflicting');
  });

  it('names a real conflict as one, and an uncomputed state as its own thing', () => {
    expect(humanMergeReadiness({ ...ALL_GREEN, mergeable: false }).reason).toContain('conflicting');
    expect(
      humanMergeReadiness({ ...ALL_GREEN, mergeable: false, mergeStateUnknown: true }).reason,
    ).toContain('not computed');
  });

  it('leads with the checks — a red PR is not a branch-staleness problem', () => {
    const red = {
      ...ALL_GREEN,
      behindBase: true,
      checkRuns: [{ name: 'verify', state: 'fail' }],
    };
    expect(humanMergeReadiness(red).reason).toContain('1 check failed');
    expect(humanMergeReadiness(red).behindBase).toBeUndefined();
  });
});

describe('the update-branch button appears exactly when it can help', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders beside a disabled merge button on a behind-base PR', async () => {
    bootWithPlans([
      {
        pr: {
          number: 34,
          title: 'Behind base',
          behindBase: true,
          headRefOid: 'sha',
          checkRuns: [{ name: 'verify', state: 'pass' }],
        },
        decision: { decision: 'queue-for-human', reasoning: 'Security-hard path.' },
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-update-branch]')).not.toBeNull();
    });
    const merge = document.querySelector('[data-pr-human-merge]') as HTMLButtonElement;
    expect(merge.disabled).toBe(true);
    expect(merge.getAttribute('data-tip')).toContain('behind base');
  });

  it('stays away when the PR is simply ready to merge', async () => {
    bootWithPlans([
      {
        pr: { number: 33, title: 'Green', checkRuns: [{ name: 'verify', state: 'pass' }] },
        decision: { decision: 'queue-for-human', reasoning: 'Security-hard path.' },
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-human-merge]')).not.toBeNull();
    });
    expect(document.querySelector('[data-pr-update-branch]')).toBeNull();
    expect((document.querySelector('[data-pr-human-merge]') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('never offers either button on a card the ritual did not queue for a human', async () => {
    bootWithPlans([
      {
        pr: { number: 12, title: 'Auto', checkRuns: [{ name: 'verify', state: 'pass' }] },
        decision: { decision: 'merge', reasoning: 'Policy green.' },
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-review-execute]')).not.toBeNull();
    });
    expect(document.querySelector('[data-pr-human-merge]')).toBeNull();
    expect(document.querySelector('[data-pr-update-branch]')).toBeNull();
  });
});

/**
 * The retry path (operator, 2026-09-09): "after an ERROR the button stops
 * and you can't submit again — how do we solve it?" Two bugs behind one
 * symptom: the refusal message was wiped by an immediate re-poll, and a
 * red check left no verb to act on.
 */
// Shared by both describe blocks below: a queue-for-human PR with one red
// gating check, whose maintainer-verb response is fully caller-controlled —
// the re-run tests below and the 🔧 Diagnose tests further down both need a
// red check to render their button in the first place.
function bootWithRefusal(response: Record<string, unknown>): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pr-review/')) {
      return { ok: true, json: async () => response } as unknown as Response;
    }
    if (url.includes('/api/pr-review')) {
      return {
        ok: true,
        json: async () => ({
          plans: [
            {
              pr: {
                number: 34,
                title: 'Red PR',
                headRefOid: 'sha',
                checkRuns: [
                  { name: 'verify (ubuntu-latest)', state: 'pass' },
                  { name: 'verify (macos-latest)', state: 'fail' },
                ],
              },
              decision: { decision: 'queue-for-human', reasoning: 'Security-hard path.' },
            },
          ],
        }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({ projects: [], empty: true }) } as unknown as Response;
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  new Function(clientJs())();
}

describe('a refused action leaves its reason on screen and its button usable', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('offers a re-run button when a gating check is red, and says so in the merge tip', async () => {
    bootWithRefusal({ rerun: false, reason: 'x' });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-rerun-checks]')).not.toBeNull();
    });
    const merge = document.querySelector('[data-pr-human-merge]') as HTMLButtonElement;
    expect(merge.disabled).toBe(true);
    expect(merge.getAttribute('data-tip')).toContain('re-run the failed jobs');
  });

  it('keeps the failure message and re-enables the button after a refusal', async () => {
    bootWithRefusal({ rerun: false, reason: 'gh refused the re-run.' });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-rerun-checks]')).not.toBeNull();
    });
    const button = document.querySelector('[data-pr-rerun-checks]') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-result')?.textContent).toContain('gh refused');
    });
    // The reason must survive: a refusal changes nothing, so nothing
    // re-renders it away, and the same click can be tried again.
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('↻ Re-run failed');
    expect(document.querySelector('.pr-review-result')?.className).toContain('fail');
  });
});

/**
 * The 🔧 Diagnose button (epic 0020 slice 8, board web-mtvpuoj4-tv1z09) — the
 * fourth maintainer verb: re-run is the right answer to a flake and useless
 * against a real defect. Read-only GET, so unlike its three siblings it
 * fires no confirm dialog and never re-polls the panel on completion —
 * nothing about the PR changed, only what the operator knows about it.
 */
describe('the 🔧 Diagnose button — reads the failing check’s own verdict', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders beside re-run whenever a gating check is red', async () => {
    bootWithRefusal({ rerun: false, reason: 'x' });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose]')).not.toBeNull();
    });
    const diagnoseBtn = document.querySelector('[data-pr-diagnose]');
    expect(diagnoseBtn?.querySelector('svg.icon-wrench')).not.toBeNull();
    expect(diagnoseBtn?.textContent).toBe('Diagnose');
  });

  it('fetches the diagnose route and renders the verdict without a confirm dialog or a re-poll', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    bootWithRefusal({
      diagnosis: {
        verdict: 'defect',
        reasoning: ['The PR directly touches the failing test file(s): a.test.ts.'],
      },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose]')).not.toBeNull();
    });
    const button = document.querySelector('[data-pr-diagnose]') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-result')?.textContent).toContain('Defect');
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    expect(button.querySelector('svg.icon-wrench')).not.toBeNull();
    expect(button.textContent).toBe('Diagnose');
    expect(document.querySelector('.pr-review-result')?.className).toContain(
      'pr-review-result-fail',
    );
  });

  it('gives a flake verdict its own ok styling', async () => {
    bootWithRefusal({
      diagnosis: {
        verdict: 'flake',
        reasoning: ['a.test.ts is already quarantined as flaky (x).'],
      },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose]')).not.toBeNull();
    });
    (document.querySelector('[data-pr-diagnose]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-result')?.textContent).toContain('Flake');
    });
    expect(document.querySelector('.pr-review-result')?.className).toContain('pr-review-result-ok');
  });
});
