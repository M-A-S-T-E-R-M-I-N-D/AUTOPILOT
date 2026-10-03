// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE POOL PANEL'S EXECUTE BUTTONS LEAD WITH A STROKE ICON (epic 0025 slice
 * 2, "execute buttons"; board web-mtywp7zq-55f3o9). Every KEEPER execute
 * button leads with a decorative icon of what it does, but the Pool panel's
 * Claim (and Claim anyway) and the Fly button a queued claim offers were
 * bare words. Claim leads with the `flag` the contest badge plants on a held
 * issue, and Fly with the `send` the rail's Fly link draws; the busy and idle
 * words swap through `setSweptText()`, so a run keeps the icon. Executes the
 * ACTUAL client bundle (`clientJs()`) in jsdom, the convention
 * `keeper-execute-button-icons.test.ts` uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const PROJECT = {
  id: 'p1',
  slug: 'dashboard',
  name: 'Dashboard',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 1,
  totalBytes: 1,
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
  activity: [],
  flightLog: [],
  tasks: [],
  rootPath: '/repo/dashboard',
  githubRepo: 'example/repo',
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const CLAIM_ENTRY = {
  issue: {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    url: 'https://github.com/example/repo/issues/42',
    assignees: [],
  },
  decision: { decision: 'claim', reasoning: 'claiming #42 for octocat' },
};

const CONTEST_ENTRY = {
  issue: {
    number: 43,
    title: 'The legend overlaps the chart',
    url: 'https://github.com/example/repo/issues/43',
    assignees: [],
  },
  decision: { decision: 'contest', reasoning: '#43 is held by gabibi555' },
  claims: [
    {
      claim: { login: 'gabibi555', claimedAt: 1, assigned: false, contested: false },
      quietDays: 2,
      releasesAt: null,
      stale: false,
    },
  ],
};

// The claim handler is a document click delegate each bundle eval registers
// again; document.open()/close() keeps it, so without this an earlier test's
// delegate would also answer a later click (keeper-execute-button-icons.test.ts
// carries the same guard).
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

/** The fleet page with a claimable and a held pool issue. `claim` answers the
 *  execute POST (a throw walks the failed-request path); `fly` answers the
 *  Fly button's POST /api/fly. */
function boot(claim: () => Response, fly: () => Response = () => json({})): void {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/pool-client/execute')) return claim();
    if (url.includes('/api/pool-client')) return json({ entries: [CLAIM_ENTRY, CONTEST_ENTRY] });
    if (url.includes('/api/fly') && init?.method === 'POST') return fly();
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

const QUEUED_CLAIM = (): Response =>
  json({
    decision: CLAIM_ENTRY.decision,
    commandResults: [{ command: { details: 'assigning #42 to octocat' }, code: 0 }],
    taskQueued: true,
  });

/** Claims #42 once the fleet state has routed it to its one project, so the
 *  queued claim offers its Fly button (pool-client-fly.test.ts's wait). */
async function claimForFly(): Promise<HTMLButtonElement> {
  await vi.waitFor(() => {
    const select = document.querySelector(
      '[data-repo="example/repo"].pool-client-project',
    ) as HTMLSelectElement | null;
    expect(select?.value).toBe('p1');
  });
  (await button('[data-pool-client-execute="42"]')).click();
  return button('.pool-client-fly');
}

describe('the Pool panel execute buttons lead with a stroke icon (epic 0025)', () => {
  beforeEach(() => {
    localStorage.removeItem('ap-locale');
    trackDocumentListeners();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    restoreListeners();
    vi.restoreAllMocks();
  });

  it('Claim and Claim anyway lead with the flag the held badge plants, their words unchanged', async () => {
    boot(QUEUED_CLAIM);

    const claim = await button('[data-pool-client-execute="42"]');
    expectLeadingIcon(claim, 'flag');
    expect(claim.textContent).toBe('Claim');
    const contest = await button('[data-pool-client-execute="43"]');
    expectLeadingIcon(contest, 'flag');
    expect(contest.textContent).toBe('Claim anyway');
  });

  it('Claim keeps its flag through the busy words and a failed request', async () => {
    boot(() => {
      throw new Error('network down');
    });
    const b = await button('[data-pool-client-execute="42"]');

    b.click();

    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('Claiming…');
    expectLeadingIcon(b, 'flag');
    await vi.waitFor(() => {
      expect(b.disabled).toBe(false);
    });
    expectLeadingIcon(b, 'flag');
    expect(b.textContent).toBe('Claim');
  });

  it('Claim keeps its flag when the claim is refused', async () => {
    boot(() => json({ error: 'gh is not signed in' }));
    const b = await button('[data-pool-client-execute="42"]');

    b.click();

    await vi.waitFor(() => {
      expect(b.disabled).toBe(false);
    });
    expectLeadingIcon(b, 'flag');
    expect(b.textContent).toBe('Claim');
  });

  it('the Fly a queued claim offers leads with the rail’s send and keeps it through a refused flight', async () => {
    boot(QUEUED_CLAIM, () =>
      json({ started: false, message: 'a flight is already running there' }),
    );
    const fly = await claimForFly();
    expectLeadingIcon(fly, 'send');
    expect(fly.textContent).toBe('Fly');

    fly.click();

    expect(fly.textContent).toBe('Starting…');
    expectLeadingIcon(fly, 'send');
    await vi.waitFor(() => {
      expect(document.querySelector('.pool-client-result')?.textContent).toBe(
        '✗ a flight is already running there',
      );
    });
    expect(fly.disabled).toBe(false);
    expectLeadingIcon(fly, 'send');
    expect(fly.textContent).toBe('Fly');
  });

  it('the Fly keeps its send through a failed request', async () => {
    boot(QUEUED_CLAIM, () => {
      throw new Error('network down');
    });
    const fly = await claimForFly();

    fly.click();

    await vi.waitFor(() => {
      expect(fly.disabled).toBe(false);
    });
    expectLeadingIcon(fly, 'send');
    expect(fly.textContent).toBe('Fly');
  });

  it('spaces each button’s leading icon from its words, like every other execute button', () => {
    const css = layoutCss();
    expect(css).toContain('.pool-client-execute > .icon');
    expect(css).toContain('.pool-client-fly > .icon');
  });
});
