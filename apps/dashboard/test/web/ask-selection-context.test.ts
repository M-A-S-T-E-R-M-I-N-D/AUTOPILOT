// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0026 "the tasks screen" slice 3 (board web-mtywp82m-zodn7z): the Ask
 * sheet "carries the current selection as context — about this task". The
 * selection is the board's own checked rows, the set the "N selected" line
 * counts. An Ask request names them in its view context, and the open sheet
 * says above its composer what it is about, following the boxes live.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { ASK_SELECTION_TITLE_CAP, selectedTasksViewText } from '../../src/web/ask-selection.js';

// Every boot() re-registers the client's document/window listeners; strip them
// after each test so a delegated handler never runs once per stale copy.
type Tracked = [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const trackedListeners: Tracked[] = [];
for (const target of [document, window] as EventTarget[]) {
  const native = target.addEventListener.bind(target);
  target.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ) => {
    trackedListeners.push([target, type, listener, options]);
    return native(type, listener, options as AddEventListenerOptions | undefined);
  }) as typeof target.addEventListener;
}

function task(id: string, title: string, status: string) {
  return {
    id,
    title,
    status,
    source: 'dashboard',
    severity: null,
    dimension: null,
    focus: false,
    priority: null,
    at: 1,
  };
}

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [
    {
      id: 'p1',
      slug: 'alpha',
      name: 'Alpha',
      status: 'idle',
      createdAt: 1,
      fileCount: 2,
      totalBytes: 100,
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
      lastActivityAt: null,
      flightLog: [],
      activity: [],
      tasks: [
        task('t1', 'Wire up the retry queue', 'queued'),
        task('t2', 'Rename the webhook payload', 'needs_approval'),
        task('t3', 'Old cleanup task', 'done'),
      ],
    },
  ],
  empty: false,
};

let askBodies: Array<Record<string, unknown>> = [];

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  askBodies = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (url === '/api/ask/stream') {
      askBodies.push(JSON.parse(String(init?.body ?? '{}')));
      const frame = `data: ${JSON.stringify({ done: true, ok: true, answer: 'ok', sources: [] })}\n\n`;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(frame));
          controller.close();
        },
      });
      return { ok: true, body } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function check(taskId: string, checked = true): void {
  const box = document.querySelector(`input[data-task-select="${taskId}"]`);
  if (!(box instanceof HTMLInputElement)) throw new Error(`no selection box for ${taskId}`);
  if (box.checked !== checked) box.click();
}

async function ask(question: string): Promise<string> {
  (document.getElementById('search-project') as HTMLSelectElement).value = 'p1';
  (document.getElementById('search-q') as HTMLInputElement).value = question;
  (document.getElementById('ask-go') as HTMLButtonElement).click();
  await vi.advanceTimersByTimeAsync(1);
  return String(askBodies[askBodies.length - 1]?.['view'] ?? '');
}

const about = (): HTMLElement => document.getElementById('ask-sheet-about') as HTMLElement;
const openSheet = (): void => (document.getElementById('ask-fab') as HTMLButtonElement).click();

describe('selectedTasksViewText', () => {
  it('appends nothing when no row is selected', () => {
    expect(selectedTasksViewText([], ASK_SELECTION_TITLE_CAP)).toBe('');
  });

  it('names one selected task', () => {
    expect(selectedTasksViewText(['Wire up the retry queue'], 5)).toBe(
      'selected task: Wire up the retry queue',
    );
  });

  it('counts and names several, in list order', () => {
    expect(selectedTasksViewText(['A', 'B', 'C'], 5)).toBe('selected tasks (3): A; B; C');
  });

  it('names the first cap titles past the cap and counts the rest', () => {
    expect(selectedTasksViewText(['A', 'B', 'C', 'D'], 2)).toBe(
      'selected tasks (4): A; B; and 2 more',
    );
  });

  it('names at least one title whatever the cap', () => {
    expect(selectedTasksViewText(['A', 'B'], 0)).toBe('selected tasks (2): A; and 1 more');
  });

  it('does not mutate its input', () => {
    const titles = Object.freeze(['A', 'B', 'C']);
    selectedTasksViewText(titles, 1);
    expect(titles).toEqual(['A', 'B', 'C']);
  });
});

describe('the Ask sheet carries the board selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    for (const [target, type, listener, options] of trackedListeners.splice(0)) {
      target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('names no selection in the view while no row is checked', async () => {
    await boot();
    expect(await ask('what next?')).not.toContain('selected task');
  });

  it("names a checked row's title in the view context", async () => {
    await boot();
    check('t1');
    expect(await ask('why is this one stuck?')).toContain('selected task: Wire up the retry queue');
  });

  it('names every checked row, in board order, and drops one unticked again', async () => {
    await boot();
    check('t2');
    check('t1');
    const view = await ask('what do these have in common?');
    expect(view).toContain('selected tasks (2): ');
    expect(view.indexOf('Wire up the retry queue')).toBeLessThan(
      view.indexOf('Rename the webhook payload'),
    );
    check('t2', false);
    expect(await ask('and now?')).toContain('selected task: Wire up the retry queue');
  });

  it('renders the about line in the sheet foot, hidden while nothing is selected', async () => {
    await boot();
    const line = about();
    expect(line).not.toBeNull();
    expect(line.closest('#ask-sheet-foot')).not.toBeNull();
    openSheet();
    expect(line.hidden).toBe(true);
    // Above the composer: a chat's context reads just over its question box.
    const form = document.getElementById('search-form') as HTMLElement;
    expect(line.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says what it is about when opened over a selection', async () => {
    await boot();
    check('t1');
    openSheet();
    expect(about().hidden).toBe(false);
    expect(about().textContent).toBe(
      STRINGS.en.askSheetAboutOne.replace('{title}', 'Wire up the retry queue'),
    );
  });

  it('follows the boxes live while the sheet is open', async () => {
    await boot();
    openSheet();
    check('t1');
    expect(about().textContent).toContain('Wire up the retry queue');
    check('t3');
    expect(about().textContent).toBe(STRINGS.en.askSheetAboutMany.replace('{n}', '2'));
    check('t1', false);
    check('t3', false);
    expect(about().hidden).toBe(true);
    expect(about().textContent).toBe('');
  });

  it('keeps the line tagged for the locale sweep only while it has words', async () => {
    await boot();
    openSheet();
    check('t1');
    expect(about().getAttribute('data-i18n-template')).toBe('askSheetAboutOne');
    expect(JSON.parse(about().getAttribute('data-i18n-args') ?? '{}')).toEqual({
      title: 'Wire up the retry queue',
    });
    check('t1', false);
    expect(about().hasAttribute('data-i18n-template')).toBe(false);
  });

  it('carries both keys in Hebrew', () => {
    expect(STRINGS.he.askSheetAboutOne).toContain('{title}');
    expect(STRINGS.he.askSheetAboutMany).toContain('{n}');
    expect(STRINGS.he.askSheetAboutOne).not.toBe(STRINGS.en.askSheetAboutOne);
  });
});
