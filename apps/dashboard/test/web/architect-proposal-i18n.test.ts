// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * search.ts's ARCHITECT proposal action card (renderProposal()) painted its
 * "ARCHITECT proposes: <tool>" summary, "Running…"/"Done."/"Failed: …"
 * status lines, the "Confirm"/"Confirm (destructive)" button text, and their
 * matching data-tip/aria-label hover texts as hardcoded English literals set
 * via el()/textContent/setAttribute at proposal-render and click time.
 * `pnpm i18n:untagged` never flagged any of them: the text is assigned via
 * imperative DOM calls, not an HTML template the tag scanner reads — the
 * same blind spot ask-flow-i18n.test.ts pinned for the Ask button's status
 * lines. This pins the tr()-at-paint-time route for all of them, in both
 * locales. See architect-action-card.test.ts for the card's behavioral
 * (safety-gating) coverage this leaves untouched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  projects: [
    {
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
    },
  ],
  empty: false,
};

function sseBody(payload: unknown): ReadableStream<Uint8Array> {
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frame));
      controller.close();
    },
  });
}

function mockFetches(opts: { proposal?: unknown; executeResult?: unknown }): void {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    if (typeof url === 'string' && url === '/api/ask/stream') {
      return {
        ok: true,
        body: sseBody({ done: true, ok: true, answer: 'ok', sources: [], proposal: opts.proposal }),
      } as unknown as Response;
    }
    if (typeof url === 'string' && url === '/api/control/execute') {
      return {
        ok: true,
        json: async () => opts.executeResult ?? { ok: true, result: { items: [] } },
      } as Response;
    }
    return { ok: true, json: async () => STATE } as Response;
  });
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

async function askViaUi(question: string): Promise<void> {
  await vi.advanceTimersByTimeAsync(1); // first fleet paint populates the project picker
  const sel = document.getElementById('search-project') as HTMLSelectElement;
  const qEl = document.getElementById('search-q') as HTMLInputElement;
  const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
  sel.value = 'p1';
  qEl.value = question;
  askBtn.click();
  await vi.advanceTimersByTimeAsync(1);
}

describe('ARCHITECT proposal action card i18n', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('paints every proposal-card status/label line via tr(), not hardcoded literals', () => {
    const js = clientJs();
    expect(js).toContain("tr('architectProposes'");
    expect(js).toContain("tr('controlRunning')");
    expect(js).toContain("tr('controlDone')");
    expect(js).toContain("tr('controlFailed'");
    expect(js).toContain("tr('controlFailedRequestError')");
    expect(js).toContain("tr('controlUnknownError')");
    expect(js).toContain("tr('controlConfirm')");
    expect(js).toContain("tr('controlConfirmDestructive')");
    expect(js).toContain("tr('controlConfirmTip')");
    expect(js).toContain("tr('controlConfirmDestructiveTip')");
    expect(js).not.toContain("'ARCHITECT proposes: '");
    expect(js).not.toContain("'Running…'");
    expect(js).not.toContain("statusEl.textContent = 'Done.'");
    expect(js).not.toContain("'Failed: request error.'");
    expect(js).not.toContain("'This action cannot be undone — confirm to run it'");
    expect(js).not.toContain("'Run this proposed action'");
  });

  it('shows the Hebrew "Done." status once a read-safety proposal auto-runs', async () => {
    mockFetches({
      proposal: { tool: 'tasks_list', args: { projectId: 'p1' }, safety: 'read' },
      executeResult: { ok: true, result: [] },
    });
    new Function(clientJs())();
    switchToHebrew();

    await askViaUi('list the open tasks');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.control-proposal-status')?.textContent).toBe(
      STRINGS.he.controlDone,
    );
    expect(STRINGS.he.controlDone).not.toBe(STRINGS.en.controlDone);
  });

  it('labels the write-safety Confirm button and its tip in Hebrew', async () => {
    mockFetches({
      proposal: {
        tool: 'tasks_set_status',
        args: { taskId: 't1', status: 'queued' },
        safety: 'write',
      },
    });
    new Function(clientJs())();
    switchToHebrew();

    await askViaUi('move t1 to queued');

    const confirmBtn = document.querySelector('.control-proposal-confirm') as HTMLButtonElement;
    expect(confirmBtn.textContent).toBe(STRINGS.he.controlConfirm);
    expect(confirmBtn.getAttribute('data-tip')).toBe(STRINGS.he.controlConfirmTip);
    expect(confirmBtn.getAttribute('aria-label')).toBe(STRINGS.he.controlConfirmTip);
  });

  it('labels the destructive-safety Confirm button and its tip in Hebrew', async () => {
    mockFetches({
      proposal: { tool: 'project_reset', args: { projectId: 'p1' }, safety: 'destructive' },
    });
    new Function(clientJs())();
    switchToHebrew();

    await askViaUi('reset the project');

    const confirmBtn = document.querySelector('.control-proposal-confirm') as HTMLButtonElement;
    expect(confirmBtn.textContent).toBe(STRINGS.he.controlConfirmDestructive);
    expect(confirmBtn.getAttribute('data-tip')).toBe(STRINGS.he.controlConfirmDestructiveTip);
  });

  it('renders the Hebrew server-error text with the substituted message', async () => {
    mockFetches({
      proposal: { tool: 'tasks_list', args: { projectId: 'p1' }, safety: 'read' },
      executeResult: { ok: false, error: 'a project id is required' },
    });
    new Function(clientJs())();
    switchToHebrew();

    await askViaUi('list the open tasks');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.control-proposal-status')?.textContent).toBe(
      STRINGS.he.controlFailed.replace('{name}', 'a project id is required'),
    );
  });

  it('renders the Hebrew request-error text when the execute call itself rejects', async () => {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/ask/stream') {
        return {
          ok: true,
          body: sseBody({
            done: true,
            ok: true,
            answer: 'ok',
            sources: [],
            proposal: { tool: 'tasks_list', args: { projectId: 'p1' }, safety: 'read' },
          }),
        } as unknown as Response;
      }
      if (typeof url === 'string' && url === '/api/control/execute') {
        throw new Error('network down');
      }
      return { ok: true, json: async () => STATE } as Response;
    });
    new Function(clientJs())();
    switchToHebrew();

    await askViaUi('list the open tasks');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.control-proposal-status')?.textContent).toBe(
      STRINGS.he.controlFailedRequestError,
    );
  });
});
