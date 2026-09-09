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
  prReviewGuestNote,
  prCheckStateGlyph,
  formatCheckDuration,
  prCheckRunTip,
  prCheckSummary,
  humanMergeReadiness,
  humanMergeConfirmMessage,
  humanMergeResult,
  updateBranchConfirmMessage,
  updateBranchResult,
  rerunChecksConfirmMessage,
  rerunChecksResult,
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
// prReviewGuestNote is generated FROM web/pr-review-panel.ts below (epic
// 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899) — its real
// compiled source via .toString(), not a hand-retyped copy. It can no
// longer drift apart.
${prReviewGuestNote.toString()}
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
${updateBranchConfirmMessage.toString()}
${updateBranchResult.toString()}
${rerunChecksConfirmMessage.toString()}
${rerunChecksResult.toString()}
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
// Every button on a card is built the same way: class, label, the data-
// attribute its delegated handler listens for, a tip that doubles as the
// aria-label, and disabled-with-reason. Four call sites shared this shape
// verbatim, which is bundle bytes on a budgeted chunk for no behavior.
function prPanelButton(cls, label, attr, number, tip, disabled) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.setAttribute(attr, String(number));
  b.setAttribute('data-tip', tip);
  b.setAttribute('aria-label', tip);
  if (disabled) {
    b.disabled = true;
    b.setAttribute('aria-disabled', 'true');
  }
  return b;
}
function renderPrReviewPanel(plans, fetchFailed, identity) {
  // The panel self-initializes and then polls forever on its own timer, so
  // its callbacks can land after the page (or, under vitest, the whole jsdom
  // environment) is gone — an unhandled "document is not defined" rejection
  // that fails a run in which every test passed. The sibling issue-triage
  // panel already guards with isConnected; this is the same guard one level
  // up, covering both the fetch .then and the interval.
  if (typeof document === 'undefined') return;
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
    var applyBtn = prPanelButton('pr-review-execute', 'Apply', 'data-pr-review-execute',
      plan.pr.number, prReviewExecuteTip(plan.pr, plan.decision, tr), false);
    applyBtn.setAttribute('data-i18n', 'prReviewApply');
    actions.appendChild(applyBtn);
    // THE MAINTAINER VERBS — only on the cards the ritual deliberately
    // refuses to act on itself. The maintainer's answer had no home in the
    // app before this (operator: "איך אני עושה את זה דרך הדשבורד עצמו?");
    // the panel queued the PR and then sent you to a browser. Each renders
    // disabled-with-reason, and every refusal that names an action gets
    // that action as a button beside it — a red check offers the re-run, a
    // stale branch offers the update.
    if (plan.decision.decision === 'queue-for-human') {
      var readiness = humanMergeReadiness(plan.pr);
      actions.appendChild(prPanelButton('pr-review-human-merge', '🤝 Merge as maintainer',
        'data-pr-human-merge', plan.pr.number, readiness.reason, !readiness.ready));
      if (readiness.hasFailedChecks) {
        actions.appendChild(prPanelButton('pr-review-update-branch', '↻ Re-run failed',
          'data-pr-rerun-checks', plan.pr.number,
          'Restart only the jobs that failed, not the whole matrix. For a flake — a real failure fails again.',
          false));
      }
      if (readiness.behindBase) {
        actions.appendChild(prPanelButton('pr-review-update-branch', '⟳ Update branch',
          'data-pr-update-branch', plan.pr.number,
          'Merge the current base into this branch so protection lets it merge. Restarts every check on the new head.',
          false));
      }
    }
    // Role gate (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899):
    // a confirmed non-owner of this repo is a guest — it sees the preview
    // above but never the write buttons (Apply / merge / re-run / update
    // branch). An unresolved identity (no gh, no GitHub remote at all — the
    // common fully-local project) is NOT a known guest, so it falls through
    // and the buttons render exactly as before.
    if (identity && identity.role === 'user') {
      var guestNote = el('p', 'muted pr-review-guest-note', prReviewGuestNote(identity));
      item.appendChild(guestNote);
    } else {
      item.appendChild(actions);
    }
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
  // Role gate (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899):
  // fetched alongside the PR review preview on every poll tick, never
  // blocking it — a failed identity read (own .catch()) still lets the
  // panel render, since an unresolved identity means "not a known guest",
  // not "unavailable".
  // socialIdentity() is a hoisted core helper — one read per page load,
  // shared with every other role-gated panel.
  var identityFetch = socialIdentity();
  var plansFetch = fetch('/api/pr-review', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : { plans: [] }; });
  Promise.all([plansFetch, identityFetch])
    .then(function (results) {
      var data = results[0];
      var identityData = results[1];
      renderPrReviewPanel(data && data.plans, !!(data && data.fetchFailed), identityData && identityData.identity);
    })
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
// The two maintainer verbs — merge and update-branch — are the same
// interaction: confirm, disable with a working label, POST, write the
// outcome into the card's live region, re-poll. One wiring, two configs;
// duplicating it cost real bundle bytes for zero behavior.
function wirePrMaintainerAction(attr, label, url, confirmFor, bodyFor, formatFor) {
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[' + attr + ']');
    if (!b || b.disabled) return;
    var number = parseInt(b.getAttribute(attr), 10);
    var plan = prReviewPlansByNumber[number];
    if (!plan) return;
    if (!window.confirm(confirmFor(plan.pr))) return;
    var item = b.closest('.pr-review-item');
    var resultEl = item && item.querySelector('.pr-review-result');
    var originalText = b.textContent;
    b.disabled = true;
    b.textContent = label;
    var restore = function () {
      b.disabled = false;
      b.textContent = originalText;
    };
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyFor(number, plan)),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var result = formatFor(data);
        if (resultEl) {
          resultEl.className = result.className;
          resultEl.textContent = result.text;
        }
        var changed = !!(data && (data.merged || data.updated || data.rerun));
        // Re-poll ONLY when the action actually changed the PR. A refusal
        // changed nothing, and re-rendering would wipe the very message
        // explaining the refusal before it could be read — the operator saw
        // a button go dead with no reason left on screen (2026-09-09). On a
        // refusal the button comes back so the same click can be retried
        // once its cause is fixed.
        if (changed) {
          loadPrReviewPanel();
          return;
        }
        restore();
      })
      .catch(function () {
        restore();
        if (resultEl) {
          resultEl.className = 'pr-review-result pr-review-result-fail';
          resultEl.textContent = tr('reportRequestFailed');
        }
      });
  });
}
// expectedHeadRefOid pins the merge to the head the operator was looking at
// — the server refuses outright if new commits landed since this card was
// drawn, rather than merging something nobody read.
wirePrMaintainerAction(
  'data-pr-human-merge',
  'Merging…',
  '/api/pr-review/human-merge',
  humanMergeConfirmMessage,
  function (n, plan) { return { number: n, expectedHeadRefOid: plan.pr.headRefOid }; },
  humanMergeResult
);
wirePrMaintainerAction(
  'data-pr-rerun-checks',
  'Re-running…',
  '/api/pr-review/rerun-checks',
  rerunChecksConfirmMessage,
  function (n) { return { number: n }; },
  rerunChecksResult
);
wirePrMaintainerAction(
  'data-pr-update-branch',
  'Updating…',
  '/api/pr-review/update-branch',
  updateBranchConfirmMessage,
  function (n) { return { number: n }; },
  updateBranchResult
);
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
