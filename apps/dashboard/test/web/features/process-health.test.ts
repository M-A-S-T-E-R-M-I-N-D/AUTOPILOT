// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's process-health stat-tile cluster
 * client (`web/features/process-health.ts`) — the DORA-for-agents,
 * parallel-gate-savings, and warm-session-savings panels, three sibling
 * assembler section functions extracted out of `shell.ts`'s `fleetJs()` into
 * one file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF). Indirect DOM-render coverage already exists for each panel through
 * the real client bundle (`dora-tiles.test.ts`, `gate-parallel-tiles.test.ts`,
 * `fleet-stat-tiles.test.ts`); this adds the direct coverage its siblings
 * (`round-panel.test.ts`, `backlog.test.ts`) already carry.
 */

import { describe, it, expect } from 'vitest';
import {
  doraTileItems,
  gateParallelTileItems,
  warmSessionTileItems,
} from '../../../src/web/stat-tiles.js';
import { processHealthJs } from '../../../src/web/features/process-health.js';

describe('processHealthJs', () => {
  it('embeds doraTileItems/gateParallelTileItems/warmSessionTileItems real compiled source via .toString()', () => {
    const out = processHealthJs();
    expect(out).toContain(doraTileItems.toString());
    expect(out).toContain(gateParallelTileItems.toString());
    expect(out).toContain(warmSessionTileItems.toString());
  });

  it('declares all three sibling section functions', () => {
    const out = processHealthJs();
    expect(out).toContain('function doraSection(c) {');
    expect(out).toContain('function gateParallelSection(c) {');
    expect(out).toContain('function warmSessionsSection(c) {');
  });

  it('hides each panel until its own store-computed data exists', () => {
    const out = processHealthJs();
    expect(out).toContain('if (!d) return null;');
    expect(out).toContain('if (!g || g.sampledFirings === 0) return null;');
    expect(out).toContain('if (!w || w.resumed.firings === 0) return null;');
  });

  it('passes fmtDuration into the DORA/gate tile math by injection, but not warm-session', () => {
    // doraTileItems/gateParallelTileItems format a duration and take fmtDuration
    // as a bare hoisted-bundle argument; warmSessionTileItems needs no formatter.
    const out = processHealthJs();
    expect(out).toContain('doraTileItems(d, fmtDuration)');
    expect(out).toContain('gateParallelTileItems(g, fmtDuration)');
    expect(out).toContain('warmSessionTileItems(w)');
  });

  it('reuses the shared statTile helper rather than re-declaring it', () => {
    // statTile stays inline in fleetJs() (shared with renderStatTiles); these
    // panels call it as a bare hoisted bundle identifier, never define it.
    const out = processHealthJs();
    expect(out).toContain('grid.appendChild(statTile(');
    expect(out).not.toContain('function statTile(');
  });

  it('tags each panel title data-i18n and leaves the sweep to renderProjectPage (board web-msnsndki-dz3vn1)', () => {
    const out = processHealthJs();
    expect(out).toContain("doraTitle.setAttribute('data-i18n', 'doraTitle');");
    expect(out).toContain("gateParallelTitle.setAttribute('data-i18n', 'gateParallelTitle');");
    expect(out).toContain("warmSessionsTitle.setAttribute('data-i18n', 'warmSessionsTitle');");
    // All three titles are built synchronously inside renderProjectPage() and
    // ride its page-level sweep — no async re-render of their own, so no
    // panel-local translateDom() call (unlike issue-triage.ts's fetch states).
    expect(out).not.toContain('translateDom(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = processHealthJs();
    expect(out).toBe(out.trim());
  });
});
