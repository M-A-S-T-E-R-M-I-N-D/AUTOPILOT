// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's RELEASE panel cluster client
 * (`web/features/release.ts`) — the preview/body renderer and the panel's
 * own EXECUTE click handler, extracted out of `shell.ts`'s `fleetJs()` into
 * one file under `web/features/` (epic 0002 "shell decomposition", SHELL
 * HUB RELIEF). Indirect DOM-render coverage already exists for this panel
 * through the real client bundle (`test/web/release-panel.test.ts`); this
 * adds the direct coverage its siblings (`landing.test.ts`,
 * `metrics.test.ts`) already carry.
 */

import { describe, it, expect } from 'vitest';
import {
  releaseExecuteResult,
  releaseVersionItems,
  releaseConfirmMessage,
  releaseExecuteTip,
} from '../../../src/web/release-panel.js';
import { releaseJs } from '../../../src/web/features/release.js';
import { releaseMaturityOf } from '../../../src/release/maturity.js';

describe('releaseJs', () => {
  it('embeds every release-panel splice real compiled source via .toString()', () => {
    const out = releaseJs();
    expect(out).toContain(releaseVersionItems.toString());
    expect(out).toContain(releaseExecuteTip.toString());
    expect(out).toContain(releaseExecuteResult.toString());
    expect(out).toContain(releaseConfirmMessage.toString());
  });

  it('embeds the maturity detector and wires the RELEASE PHASE select: auto-detect shown, override posted, auto omitted', () => {
    const out = releaseJs();
    expect(out).toContain(releaseMaturityOf.toString());
    expect(out).toContain('var detected = releaseMaturityOf(release.plan.version);');
    expect(out).toContain("['auto', 'Auto — detected: ' + detected.phase]");
    // The hint spells out the reasoning — never a silent guess.
    expect(out).toContain(
      "el('p', 'release-maturity-hint', detected.phase + ' — ' + detected.reasoning)",
    );
    // Auto stays implicit; only a real override rides the POST body.
    expect(out).toContain("if (maturity && maturity !== 'auto') payload.maturity = maturity;");
  });

  it('declares renderReleaseBody and releaseSection', () => {
    const out = releaseJs();
    expect(out).toContain('function renderReleaseBody(body, release, pid) {');
    expect(out).toContain('function releaseSection(pid) {');
  });

  it('fetches the RELEASE preview on demand rather than folding into the polled /api/state', () => {
    expect(releaseJs()).toContain("fetch('/api/release?project=' + encodeURIComponent(pid))");
  });

  it('carries its own EXECUTE click handler, confirm-guarded', () => {
    const out = releaseJs();
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-release-execute]');",
    );
    expect(out).toContain(
      'if (!window.confirm(releaseConfirmMessage(milestoneTag, ghRelease))) return;',
    );
    expect(out).toContain("fetch('/api/release/execute', {");
  });

  it('keeps no module-level state and calls refresh() as a bare hoisted identifier, never defines it', () => {
    // Unlike landing.ts, this cluster's click handler reads no fleet-wide
    // mutable state — it only calls refresh() on success, the same
    // cross-module hoisted-call shape every whole-region move relies on.
    const out = releaseJs();
    expect(out).toContain('if (r.data && r.data.ok) refresh();');
    expect(out).not.toContain('function refresh(');
  });

  it('reuses the shared el/tipChip helpers rather than re-declaring them', () => {
    const out = releaseJs();
    expect(out).toContain("el('section', 'release-panel')");
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function tipChip(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = releaseJs();
    expect(out).toBe(out.trim());
  });
});
