// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Pool client panel's own static text (board web-msnsndki-dz3vn1):
 * `web/features/pool-client.ts` already tags its "🧑‍🤝‍🧑 Pool" heading
 * `data-i18n="poolTitle"` and calls `translateDom()` at the end of every
 * render (it rebuilds on its own 30s poll, not the fleet stream's tick), but
 * every per-entry string it paints — the "No local task" option, the local
 * project `<select>`'s aria-label and tip, the Claim button (idle +
 * "Claiming…"), the Fly button (idle + "Starting…"), and the client-written
 * request-failed line shared by both catch blocks — was still an English
 * literal. Those are all built fresh inside `renderPoolClientPanel()` /
 * the panel's click handler on every render or click, so `tr()` at build
 * time is the right sweep — the same reasoning `report-menu.ts` followed
 * (report-menu-i18n.test.ts), not a `data-i18n` tag `translateDom()` would
 * need to revisit later. `client-tr-keys.test.ts` resolves every key
 * asserted here against STRINGS.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { poolClientJs } from '../../src/web/features/pool-client.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

describe('the Pool client panel reads its per-entry static text from STRINGS', () => {
  const out = poolClientJs();

  it('translates the "No local task" option', () => {
    expect(out).toContain("noneOpt.textContent = tr('poolNoLocalTask');");
    expect(out).not.toContain("'No local task'");
  });

  it('translates the project select aria-label and tip', () => {
    expect(out).toContain("projectSelect.setAttribute('aria-label', tr('poolProjectSelectAria'));");
    expect(out).toContain("projectSelect.setAttribute('data-tip', tr('poolProjectSelectTip'));");
    expect(out).not.toContain("'Local project to queue a board task on (optional)'");
  });

  it('translates the Claim button in both states', () => {
    expect(out).toContain("claimBtn.textContent = tr('poolClaim');");
    expect(out).toContain("b.textContent = tr('poolClaiming');");
    expect(out).not.toContain("'Claim'");
    expect(out).not.toContain("'Claiming…'");
  });

  it('translates the Fly button in both states', () => {
    expect(out).toContain("flyBtn.textContent = tr('poolFly');");
    expect(out).toContain("flyBtn.textContent = tr('poolStarting');");
    expect(out).not.toContain("'Fly'");
    expect(out).not.toContain("'Starting…'");
  });

  it('translates the request-failed line shared by both catch blocks', () => {
    const failed = out.match(/resultEl\.textContent = tr\('poolRequestFailed'\);/g) ?? [];
    expect(failed).toHaveLength(2);
    expect(out).not.toContain("'✗ Request failed — try again shortly.'");
  });
});

describe('STRINGS carries the pool-client keys', () => {
  it('keeps the English byte-identical to the old literals', () => {
    expect(STRINGS.en.poolNoLocalTask).toBe('No local task');
    expect(STRINGS.en.poolProjectSelectAria).toBe(
      'Local project to queue a board task on (optional)',
    );
    expect(STRINGS.en.poolClaim).toBe('Claim');
    expect(STRINGS.en.poolClaiming).toBe('Claiming…');
    expect(STRINGS.en.poolFly).toBe('Fly');
    expect(STRINGS.en.poolStarting).toBe('Starting…');
    expect(STRINGS.en.poolRequestFailed).toBe('✗ Request failed — try again shortly.');
  });
});

describe('the Pool client panel paints in the active locale (live, full bundle)', () => {
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
  };
  const STATE = {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 0,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
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

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
    try {
      localStorage.removeItem('ap-locale');
    } catch {
      /* jsdom without storage */
    }
  });

  it('switching to Hebrew renders the "No local task" option, the Claim button and its tip in Hebrew', async () => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/pool-client')) {
        return { ok: true, json: async () => ({ entries: [POOL_ENTRY] }) } as Response;
      }
      return { ok: true, json: async () => STATE } as Response;
    });
    new Function(clientJs())();
    // Switch locale BEFORE the panel's own initial fetch resolves — the
    // panel paints its per-entry text with tr() at render time (no
    // data-i18n tag to revisit later), so the switch must land before that
    // first render, the same ordering constraint the pool client's own
    // 30s-poll rebuild imposes in production.
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(document.documentElement.lang).toBe('he');
    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() => {
      expect(document.querySelector('.pool-client-project')).not.toBeNull();
    });
    const select = document.querySelector('.pool-client-project') as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe(STRINGS.he.poolNoLocalTask);
    expect(select.getAttribute('aria-label')).toBe(STRINGS.he.poolProjectSelectAria);
    const claimBtn = document.querySelector('.pool-client-execute') as HTMLButtonElement;
    expect(claimBtn.textContent).toBe(STRINGS.he.poolClaim);
  });
});
