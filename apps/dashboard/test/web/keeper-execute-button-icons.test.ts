// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE KEEPER EXECUTE BUTTONS LEAD WITH A STROKE ICON (epic 0025 slice 2,
 * "execute buttons"; board web-mtywp7zq-55f3o9). Landing, release and the
 * KEEPER issue triage execute buttons led with their panel's icon, but the
 * mirror pass's five, the Discussions triage run and the PR review Apply
 * were bare words. Each leads with a decorative icon now, the busy and idle
 * words swap through `setSweptText()` so the icon stays put through a run (a
 * `textContent` swap would drop it), and one rule spaces every execute
 * button's icon from its words. The issue triage and release runs led with
 * their icon from the start but swapped `textContent` on a click, so the
 * first run dropped it; they swap through `setSweptText()` now too.
 * Executes the ACTUAL client bundle (`clientJs()`) in jsdom, the
 * convention `pr-review-maintainer-icons.test.ts` uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

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

const MAINTAINER = { login: 'octocat', nameWithOwner: 'octocat/hello-world', role: 'maintainer' };

const FINDING = [{ finding: { issueNumber: 42, comment: 'Landed in abc123 — closing.' } }];

const DISCUSSION_PLANS = [
  {
    discussion: { number: 5, title: 'How do I configure X?' },
    decision: { decision: 'accept', reasoning: '#5 has no answer yet.' },
  },
];

const ISSUE_PLANS = [
  {
    issue: { number: 7, title: 'Keyboard nav is broken in the fleet table' },
    decision: { decision: 'accept', reasoning: 'No matching open task.' },
  },
];

const RELEASE = {
  tagName: 'v1.2.0',
  currentVersion: '1.2.0',
  plan: { ok: true, bump: 'minor', version: '1.3.0', changelog: '# Changelog' },
};

const PR_PLAN = {
  pr: {
    number: 42,
    title: 'fix: leaky socket',
    url: 'https://github.com/acme/widgets/pull/42',
    checkRuns: [],
  },
  decision: { decision: 'merge', reasoning: 'green and approved' },
};

// Each test evals the client bundle afresh and re-registers its top-level
// click delegates; document.open()/close() resets the DOM but not those
// listeners, so without this an earlier test's delegate would also answer a
// later click, capture the busy words as the label to restore, and restore
// them (execute-result-live-regions.test.ts carries the same guard).
let restoreListeners: () => void = () => {};

function trackDocumentListeners(): void {
  const added: Array<
    [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]
  > = [];
  const original = document.addEventListener.bind(document);
  document.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    added.push([type, listener, options]);
    return original(type, listener, options);
  }) as typeof document.addEventListener;
  restoreListeners = () => {
    for (const [type, listener, options] of added) {
      document.removeEventListener(type, listener, options);
    }
    document.addEventListener = original;
  };
}

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** The project page with every mirror pass preview carrying a finding, an
 *  open discussion and an open issue to accept, and a release to cut, so
 *  every execute button renders. Each execute POST fails, so a click walks
 *  the busy-then-restore path. */
function bootProjectPage(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) return json({ identity: MAINTAINER });
    if (url.includes('/execute')) throw new Error('network down');
    if (url.includes('/api/discussions-triage'))
      return json({ triage: { plans: DISCUSSION_PLANS } });
    if (url.includes('/api/issue-triage')) return json({ triage: ISSUE_PLANS });
    if (url.includes('/api/release')) return json({ release: RELEASE });
    // Most specific mirror-pass paths first — each contains `/api/mirror-pass`.
    if (url.includes('/api/mirror-pass/landing-note')) return json({ landingNote: FINDING });
    if (url.includes('/api/mirror-pass/drift')) {
      return json({
        drift: {
          versionDrift: { source: 'README.md', claimedVersion: '1', actualVersion: '2' },
          countsDrift: null,
          linkDrift: null,
        },
      });
    }
    if (url.includes('/api/mirror-pass/stale-claims')) return json({ staleClaims: FINDING });
    if (url.includes('/api/mirror-pass/priority-follow')) {
      return json({
        priorityFollow: [
          { finding: { taskId: 'github-7', issueNumber: 7, label: 'priority: high' } },
        ],
      });
    }
    if (url.includes('/api/mirror-pass')) return json({ mirrorPass: FINDING });
    return json(STATE);
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

async function button(selector: string): Promise<HTMLButtonElement> {
  await vi.waitFor(() => {
    expect(document.querySelector(selector)).not.toBeNull();
  });
  return document.querySelector(selector) as HTMLButtonElement;
}

/** The button's leading child is the named decorative icon. */
function expectLeadingIcon(b: Element, name: string): void {
  const first = b.firstElementChild;
  expect(first?.tagName.toLowerCase()).toBe('svg');
  expect(first?.classList.contains('icon-' + name)).toBe(true);
  expect(first?.getAttribute('aria-hidden')).toBe('true');
}

