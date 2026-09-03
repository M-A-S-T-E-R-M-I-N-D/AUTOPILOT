// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's Flight console panel client
 * (`web/features/flight-console.ts`) — a whole assembler function extracted
 * out of `shell.ts`'s `fleetJs()` into its own file under `web/features/`
 * (epic 0002 "shell decomposition", SHELL HUB RELIEF).
 */

import { describe, it, expect } from 'vitest';
import { consoleLinesAriaLabel } from '../../../src/web/console-panel.js';
import { flightConsoleJs } from '../../../src/web/features/flight-console.js';

describe('flightConsoleJs', () => {
  it('embeds consoleLinesAriaLabel real compiled source via .toString()', () => {
    expect(flightConsoleJs()).toContain(consoleLinesAriaLabel.toString());
  });

  it('declares flightConsoleSection and renderConsoleBody', () => {
    const out = flightConsoleJs();
    expect(out).toContain('function flightConsoleSection(pid) {');
    expect(out).toContain('function renderConsoleBody(body, lines) {');
  });

  it('lazy-loads the console tail only once per project on first expand', () => {
    const out = flightConsoleJs();
    expect(out).toContain('if (!details.open || consoleLoaded[pid]) return;');
    expect(out).toContain('consoleLoaded[pid] = true;');
    expect(out).toContain("fetch('/api/flightlog?project=' + encodeURIComponent(pid))");
  });

  it('allows a retry on the next expand after a failed fetch', () => {
    expect(flightConsoleJs()).toContain(
      'consoleLoaded[pid] = false; // allow a retry on the next expand',
    );
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = flightConsoleJs();
    expect(out).toBe(out.trim());
  });
});
