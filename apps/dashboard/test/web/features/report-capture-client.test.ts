// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct + behavioral coverage for the RIGHT-CLICK REPORT-FROM-HERE live
 * wiring (`web/features/report-capture-client.ts`, `web-mtdc6wsm-hek3bl`,
 * epic 0015) — the contextmenu listener and live `console.error` ring
 * buffer `src/web/report-capture.ts`'s header comment deferred to this
 * slice. Text-content assertions pin the no-drift `.toString()`/
 * `JSON.stringify()` embeds (the same shape `report-menu.test.ts`/
 * `pool-client.test.ts` use for their own splices); the `document.open()`/
 * `write()`/`close()` + `new Function(js)()` boot below actually EXECUTES
 * the assembled script in jsdom — the same pattern
 * `report-from-here-embed.test.ts` already trusts for re-running other
 * self-initializing feature modules (`switcherJs`, `pool-client.js`) across
 * many `it()` blocks without cross-test listener leakage. Since REPORT
 * UNIFICATION 2/2 (epic 0015), the resolver reads its registry off
 * `window.REPORT_REGIONS` — the real global `web/shell.ts` declares at its
 * script's top level — rather than a sibling-tag relay this module used to
 * build itself; `window.REPORT_REGIONS` is set by hand below since this
 * file boots only `reportCaptureClientJs()`, not the full `shell.ts` bundle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveOwningModule,
  captureDomSnapshot,
  captureComputedCss,
  createConsoleErrorRingBuffer,
  recordConsoleError,
  REPORT_REGION_ATTR,
  REPORT_DOM_MAX_TEXT_LENGTH,
  REPORT_CSS_PROPERTIES,
} from '../../../src/web/report-capture.js';
import { reportCaptureClientJs } from '../../../src/web/features/report-capture-client.js';

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

function boot(): void {
  document.open();
  document.write('<!doctype html><html><body><main id="fleet"></main></body></html>');
  document.close();
  new Function(reportCaptureClientJs())();
}

describe('reportCaptureClientJs (assembled text)', () => {
  it('embeds every report-capture splice real compiled source via .toString()', () => {
    const out = reportCaptureClientJs();
    expect(out).toContain(resolveOwningModule.toString());
    expect(out).toContain(captureDomSnapshot.toString());
    expect(out).toContain(captureComputedCss.toString());
    expect(out).toContain(createConsoleErrorRingBuffer.toString());
    expect(out).toContain(recordConsoleError.toString());
  });

  it('embeds the real REPORT_REGION_ATTR/REPORT_DOM_MAX_TEXT_LENGTH/REPORT_CSS_PROPERTIES values', () => {
    const out = reportCaptureClientJs();
    expect(out).toContain(`const REPORT_REGION_ATTR = ${JSON.stringify(REPORT_REGION_ATTR)};`);
    expect(out).toContain(
      `const REPORT_DOM_MAX_TEXT_LENGTH = ${JSON.stringify(REPORT_DOM_MAX_TEXT_LENGTH)};`,
    );
    expect(out).toContain(
      `const REPORT_CSS_PROPERTIES = ${JSON.stringify(REPORT_CSS_PROPERTIES)};`,
    );
  });

  it('overrides console.error to feed a live ring buffer, preserving the real console.error', () => {
    const out = reportCaptureClientJs();
    expect(out).toContain('var reportCaptureRealConsoleError = console.error.bind(console);');
    expect(out).toContain('reportCaptureRealConsoleError.apply(console, arguments);');
  });

  it('registers a contextmenu listener that never calls preventDefault', () => {
    const out = reportCaptureClientJs();
    expect(out).toContain("document.addEventListener('contextmenu', function (e) {");
    expect(out).not.toContain('preventDefault');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = reportCaptureClientJs();
    expect(out).toBe(out.trim());
  });
});

describe('reportCaptureClientJs (live behavior)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    boot();
    window.__autopilotReportCapture = undefined;
    window.REPORT_REGIONS = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures dom, css, console errors, and a null owning module on right-click with no tagged region', () => {
    const el = document.createElement('div');
    el.setAttribute('style', 'color: red;');
    el.textContent = 'hello';
    document.body.appendChild(el);

    console.error('boom');
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    const capture = window.__autopilotReportCapture;
    expect(capture).toBeDefined();
    expect(capture!.owningModule).toBeNull();
    expect(capture!.dom.tag).toBe('div');
    expect(Object.keys(capture!.css)).toEqual([...REPORT_CSS_PROPERTIES]);
    expect(capture!.consoleErrors.some((e) => e.message === 'boom')).toBe(true);
    expect(typeof capture!.capturedAt).toBe('number');
  });

  it('resolves the owning module once window.REPORT_REGIONS is populated', () => {
    const region = {
      regionId: 'flight-console',
      regionLabel: 'Flight console',
      moduleSources: ['apps/dashboard/src/web/features/flight-console.ts'],
    };
    window.REPORT_REGIONS = { 'flight-console': region };
    const container = document.createElement('section');
    container.setAttribute(REPORT_REGION_ATTR, 'flight-console');
    const child = document.createElement('span');
    container.appendChild(child);
    document.body.appendChild(container);

    child.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    expect(window.__autopilotReportCapture!.owningModule).toEqual(region);
  });

  it('never prevents the default browser context menu', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('trims the ring buffer to its fixed capacity across many console.error calls', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    for (let i = 0; i < 25; i++) console.error('err-' + i);
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    const errors = window.__autopilotReportCapture!.consoleErrors;
    expect(errors.length).toBe(20);
    expect(errors[0]!.message).toBe('err-5');
    expect(errors[errors.length - 1]!.message).toBe('err-24');
  });

  it('does not throw and leaves the capture untouched when the event target has no closest()', () => {
    document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    expect(window.__autopilotReportCapture).toBeUndefined();
  });
});
