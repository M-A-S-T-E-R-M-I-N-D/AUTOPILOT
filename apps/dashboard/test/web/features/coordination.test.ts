// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's FLEET COORDINATION panel
 * client (`web/features/coordination.ts`) — BOARD web-mtbp0t8z-aftrnm ("NO
 * VISIBLE INTER-LANE COORDINATION").
 */

import { describe, it, expect } from 'vitest';
import { coordinationLineMeta } from '../../../src/web/coordination-panel.js';
import { coordinationJs } from '../../../src/web/features/coordination.js';

describe('coordinationJs', () => {
  it('embeds coordinationLineMeta real compiled source via .toString()', () => {
    expect(coordinationJs()).toContain(coordinationLineMeta.toString());
  });

  it('declares coordinationSection and renderCoordinationBody', () => {
    const out = coordinationJs();
    expect(out).toContain('function coordinationSection(pid) {');
    expect(out).toContain('function renderCoordinationBody(body, lines) {');
  });

  it('keeps no module-level state — every render fetches fresh', () => {
    expect(coordinationJs()).not.toContain('var coordination');
  });

  it('fetches on demand rather than folding into the polled /api/state', () => {
    expect(coordinationJs()).toContain(
      "fetch('/api/coordination?project=' + encodeURIComponent(pid))",
    );
  });

  it('degrades to an honest unavailable message on fetch failure', () => {
    expect(coordinationJs()).toContain(
      "body.replaceChildren(el('p', 'muted', 'Fleet coordination unavailable.'));",
    );
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = coordinationJs();
    expect(out).toBe(out.trim());
  });

  it('gives every line the shared [data-tip] primitive — keyboard-reachable with an accessible label (interactivity audit v2, web-msm66jlc-gm4oom)', () => {
    const out = coordinationJs();
    // D1 TAB-STOP ROVING (epic 0015): only the first line starts as a Tab
    // stop; the shared wireRoving() pattern moves it.
    expect(out).toContain("textEl.setAttribute('tabindex', i === 0 ? '0' : '-1');");
    expect(out).toContain("wireRoving('.coordination-list [tabindex]', '.coordination-list');");
    expect(out).toContain("textEl.setAttribute('data-tip', meta.tip);");
  });

  it('exposes the tip via aria-describedby into a visually-hidden span instead of an aria-label that would duplicate data-tip verbatim (D1 ATTRIBUTE PAYLOAD, epic 0015)', () => {
    const out = coordinationJs();
    expect(out).not.toContain("setAttribute('aria-label'");
    expect(out).toContain("textEl.setAttribute('aria-describedby', descId);");
    expect(out).toContain("el('span', 'sr-only', meta.tip);");
  });
});
