// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The MIRROR PASS panel's per-project gate on the client (EPIC 0019 S3
 * "issues⇄board mirror PER PROJECT", board web-mtrh1hlh-62l41b). The `gh`
 * CLI acts on ONE repository; every mirror-pass preview reads that
 * repository's issues. `flight/mirror-pass-execute.ts`'s execute gate already
 * refuses a project whose git origin is a different repository — but the
 * panel still fetched all four gh-reading previews for such a project,
 * rendered the WRONG repository's issues as if they were this project's
 * findings, and then showed execute buttons that could only ever come back
 * "Not run — repo-mismatch". Drives the real served bundle in jsdom, the
 * same way `mirror-pass-panel-guest.test.ts` covers the role gate: a known
 * mismatch is said up front, nothing wrong-repo is fetched or rendered, and
 * the two "nothing to compare" outs the server gate keeps (no GitHub origin,
 * unresolved identity) keep the single-context behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

// waitFor with a 5 s ceiling (2026-09-13): the 1 s default flaked under a full
// 700-file run and turned a landing gate red; the assertions are unchanged.
const waitFor = <T>(probe: () => T | Promise<T>): Promise<T> =>
  vi.waitFor(probe, { timeout: 5000 });

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

const RECONCILE_FINDING = [
  { finding: { issueNumber: 42, comment: 'Landed in abc123 — closing.' } },
];

const MAINTAINER = { login: 'octocat', nameWithOwner: 'octocat/hello-world', role: 'maintainer' };

function boot(githubRepo: string | null | undefined, identity: unknown): void {
  const project = githubRepo === undefined ? PROJECT : { ...PROJECT, githubRepo };
  const state = {
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
    projects: [project],
    empty: false,
  };
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity }) } as unknown as Response;
    }
    // Most specific mirror-pass paths first — every one of them contains the
    // bare `/api/mirror-pass` substring the reconcile preview matches on.
    if (url.includes('/api/mirror-pass/landing-note')) {
      return { ok: true, json: async () => ({ landingNote: [] }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass/drift')) {
      return { ok: true, json: async () => ({ drift: null }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass/stale-claims')) {
      return { ok: true, json: async () => ({ staleClaims: [] }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass/priority-follow')) {
      return { ok: true, json: async () => ({ priorityFollow: [] }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass')) {
      return {
        ok: true,
        json: async () => ({ mirrorPass: RECONCILE_FINDING }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => state } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

function previewCalls(): number {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
    String(call[0]).includes('/api/mirror-pass'),
  ).length;
}

function mismatchLine(): HTMLElement | null {
  return document.querySelector('.mirror-pass-repo-mismatch');
}

describe('the MIRROR PASS panel says up front when the project is a checkout of another repo (epic 0019 S3 per project)', () => {
  beforeEach(() => localStorage.removeItem('ap-locale'));
  afterEach(() => vi.restoreAllMocks());

  it('names both repositories, fetches none of the previews, and shows no finding or execute button', async () => {
    boot('someone-else/their-project', MAINTAINER);

    await waitFor(() => {
      expect(mismatchLine()).not.toBeNull();
    });
    expect(mismatchLine()?.textContent).toBe(
      STRINGS.en.mirrorPassRepoMismatch
        .replace('{projectRepo}', 'someone-else/their-project')
        .replace('{ghRepo}', 'octocat/hello-world'),
    );
    expect(previewCalls()).toBe(0);
    expect(document.querySelector('.mirror-pass-item')).toBeNull();
    expect(document.querySelector('[data-mirror-pass-execute]')).toBeNull();
  });

  it('is a two-value template the locale sweep re-fills in place — Hebrew keeps both names', async () => {
    boot('someone-else/their-project', MAINTAINER);
    await waitFor(() => {
      expect(mismatchLine()).not.toBeNull();
    });

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(mismatchLine()?.textContent).toBe(
      STRINGS.he.mirrorPassRepoMismatch
        .replace('{projectRepo}', 'someone-else/their-project')
        .replace('{ghRepo}', 'octocat/hello-world'),
    );
  });

  it("mirrors as before when the project's origin is gh's own repo, in any letter case", async () => {
    boot('OctoCat/Hello-World', MAINTAINER);

    await waitFor(() => {
      expect(document.querySelector('[data-mirror-pass-execute]')).not.toBeNull();
    });
    expect(mismatchLine()).toBeNull();
    expect(document.querySelectorAll('.mirror-pass-item')).toHaveLength(1);
    expect(previewCalls()).toBe(5);
  });

  it('keeps the single-context behavior when the project has no GitHub origin to compare', async () => {
    boot(null, MAINTAINER);

    await waitFor(() => {
      expect(document.querySelector('[data-mirror-pass-execute]')).not.toBeNull();
    });
    expect(mismatchLine()).toBeNull();
    expect(previewCalls()).toBe(5);
  });

  it('keeps the single-context behavior when identity is unresolved — an unknown answer is never a mismatch', async () => {
    boot('someone-else/their-project', null);

    await waitFor(() => {
      expect(document.querySelector('[data-mirror-pass-execute]')).not.toBeNull();
    });
    expect(mismatchLine()).toBeNull();
    expect(previewCalls()).toBe(5);
  });
});
