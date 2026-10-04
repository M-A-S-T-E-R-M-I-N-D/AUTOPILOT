// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE REPORT DIALOG'S EXECUTE BUTTON LEADS WITH A STROKE ICON (epic 0025
 * slice 2, "execute buttons"; board web-mtywp7zq-55f3o9). Every KEEPER and
 * Pool execute button leads with a decorative icon, but the right-click
 * "Report from here" dialog's Execute was bare words. It leads with the
 * `flag` the dialog's title and the menu item draw, the way the issue triage
 * and Discussions triage runs take their panel heading's icon; the busy and
 * idle words swap through `setSweptText()`, so a run keeps the icon. Executes
 * the ACTUAL client bundle (`clientJs()`) in jsdom, the convention
 * `features/report-menu.test.ts` uses for this dialog.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

const PLAN = {
  ok: true,
  action: 'issue',
  title: 't',
  body: 'b',
  commands: [],
  summary: 'files a bug issue',
};

// Each bundle eval registers the dialog's contextmenu/keydown/mousedown
// delegates on `document` again, and document.open()/close() keeps them, so
// a stale delegate would answer a later test's right-click.
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

/** Boots the shell, opens the report dialog on a plain element and previews
 *  a resolved plan. `execute` answers the execute POST (a throw walks the
 *  failed-request path). */
async function previewedExecuteButton(execute: () => Response): Promise<HTMLButtonElement> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/report-from-here/execute') return execute();
    if (url === '/api/report-from-here') return json({ plan: PLAN });
    return json(STATE);
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  const target = document.createElement('div');
  document.body.appendChild(target);
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();
  (document.querySelector('.report-preview') as HTMLButtonElement).click();
  await vi.advanceTimersByTimeAsync(1);
  const b = document.querySelector('.report-execute');
  expect(b).not.toBeNull();
  return b as HTMLButtonElement;
}

/** The button's leading child is the named decorative icon. */
function expectLeadingIcon(b: Element, name: string): void {
  const first = b.firstElementChild;
  expect(first?.tagName.toLowerCase()).toBe('svg');
  expect(first?.classList.contains('icon-' + name)).toBe(true);
  expect(first?.getAttribute('aria-hidden')).toBe('true');
}

describe('the report dialog’s Execute button leads with a stroke icon (epic 0025)', () => {
  beforeEach(() => {
    localStorage.removeItem('ap-locale');
    vi.useFakeTimers();
    trackDocumentListeners();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    restoreListeners();
    vi.restoreAllMocks();
    delete (window as { __autopilotReportCapture?: unknown }).__autopilotReportCapture;
  });

  it('leads with the flag the dialog title draws, its words and accessible name unchanged', async () => {
    const b = await previewedExecuteButton(() => json({}));

    expectLeadingIcon(b, 'flag');
    expect(b.textContent).toBe('Execute');
    expect(b.getAttribute('aria-label')).toBe(b.getAttribute('data-tip'));
    expect(b.getAttribute('aria-label')).toContain('files a bug issue');
  });

  it('keeps its flag through the busy words and a finished run', async () => {
    const b = await previewedExecuteButton(() =>
      json({
        plan: { ok: true, action: 'issue' },
        commandResults: [{ command: { details: 'gh issue create "t"' }, code: 0 }],
      }),
    );

    b.click();

    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('Executing…');
    expectLeadingIcon(b, 'flag');
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.report-result')?.className).toContain('report-result-ok');
    expect(b.disabled).toBe(false);
    expectLeadingIcon(b, 'flag');
    expect(b.textContent).toBe('Execute');
  });

  it('keeps its flag through a refused run', async () => {
    const b = await previewedExecuteButton(() => json({ error: 'gh is not signed in' }));

    b.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.report-result')?.textContent).toBe('✗ gh is not signed in');
    expect(b.disabled).toBe(false);
    expectLeadingIcon(b, 'flag');
    expect(b.textContent).toBe('Execute');
  });

  it('keeps its flag through a failed request', async () => {
    const b = await previewedExecuteButton(() => {
      throw new Error('network down');
    });

    b.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.report-result')?.className).toContain('report-result-fail');
    expect(b.disabled).toBe(false);
    expectLeadingIcon(b, 'flag');
    expect(b.textContent).toBe('Execute');
  });

  it('spaces the leading icon from its words, like every other execute button', () => {
    expect(layoutCss()).toContain('.report-execute > .icon');
  });
});
