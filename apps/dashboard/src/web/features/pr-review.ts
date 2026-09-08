// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER PR review panel cluster — the preview/apply renderer
 * (`renderPrReviewPanel`/`loadPrReviewPanel`) and the panel's own
 * confirm-guarded `data-pr-review-execute` click handler, a whole
 * bundle-composing assembler function extracted out of `shell.ts`'s
 * `fleetJs()` into its own file under `web/features/` (epic 0002 "shell
 * decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/release.ts` for
 * the prior cluster extraction of this shape).
 * `web/shell.ts`'s `clientJs()` calls this module indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change. Unlike every panel
 * moved so far, this one is independent of any flown project — the KEEPER
 * rituals act on the one canonical repo the dashboard process itself runs in
 * — so it initializes itself on its own 30s poll timer at the bottom of this
 * module (`loadPrReviewPanel()`/`setInterval(...)`) the same way
 * `web/features/notifications.ts`'s own `notifyInit()` self-initializes,
 * rather than being called from `renderProjectPage()` like every per-project
 * panel. That self-init now runs after `fleetJs()`'s own `startFleetStream()`
 * call instead of before it (the two are independent fetches to different
 * endpoints), the same ordering `notifications.ts`'s `notifyInit()` already
 * established for a fleet-wide panel's init relative to `fleetJs()`'s tail.
 * `discoverFeatureModules('web/features')` finds this file's `prReviewJs`
 * export the same way it already finds `release.ts`'s. This file carries
 * real relative-import splices of its own —
 * `prReviewDecisionLabel`/`prReviewConfirmMessage`/`prReviewExecuteResult`/
 * `prReviewExecuteTip` (from `web/pr-review-panel.ts`) and
 * `decisionItemHeadMeta` (from `web/decision-item.ts`) — now resolved
 * relative to this file instead of `shell.ts`; a function's `.toString()`
 * output is unaffected by which local name imports it under, so this remains
 * byte-for-byte the same generated text. `decisionItemHeadMeta` is ALSO
 * relied on by `web/features/issue-triage.ts`'s `issueTriageSection`, which
 * calls it as a bare hoisted identifier rather than importing/re-splicing it
 * there — moving its splice site out of `fleetJs()` and into this module
 * changes nothing for that caller, since function declarations hoist across
 * the whole concatenated bundle regardless of which feature module's text
 * happens to define them or in what order. This cluster keeps its own
 * module-level state (`PR_REVIEW_POLL_MS`/`prReviewPlansByNumber`, read and
 * written only by the functions below) and its click handler reads no
 * fleet-wide mutable state at all — no other module reads or writes either.
 * `el`/`tipChip` stay inline in `fleetJs()` — broadly shared across many
 * panels beyond this cluster, already relied on the same way by
 * `web/features/release.ts`/`web/features/landing.ts`. `translateDom`/`tr`
 * stay inline in `web/features/locale.ts` — called here as bare hoisted
 * identifiers, the same cross-module hoisting shape this cluster already
 * relied on for `translateDom` before the move.
 *
 * i18n (board web-msnsndki-dz3vn1): the spliced `prReviewDecisionLabel`/
 * `prReviewConfirmMessage`/`prReviewExecuteResult`/`prReviewExecuteTip`
 * helpers now take the bundle's `tr()` as their last parameter (own tests in
 * `web/pr-review-panel.ts`'s test file), and the two lines this module
 * writes at click/error time — the "Applying…" label and the generic
 * request-failed fallback (reusing `report-menu.ts`'s `reportRequestFailed`
 * key, byte-identical English) — read from STRINGS too, since neither is
 * swept by `translateDom()`'s markup sweep.
 */
import {
  prReviewDecisionLabel,
  prReviewConfirmMessage,
  prReviewExecuteResult,
  prReviewExecuteTip,
  prCheckStateGlyph,
  formatCheckDuration,
  prCheckRunTip,
  prCheckSummary,
  humanMergeReadiness,
  humanMergeConfirmMessage,
  humanMergeResult,
} from '../pr-review-panel.js';
import { decisionItemHeadMeta } from '../decision-item.js';

/** The KEEPER PR review panel cluster client — vanilla, external (keeps CSP script-src 'self'). */
export function prReviewJs(): string {
  return `
// KEEPER PR review (BOARD web-mss50ia0-s6vtbd, "PLATFORM 4/7"): GET
// /api/pr-review previews every open PR's planned decision — merge,
// request-changes, or queue-for-human — and POST /api/pr-review/execute
// (confirm-guarded below) applies one. This is the operator-facing surface
// flight/pr-review.ts's header comment flagged as a deferred follow-up
// slice. Independent of any flown project — the KEEPER rituals act on the
// one canonical repo the dashboard process itself runs in — so it polls on
// its own timer rather than riding the per-project SSE state, and the
// section stays hidden entirely when there is nothing open to review.
// prReviewDecisionLabel/prReviewConfirmMessage/prReviewExecuteResult/
// prReviewExecuteTip are generated FROM web/pr-review-panel.ts below — their
// real compiled source via .toString(), not a hand-retyped copy. They can no
// longer drift apart.
${prReviewDecisionLabel.toString()}
${prReviewConfirmMessage.toString()}
${prReviewExecuteResult.toString()}
${prReviewExecuteTip.toString()}
// The pipeline strip's four helpers, same .toString() splice — the per-check
// rows GET /api/pr-review now carries (operator's "give the tests/stages
// real expression" catch, 2026-09-09).
${prCheckStateGlyph.toString()}
${formatCheckDuration.toString()}
${prCheckRunTip.toString()}
${prCheckSummary.toString()}
// The human merge button (operator, 2026-09-09) — the maintainer's own act
// on a PR the ritual queued for a human and refuses to merge itself.
${humanMergeReadiness.toString()}
${humanMergeConfirmMessage.toString()}
${humanMergeResult.toString()}
// decisionItemHeadMeta is generated FROM web/decision-item.ts below (epic
// 0002 "shell decomposition", slice 2, eighty-fourth cut) — its real
// compiled source via .toString(), not a hand-retyped copy. Shared with the
// KEEPER issue-triage panel (web/features/issue-triage.ts, SHELL HUB
// RELIEF), which calls it as a bare hoisted identifier rather than
// re-splicing it there — the same cross-module hoisting every whole-region
// feature-module move already relies on. It can no longer drift apart
// between the two.
${decisionItemHeadMeta.toString()}
var PR_REVIEW_POLL_MS = 30000;
var prReviewPlansByNumber = {};
function renderPrReviewPanel(plans, fetchFailed) {
  var section = document.getElementById('pr-review-panel');
  if (!section) return;
  plans = plans || [];
  prReviewPlansByNumber = {};
  section.replaceChildren();
  // Guarded write: assigning the same boolean still queues a MutationObserver
  // record (attribute set, value-equal or not), and this runs every poll tick
  // — an idempotent tick must mutate nothing (cockpit epic 0015, D2 dedup).
  // A failed gh read keeps the section VISIBLE with an honest outage notice —
  // hiding it rendered an outage identically to a confirmed-empty queue.
  var prPanelHidden = plans.length === 0 && !fetchFailed;
  if (section.hidden !== prPanelHidden) section.hidden = prPanelHidden;
  if (prPanelHidden) return;
  var title = el('h3', 'pr-review-title', '🗝️ KEEPER PR review');
  title.setAttribute('data-i18n', 'prReviewTitle');
  section.appendChild(title);
  if (fetchFailed) {
    var notice = el('p', 'pr-review-fetch-failed', '⚠ The open-PR list could not be read from gh — an outage, not a confirmed-empty queue; the next poll retries.');
    notice.setAttribute('data-i18n', 'prReviewFetchFailed');
    section.appendChild(notice);
  }
  for (var i = 0; i < plans.length; i++) {
    var plan = plans[i];
    prReviewPlansByNumber[plan.pr.number] = plan;
    var item = el('div', 'pr-review-item');
    var head = el('div', 'pr-review-head');
    // The number is a real link when gh reported the PR's own url (operator,
    // 2026-09-09: "we pull the data from GitHub — why can't we link straight
    // to it?"). An <a> only when there IS a url: a link element that goes
    // nowhere is worse than plain text. rel=noreferrer on a _blank target is
    // the standard reverse-tabnabbing guard.
    var prNumberEl = plan.pr.url
      ? el('a', 'pr-review-number pr-review-number-link', '#' + plan.pr.number)
      : el('span', 'pr-review-number', '#' + plan.pr.number);
    if (plan.pr.url) {
      prNumberEl.setAttribute('href', plan.pr.url);
      prNumberEl.setAttribute('target', '_blank');
      prNumberEl.setAttribute('rel', 'noopener noreferrer');
    }
    // D1 TAB-STOP ROVING (epic 0015): one Tab stop for the whole panel — a
    // busy review round would otherwise cost one Tab press per open PR.
    // wireRoving() below moves it.
    prNumberEl.setAttribute('tabindex', i === 0 ? '0' : '-1');
    var awaitingApproval = !!(plan.pr.awaitingApprovalRunIds && plan.pr.awaitingApprovalRunIds.length > 0);
    var label = prReviewDecisionLabel(plan.decision.decision, tr, awaitingApproval);
    var headMeta = decisionItemHeadMeta(
      'GitHub PR',
      'pull request',
      'pr-review',
      plan.pr,
      plan.decision.decision,
      label,
      plan.decision.reasoning
    );
    prNumberEl.setAttribute('data-tip', headMeta.numberTip);
    prNumberEl.setAttribute('aria-label', headMeta.numberAriaLabel);
    head.appendChild(prNumberEl);
    head.appendChild(tipChip(headMeta.badgeText, headMeta.badgeTip, headMeta.badgeAriaLabel, headMeta.badgeClass));
    item.appendChild(head);
    item.appendChild(el('p', 'pr-review-pr-title', plan.pr.title));
    // THE PIPELINE STRIP: the stages behind the one-word gate verdict, each
    // its own deep link, each carrying its own elapsed time, running ones
    // animated. The rollup was always fetched and always discarded at this
    // boundary — showing it is what turns "pending" into "e2e is 4m in,
    // windows still queued".
    var checks = plan.pr.checkRuns || [];
    if (checks.length) {
      var checksWrap = el('div', 'pr-review-checks');
      var summary = el('p', 'pr-review-checks-summary', prCheckSummary(checks));
      checksWrap.appendChild(summary);
      var strip = el('div', 'pr-review-check-strip');
      for (var c = 0; c < checks.length; c++) {
        var check = checks[c];
        var chipClass =
          'pr-review-check pr-review-check-' + check.state + (check.optional ? ' pr-review-check-optional' : '');
        var chip = check.url ? el('a', chipClass) : el('span', chipClass);
        var glyph = el('span', 'pr-review-check-glyph', prCheckStateGlyph(check.state));
        // Decorative: the state is already in the tip and the chip text, so
        // a screen reader must not hear "check mark" twice per chip.
        glyph.setAttribute('aria-hidden', 'true');
        chip.appendChild(glyph);
        chip.appendChild(el('span', 'pr-review-check-name', check.name));
        if (check.elapsedMs !== undefined) {
          chip.appendChild(el('span', 'pr-review-check-time', formatCheckDuration(check.elapsedMs)));
        }
        var checkTip = prCheckRunTip(check);
        chip.setAttribute('data-tip', checkTip);
        chip.setAttribute('aria-label', checkTip);
        if (check.url) {
          chip.setAttribute('href', check.url);
          chip.setAttribute('target', '_blank');
          chip.setAttribute('rel', 'noopener noreferrer');
        }
        strip.appendChild(chip);
      }
      checksWrap.appendChild(strip);
      item.appendChild(checksWrap);
    }
    var actions = el('div', 'pr-review-actions');
    var applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'pr-review-execute';
    applyBtn.textContent = 'Apply';
    applyBtn.setAttribute('data-i18n', 'prReviewApply');
    applyBtn.setAttribute('data-pr-review-execute', String(plan.pr.number));
    var applyTip = prReviewExecuteTip(plan.pr, plan.decision, tr);
    applyBtn.setAttribute('data-tip', applyTip);
    applyBtn.setAttribute('aria-label', applyTip);
    actions.appendChild(applyBtn);
    // THE HUMAN MERGE BUTTON — only on the cards the ritual deliberately
    // refuses to merge itself. The maintainer's answer had no home in the
    // app before this (operator: "איך אני עושה את זה דרך הדשבורד עצמו?");
    // the panel queued the PR and then sent you to a browser. Renders
    // disabled-with-reason until every gating check is green.
    if (plan.decision.decision === 'queue-for-human') {
      var mergeBtn = document.createElement('button');
      mergeBtn.type = 'button';
      mergeBtn.className = 'pr-review-human-merge';
      mergeBtn.textContent = '🤝 Merge as maintainer';
      mergeBtn.setAttribute('data-pr-human-merge', String(plan.pr.number));
      var readiness = humanMergeReadiness(plan.pr);
      if (!readiness.ready) {
        mergeBtn.disabled = true;
        mergeBtn.setAttribute('aria-disabled', 'true');
      }
      mergeBtn.setAttribute('data-tip', readiness.reason);
      mergeBtn.setAttribute('aria-label', readiness.reason);
      actions.appendChild(mergeBtn);
    }
    item.appendChild(actions);
    // The execute outcome lands here AFTER the confirm dialog, once focus has
    // long moved on — a polite live region is what lets a screen reader hear
    // that a real gh merge/review landed or failed, the same role=status shape
    // landing-result / gh-issue-result / report-menu's result already carry.
    var resultEl = el('div', 'pr-review-result');
    resultEl.setAttribute('role', 'status');
    resultEl.setAttribute('aria-live', 'polite');
    item.appendChild(resultEl);
    section.appendChild(item);
  }
  // This panel rebuilds on its own 30s poll (PR_REVIEW_POLL_MS below), not
  // the fleet stream's tick, so it needs the same fix renderFleet() applies
  // to fleet cards: a data-i18n element built after the page's one-time
  // applyLocale() call would otherwise render in English regardless of the
  // active locale (board web-msnsndki-dz3vn1).
  translateDom(document.documentElement.lang || 'en');
}
function loadPrReviewPanel() {
  fetch('/api/pr-review', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : { plans: [] }; })
    .then(function (data) { renderPrReviewPanel(data && data.plans, !!(data && data.fetchFailed)); })
    .catch(function () {});
}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-pr-review-execute]');
  if (!b) return;
  var number = parseInt(b.getAttribute('data-pr-review-execute'), 10);
  var plan = prReviewPlansByNumber[number];
  if (!plan) return;
  if (!window.confirm(prReviewConfirmMessage(plan.pr, plan.decision, tr))) return;
  var item = b.closest('.pr-review-item');
  var resultEl = item && item.querySelector('.pr-review-result');
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = tr('prReviewApplying');
  // expectedDecision pins the execute to the decision KIND the confirm
  // dialog above actually showed — the server re-derives fresh and REFUSES
  // to run anything if the PR changed to a different verdict in the
  // meantime (staleDecision: true), instead of e.g. merging on a confirm
  // that promised only a comment. expectedHeadRefOid pins it to the
  // previewed PR's head SHA too — the re-triage-before-Apply guard: a moved
  // head is caught even when the fresh kind coincidentally matches the stale
  // one. See flight/pr-review-execute.ts.
  fetch('/api/pr-review/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      number: number,
      expectedDecision: plan.decision.decision,
      expectedHeadRefOid: plan.pr.headRefOid,
    }),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      var result = prReviewExecuteResult(r.data, tr);
      if (result.className.indexOf('pr-review-result-fail') !== -1) {
        b.disabled = false;
        b.textContent = originalText;
        if (resultEl) {
          resultEl.className = result.className;
          resultEl.textContent = result.text;
        }
        return;
      }
      // A clean apply changed the PR's state (comment posted, or merged) —
      // reload the panel so it reflects reality instead of the stale plan,
      // same "success re-fetches" convention release/landing execute use.
      loadPrReviewPanel();
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'pr-review-result pr-review-result-fail';
        resultEl.textContent = tr('reportRequestFailed');
      }
    });
});
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-pr-human-merge]');
  if (!b || b.disabled) return;
  var number = parseInt(b.getAttribute('data-pr-human-merge'), 10);
  var plan = prReviewPlansByNumber[number];
  if (!plan) return;
  if (!window.confirm(humanMergeConfirmMessage(plan.pr))) return;
  var item = b.closest('.pr-review-item');
  var resultEl = item && item.querySelector('.pr-review-result');
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = 'Merging…';
  // expectedHeadRefOid pins the merge to the head the operator was looking
  // at — the server refuses outright if new commits landed since this card
  // was drawn, rather than merging something nobody read.
  fetch('/api/pr-review/human-merge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ number: number, expectedHeadRefOid: plan.pr.headRefOid }),
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var result = humanMergeResult(data);
      if (resultEl) {
        resultEl.className = result.className;
        resultEl.textContent = result.text;
      }
      if (data && data.merged) {
        // The PR is gone from the open list now — re-poll so the card goes
        // with it rather than lingering as a merged ghost.
        loadPrReviewPanel();
        return;
      }
      b.disabled = false;
      b.textContent = originalText;
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'pr-review-result pr-review-result-fail';
        resultEl.textContent = tr('reportRequestFailed');
      }
    });
});
// Shared roving-tabindex wiring (APG pattern) — wireRoving is a hoisted
// function declaration from fleetJs()'s text in the same concatenated
// bundle, the same top-level call shape coordination.ts already relies on.
// Delegated on document, so renderPrReviewPanel's wholesale poll re-renders
// keep working without re-wiring.
wireRoving('.pr-review-number', '.pr-review-panel');
loadPrReviewPanel();
setInterval(loadPrReviewPanel, PR_REVIEW_POLL_MS);
`.trim();
}
