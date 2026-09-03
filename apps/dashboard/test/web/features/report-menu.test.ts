// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct + behavioral coverage for REPORT UNIFICATION 1/2 (epic 0015,
 * "operator course correction — 2026-09-02") — the single right-click "📮
 * Report from here" custom context menu + one hidden dialog
 * (`web/features/report-menu.ts`). The assembled-text describe block mirrors
 * `report.test.ts`'s shape (pure `.toString()`-embed assertions on
 * `reportMenuJs()` alone); the live-behavior describe block instead boots the
 * FULL `clientJs()` bundle via `renderShell()`, the same way
 * `report-from-here-embed.test.ts` does — this module's dialog calls the
 * global `el(...)` helper `fleetJs()` (shell.ts's core chunk) defines, the
 * same cross-chunk hoisting contract every other `web/features/` module
 * already relies on, so exercising it for real needs the whole bundle, not
 * `reportMenuJs()` in isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  reportActionLabel,
  reportConfirmMessage,
  reportExecuteResult,
  reportExecuteTip,
} from '../../../src/web/report-panel.js';
import {
  formatCapturedReportContext,
  REPORT_REGION_ATTR,
} from '../../../src/web/report-capture.js';
import { reportMenuJs } from '../../../src/web/features/report-menu.js';
import { renderShell, clientJs } from '../../../src/web/shell.js';

interface AutopilotReportCapture {
  owningModule: unknown;
  dom: { tag: string };
  css: Record<string, string>;
  consoleErrors: Array<{ message: string; timestamp: number }>;
  capturedAt: number;
}

declare global {
  interface Window {
    __autopilotReportCapture?: AutopilotReportCapture | undefined;
    REPORT_REGIONS?: Record<string, unknown> | undefined;
  }
}

const FLIGHT_CONSOLE_REGION = {
  regionId: 'flight-console',
  regionLabel: 'Flight console',
  moduleSources: ['apps/dashboard/src/web/features/flight-console.ts'],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

// jsdom's document.open()/write()/close() resets document CONTENT but not
// listeners already bound to the `document` object itself — see
// a11y.test.ts's header comment for the reproduced bug this guards against.
// Every test here calls boot(), re-registering this module's contextmenu/
// keydown/mousedown listeners; left untracked, a stale listener from an
// earlier test would keep firing (and appending its own stray
// `.report-ctx-menu`/`.report-dialog`) alongside the current test's.
const trackedDocumentListeners: Array<
  [
    type: string,
    listener: EventListenerOrEventListenerObject,
    options: boolean | AddEventListenerOptions | undefined,
  ]
> = [];
const nativeAddEventListener = document.addEventListener.bind(document);
document.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => {
  trackedDocumentListeners.push([type, listener, options]);
  return nativeAddEventListener(type, listener, options);
}) as typeof document.addEventListener;

function fetchStub(): typeof fetch {
  return vi.fn(async () => ({ ok: true, json: async () => STATE }) as unknown as Response);
}

function boot(fetchImpl: typeof fetch = fetchStub()): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = fetchImpl;
  new Function(clientJs())();
}

function rightClick(target: Element, opts: Partial<MouseEventInit> = {}): MouseEvent {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(event);
  return event;
}

describe('reportMenuJs (assembled text)', () => {
  it('embeds every reused report-panel/report-capture splice via .toString()', () => {
    const out = reportMenuJs();
    expect(out).toContain(reportActionLabel.toString());
    expect(out).toContain(reportConfirmMessage.toString());
    expect(out).toContain(reportExecuteResult.toString());
    expect(out).toContain(reportExecuteTip.toString());
    expect(out).toContain(formatCapturedReportContext.toString());
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = reportMenuJs();
    expect(out).toBe(out.trim());
  });
});

