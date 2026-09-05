// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Three of `shell.ts`'s event-delegated handlers still painted hardcoded
 * English at runtime after the surrounding forms were translated (board
 * web-msnsndki-dz3vn1): the SOUL editor's submit handler wrote its two
 * `aria-live` status lines ("Proposed — …" / "Could not propose …"), the
 * github-sync click handler swapped the button's label to "Syncing…" for
 * the request's duration and painted "✗ Request failed …" on a network
 * error, and the github-pr submit handler did the same with "opening…" and
 * the same failure line. `pnpm i18n:untagged` never listed any of them —
 * they are runtime `textContent` writes inside handlers, not template text
 * — so this pins the `tr()`-at-paint-time route the Inbox status lines
 * already use, plus a real Hebrew paint for the two surfaces a test can
 * drive end to end (SOUL propose success/failure, github-sync busy label
 * and failure line).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
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

const KEYS: readonly StringKey[] = [
  'soulProposed',
  'soulProposeFailed',
  'githubSyncing',
  'githubPrOpening',
  'githubRequestFailed',
];

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

/** Route one endpoint to a stub; everything else keeps serving the fleet state. */
function stubEndpoint(url: string, respond: () => Promise<Response>): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (u: string, init?: RequestInit) => {
    if (u === url) return respond();
    return realFetch(u, init);
  }) as unknown as typeof fetch;
}

function submitSoulEdit(): void {
  const form = document.querySelector('[data-soul-edit]') as HTMLFormElement;
  const textarea = form.querySelector('textarea[name="text"]') as HTMLTextAreaElement;
  textarea.value = 'a hand-written amendment';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('handler-painted status lines i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('defines every status/busy key in every locale, with English matching the old literals', () => {
    for (const key of KEYS) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key], `${locale}.${key}`).toBeTruthy();
      }
    }
    // The copy itself is unchanged — only its route.
    expect(STRINGS.en.soulProposed).toBe('Proposed — review it above to ratify or dismiss.');
    expect(STRINGS.en.soulProposeFailed).toBe('Could not propose the edit — try again.');
    expect(STRINGS.en.githubSyncing).toBe('Syncing…');
    expect(STRINGS.en.githubPrOpening).toBe('opening…');
    expect(STRINGS.en.githubRequestFailed).toBe('✗ Request failed — try again shortly.');
  });

  it("paints every one of them via tr(), with no hardcoded literal left in shell.ts's own handlers", () => {
    const js = clientJs();
    for (const key of KEYS) expect(js).toContain(`tr('${key}')`);
    expect(js).not.toContain("'Proposed — review it above to ratify or dismiss.'");
    expect(js).not.toContain("'Could not propose the edit — try again.'");
    expect(js).not.toContain("'Syncing…'");
    expect(js).not.toContain("'opening…'");
    // The request-failed sentence still lives in other feature modules that
    // are inlined into the same bundle (issue-triage, release — separate
    // surfaces, separate slices), so pin shell.ts's own source, not the
    // assembled bundle. vitest's root is the repo root, and under jsdom
    // import.meta.url is an http: URL, so resolve from cwd.
    const shellSource = readFileSync(
      join(process.cwd(), 'apps/dashboard/src/web/shell.ts'),
      'utf8',
    );
    expect(shellSource).not.toContain("'✗ Request failed — try again shortly.'");
    expect(shellSource.split("tr('githubRequestFailed')").length - 1).toBe(2);
  });

  // This is deliberately the FIRST test that boots the shell: every boot()
  // registers another delegated click listener on the shared jsdom document,
  // and a second listener would capture "Syncing…" as ITS original label and
  // restore that last — an artifact of listener accumulation, not of the
  // handler. With one listener the restore assertion is exact.
  it('shows the Hebrew "Syncing…" busy label while the github-sync request is in flight, then restores the button', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    switchToHebrew();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    let finish: (r: Response) => void = () => {};
    stubEndpoint(
      '/api/github-sync/execute',
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );

    const syncBtn = document.querySelector('[data-github-sync="p1"]') as HTMLButtonElement;
    const idleLabel = syncBtn.textContent;
    syncBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(syncBtn.disabled).toBe(true);
    expect(syncBtn.textContent).toBe(STRINGS.he.githubSyncing);
    expect(STRINGS.he.githubSyncing).not.toBe(STRINGS.en.githubSyncing);

    finish({
      status: 200,
      json: async () => ({ ok: true, url: 'https://github.com/x/alpha' }),
    } as unknown as Response);
    await vi.waitFor(() => expect(syncBtn.disabled).toBe(false));
    expect(syncBtn.textContent).toBe(idleLabel);
  });

  it('paints the Hebrew request-failed line when the github-sync request throws', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    switchToHebrew();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubEndpoint('/api/github-sync/execute', async () => {
      throw new Error('network down');
    });

    const syncBtn = document.querySelector('[data-github-sync="p1"]') as HTMLButtonElement;
    syncBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = syncBtn.parentElement?.querySelector('.github-sync-result');
    await vi.waitFor(() => expect(result?.textContent).toBe(STRINGS.he.githubRequestFailed));
    expect(result?.className).toContain('github-sync-result-fail');
    expect(STRINGS.he.githubRequestFailed).not.toBe(STRINGS.en.githubRequestFailed);
  });

  it('reports a successful SOUL proposal in Hebrew once the locale is Hebrew', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    switchToHebrew();
    stubEndpoint(
      '/api/project/soul-propose',
      async () =>
        ({ ok: true, json: async () => ({ proposed: true, id: 'p1' }) }) as unknown as Response,
    );

    submitSoulEdit();

    const status = document.getElementById('soul-editor-status-p1');
    await vi.waitFor(() => expect(status?.textContent).toBe(STRINGS.he.soulProposed));
    expect(STRINGS.he.soulProposed).not.toBe(STRINGS.en.soulProposed);
  });

  it('reports a failed SOUL proposal in Hebrew when the request errors', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    switchToHebrew();
    stubEndpoint('/api/project/soul-propose', async () => {
      throw new Error('network down');
    });

    submitSoulEdit();

    const status = document.getElementById('soul-editor-status-p1');
    await vi.waitFor(() => expect(status?.textContent).toBe(STRINGS.he.soulProposeFailed));
    expect(STRINGS.he.soulProposeFailed).not.toBe(STRINGS.en.soulProposeFailed);
  });
});
