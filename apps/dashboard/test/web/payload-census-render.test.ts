// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE RENDER-AND-DIFF PAYLOAD CENSUS — slice (b) of the payload census split
 * (docs/debriefs/2026-09-27-verdict-ap-mtui8t6l-0-payload-census-split-confirmed.md).
 * `payload-census.test.ts` (slice a) infers "this field reaches the panel"
 * from renderer SOURCE TEXT — a receiver-scoped regex match. That is still an
 * inference: a field could match the text while never actually changing what
 * a browser paints (or vice versa, though slice a's fail-closed match makes
 * that direction rare). This file measures the real thing: it boots the
 * actual client bundle (`renderShell()` + `clientJs()` behind a mocked
 * `fetch`, the same real-bundle convention `pool-client-link.test.ts` /
 * `pr-check-strip.test.ts` / `publicity-roving-tabindex.test.ts` already use)
 * and, for every field `payload-census.test.ts` censuses across all three
 * `PAYLOAD_INTERFACES` entries, renders the panel twice with ONLY that field
 * varied and asserts the rendered DOM differs. It also covers the fields a
 * source-text match structurally cannot verify — `elapsedMs`'s formatted
 * duration, `claims`' derived ledger text, `dormant`'s element-shape switch —
 * where "the text mentions this field" says nothing about what actually
 * changes on screen.
 *
 * Each "after" snapshot is taken by waiting for the target element to exist
 * again (`document.open()`/`write()`/`close()` briefly removes it on every
 * reboot) and ONLY THEN reading its HTML — comparing against a snapshot taken
 * mid-teardown would find "some" difference (present vs `undefined`) no
 * matter what the varied field actually does, a false pass a first version of
 * this file shipped and a workflow-field mutation caught: disabling the real
 * `check.workflow` read left the chip byte-identical, and only the
 * presence-then-compare shape turns that red.
 *
 * Excused fields (`PoolIssue#labels`/`#assignees`, tracked in
 * `payload-census.test.ts`'s `EXCUSED`) are skipped here too: there is
 * nothing to render-diff for a field the panel does not paint yet.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PoolIssue — every rendered field changes the pool panel item', () => {
  function bootPool(entries: unknown): void {
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/pool-client')) {
        return { ok: true, json: async () => ({ entries }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ projects: [], empty: true }) } as unknown as Response;
    });
    new Function(clientJs())();
  }

  /** Waits for the item to exist (a reboot briefly removes it) and only then
   *  reads its HTML — see the file header for why the wait must come first. */
  async function itemHtml(): Promise<string> {
    await vi.waitFor(() => expect(document.querySelector('.pool-client-item')).not.toBeNull());
    return document.querySelector('.pool-client-item')!.outerHTML;
  }

  const BASE_ISSUE = {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    url: 'https://github.com/example/repo/issues/42',
    assignees: [],
  };
  const DECISION = { decision: 'claim', reasoning: 'claiming #42 for octocat' };

  it('number: a different issue number changes the rendered item', async () => {
    bootPool([{ issue: BASE_ISSUE, decision: DECISION }]);
    const before = await itemHtml();

    bootPool([{ issue: { ...BASE_ISSUE, number: 99 }, decision: DECISION }]);
    expect(await itemHtml()).not.toBe(before);
  });

  it('title: a different title changes the rendered item', async () => {
    bootPool([{ issue: BASE_ISSUE, decision: DECISION }]);
    const before = await itemHtml();

    bootPool([
      { issue: { ...BASE_ISSUE, title: 'A completely different title' }, decision: DECISION },
    ]);
    expect(await itemHtml()).not.toBe(before);
  });

  it('url: dropping the url changes the rendered item (link becomes plain text)', async () => {
    bootPool([{ issue: BASE_ISSUE, decision: DECISION }]);
    const before = await itemHtml();

    bootPool([{ issue: { ...BASE_ISSUE, url: undefined }, decision: DECISION }]);
    expect(await itemHtml()).not.toBe(before);
  });

  it('claims (derived via PoolBrowseEntry): a live claim adds the ledger line', async () => {
    bootPool([{ issue: BASE_ISSUE, decision: DECISION, claims: [] }]);
    const before = await itemHtml();
    expect(document.querySelector('.pool-client-ledger')).toBeNull();

    bootPool([
      {
        issue: BASE_ISSUE,
        decision: DECISION,
        claims: [
          {
            claim: {
              login: 'octocat',
              claimedAt: 1_700_000_000_000,
              assigned: true,
              contested: false,
            },
            quietDays: 1,
            releasesAt: null,
            stale: false,
          },
        ],
      },
    ]);
    expect(await itemHtml()).not.toBe(before);
    expect(document.querySelector('.pool-client-ledger')).not.toBeNull();
  });
});