describe('reportMenuJs (live behavior, full bundle)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.__autopilotReportCapture;
    delete window.REPORT_REGIONS;
    while (trackedDocumentListeners.length) {
      const [type, listener, options] = trackedDocumentListeners.pop()!;
      document.removeEventListener(type, listener, options);
    }
  });

  it('Shift+right-click keeps the browser menu — no preventDefault, no custom menu', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const target = document.createElement('div');
    document.body.appendChild(target);

    const event = rightClick(target, { shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector('.report-ctx-menu')).toBeNull();
  });

  it('right-click inside a textarea keeps the browser menu — editable surfaces are never intercepted', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const event = rightClick(textarea);

    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector('.report-ctx-menu')).toBeNull();
  });

  it('a plain right-click opens the custom menu and suppresses the browser menu', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const target = document.createElement('div');
    document.body.appendChild(target);

    const event = rightClick(target, { clientX: 40, clientY: 60 });

    expect(event.defaultPrevented).toBe(true);
    const menu = document.querySelector('.report-ctx-menu');
    expect(menu).not.toBeNull();
    expect(menu!.getAttribute('role')).toBe('menu');
    const item = menu!.querySelector('[role="menuitem"]');
    expect(item?.textContent).toBe('🚩 Report from here');
  });

  it('Escape closes the open menu', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const target = document.createElement('div');
    document.body.appendChild(target);
    rightClick(target);
    expect(document.querySelector('.report-ctx-menu')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('.report-ctx-menu')).toBeNull();
  });

  it('clicking outside the menu closes it', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const target = document.createElement('div');
    document.body.appendChild(target);
    rightClick(target);
    expect(document.querySelector('.report-ctx-menu')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(document.querySelector('.report-ctx-menu')).toBeNull();
  });

  it('choosing the menu item with no prior capture closes the menu without opening a dialog', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const target = document.createElement('div');
    document.body.appendChild(target);
    rightClick(target);
    // report-capture-client.js's own contextmenu listener runs on this same
    // event and populates window.__autopilotReportCapture (see this module's
    // header comment) — clear it to exercise openReportDialog()'s defensive
    // "no capture" guard, since a real right-click never leaves it unset.
    delete window.__autopilotReportCapture;

    (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();

    expect(document.querySelector('.report-ctx-menu')).toBeNull();
    expect(document.querySelector('.report-dialog')).toBeNull();
  });

  it('choosing the menu item with a capture opens the one dialog, auto-filled and focused on the description', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const target = document.createElement('div');
    document.body.appendChild(target);
    rightClick(target);

    (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();

    const dialog = document.querySelector('.report-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('role')).toBe('dialog');
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('.report-dialog-capture')?.textContent).toBe(
      formatCapturedReportContext({ owningModule: null, dom: { tag: 'div' }, consoleErrors: [] }),
    );
    expect(document.activeElement).toBe(document.getElementById('report-dialog-desc'));
    expect(document.querySelector('.report-dialog-overlay')?.hasAttribute('hidden')).toBe(false);
  });

  it('Escape closes the dialog and restores focus to the element that had it', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    rightClick(trigger);
    (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();
    expect(document.querySelector('.report-dialog')).not.toBeNull();

    document
      .querySelector('.report-dialog-overlay')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('.report-dialog')).toBeNull();
    expect(document.querySelector('.report-dialog-overlay')?.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('previewing an unresolved element falls back to a synthetic "element" region with no module sources', async () => {
    boot(
      vi.fn(async (url: unknown, _init?: RequestInit) => {
        if (url === '/api/report-from-here') {
          return {
            ok: true,
            json: async () => ({ plan: { ok: false, reasoning: 'blank' } }),
          } as unknown as Response;
        }
        return { ok: true, json: async () => STATE } as unknown as Response;
      }) as unknown as typeof fetch,
    );
    await vi.advanceTimersByTimeAsync(1);
    console.error('boom');
    const target = document.createElement('div');
    document.body.appendChild(target);
    rightClick(target);
    (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();

    (document.getElementById('report-dialog-desc') as HTMLTextAreaElement).value = 'looks broken';
    let captured: { description: string; [key: string]: unknown } | null = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      captured = init?.body ? JSON.parse(String(init.body)) : null;
      return {
        ok: true,
        json: async () => ({ plan: { ok: false, reasoning: 'blank' } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    (document.querySelector('.report-preview') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(captured).toMatchObject({
      regionId: 'element',
      regionLabel: 'a dashboard element',
      moduleSources: [],
      hasScreenshot: false,
      action: 'issue',
      projectId: 'p1',
    });
    expect(captured!.description).toContain('looks broken');
    expect(captured!.description).toContain('Captured element: <div>.');
    expect(captured!.description).toContain('Recent console errors:');
    expect(captured!.description).toContain('- boom');
  });

  it('previewing a resolved region posts its real regionId/regionLabel/moduleSources/projectId', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const container = document.createElement('section');
    container.setAttribute(REPORT_REGION_ATTR, 'flight-console');
    const child = document.createElement('button');
    container.appendChild(child);
    document.body.appendChild(container);
    window.REPORT_REGIONS = { 'flight-console': FLIGHT_CONSOLE_REGION };
    rightClick(child);
    (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();

    let captured: unknown = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      captured = init?.body ? JSON.parse(String(init.body)) : null;
      return {
        ok: true,
        json: async () => ({ plan: { ok: false, reasoning: 'blank' } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    (document.querySelector('.report-preview') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(captured).toMatchObject({
      regionId: 'flight-console',
      regionLabel: 'Flight console',
      moduleSources: ['apps/dashboard/src/web/features/flight-console.ts'],
      projectId: 'p1',
      action: 'issue',
    });
  });

  it('executes a previewed plan after confirm and shows the result', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const target = document.createElement('div');
    document.body.appendChild(target);
    rightClick(target);
    (document.querySelector('.report-ctx-menu-item') as HTMLButtonElement).click();

    globalThis.fetch = vi.fn(async (url: unknown) => {
      if (url === '/api/report-from-here') {
        return {
          ok: true,
          json: async () => ({
            plan: {
              ok: true,
              action: 'issue',
              title: 't',
              body: 'b',
              commands: [],
              summary: 'files a bug issue',
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          plan: { ok: true, action: 'issue' },
          commandResults: [{ command: { details: 'gh issue create "t"' }, code: 0 }],
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    (document.querySelector('.report-preview') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);
    (document.querySelector('.report-execute') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(window.confirm).toHaveBeenCalled();
    expect(document.querySelector('.report-result')?.textContent).toContain('gh issue create "t"');
    expect(document.querySelector('.report-result')?.className).toContain('report-result-ok');
  });

  // ── COPY TOOLKIT (operator course correction 2026-09-03): the right-click
  // menu is no longer report-only — it is the dashboard's copy multi-tool.
  function mockClipboard(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    return writeText;
  }

  function menuItems(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll('.report-ctx-menu-item'));
  }

  it('the menu is a full copy toolkit: report first, a separator, then the five copy items, headed by a breadcrumb', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const target = document.createElement('div');
    target.className = 'card';
    document.body.appendChild(target);
    rightClick(target);

    const menu = document.querySelector('.report-ctx-menu')!;
    const labels = menuItems().map((b) => b.textContent);
    expect(labels).toEqual([
      '🚩 Report from here',
      '📋 Copy text',
      '🧩 Copy element HTML',
      '🎯 Copy CSS selector',
      '🎨 Copy computed styles',
      '🧠 Copy smart context (JSON)',
    ]);
    expect(menu.querySelector('.report-ctx-menu-sep')?.getAttribute('role')).toBe('separator');
    // The breadcrumb orients the operator on WHAT was right-clicked.
    expect(menu.querySelector('.report-ctx-menu-head')?.textContent).toContain('div.card');
  });

  it('Copy text prefers the live selection and falls back to the element text', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const writeText = mockClipboard();
    const target = document.createElement('div');
    target.textContent = 'hello from the fleet';
    document.body.appendChild(target);
    rightClick(target);

    menuItems()[1]!.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith('hello from the fleet');
  });

  it('Copy element HTML writes the outerHTML', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const writeText = mockClipboard();
    const target = document.createElement('span');
    target.className = 'chip';
    target.textContent = 'x';
    document.body.appendChild(target);
    rightClick(target);

    menuItems()[2]!.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith('<span class="chip">x</span>');
  });

  it('Copy CSS selector emits a rooted path that short-circuits at the nearest id', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const writeText = mockClipboard();
    const zone = document.createElement('section');
    zone.id = 'zone';
    const card = document.createElement('div');
    card.className = 'card alpha';
    zone.appendChild(card);
    document.body.appendChild(zone);
    rightClick(card);

    menuItems()[3]!.click();
    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith('#zone > div.card.alpha');
  });

  it('Copy smart context bundles selector, tag, rect, dataset, and the owning region module sources', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const writeText = mockClipboard();
    const target = document.createElement('div');
    target.dataset['probe'] = 'yes';
    document.body.appendChild(target);
    rightClick(target);
    window.__autopilotReportCapture = {
      owningModule: FLIGHT_CONSOLE_REGION,
      dom: { tag: 'div' },
      css: {},
      consoleErrors: [],
      capturedAt: 1,
    };

    menuItems()[5]!.click();
    await vi.advanceTimersByTimeAsync(1);

    const payload = JSON.parse(writeText.mock.calls[0]![0] as string) as {
      tag: string;
      dataset: Record<string, string>;
      region: { regionId: string; moduleSources: unknown };
      selector: string;
    };
    expect(payload.tag).toBe('div');
    expect(payload.dataset['probe']).toBe('yes');
    expect(payload.region.regionId).toBe('flight-console');
    expect(payload.region.moduleSources).toEqual(FLIGHT_CONSOLE_REGION.moduleSources);
    expect(payload.selector.length).toBeGreaterThan(0);
  });

  it('a successful copy flashes ✓ on the item and closes the menu', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    mockClipboard();
    const target = document.createElement('div');
    target.textContent = 't';
    document.body.appendChild(target);
    rightClick(target);

    const item = menuItems()[1]!;
    item.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(item.textContent).toBe('✓ Copied');
    await vi.advanceTimersByTimeAsync(600);
    expect(document.querySelector('.report-ctx-menu')).toBeNull();
  });

  it('ArrowDown and ArrowUp cycle focus through every menu item', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    const target = document.createElement('div');
    document.body.appendChild(target);
    rightClick(target);

    const items = menuItems();
    expect(document.activeElement).toBe(items[0]!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[0]!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[items.length - 1]!);
  });
});
