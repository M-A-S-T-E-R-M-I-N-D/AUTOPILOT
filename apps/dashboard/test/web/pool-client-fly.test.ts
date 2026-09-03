// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * End-to-end DOM coverage for the pool client's "fly locally" affordance
 * (epic 0007 slice 6's last-noted open item): a claim that queues a local
 * board task on a project now offers a "Fly" button right there in the pool
 * panel, wired to the existing `POST /api/fly` — no new flight machinery,
 * just the operator affordance to invoke it from here. Executes the ACTUAL
 * client bundle (`clientJs()`), the same real-bundle convention
 * `a11y.test.ts`'s pool-client coverage and `card-remove-tooltip.test.ts`
 * use, rather than re-deriving the click handler's behavior by hand.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  // The field the fly bar's own folder datalist (`web/flights.ts`'s
  // `FolderOption`) reads — the pool panel's project list comes from the
  // same live fleet state, so a real project always carries it too.
  rootPath: '/repo/dashboard',
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const POOL_ENTRY = {
  issue: {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    url: 'https://github.com/example/repo/issues/42',
    assignees: [],
  },
  decision: { decision: 'claim', reasoning: 'claiming #42 for octocat' },
};

function mockFetch(flyResponse: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pool-client/execute')) {
      return {
        ok: true,
        json: async () => ({
          decision: POOL_ENTRY.decision,
          commandResults: [{ command: { details: 'assigning #42 to octocat' }, code: 0 }],
          taskQueued: true,
        }),
      };
    }
    if (url.includes('/api/pool-client')) {
      return { ok: true, json: async () => ({ entries: [POOL_ENTRY] }) };
    }
    if (url.includes('/api/fly')) {
      return { ok: true, json: async () => flyResponse };
    }
    return { ok: true, json: async () => STATE };
  });
}

function boot(flyResponse: unknown = { started: true, message: 'Flying Dashboard.' }) {
  document.open();
  document.write(renderShell(''));
  document.close();
  const fetchMock = mockFetch(flyResponse);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  new Function(clientJs())();
  return fetchMock;
}

async function claimAgainstProjectP1(): Promise<void> {
  await vi.waitFor(() => {
    const select = document.querySelector('.pool-client-project') as HTMLSelectElement | null;
    expect(select?.options.length).toBe(2); // 'No local task' + PROJECT
  });
  const select = document.querySelector('.pool-client-project') as HTMLSelectElement;
  select.value = 'p1';
  const claimBtn = document.querySelector('[data-pool-client-execute="42"]') as HTMLButtonElement;
  claimBtn.click();
  await vi.waitFor(() => {
    expect(document.querySelector('.pool-client-fly')).not.toBeNull();
  });
}

describe('pool client "fly locally" affordance', () => {
  beforeEach(() => vi.spyOn(window, 'confirm').mockReturnValue(true));
  afterEach(() => vi.restoreAllMocks());

  it('shows a Fly button naming the project after a claim queues a local board task, and removes the claim controls', async () => {
    boot();
    await claimAgainstProjectP1();

    const flyBtn = document.querySelector('.pool-client-fly') as HTMLButtonElement;
    expect(flyBtn.textContent).toBe('Fly');
    expect(flyBtn.getAttribute('aria-label')).toContain('Fly "Dashboard" now');
    expect(flyBtn.getAttribute('data-tip')).toBe(flyBtn.getAttribute('aria-label'));
    // No second claim attempt is possible once the claim has succeeded.
    expect(document.querySelector('.pool-client-project')).toBeNull();
    expect(document.querySelector('[data-pool-client-execute]')).toBeNull();
  });

  it("POSTs /api/fly with the claimed project's folder when Fly is clicked, and reports success", async () => {
    const fetchMock = boot();
    await claimAgainstProjectP1();

    const flyBtn = document.querySelector('.pool-client-fly') as HTMLButtonElement;
    flyBtn.click();

    // The fly bar's own idle status poll also hits GET /api/fly with no
    // `method` — only the POST this button triggers carries one, so that's
    // the call under test.
    const isFlyPost = (c: unknown[]): boolean =>
      String(c[0]).includes('/api/fly') && (c[1] as RequestInit | undefined)?.method === 'POST';
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(isFlyPost)).toBe(true);
    });
    const flyCall = fetchMock.mock.calls.find(isFlyPost);
    if (!flyCall) {
      throw new Error('expected a POST call to /api/fly');
    }
    expect(flyCall[1].method).toBe('POST');
    expect(JSON.parse(flyCall[1].body)).toEqual({ folder: '/repo/dashboard' });

    await vi.waitFor(() => {
      expect(document.querySelector('.pool-client-result')?.textContent).toBe(
        '✓ Flying Dashboard.',
      );
    });
    expect(flyBtn.disabled).toBe(true);
  });

  it('reports a failed fly with the server message and leaves the button enabled to retry', async () => {
    boot({ started: false, message: 'a flight is already running there' });
    await claimAgainstProjectP1();

    const flyBtn = document.querySelector('.pool-client-fly') as HTMLButtonElement;
    flyBtn.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.pool-client-result')?.textContent).toBe(
        '✗ a flight is already running there',
      );
    });
    expect(flyBtn.disabled).toBe(false);
  });
});
