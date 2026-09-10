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
  releaseGuestNote,
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
    expect(out).toContain(releaseGuestNote.toString());
  });

  it('fetches the viewer identity alongside the release preview and role-gates the EXECUTE button (epic 0019, board web-mtt3f7j6-3bj899)', () => {
    const out = releaseJs();
    // Reads the identity through core's shared socialIdentity() helper —
    // one fetch per page load across every role-gated panel, not one each.
    expect(out).toContain('socialIdentity()');
    expect(out).not.toContain("fetch('/api/social-identity')");
    expect(out).toContain("identity && identity.role === 'user'");
    // A confirmed guest gets the note instead of the execute button/inputs.
    expect(out).toContain("el('p', 'muted release-guest-note', releaseGuestNote(identity))");
  });

  it('tags the guest note with a data-i18n-template pair for locale repaint (board web-msnsndki-dz3vn1)', () => {
    const out = releaseJs();
    expect(out).toContain("guestNote.setAttribute('data-i18n-template', 'releaseGuestNote');");
    expect(out).toContain("'data-i18n-args',");
    expect(out).toContain(
      "JSON.stringify({ owner: identity.nameWithOwner.split('/')[0], login: identity.login }),",
    );
  });

  it('embeds the maturity detector and wires the RELEASE PHASE select: auto-detect shown, override posted, auto omitted', () => {
    const out = releaseJs();
    expect(out).toContain(releaseMaturityOf.toString());
    expect(out).toContain('var detected = releaseMaturityOf(release.plan.version);');
    // The label and the five option texts are translated (board github-4);
    // Auto substitutes the translated phase label, never the raw phase id.
    expect(out).toContain("el('label', null, tr('releaseMaturityLabel'))");
    expect(out).toContain(
      "['auto', tr('releaseMaturityAutoTemplate', { phase: maturityPhaseLabels[detected.phase] })]",
    );
    // The hint spells out the reasoning — never a silent guess.
    expect(out).toContain(
      "el('p', 'release-maturity-hint', maturityPhaseLabels[detected.phase] + ' — ' + detected.reasoning)",
    );
    // Auto stays implicit; only a real override rides the POST body.
    expect(out).toContain("if (maturity && maturity !== 'auto') payload.maturity = maturity;");
  });

  it('declares renderReleaseBody and releaseSection', () => {
    const out = releaseJs();
    expect(out).toContain('function renderReleaseBody(body, release, pid, identity) {');
    expect(out).toContain('function releaseSection(pid) {');
  });

  it('tags every el()-built text state data-i18n and sweeps the async states itself (board web-msnsndki-dz3vn1)', () => {
    const out = releaseJs();
    // Built synchronously at mount — rides the page-level sweep like the title.
    expect(out).toContain("loadingMsg.setAttribute('data-i18n', 'releaseLoading');");
    // Rebuilt inside the async /api/release handlers — both the resolved
    // body (every branch of renderReleaseBody) and the rejected catch.
    expect(out).toContain("unavailableMsg.setAttribute('data-i18n', 'releaseUnavailable');");
    expect(out).toContain("noTagsMsg.setAttribute('data-i18n', 'releaseNoTags');");
    expect(out).toContain("milestoneLabel.setAttribute('data-i18n', 'releaseMilestoneLabel');");
    // One panel-local sweep per async landing site, since either can land
    // after the page-level sweep already ran; translateDom itself stays a
    // bare hoisted identifier from locale.ts's splice, never re-declared.
    const sweeps = out.split("translateDom(document.documentElement.lang || 'en');").length - 1;
    expect(sweeps).toBe(2);
    expect(out).not.toContain('function translateDom(');
  });

  it('fetches the RELEASE preview on demand rather than folding into the polled /api/state', () => {
    expect(releaseJs()).toContain("fetch('/api/release?project=' + encodeURIComponent(pid))");
  });

  it('tags the EXECUTE button label as a {version} template and paints its transient states via tr() (board web-msnsndki-dz3vn1)', () => {
    const out = releaseJs();
    // The label carries a live {version} — a data-i18n-template, not a plain
    // data-i18n tag, which could only paint fixed text.
    expect(out).toContain("execBtn.setAttribute('data-i18n-template', 'releaseExecuteTemplate');");
    expect(out).toContain(
      "execBtn.setAttribute('data-i18n-args', JSON.stringify({ version: release.plan.version }));",
    );
    // Neither transient state is a DOM attribute a sweep can reach — both
    // paint via tr() at the moment they're set, never a bare literal.
    expect(out).toContain("b.textContent = tr('releaseExecuting');");
    expect(out).toContain("resultEl.textContent = tr('releaseRequestFailed');");
    expect(out).not.toContain("b.textContent = 'Releasing…';");
    expect(out).not.toContain("resultEl.textContent = '✗ Request failed — try again shortly.';");
  });

  it('carries its own EXECUTE click handler, confirm-guarded', () => {
    const out = releaseJs();
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-release-execute]');",
    );
    expect(out).toContain(
      'if (!window.confirm(releaseConfirmMessage(milestoneTag, ghRelease, tr))) return;',
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
