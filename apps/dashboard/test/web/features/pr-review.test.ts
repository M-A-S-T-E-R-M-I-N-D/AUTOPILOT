// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the KEEPER PR review panel cluster client
 * (`web/features/pr-review.ts`) — the preview/apply renderer and the
 * panel's own EXECUTE click handler, extracted out of `shell.ts`'s
 * `fleetJs()` into one file under `web/features/` (epic 0002 "shell
 * decomposition", SHELL HUB RELIEF). Indirect DOM-render coverage already
 * exists for this panel through the real client bundle
 * (`test/web/pr-review-panel.test.ts`, `test/web/pr-review-panel-i18n.test.ts`,
 * `test/web/pr-review-execute-tooltip.test.ts`); this adds the direct
 * coverage its siblings (`release.test.ts`, `landing.test.ts`) already
 * carry.
 */

import { describe, it, expect } from 'vitest';
import {
  prReviewDecisionLabel,
  prReviewConfirmMessage,
  prReviewExecuteResult,
  prReviewExecuteTip,
  awaitingApprovalChecksUrl,
} from '../../../src/web/pr-review-panel.js';
import { decisionItemHeadMeta } from '../../../src/web/decision-item.js';
import { prReviewJs } from '../../../src/web/features/pr-review.js';

describe('prReviewJs', () => {
  it('embeds every pr-review-panel and decision-item splice real compiled source via .toString()', () => {
    const out = prReviewJs();
    expect(out).toContain(prReviewDecisionLabel.toString());
    expect(out).toContain(prReviewConfirmMessage.toString());
    expect(out).toContain(prReviewExecuteResult.toString());
    expect(out).toContain(prReviewExecuteTip.toString());
    expect(out).toContain(decisionItemHeadMeta.toString());
  });

  it('pins the execute POST to the operator-confirmed decision kind (stale-decision guard)', () => {
    expect(prReviewJs()).toContain('expectedDecision: plan.decision.decision');
  });

  it('pins the execute POST to the previewed head SHA too (re-triage-before-Apply guard)', () => {
    expect(prReviewJs()).toContain('expectedHeadRefOid: plan.pr.headRefOid');
  });

  it('declares renderPrReviewPanel and loadPrReviewPanel', () => {
    const out = prReviewJs();
    expect(out).toContain('function renderPrReviewPanel(plans, fetchFailed) {');
    expect(out).toContain('function loadPrReviewPanel() {');
  });

  it('threads the awaiting-approval run list into the decision-label badge (board web-mto1tya3-57v8ig)', () => {
    const out = prReviewJs();
    expect(out).toContain(
      'var awaitingApproval = !!(plan.pr.awaitingApprovalRunIds && plan.pr.awaitingApprovalRunIds.length > 0);',
    );
    expect(out).toContain(
      'var label = prReviewDecisionLabel(plan.decision.decision, tr, awaitingApproval);',
    );
  });

  it("embeds awaitingApprovalChecksUrl and links an awaiting-approval card to GitHub's own approve control (board web-mto1tya3-57v8ig)", () => {
    const out = prReviewJs();
    expect(out).toContain(awaitingApprovalChecksUrl.toString());
    expect(out).toContain('var approveChecksUrl = awaitingApprovalChecksUrl(plan.pr.url);');
    expect(out).toContain('if (awaitingApproval && approveChecksUrl) {');
    expect(out).toContain(
      "var approveLink = el('a', 'pr-review-approve-link', '🔓 Review & approve on GitHub');",
    );
    expect(out).toContain("approveLink.setAttribute('href', approveChecksUrl);");
    expect(out).toContain("approveLink.setAttribute('target', '_blank');");
    expect(out).toContain("approveLink.setAttribute('rel', 'noopener noreferrer');");
    // Accessible name: the tooltip doubles as the aria-label, the same
    // data-tip/aria-label pairing every other card control carries.
    expect(out).toContain("approveLink.setAttribute('data-tip', approveLinkTip);");
    expect(out).toContain("approveLink.setAttribute('aria-label', approveLinkTip);");
    expect(out).toContain('actions.appendChild(approveLink);');
    // Ordering: the approve link lands BEFORE the maintainer merge button —
    // nothing can merge until the blocked run is approved, so the one
    // actionable next step reads first in the row.
    expect(out.indexOf('actions.appendChild(approveLink);')).toBeLessThan(
      out.indexOf("actions.appendChild(prPanelButton('pr-review-human-merge'"),
    );
  });

  it('fetches the PR review preview on its own timer rather than riding the fleet stream', () => {
    const out = prReviewJs();
    expect(out).toContain("fetch('/api/pr-review', { headers: { accept: 'application/json' } })");
    expect(out).toContain('var PR_REVIEW_POLL_MS = 30000;');
    expect(out).toContain('setInterval(loadPrReviewPanel, PR_REVIEW_POLL_MS);');
  });

  it('self-initializes by calling loadPrReviewPanel() at load, independent of any project', () => {
    const out = prReviewJs();
    expect(out.trim().endsWith('setInterval(loadPrReviewPanel, PR_REVIEW_POLL_MS);')).toBe(true);
    expect(out).toContain(
      'loadPrReviewPanel();\nsetInterval(loadPrReviewPanel, PR_REVIEW_POLL_MS);',
    );
  });

  it('carries its own EXECUTE click handler, confirm-guarded', () => {
    const out = prReviewJs();
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-pr-review-execute]');",
    );
    expect(out).toContain(
      'if (!window.confirm(prReviewConfirmMessage(plan.pr, plan.decision, tr))) return;',
    );
    expect(out).toContain("fetch('/api/pr-review/execute', {");
  });

  it('keeps its own module-level state, not shared with any other module', () => {
    const out = prReviewJs();
    expect(out).toContain('var prReviewPlansByNumber = {};');
  });

  it('reuses the shared el/tipChip/translateDom helpers rather than re-declaring them', () => {
    const out = prReviewJs();
    expect(out).toContain("el('h3', 'pr-review-title'");
    expect(out).toContain("translateDom(document.documentElement.lang || 'en');");
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function tipChip(');
    expect(out).not.toContain('function translateDom(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = prReviewJs();
    expect(out).toBe(out.trim());
  });
});