describe('the KEEPER execute buttons lead with a stroke icon (epic 0025)', () => {
  beforeEach(() => {
    localStorage.removeItem('ap-locale');
    trackDocumentListeners();
  });
  afterEach(() => {
    restoreListeners();
    vi.restoreAllMocks();
  });

  it('each of the mirror pass execute buttons leads with the icon of what it does, its words unchanged', async () => {
    bootProjectPage();
    const cases: Array<[string, string, string]> = [
      ['[data-mirror-pass-execute]', 'repeat', 'Run mirror pass'],
      ['[data-mirror-pass-drift-execute]', 'file-text', 'Fix doc drift'],
      ['[data-mirror-pass-landing-note-execute]', 'message-circle', 'Post landing note(s)'],
      ['[data-mirror-pass-stale-claim-execute]', 'lock-open', 'Free stale claim(s)'],
      ['[data-mirror-pass-priority-follow-execute]', 'flag', 'Follow GitHub priority label(s)'],
    ];
    for (const [selector, icon, words] of cases) {
      const b = await button(selector);
      expectLeadingIcon(b, icon);
      expect(b.textContent).toBe(words);
    }
  });

  it('the mirror pass run keeps its icon through the busy words and a failed run', async () => {
    bootProjectPage();
    const b = await button('[data-mirror-pass-execute]');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    b.click();

    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('Running…');
    expectLeadingIcon(b, 'repeat');
    await vi.waitFor(() => {
      expect(document.querySelector('.mirror-pass-result')?.textContent).toBe(
        'Mirror pass request failed.',
      );
    });
    expect(b.disabled).toBe(false);
    expectLeadingIcon(b, 'repeat');
    expect(b.textContent).toBe('Run mirror pass');
  });

  it('the Discussions triage run leads with its panel heading’s message-circle and keeps it through a failed run', async () => {
    bootProjectPage();
    const b = await button('[data-discussions-triage-execute]');
    expectLeadingIcon(b, 'message-circle');
    expect(b.textContent).toBe('Run KEEPER Discussions triage');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    b.click();

    expect(b.disabled).toBe(true);
    expectLeadingIcon(b, 'message-circle');
    await vi.waitFor(() => {
      expect(b.disabled).toBe(false);
    });
    expectLeadingIcon(b, 'message-circle');
    expect(b.textContent).toBe('Run KEEPER Discussions triage');
  });

  it('the issue triage run keeps its KEEPER key through the busy words and a failed run', async () => {
    bootProjectPage();
    const b = await button('[data-issue-triage-execute]');
    expectLeadingIcon(b, 'key-round');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    b.click();

    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('Triaging…');
    expectLeadingIcon(b, 'key-round');
    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-result')?.textContent).toBe(
        '✗ Request failed — try again shortly.',
      );
    });
    expect(b.disabled).toBe(false);
    expectLeadingIcon(b, 'key-round');
    expect(b.textContent).toBe('Run KEEPER triage');
  });

  it('the release run keeps its rocket through the busy words and a failed run', async () => {
    bootProjectPage();
    const b = await button('[data-release-execute]');
    expectLeadingIcon(b, 'rocket');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    b.click();

    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('Releasing…');
    expectLeadingIcon(b, 'rocket');
    await vi.waitFor(() => {
      expect(document.querySelector('.release-result')?.textContent).toBe(
        '✗ Request failed — try again shortly.',
      );
    });
    expect(b.disabled).toBe(false);
    expectLeadingIcon(b, 'rocket');
    expect(b.textContent).toBe('Cut release v1.3.0');
  });

  it('the release run keeps its rocket when the ritual answers with a refusal', async () => {
    bootProjectPage();
    const b = await button('[data-release-execute]');
    const pageFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/release/execute')) {
        return json({ ok: false, error: 'working tree is dirty' });
      }
      return pageFetch(input, init);
    }) as unknown as typeof fetch;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    b.click();

    expectLeadingIcon(b, 'rocket');
    await vi.waitFor(() => {
      expect(b.disabled).toBe(false);
    });
    expectLeadingIcon(b, 'rocket');
    expect(b.textContent).toBe('Cut release v1.3.0');
  });

  it('the PR review Apply leads with the KEEPER key, as the issue triage run does', async () => {
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/social-identity')) return json({ identity: null });
      if (url.startsWith('/api/pr-review')) return json({ plans: [PR_PLAN] });
      return json({ ...STATE, projects: [], empty: true });
    }) as unknown as typeof fetch;
    new Function(clientJs())();

    const b = await button('[data-pr-review-execute]');
    expectLeadingIcon(b, 'key-round');
    expect(b.textContent).toBe('Apply');
  });

  it('every execute button spaces its leading icon from its words', () => {
    const css = layoutCss();
    for (const cls of [
      'landing-execute',
      'release-execute',
      'pr-review-execute',
      'issue-triage-execute',
      'mirror-pass-execute',
      'discussions-triage-execute',
      'pr-review-human-merge',
      'pr-review-update-branch',
    ]) {
      expect(css).toContain('.' + cls + ' > .icon');
    }
  });
});