describe('PublicityAffordance — every rendered field changes the publicity panel', () => {
  function bootPublicity(affordances: unknown): void {
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/publicity')) {
        return { ok: true, json: async () => ({ affordances }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ projects: [], empty: true }) } as unknown as Response;
    });
    new Function(clientJs())();
  }

  /** Waits for the live link to exist, then reads the panel's whole
   *  innerHTML — see the file header for why the wait must come first. */
  async function panelHtml(): Promise<string> {
    await vi.waitFor(() => expect(document.querySelector('.publicity-link')).not.toBeNull());
    return document.getElementById('publicity-panel')!.innerHTML;
  }

  const BASE_AFFORDANCE = {
    id: 'repo',
    label: 'View repo',
    url: 'https://github.com/octocat/hello-world',
    dormant: false,
    reasoning: 'octocat/hello-world is public — publicity affordances are live',
  };

  it('id: a different affordance id changes the rendered panel (aria-describedby target)', async () => {
    bootPublicity([BASE_AFFORDANCE]);
    const before = await panelHtml();

    bootPublicity([{ ...BASE_AFFORDANCE, id: 'star' }]);
    expect(await panelHtml()).not.toBe(before);
  });

  it('label: a different label changes the rendered panel', async () => {
    bootPublicity([BASE_AFFORDANCE]);
    const before = await panelHtml();

    bootPublicity([{ ...BASE_AFFORDANCE, label: 'Star' }]);
    expect(await panelHtml()).not.toBe(before);
  });

  it('url: a different url changes the rendered panel', async () => {
    bootPublicity([BASE_AFFORDANCE]);
    const before = await panelHtml();

    bootPublicity([
      { ...BASE_AFFORDANCE, url: 'https://github.com/octocat/hello-world/stargazers' },
    ]);
    expect(await panelHtml()).not.toBe(before);
  });

  it('dormant: flipping dormant changes the rendered panel (span vs live link)', async () => {
    bootPublicity([BASE_AFFORDANCE]);
    const before = await panelHtml();

    bootPublicity([{ ...BASE_AFFORDANCE, dormant: true }]);
    expect(await panelHtml()).not.toBe(before);
  });

  it('reasoning: different reasoning changes the rendered panel (tip + sr-only text)', async () => {
    bootPublicity([BASE_AFFORDANCE]);
    const before = await panelHtml();

    bootPublicity([{ ...BASE_AFFORDANCE, reasoning: 'a completely different reason' }]);
    expect(await panelHtml()).not.toBe(before);
  });

  it('count: adding a live count changes the rendered panel (badge appears)', async () => {
    bootPublicity([BASE_AFFORDANCE]);
    const before = await panelHtml();
    expect(document.querySelector('.publicity-count')).toBeNull();

    bootPublicity([{ ...BASE_AFFORDANCE, count: 7 }]);
    expect(await panelHtml()).not.toBe(before);
    expect(document.querySelector('.publicity-count')?.textContent).toBe('7');
  });
});

describe('PrCheckRun — every rendered field changes the pipeline strip chip', () => {
  function bootPr(checkRuns: unknown): void {
    document.open();
    document.write(renderShell());
    document.close();
    const plans = [
      {
        pr: {
          number: 33,
          title: 'feat(engine): deterministic diff-size gate',
          url: 'https://github.com/example/repo/pull/33',
          checkRuns,
        },
        decision: { decision: 'queue-for-human', reasoning: 'Security-hard path.' },
      },
    ];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/pr-review')) {
        return { ok: true, json: async () => ({ plans }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ projects: [], empty: true }) } as unknown as Response;
    });
    new Function(clientJs())();
  }

  /** Waits for the chip to exist, then reads its HTML — see the file header
   *  for why the wait must come first. */
  async function chipHtml(): Promise<string> {
    await vi.waitFor(() => expect(document.querySelector('.pr-review-check')).not.toBeNull());
    return document.querySelector('.pr-review-check')!.outerHTML;
  }

  const BASE_CHECK = { name: 'verify (ubuntu-latest)', state: 'pass' };

  it('name: a different check name changes the rendered chip', async () => {
    bootPr([BASE_CHECK]);
    const before = await chipHtml();

    bootPr([{ ...BASE_CHECK, name: 'verify (windows-latest)' }]);
    expect(await chipHtml()).not.toBe(before);
  });

  it('state: a different state changes the rendered chip (class + glyph)', async () => {
    bootPr([BASE_CHECK]);
    const before = await chipHtml();

    bootPr([{ ...BASE_CHECK, state: 'fail' }]);
    expect(await chipHtml()).not.toBe(before);
  });

  it('url: adding a log url changes the rendered chip (span becomes a link)', async () => {
    bootPr([BASE_CHECK]);
    const before = await chipHtml();

    bootPr([{ ...BASE_CHECK, url: 'https://github.com/example/repo/runs/1' }]);
    expect(await chipHtml()).not.toBe(before);
  });

  it('elapsedMs: a reported duration changes the rendered chip', async () => {
    bootPr([BASE_CHECK]);
    const before = await chipHtml();

    bootPr([{ ...BASE_CHECK, elapsedMs: 17_000 }]);
    expect(await chipHtml()).not.toBe(before);
  });

  it('workflow: a different workflow changes the rendered chip (tip/aria-label)', async () => {
    bootPr([BASE_CHECK]);
    const before = await chipHtml();

    bootPr([{ ...BASE_CHECK, workflow: 'verify.yml' }]);
    expect(await chipHtml()).not.toBe(before);
  });

  it('optional: flipping optional changes the rendered chip (dimmed class)', async () => {
    bootPr([BASE_CHECK]);
    const before = await chipHtml();

    bootPr([{ ...BASE_CHECK, optional: true }]);
    expect(await chipHtml()).not.toBe(before);
  });
});
