// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The dashboard shell + client. Token-themed HTML, layout CSS, and a vanilla
 * client script (theme switcher + live Fleet renderer) — all served as separate
 * same-origin files so the CSP stays `default-src 'self'` (no inline script/style).
 * The client fetches GET /api/state and re-renders on a poll, so the page shows
 * live data. It builds the DOM with createElement + textContent (never innerHTML),
 * so project names/paths from the store can never inject markup.
 */

import { DEFAULT_THEME } from '@autopilot/tokens';
import { fontFaceCss, PRELOAD_FONT_PATHS } from '../assets/fonts.js';
import { gogglesMarkInlineSvg } from '../assets/goggles-mark.js';
import { CALLSIGN_WORDS, firingCallsign as sharedFiringCallsign } from '../shared/callsign.js';
import { countTurns as sharedCountTurns } from '../shared/turns.js';
import {
  NARRATOR_TARGET_CAP,
  basename as sharedBasename,
  narratorTarget as sharedNarratorTarget,
  narratorKind as sharedNarratorKind,
  narratorPhrase as sharedNarratorPhrase,
  narratorLine as sharedNarratorLine,
} from '../shared/narrator.js';
import { flightHeadlineOf as sharedFlightHeadlineOf } from '../shared/flight-summary.js';
import {
  SUBAGENT_TOOLS,
  LIVE_SUBAGENT_CAP,
  liveSubagents as sharedLiveSubagents,
  averageFiringDurationMs as sharedAverageFiringDurationMs,
  ORIENT_FIXATION_TURN_THRESHOLD,
  orientFixation as sharedOrientFixation,
  liveFiringOf as sharedLiveFiring,
  liveFiringsOf as sharedLiveFirings,
} from '../shared/live-firing.js';
import { OFFICE_TIPS } from './office-map.js';
import {
  fmtBytes as sharedFmtBytes,
  fmtCost as sharedFmtCost,
  fmtTokens as sharedFmtTokens,
  fmtAgo as sharedFmtAgo,
  fmtElapsed as sharedFmtElapsed,
  fmtDuration as sharedFmtDuration,
} from './format.js';
import {
  flightVerdictOf as sharedFlightVerdictOf,
  taskMap as sharedTaskMap,
  taskBurnOf as sharedTaskBurnOf,
  taskBudgetSignalOf as sharedTaskBudgetSignalOf,
  taskDimensionBudgetSignalOf as sharedTaskDimensionBudgetSignalOf,
  fleetCacheShareOf as sharedFleetCacheShareOf,
  flightBarMeta as sharedFlightBarMeta,
} from './flight-metrics.js';
import { metricSparkline as sharedMetricSparkline } from './spark-charts.js';
import { cardSectionSigs as sharedCardSectionSigs } from './card-sections.js';
import {
  langBarSegments as sharedLangBarSegments,
  langSegMeta as sharedLangSegMeta,
  langLegendLine as sharedLangLegendLine,
} from './lang-bar.js';
import {
  gaugeSegments as sharedGaugeSegments,
  cardGaugeLabels as sharedCardGaugeLabels,
  gaugeSegmentMeta as sharedGaugeSegmentMeta,
} from './gauge.js';
import { sparkBars as sharedSparkBars } from './sparkline.js';
import {
  brbOverlayVisible as sharedBrbOverlayVisible,
  BRB_FAIL_THRESHOLD,
} from './be-right-back.js';
import { detailSectionSigs as sharedDetailSectionSigs } from './detail-sections.js';
import {
  liveProgressOf as sharedLiveProgressOf,
  liveWorkerCountLabel as sharedLiveWorkerCountLabel,
  liveWorkerTurnLabel as sharedLiveWorkerTurnLabel,
  liveWorkerHeadMeta as sharedLiveWorkerHeadMeta,
  orientFixationChipMeta as sharedOrientFixationChipMeta,
} from './live-progress.js';
import { actMeta as sharedActMeta } from './activity-log.js';
import {
  taskFocusActive as sharedTaskFocusActive,
  taskQueueCounts as sharedTaskQueueCounts,
  taskHistoryMoreMeta as sharedTaskHistoryMoreMeta,
  probableTaskTitle as sharedProbableTaskTitle,
  moveTaskOrder as sharedMoveTaskOrder,
  domTaskOrder as sharedDomTaskOrder,
  taskBurnLabel as sharedTaskBurnLabel,
  taskRunawayTip as sharedTaskRunawayTip,
  suggestedTurnBudget as sharedSuggestedTurnBudget,
  taskBudgetRiskTip as sharedTaskBudgetRiskTip,
  taskDimensionBudgetRiskTip as sharedTaskDimensionBudgetRiskTip,
  DEFAULT_FIRING_TURNS,
  taskStalenessDays as sharedTaskStalenessDays,
  taskStalenessTip as sharedTaskStalenessTip,
  STALE_TASK_DAYS,
  taskTitleTip as sharedTaskTitleTip,
  taskMoveTip as sharedTaskMoveTip,
  taskFocusTip as sharedTaskFocusTip,
  taskActionTip as sharedTaskActionTip,
  taskDimensionChip as sharedTaskDimensionChip,
  taskSeverityChip as sharedTaskSeverityChip,
  queueForecastMeta as sharedQueueForecastMeta,
  QUEUE_FORECAST_WINDOW,
} from './task-queue.js';
import {
  flightLogDisplayRows as sharedFlightLogDisplayRows,
  flightDetailLine as sharedFlightDetailLine,
  flightGroupSummary as sharedFlightGroupSummary,
  sliceChipMeta as sharedSliceChipMeta,
  flightLogRowMeta as sharedFlightLogRowMeta,
  flightGroupHeadMeta as sharedFlightGroupHeadMeta,
  flightCostAgoMeta as sharedFlightCostAgoMeta,
  flightLogMoreMeta as sharedFlightLogMoreMeta,
} from './flight-log-rows.js';
import {
  totalsTileItems as sharedTotalsTileItems,
  statTileItems as sharedStatTileItems,
  statTileAriaLabel as sharedStatTileAriaLabel,
  cardStatItems as sharedCardStatItems,
  cardMetaItems as sharedCardMetaItems,
  liveWorkerItems as sharedLiveWorkerItems,
  liveWorkerChipMeta as sharedLiveWorkerChipMeta,
} from './stat-tiles.js';
import { fleetStateSig as sharedFleetStateSig } from './fleet-view.js';
import { factsMeta as sharedFactsMeta } from './card-facts.js';
import {
  cardRemoveTip as sharedCardRemoveTip,
  cardRemoveAriaLabel as sharedCardRemoveAriaLabel,
  startOverTip as sharedStartOverTip,
  githubSyncTip as sharedGithubSyncTip,
  githubSyncExecuteResult as sharedGithubSyncExecuteResult,
  githubPrLabel as sharedGithubPrLabel,
  githubPrSubmitTip as sharedGithubPrSubmitTip,
  githubPrExecuteResult as sharedGithubPrExecuteResult,
  poolDeliveryIssueNumber as sharedPoolDeliveryIssueNumber,
} from './card-actions.js';
import { statusPillMeta as sharedStatusPillMeta } from './status-pill.js';
import {
  anomalyChipMeta as sharedAnomalyChipMeta,
  guardDenialChipMeta as sharedGuardDenialChipMeta,
} from './anomaly.js';
import {
  coreFeatureModulesJs,
  projectFeatureModulesJs,
  deferredFeatureModulesJs,
} from './chunks.js';
import { layoutCss } from './layout-css.js';
import { REPORT_REGION_ATTR } from './report-capture.js';
import { themeButtons, langButtons, escapeAttr } from './shell-html.js';
import { ACT_ICON_SHAPES, actIconShapes as sharedActIconShapes } from './activity-icon.js';
import { tipPosition as sharedTipPosition } from './tip-position.js';
import { dragBeforeIndex as sharedDragBeforeIndex } from './drag-reorder.js';
import {
  OPERATOR_ACTION_LOG_CAP,
  recordOperatorAction as sharedRecordOperatorAction,
  operatorActionsViewText as sharedOperatorActionsViewText,
} from './operator-actions.js';
const REFRESH_MS = 3000;

/**
 * The live Fleet renderer — fetches /api/state and re-renders on a poll. Vanilla,
 * external, DOM-API-only (createElement + textContent), so store-sourced strings
 * cannot inject markup. No template literals here on purpose (this whole body is
 * itself embedded in one), hence string concatenation throughout.
 */
export function fleetJs(): string {
  return `
var REFRESH_MS = ${REFRESH_MS};
// Recent-operator-actions log for the Ask view context (web-msnrw1ok-0gsdff,
// third slice) — session-scoped (reset on reload), populated by fly.ts's
// launch/stop/pause handlers, read by search.ts when it builds the view
// string. OPERATOR_ACTION_LOG_CAP/recordOperatorAction/operatorActionsViewText
// are generated FROM web/operator-actions.ts below — their real compiled
// source via .toString()/JSON.stringify(), not a hand-retyped copy. They can
// no longer drift apart.
var operatorActionLog = [];
var OPERATOR_ACTION_LOG_CAP = ${JSON.stringify(OPERATOR_ACTION_LOG_CAP)};
${sharedRecordOperatorAction.toString()}
${sharedOperatorActionsViewText.toString()}
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
/** A '.chip' span that explains itself on hover/focus via the shared [data-tip] primitive. */
function tipChip(text, tip, ariaLabel, extraClass) {
  var e = el('span', extraClass ? 'chip ' + extraClass : 'chip', text);
  e.setAttribute('tabindex', '0');
  e.setAttribute('data-tip', tip);
  e.setAttribute('aria-label', ariaLabel);
  return e;
}
// fmtBytes/fmtCost/fmtTokens are generated FROM web/format.ts below (epic
// 0002 "shell decomposition", slice 2) — their real compiled source via
// .toString(), not a hand-retyped copy. They can no longer drift apart.
${sharedFmtBytes.toString()}
${sharedFmtCost.toString()}
${sharedFmtTokens.toString()}
// The ONE honest verdict for a flight-log entry — every surface (flight-log
// chips, per-firing trace) derives from HERE. Two hand-rolled copies drifted
// once already: the trace labeled every non-ship "reverted" while zero
// reverted firings exist in the whole history (operator: "weird REVERTS?!").
// flightVerdictOf is generated FROM web/flight-metrics.ts below (epic 0002
// "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedFlightVerdictOf.toString()}
// flightHeadlineOf is generated FROM shared/flight-summary.ts below (epic
// 0002 "shell decomposition", slice 1) — its real compiled source via
// .toString(), not a hand-retyped copy. EXCEPT a "slice" firing only
// ADVANCED its task (completion.ts taskShouldClose keeps it open) — every
// sibling slice shares that same task title, so leading with it reads as
// duplicate rows (operator: "identical epic titles x15"); a slice leads with
// its OWN commit subject instead. It can no longer drift from the server's
// own function; see flight-summary-parity.test.ts.
${sharedFlightHeadlineOf.toString()}
// A run of 2+ consecutive "slice" firings that advanced the SAME open task —
// collapsed into ONE expandable row (operator: "identical epic titles x15
// read as duplication") instead of N rows repeating the task title. Reuses
// the flight-row click delegation (data-flight-row/data-flight-pid) with a
// synthetic id, so opening it works exactly like opening a normal row.
// flightGroupSummary/flightLogRowMeta are generated FROM
// web/flight-log-rows.ts below (epic 0002 "shell decomposition", slice 2) —
// their real compiled source via .toString(), not a hand-retyped copy. They
// can no longer drift apart.
${sharedFlightGroupSummary.toString()}
${sharedFlightLogRowMeta.toString()}
${sharedFlightGroupHeadMeta.toString()}
${sharedFlightCostAgoMeta.toString()}
function flightGroupRow(c, entry, taskById) {
  var rows = entry.rows;
  var summary = flightGroupSummary(entry, taskById, flightVerdictOf);
  var newest = summary.newest;
  var taskTitle = summary.taskTitle;
  var totalCost = summary.totalCost;
  var groupId = summary.groupId;
  var isOpenRow = openFlightRow[c.id] === groupId;
  var verdict = summary.verdict;
  var headline = summary.headline;

  var li = el('li', 'flight flight-group' + (isOpenRow ? ' flight-open' : ''));
  var head = document.createElement('button');
  head.type = 'button';
  head.className = 'flight-head';
  head.setAttribute('data-flight-row', groupId);
  head.setAttribute('data-flight-pid', c.id);
  head.setAttribute('aria-expanded', String(isOpenRow));
  var headMeta = flightGroupHeadMeta(verdict, rows.length, taskTitle, totalCost, headline, newest.at, fmtCost, fmtAgo);
  var dotEl = el('span', 'flight-dot flight-' + verdict.split(' ')[0], '');
  dotEl.setAttribute('tabindex', '0');
  dotEl.setAttribute('data-tip', headMeta.dotTip);
  dotEl.setAttribute('aria-label', headMeta.dotAriaLabel);
  head.appendChild(dotEl);
  var itemEl = el('span', 'flight-item', headline);
  itemEl.setAttribute('tabindex', '0');
  itemEl.setAttribute('data-tip', headMeta.itemTip);
  itemEl.setAttribute('aria-label', headMeta.itemAriaLabel);
  head.appendChild(itemEl);
  var costEl = el('span', 'flight-cost muted', fmtCost(totalCost));
  costEl.setAttribute('tabindex', '0');
  costEl.setAttribute('data-tip', headMeta.costTip);
  costEl.setAttribute('aria-label', headMeta.costAriaLabel);
  head.appendChild(costEl);
  var agoEl = el('span', 'flight-ago muted', fmtAgo(newest.at));
  agoEl.setAttribute('tabindex', '0');
  agoEl.setAttribute('data-tip', headMeta.agoTip);
  agoEl.setAttribute('aria-label', headMeta.agoAriaLabel);
  head.appendChild(agoEl);
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): a
  // flight-log row header used to give its dot/headline/cost/ago fields (and
  // any of the slice/auto-fixed/guard chips below) their own Tab stop each —
  // one of the biggest per-row multipliers the follow-on measured (25.0
  // stops/flight-log row). Only the first field is now a Tab stop; wireRoving
  // below moves it.
  seedRoving(head, '[tabindex]');
  li.appendChild(head);

  if (isOpenRow) {
    var members = el('ol', 'flight-group-members');
    for (var m = 0; m < rows.length; m++) {
      var mf = rows[m];
      var mVerdict = flightVerdictOf(mf);
      var mHeadline = flightHeadlineOf(mf, taskById);
      var mMeta = flightLogRowMeta(mHeadline, mVerdict, mf.sha);
      var member = el('li', 'flight-group-member');
      var mDot = el('span', 'flight-dot flight-' + mVerdict.split(' ')[0], '');
      mDot.setAttribute('tabindex', '0');
      mDot.setAttribute('data-tip', mMeta.dotTip);
      mDot.setAttribute('aria-label', mMeta.dotAriaLabel);
      member.appendChild(mDot);
      var mItem = el('span', 'flight-item', mMeta.itemText);
      mItem.setAttribute('tabindex', '0');
      mItem.setAttribute('data-tip', mMeta.itemTip);
      // D1 ATTRIBUTE PAYLOAD (epic 0015, board web-mtd1wmqc-v7h6cq): no
      // aria-label duplicating the tip — the full headline rides
      // aria-describedby into a visually-hidden span instead (same fix as
      // the flat flight-log row's own headline, below).
      var mItemDescId = 'flight-member-item-desc-' + c.id + '-' + groupId + '-' + m;
      mItem.setAttribute('aria-describedby', mItemDescId);
      member.appendChild(mItem);
      var mItemDesc = el('span', 'sr-only', mMeta.itemTip);
      mItemDesc.id = mItemDescId;
      member.appendChild(mItemDesc);
      if (mf.sha) {
        var mSha = el('span', 'flight-sha', mMeta.shaText);
        mSha.setAttribute('tabindex', '0');
        mSha.setAttribute('data-tip', mMeta.shaTip);
        mSha.setAttribute('aria-label', mMeta.shaAriaLabel);
        member.appendChild(mSha);
      }
      var mCostAgo = flightCostAgoMeta(
        'Spend for this slice',
        'When this slice happened',
        mf.cost,
        mf.at,
        fmtCost,
        fmtAgo,
        mf.realCostUsd,
      );
      var mCost = el('span', 'flight-cost muted', fmtCost(mf.cost));
      mCost.setAttribute('tabindex', '0');
      mCost.setAttribute('data-tip', mCostAgo.costTip);
      mCost.setAttribute('aria-label', mCostAgo.costAriaLabel);
      member.appendChild(mCost);
      if (mCostAgo.realCostText) {
        var mRealCost = el('span', 'flight-real-cost muted', mCostAgo.realCostText);
        mRealCost.setAttribute('tabindex', '0');
        mRealCost.setAttribute('data-tip', mCostAgo.realCostTip);
        mRealCost.setAttribute('aria-label', mCostAgo.realCostAriaLabel);
        member.appendChild(mRealCost);
      }
      var mAgo = el('span', 'flight-ago muted', fmtAgo(mf.at));
      mAgo.setAttribute('tabindex', '0');
      mAgo.setAttribute('data-tip', mCostAgo.agoTip);
      mAgo.setAttribute('aria-label', mCostAgo.agoAriaLabel);
      member.appendChild(mAgo);
      // Same roving fix as the row header above, per member — an expanded
      // slice-run group can hold several members at once, each its own group.
      seedRoving(member, '[tabindex]');
      members.appendChild(member);
    }
    li.appendChild(members);
  }
  return li;
}
// taskMap/taskBurnOf/taskBudgetSignalOf are generated FROM
// web/flight-metrics.ts below (epic 0002 "shell decomposition", slice 2;
// taskBudgetSignalOf added for ADAPTIVE TASK BUDGET, board
// web-msnt26wf-wnv3w7) — their real compiled source via .toString(), not a
// hand-retyped copy. They can no longer drift apart.
${sharedTaskMap.toString()}
${sharedTaskBurnOf.toString()}
${sharedTaskBudgetSignalOf.toString()}
// taskDimensionBudgetSignalOf is generated FROM web/flight-metrics.ts below
// (ADAPTIVE TASK BUDGET breadth fallback, board web-msnt26wf-wnv3w7) — its
// real compiled source via .toString(), not a hand-retyped copy.
${sharedTaskDimensionBudgetSignalOf.toString()}
// sparkBars is generated FROM web/sparkline.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${sharedSparkBars.toString()}
// Every per-firing spark/timeline bar (metricSparkline, flightTimelineStrip
// in web/features/metrics.ts) needs the same tooltip/aria-label metadata
// derived from a flight-log entry — the two used to hand-duplicate that
// block identically. flightBarMeta is generated FROM web/flight-metrics.ts
// below (epic 0002 "shell decomposition", slice 2) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${sharedFlightBarMeta.toString()}
// metricSparkline is generated FROM web/spark-charts.ts below (BOARD
// web-msuflffa-imy6ne, "PARALLEL UNLOCK A2" — the first cut of real
// DOM-building code, not just pure math, out of shell.ts) — its real
// compiled source via .toString(), not a hand-retyped copy. It can no
// longer drift apart. svgNode is the createSvgNode capability that module
// takes injected rather than calling document.createElementNS itself
// (apps/dashboard's build tsconfig has no "DOM" lib — only the typecheck
// config adds it — so a real, buildable module can't name SVGElement).
function svgNode(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}
${sharedMetricSparkline.toString()}
// costSparkline/flightTimelineStrip/metricsSection — the Metrics
// detail-panel cluster, the two sparkline builders that exist solely to be
// assembled into metricsSection's panel — moved out as one coherent cluster
// to web/features/metrics.ts (epic 0002 "shell decomposition", SHELL HUB
// RELIEF). They ride featureModulesJs() into the same concatenated bundle,
// so metricsDetailNode() below still calls metricsSection by name.
// Fleet-wide stat-tile sparks: all four read the same merged, capped,
// oldest→newest firing series (FleetView.recentFirings, see read/fleet.ts's
// fleetChronoLog) so every tile's trend is real telemetry, never invented.
function fleetCostSpark(log, tasks) {
  return metricSparkline(
    log,
    tasks,
    function (f) { return f.cost || 0; },
    function (f) { return fmtCost(f.cost || 0); },
    function (n, total) { return 'Cost per firing across the fleet, last ' + n + ' firings, total ' + fmtCost(total) + ' — tab through bars for detail'; },
    svgNode, sparkBars, taskMap, flightBarMeta, flightHeadlineOf,
  );
}
function fleetTurnsSpark(log, tasks) {
  return metricSparkline(
    log,
    tasks,
    function (f) { return f.turns || 0; },
    function (f) { return (f.turns || 0) + ((f.turns || 0) === 1 ? ' turn' : ' turns'); },
    function (n) { return 'Turns per firing across the fleet, last ' + n + ' firings — tab through bars for detail'; },
    svgNode, sparkBars, taskMap, flightBarMeta, flightHeadlineOf,
  );
}
// Ship/no-ship "form": every bar the same height, colored by verdict — the
// exact sequence the ship-rate % and streak count both summarize, so the
// ship-rate and streak tiles share this one spark shape.
function fleetFormSpark(log, tasks) {
  return metricSparkline(
    log,
    tasks,
    function () { return 1; },
    function (f) { return f.shipped ? 'shipped' : 'not shipped'; },
    function (n) { return 'Ship outcome per firing across the fleet, last ' + n + ' firings — tab through bars for detail'; },
    svgNode, sparkBars, taskMap, flightBarMeta, flightHeadlineOf,
  );
}
// fleetCacheShareOf is generated FROM web/flight-metrics.ts below (epic 0002
// "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedFleetCacheShareOf.toString()}
function fleetCacheSpark(log, tasks) {
  return metricSparkline(
    log,
    tasks,
    fleetCacheShareOf,
    function (f) { return Math.round(fleetCacheShareOf(f) * 100) + '% cached'; },
    function (n) { return 'Cache-read share per firing across the fleet, last ' + n + ' firings — tab through bars for detail'; },
    svgNode, sparkBars, taskMap, flightBarMeta, flightHeadlineOf,
  );
}
// Roving-tabindex keyboard support for the stat-tile spark bars built above
// (.spark .spark-bar) — wireRoving() (function declaration further down in
// this same generated script, hoisted, so this forward call works) handles
// the Left/Right/Home/End Tab-stop movement generically now. This used to
// be its own hand-copied keydown/focusin pair — the exact duplication
// board ap-mtcktgq1-0's "VERDICT split" flagged as pushing the core bundle
// over its raw budget. Several spark widgets exist on the page at once
// (cost/turns/form/cache); wireRoving reads/writes tabindex straight off
// each group's own DOM, so no shared module-level index is needed.
wireRoving('.spark .spark-bar', '.spark');
// contributionHeatmap — the GitHub-style "Firing activity" calendar, its
// heatRovingIndex roving-tabindex state, and its delegated keydown/focusin
// handlers — moved out as one self-contained region to
// web/features/activity-heatmap.ts (epic 0002 "shell decomposition",
// PARALLEL UNLOCK B). It rides featureModulesJs() into the same
// concatenated bundle, so renderProjectPage() below still calls it by name.
// evaluationTrendPanel/evolutionSection — the two "is the agent improving?"
// evolution-cluster panels that shared the evaluationTrendWeeks/
// evaluationTrendSummary window math — moved out as one coherent cluster to
// web/features/evolution.ts (epic 0002 "shell decomposition", SHELL HUB
// RELIEF). They ride featureModulesJs() into the same concatenated bundle,
// so renderProjectPage() below still calls them by name.
// App-wide tooltip primitive: one shared element, positioned over whichever
// [data-tip] element is hovered or focused. Event-delegated on document
// (cards are rebuilt on every live re-render, so per-element listeners would
// need re-attaching each time). Two content modes: a plain string in
// data-tip (any element), or the richer composed title+meta the cost
// sparkline bars use (data-tip-title/-verdict/-cost/-turns/-sha).
var sparkTipEl = null;
function sparkTip() {
  if (!sparkTipEl) {
    sparkTipEl = el('div', 'spark-tip');
    sparkTipEl.setAttribute('role', 'tooltip');
    sparkTipEl.hidden = true;
    document.body.appendChild(sparkTipEl);
  }
  return sparkTipEl;
}
// tipPosition is generated FROM web/tip-position.ts below (epic 0002 "shell
// decomposition") — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${sharedTipPosition.toString()}
function showTip(target) {
  var tip = sparkTip();
  tip.textContent = '';
  if (target.hasAttribute('data-tip-title')) {
    tip.appendChild(el('strong', 'spark-tip-title', target.getAttribute('data-tip-title')));
    tip.appendChild(el('div', 'spark-tip-meta', [
      target.getAttribute('data-tip-verdict'),
      target.getAttribute('data-tip-cost'),
      target.getAttribute('data-tip-turns'),
      target.getAttribute('data-tip-sha'),
    ].join(' · ')));
  } else {
    tip.textContent = target.getAttribute('data-tip') || '';
  }
  tip.hidden = false;
  var box = target.getBoundingClientRect();
  var tipBox = tip.getBoundingClientRect();
  var pos = tipPosition(box, tipBox, window.innerWidth);
  tip.style.left = pos.left + 'px';
  tip.style.top = pos.top + 'px';
}
function hideTip() {
  if (sparkTipEl) sparkTipEl.hidden = true;
}
function tipTarget(e) {
  return e.target && e.target.closest && e.target.closest('[data-tip], [data-tip-title]');
}
document.addEventListener('mouseover', function (e) {
  var target = tipTarget(e);
  if (target) showTip(target);
});
document.addEventListener('mouseout', function (e) {
  var target = tipTarget(e);
  if (target) hideTip();
});
document.addEventListener('focusin', function (e) {
  var target = tipTarget(e);
  if (target) showTip(target);
});
document.addEventListener('focusout', function (e) {
  var target = tipTarget(e);
  if (target) hideTip();
});
// Which phase is drilled open per project (survives SSE re-renders).
var openPhases = {};
// D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the #live-workers chip
// strip contributed one Tab stop PER LANE (measured 8.0 stops/lane added,
// cockpit-metrics.mjs) — a keyboard trap in practice long before it looked
// like one. Only the chip at this index is a real Tab stop (tabindex="0");
// every other chip is tabindex="-1" and reachable by Left/Right/Home/End
// once the group has focus, the standard roving-tabindex technique. Survives
// SSE re-renders the same way openPhases does; clamped to the live item
// count each render since lanes can finish between polls.
var liveWorkersRovingIndex = 0;
// Flight-log disclosure state (survives SSE re-renders): the expanded row per
// project + whether the full history is shown (vs the compact first rows).
var FLIGHTLOG_COMPACT_ROWS = 8;
var openFlightRow = {};
var openFlightLogAll = {};
// Older firing pages fetched via /api/firings "Load more" (web-msnf2heh-2znbbu):
// entries appended past the server's initial flightLog window, keyed by project id.
// A fresh /api/state pull never carries these — they live only on the client until
// the user asks for them again.
var flightLogExtra = {};
var flightLogMore = {};
var flightLogLoading = {};
// Task-history disclosure state (survives SSE re-renders): how many DONE/
// deferred tasks are shown per project — the open queue is always fully
// visible; only closed history sits behind "Load more" (list-management
// research: NN/g Load-More pattern, chunks of 15).
var TASK_HISTORY_CHUNK = 15;
var openTaskHistory = {};
// Pointer drag-reorder state (HTML5 DnD, zero deps) — the id + source list of
// the task currently being dragged; null between drags.
var draggedTaskId = null;
var draggedTaskList = null;
// narratorTarget/basename/narratorKind/narratorPhrase/narratorLine are
// generated FROM shared/narrator.ts below (epic 0002 "shell decomposition",
// slice 1) — their real compiled source via .toString(), not a hand-retyped
// copy. They can no longer drift apart; see narrator-parity.test.ts. This
// basename is also what activityFileNodes (above) calls internally.
var NARRATOR_TARGET_CAP = ${NARRATOR_TARGET_CAP};
${sharedBasename.toString()}
${sharedNarratorTarget.toString()}
${sharedNarratorKind.toString()}
${sharedNarratorPhrase.toString()}
${sharedNarratorLine.toString()}
// Vendored inline SVG icons for the activity feed — hand-authored 16x16 line
// glyphs (no external font/icon CDN, so the CSP stays default-src 'self').
// Keyed by narratorKind() so the icon always matches the sentence next to it.
// ACT_ICON_SHAPES/actIconShapes are generated FROM web/activity-icon.ts below
// (epic 0002 "shell decomposition") — their real compiled source via
// .toString()/JSON.stringify(), not a hand-retyped copy. They can no longer
// drift apart.
var ACT_ICON_SHAPES = ${JSON.stringify(ACT_ICON_SHAPES)};
${sharedActIconShapes.toString()}
function actIcon(kind) {
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'act-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  var shapes = actIconShapes(kind);
  for (var i = 0; i < shapes.length; i++) {
    var shape = shapes[i];
    var node = document.createElementNS(NS, shape.t);
    for (var key in shape) {
      if (key === 't') continue;
      node.setAttribute(key, String(shape[key]));
    }
    svg.appendChild(node);
  }
  return svg;
}
// One row of the humanized activity feed — an icon plus a plain-language
// sentence ("Editing a.ts.", "Running the gate: pnpm test.") instead of the
// raw tool name. The full tool + target explain themselves on hover/focus via
// the shared [data-tip] primitive (app-wide interactivity audit). DECISION
// TRANSPARENCY: when showReasoning is set (the per-firing drill-down only —
// the compact top-level feed stays one line by design) and the agent's
// stated reasoning survived onto this step, it renders as a visible second
// line — the WHY before the tool call, not just the WHAT.
// actMeta is generated FROM web/activity-log.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${sharedActMeta.toString()}
function actRow(a, showReasoning) {
  var li = el('li', 'act-wrap-row');
  var row = el('div', 'act');
  row.appendChild(actIcon(narratorKind(a)));
  var sentence = el('span', 'act-sentence', narratorPhrase(a) + '.');
  if (a.target) {
    sentence.setAttribute('tabindex', '0');
    sentence.setAttribute('data-tip', a.tool + ': ' + a.target);
    sentence.setAttribute('aria-label', narratorPhrase(a) + '. ' + a.tool + ': ' + a.target);
  }
  row.appendChild(sentence);
  li.appendChild(row);
  if (showReasoning && a.reasoning) {
    li.appendChild(el('p', 'muted act-reason', a.reasoning));
  }
  if (showReasoning) {
    var meta = actMeta(a, fmtTokens);
    if (meta) {
      var metaEl = el('p', 'muted act-meta', meta);
      metaEl.setAttribute('tabindex', '0');
      metaEl.setAttribute('data-tip', 'Model and token usage billed for this step');
      metaEl.setAttribute('aria-label', 'step cost: ' + meta);
      li.appendChild(metaEl);
    }
  }
  return li;
}
// D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): every actRow field above
// (the sentence, and the step-cost meta in the per-firing drill-down) gave
// itself a Tab stop — one per TOOL CALL in the compact debrief feed, a phase's
// "inside orient/do/gate/commit" list, and the trace drill-down, where a
// fifty-call firing was fifty-plus Tab presses before the next panel. Each
// .activity list is one roving group instead: its builders (activitySection/
// phaseDetail in web/features/activity.ts, firingTimelineSection in
// web/features/firing-timeline.ts) seedRoving() once the list is assembled —
// actRow can't know whether its row is first, and rows without a target carry
// no tabindex at all — and the shared wireRoving() handlers (defined further
// down; function declarations hoist) move the stop with Left/Right/Home/End,
// clamped at the list rim. The replay viewer's own Left/Right scrubbing is
// scoped to its .replay-nav bar, so the two never see the same keystroke.
wireRoving('.activity [tabindex]', '.activity');
// countTurns is generated FROM shared/turns.ts below (epic 0002 "shell
// decomposition", slice 1) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift from the server's own function;
// see countTurns-parity.test.ts.
${sharedCountTurns.toString()}
// firingCallsign + CALLSIGN_WORDS are generated FROM shared/callsign.ts below
// (epic 0002 "shell decomposition", slice 1) — the word list is its real
// array, and the function is its real compiled source via .toString(), not a
// hand-retyped copy. They can no longer drift apart; see callsign-parity.test.ts.
var CALLSIGN_WORDS = ${JSON.stringify(CALLSIGN_WORDS)};
${sharedFiringCallsign.toString()}
// SUBAGENT_TOOLS/LIVE_SUBAGENT_CAP + liveSubagents are generated FROM
// shared/live-firing.ts below (epic 0002 "shell decomposition", slice 1) —
// their real compiled source via .toString(), not a hand-retyped copy. They
// can no longer drift apart; see live-firing-parity.test.ts.
var SUBAGENT_TOOLS = new Set(${JSON.stringify([...SUBAGENT_TOOLS])});
var LIVE_SUBAGENT_CAP = ${LIVE_SUBAGENT_CAP};
${sharedLiveSubagents.toString()}
// ORIENT_FIXATION_TURN_THRESHOLD + orientFixation are generated FROM
// shared/live-firing.ts below (epic 0002 "shell decomposition", slice 2) —
// their real compiled source via .toString(), not a hand-retyped copy. They
// can no longer drift apart; see live-firing-parity.test.ts.
var ORIENT_FIXATION_TURN_THRESHOLD = ${ORIENT_FIXATION_TURN_THRESHOLD};
${sharedOrientFixation.toString()}
// liveFiringOf is generated FROM shared/live-firing.ts below (epic 0002
// "shell decomposition", slice 2, twentieth cut) — its real compiled source
// via .toString(), not a hand-retyped copy. It can no longer drift from the
// server's own liveFiring (read/fleet.ts); see live-firing-parity.test.ts.
// callsignOf/narratorLineOf/countTurnsOf are injected (mirrors
// flightProgressOf's fmtCost/fmtDuration params) rather than imported, same
// reason every shared module in this epic stays import-free.
${sharedLiveFiring.toString()}
// probableTaskTitle is generated FROM web/task-queue.ts below (epic 0002
// "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedProbableTaskTitle.toString()}
// Wraps liveFiringOf with the client-only probableTask fallback — the honest
// best guess at "what this firing is working" when no focus lock is set: the
// queue head, the same task a firing's board would list first (see fly.ts's
// board build: only 'queued'/'in_progress' rows, already severity/priority-
// ordered by recentTasks). A 'needs_approval' proposal is never actually
// worked, so it's skipped even when it sorts ahead of a real queued task.
// probableTask has no server-side use (only the live worker card renders
// it), so it stays a thin wrapper here instead of joining the shared core —
// same split flightProgressOf/renderTotalProgress uses between pure math and
// DOM-adjacent glue.
function liveFiring(c) {
  var core = liveFiringOf(c, firingCallsign, narratorLine, countTurns);
  if (!core) return null;
  core.phase = core.phase || 'other';
  core.probableTask = core.focusTask ? null : probableTaskTitle(c.tasks || []);
  return core;
}
// liveFiringsOf is generated FROM shared/live-firing.ts below (multi-lane
// board web-mtbp0t86-rnimyi) — its real compiled source via .toString(), not
// a hand-retyped copy. It can no longer drift from the server's own
// liveFirings (read/fleet.ts).
${sharedLiveFirings.toString()}
// The multi-lane counterpart to liveFiring(c) above — every still-live lane
// for this project, newest first, each wrapped with the same client-only
// probableTask fallback.
function liveFirings(c) {
  var list = liveFiringsOf(c, firingCallsign, narratorLine, countTurns);
  return list.map(function (core) {
    core.phase = core.phase || 'other';
    core.probableTask = core.focusTask ? null : probableTaskTitle(c.tasks || []);
    return core;
  });
}
// averageFiringDurationMs is generated FROM shared/live-firing.ts below
// (epic 0002 "shell decomposition", slice 1) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift from the
// server's own function; see live-firing-parity.test.ts.
${sharedAverageFiringDurationMs.toString()}
// liveProgressOf is generated FROM web/live-progress.ts below (epic 0002
// "shell decomposition", slice 2, eighteenth cut) — its real compiled source
// via .toString(), not a hand-retyped copy. It can no longer drift apart.
// fmtElapsed/fmtDuration are injected (mirrors flightProgressOf's
// fmtCost/fmtDuration params) rather than imported, same reason.
${sharedLiveProgressOf.toString()}
// liveWorkerCountLabel/liveWorkerTurnLabel are generated FROM
// web/live-progress.ts below (epic 0002 "shell decomposition", slice 2,
// forty-second cut) — their real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${sharedLiveWorkerCountLabel.toString()}
${sharedLiveWorkerTurnLabel.toString()}
// liveWorkerHeadMeta is generated FROM web/live-progress.ts below (epic 0002
// "shell decomposition", slice 2, sixty-third cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${sharedLiveWorkerHeadMeta.toString()}
// orientFixationChipMeta is generated FROM web/live-progress.ts below (epic
// 0002 "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedOrientFixationChipMeta.toString()}
// The live worker card — "what is this firing doing right now?" — rendered on
// both the fleet grid card and the project detail page (same card() markup).
function liveWorkerCard(c) {
  var live = liveFiring(c);
  if (!live) return null;
  var wrap = el('div', 'live-worker');
  var head = el('div', 'live-worker-head');
  var dot = el('span', 'live-dot');
  dot.setAttribute('aria-hidden', 'true');
  head.appendChild(dot);
  head.appendChild(el('span', 'live-worker-label', 'live — firing in progress'));
  var headMeta = liveWorkerHeadMeta(live.callsign, live.model);
  head.appendChild(tipChip(
    live.callsign,
    headMeta.callsign.tip,
    headMeta.callsign.ariaLabel,
    'live-callsign'
  ));
  var phaseTip = OFFICE_TIPS[live.phase] || 'phase not yet classified from recent activity';
  var phasePill = el('span', 'pill live-phase-' + live.phase, live.phase);
  phasePill.setAttribute('tabindex', '0');
  phasePill.setAttribute('data-tip', phaseTip + ' (current)');
  // D1 ATTRIBUTE PAYLOAD (epic 0015): the pill's own text already shows the
  // phase name, so aria-label states only the essential "this is the current
  // one" fact — it must not also duplicate data-tip's full descriptive
  // sentence verbatim, the same class of duplication 189137e0/f8779d15/
  // c3c57f5d fixed for the task-chip/search-hit/task-title aria-labels.
  phasePill.setAttribute('aria-label', 'current phase: ' + live.phase);
  head.appendChild(phasePill);
  if (headMeta.model) {
    head.appendChild(tipChip(
      live.model,
      headMeta.model.tip,
      headMeta.model.ariaLabel,
      'chip-model live-model'
    ));
  }
  if (live.orientFixation) {
    var fixationMeta = orientFixationChipMeta(live.turnsSeen);
    head.appendChild(tipChip(
      '⚠ no edit yet',
      fixationMeta.tip,
      fixationMeta.ariaLabel,
      'chip-anomaly live-orient-fixation'
    ));
  }
  wrap.appendChild(head);
  var narratorEl = el('p', 'live-worker-narrator', live.narrator);
  narratorEl.setAttribute('tabindex', '0');
  narratorEl.setAttribute(
    'data-tip',
    "AUTOPILOT's own one-sentence summary of its most recent action this firing",
  );
  narratorEl.setAttribute('aria-label', live.narrator);
  wrap.appendChild(narratorEl);
  if (live.focusTask) {
    var focusTaskEl = el('p', 'live-worker-line', '🎯 working: ' + live.focusTask);
    focusTaskEl.setAttribute('tabindex', '0');
    focusTaskEl.setAttribute('data-tip', 'The board task this firing is explicitly working on');
    focusTaskEl.setAttribute('aria-label', focusTaskEl.textContent);
    wrap.appendChild(focusTaskEl);
  } else if (live.probableTask) {
    var probableTaskEl = el('p', 'live-worker-line live-worker-guess', 'probably working: ' + live.probableTask);
    probableTaskEl.setAttribute('tabindex', '0');
    probableTaskEl.setAttribute(
      'data-tip',
      "AUTOPILOT's best guess at the task this firing is working on, inferred from the " +
        'board queue — not a confirmed link',
    );
    probableTaskEl.setAttribute('aria-label', probableTaskEl.textContent);
    wrap.appendChild(probableTaskEl);
  }
  var actionLine = el('p', 'live-worker-line');
  var toolSpan = el('span', 'act-tool act-' + (live.kind || 'other'), live.tool);
  toolSpan.setAttribute('tabindex', '0');
  toolSpan.setAttribute('data-tip', 'the most recent tool call this firing made');
  toolSpan.setAttribute('aria-label', 'tool: ' + live.tool);
  actionLine.appendChild(toolSpan);
  if (live.target) {
    var targetSpan = el('span', 'act-target', live.target);
    targetSpan.setAttribute('tabindex', '0');
    targetSpan.setAttribute('data-tip', 'the file, command, or target that tool call touched');
    targetSpan.setAttribute('aria-label', 'target: ' + live.target);
    actionLine.appendChild(targetSpan);
  }
  wrap.appendChild(actionLine);
  var countLabel = liveWorkerCountLabel(live.recentActions, live.recentActionsCapped);
  var countEl = el('p', 'muted live-worker-count', countLabel);
  countEl.setAttribute('tabindex', '0');
  countEl.setAttribute(
    'data-tip',
    live.recentActionsCapped
      ? 'The shared recent-activity window is entirely this firing — it may have taken more actions than are visible here'
      : 'Every action this live firing has taken, within the shared recent-activity window',
  );
  countEl.setAttribute('aria-label', 'recent actions: ' + countLabel);
  wrap.appendChild(countEl);
  var turnLabel = liveWorkerTurnLabel(live.startedAt, live.turnsSeen, fmtElapsed);
  var turnsEl = el('p', 'muted live-worker-turns', turnLabel);
  turnsEl.setAttribute('tabindex', '0');
  turnsEl.setAttribute(
    'data-tip',
    'An approximate turn count — adjacent tool calls collapse into one turn when they ' +
      'share the same model, token usage, and reasoning; the real cost is unknown until ' +
      'this firing lands',
  );
  turnsEl.setAttribute('aria-label', turnLabel);
  wrap.appendChild(turnsEl);
  // Per-firing PROGRESS (slice of web-msnt5ccp-9bx2ix): elapsed vs. this
  // project's own average firing duration — silent with no history yet
  // (a fresh project has nothing honest to compare against). Capped at 100%
  // visually; a real overrun is called out in the label instead of clipping.
  // The percent/label math itself is liveProgressOf (above); this function
  // stays the DOM-writing half, same split flight-progress's DOM-building
  // half uses.
  if (live.avgFiringDurationMs) {
    var progress = liveProgressOf(live.startedAt, live.avgFiringDurationMs, fmtElapsed, fmtDuration);
    var progressLabel = el('p', 'muted live-worker-progress-label', progress.label);
    progressLabel.setAttribute('tabindex', '0');
    progressLabel.setAttribute(
      'data-tip',
      'Elapsed time for this firing against the average duration of past firings on this project',
    );
    progressLabel.setAttribute('aria-label', progress.label);
    wrap.appendChild(progressLabel);
    var progressBar = el('div', 'live-progress' + (progress.isOver ? ' live-progress-over' : ''));
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('tabindex', '0');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', '100');
    progressBar.setAttribute('aria-valuenow', String(progress.pctCapped));
    progressBar.setAttribute('aria-label', progress.label);
    progressBar.setAttribute(
      'data-tip',
      'Elapsed time for this firing against the average duration of past firings on this project',
    );
    var progressFill = el('div', 'live-progress-fill');
    progressFill.style.transform = 'scaleX(' + progress.pctCapped / 100 + ')';
    progressBar.appendChild(progressFill);
    wrap.appendChild(progressBar);
  }
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): every
  // explained line above — callsign/phase/model/fixation chips, narrator,
  // task line, tool + target, count, turns, progress label AND bar — used to
  // be its own Tab stop: up to a dozen per flying card, repeated on every
  // flying fleet card and again on the project page. Only the first line (in
  // DOM order) is now a Tab stop; wireRoving() below moves it with Left/
  // Right/Home/End and follows mouse/programmatic focus, scoped to THIS
  // card so End on one flying project never jumps into the next. Seeded
  // after assembly, like the flight-log rows: which line is first depends on
  // the optional model/fixation chips, so it's only knowable here.
  seedRoving(wrap, '[tabindex]');
  return wrap;
}
wireRoving('.live-worker [tabindex]', '.live-worker');
// OFFICE_TIPS is generated FROM web/office-map.ts below (epic 0002 "shell
// decomposition", slice 2) — its real value via JSON.stringify(), not a
// hand-retyped copy. It can no longer drift apart. The rest of the agent
// office map (OFFICE_PHASES/OFFICE_LABELS/officeZoneX/officeTargetFor/
// officeEase/officeSatellitePos/officeTweenPos/officeSatellites/
// officeMapSection/prefersReducedMotion) moved to
// web/features/office-map.ts (SHELL HUB RELIEF, web-mt69bego-etc8te) —
// OFFICE_TIPS stays here instead because liveWorkerCard/renderStatTiles
// below and web/features/activity.ts's phaseRail also read it, not just
// officeMapSection.
var OFFICE_TIPS = ${JSON.stringify(OFFICE_TIPS)};
// fmtAgo/fmtElapsed/fmtDuration are generated FROM web/format.ts below (epic
// 0002 "shell decomposition", slice 2) — their real compiled source via
// .toString(), not a hand-retyped copy. They can no longer drift apart.
${sharedFmtAgo.toString()}
${sharedFmtElapsed.toString()}
${sharedFmtDuration.toString()}
// Status pills (project card header, task board rows) used to be plain,
// unexplained text — unlike every other chip/stat on the fleet card, which
// already carries the shared [data-tip] primitive. These maps back the same
// tabindex/data-tip/aria-label wiring stat() uses below.
var PROJECT_STATUS_TIPS = {
  registered: 'Registered but has not flown yet',
  flying: 'A firing is in progress right now',
  paused: 'Paused — will not fly until resumed',
  hibernating: 'No recent activity — skipped by the scheduler until it wakes',
  needs_you: 'Blocked on a decision only you can make',
};
var TASK_STATUS_TIPS = {
  queued: 'Queued — waiting its turn in the flight queue',
  in_progress: 'Currently being worked by the autopilot',
  done: 'Completed and verified by the gate',
  needs_approval: 'Self-proposed — waiting on your approve/reject decision',
  deferred: 'Deferred — set aside for later',
};
// statusPillMeta is generated FROM web/status-pill.ts below (epic 0002 "shell
// decomposition", slice 2, seventy-fourth cut) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedStatusPillMeta.toString()}
function statusPill(classPrefix, status, tips) {
  var meta = statusPillMeta(status, tips);
  var pill = el('span', classPrefix + status, meta.label);
  if (meta.tip) {
    pill.setAttribute('tabindex', '0');
    pill.setAttribute('data-tip', meta.tip);
    pill.setAttribute('aria-label', meta.ariaLabel);
  }
  return pill;
}
// anomalyChipMeta is generated FROM web/anomaly.ts below (epic 0002 "shell
// decomposition", slice 2, seventy-eighth cut) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedAnomalyChipMeta.toString()}
// guardDenialChipMeta is generated FROM web/anomaly.ts below (epic 0002
// "shell decomposition", slice 2, eighty-third cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${sharedGuardDenialChipMeta.toString()}
var ANOMALY_LABELS = {
  'cost-spike': '⚠ cost spike',
  'death-cluster': '⚠ death cluster',
  'gate-fail-streak': '⚠ gate fail streak',
  'orient-drag': '🧭 orient drag',
  'family-runaway': '⚠ family runaway',
  'intent-collision': '🚨 intent collision',
  'near-miss-recurring': '🩹 recurring near-miss',
  'guard-denial': '🛡️ guard denial',
  'sync-back-refusal': '🔁 sync-back refused',
  'land-gate-alarm': '🚨 land gate alarm',
  'convergence-red': '⛔ convergence red',
  'e2e-land-block': '🚫 e2e land block',
};
/** A needs-you chip for one detected anomaly (see read/anomalies.ts) — label
 *  names the rule, the hover/focus tip carries the evidence that fired it. */
function anomalyChip(a) {
  var meta = anomalyChipMeta(a, ANOMALY_LABELS);
  return tipChip(meta.label, meta.tip, meta.ariaLabel, 'chip-anomaly');
}
// statTileAriaLabel is generated FROM web/stat-tiles.ts below (epic 0002
// "shell decomposition", slice 2, seventy-ninth cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart. stat() had independently retyped this exact
// label + ': ' + value + ' — ' + tip formula — the same hand-sync
// duplication class the seventy-fifth cut fixed across doraSection/
// gateParallelSection/renderTotals/renderStatTiles, missed there since
// stat() is a fifth, lower-level call site those four route through
// rather than a peer of them.
${sharedStatTileAriaLabel.toString()}
function stat(value, label, tip) {
  var wrap = el('div', 'stat');
  wrap.appendChild(el('span', 'stat-n', String(value)));
  wrap.appendChild(el('span', 'stat-l', label));
  if (tip) {
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('data-tip', tip);
    wrap.setAttribute('aria-label', statTileAriaLabel([String(value), label, tip]));
  }
  return wrap;
}
// gaugeSegments is generated FROM web/gauge.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${sharedGaugeSegments.toString()}
// gaugeSegmentMeta is generated FROM web/gauge.ts below (epic 0002 "shell
// decomposition", slice 2, sixty-sixth cut) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedGaugeSegmentMeta.toString()}
function gaugeBar(g) {
  var wrap = el('div', 'gauge');
  var segs = gaugeSegments(g);
  if (!segs.length) {
    var clear = el('span', 'seg seg-clear');
    clear.style.flex = '1';
    clear.setAttribute('tabindex', '0');
    clear.setAttribute('role', 'img');
    clear.setAttribute('data-tip', 'No open findings');
    clear.setAttribute('aria-label', 'No open findings');
    wrap.appendChild(clear);
    return wrap;
  }
  for (var i = 0; i < segs.length; i++) {
    var seg = el('span', 'seg seg-' + segs[i].kind);
    seg.style.flex = String(segs[i].count);
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only the
    // first segment is a Tab stop — every fleet-card gauge used to add one Tab
    // stop per severity bucket (critical/high/medium/low), so a bigger fleet
    // grid meant a longer keyboard trap before a user ever reached the next
    // card. The keydown/focusin handlers below move the single stop.
    seg.setAttribute('tabindex', i === 0 ? '0' : '-1');
    seg.setAttribute('role', 'img');
    var segMeta = gaugeSegmentMeta(segs[i]);
    seg.setAttribute('data-tip', segMeta.tip);
    seg.setAttribute('aria-label', segMeta.ariaLabel);
    wrap.appendChild(seg);
  }
  return wrap;
}
// Roving-tabindex keyboard support for the findings-gauge segments built
// above (.card-gauge .gauge .seg), via the shared wireRoving() helper
// (hoisted function declaration, defined alongside the langbar group below).
// MANY gauges exist at once (one per fleet card), which wireRoving handles by
// keeping state in each group's own tabindex attributes rather than a shared
// module-level index — this group used to hand-copy those ~15 lines, the
// exact duplication that pushed the core bundle over its raw budget when the
// D1 roving lanes merged.
wireRoving('.gauge .seg', '.gauge');
// Roving-tabindex keyboard support for the gauge label's two spans (findings
// count + last-activity timestamp) built in cardGauge below.
wireRoving('.gauge-label [tabindex]', '.gauge-label');
function cardHead(c) {
  var head = el('div', 'card-head');
  var title = el('h2', 'card-title');
  var titleLink = document.createElement('a');
  titleLink.href = '/p/' + encodeURIComponent(c.id);
  titleLink.className = 'card-link';
  titleLink.textContent = c.name;
  title.appendChild(titleLink);
  head.appendChild(title);
  var badges = el('div', 'card-head-badges');
  badges.appendChild(statusPill('pill pill-', c.status, PROJECT_STATUS_TIPS));
  if (c.anomalies) {
    for (var ai = 0; ai < c.anomalies.length; ai++) badges.appendChild(anomalyChip(c.anomalies[ai]));
  }
  if (c.soulReviewed === false) badges.appendChild(soulReviewBtn(c.id));
  head.appendChild(badges);
  return head;
}
// The SOUL evolution loop's "unreviewed" surface (B5 closure): a project's
// (possibly LLM-generated) starter SOUL starts unratified — this button is
// the operator's one-click way to say "I've read it" (POST handler below).
function soulReviewBtn(projectId) {
  var tip = "This project's starter SOUL prompt was auto-generated and has not been reviewed by you yet — click to mark it reviewed";
  var btn = el('button', 'soul-review-btn', '◐ SOUL unreviewed');
  btn.setAttribute('type', 'button');
  btn.setAttribute('data-soul-review', projectId);
  btn.setAttribute('data-tip', tip);
  // D1 ATTRIBUTE PAYLOAD (epic 0015, board web-mtd1wmqc-v7h6cq): the button's
  // own "◐ SOUL unreviewed" text already gives it a short accessible name —
  // an aria-label here would override that name with the full tip sentence
  // AND duplicate data-tip verbatim. The tip instead rides aria-describedby
  // into a visually-hidden sibling span, appended AFTER the button (not
  // inside it, where a button's accessible name absorbs descendant text).
  var descId = 'soul-review-desc-' + projectId;
  btn.setAttribute('aria-describedby', descId);
  var desc = el('span', 'sr-only', tip);
  desc.id = descId;
  var frag = document.createDocumentFragment();
  frag.appendChild(btn);
  frag.appendChild(desc);
  return frag;
}
// cardMetaItems is generated FROM web/stat-tiles.ts below (epic 0002 "shell
// decomposition", slice 2, sixty-first cut) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedCardMetaItems.toString()}
function cardMeta(c) {
  var meta = el('div', 'card-meta');
  var items = cardMetaItems(c, fmtBytes);
  for (var i = 0; i < items.length; i++) meta.appendChild(tipChip(items[i][0], items[i][1], items[i][2]));
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): the
  // language/file-count/size chips used to be three Tab stops per card, part
  // of the 23.0 stops/added-card the 2026-09-03 row-axis measurement still
  // counted. Only the first chip is a Tab stop now; wireRoving below moves it.
  seedRoving(meta, '.chip');
  return meta;
}
// cardStatItems is generated FROM web/stat-tiles.ts below (epic 0002 "shell
// decomposition", slice 2, thirty-fifth cut) — its real compiled source via
// .toString(), not a hand-retyped copy. They can no longer drift apart.
${sharedCardStatItems.toString()}
function cardStats(c) {
  var stats = el('div', 'card-stats');
  var items = cardStatItems(c);
  for (var i = 0; i < items.length; i++) stats.appendChild(stat(items[i][0], items[i][1], items[i][2]));
  // Same roving fix as cardMeta above for the firings/shipped/ship-rate (and
  // optional recent-form) tiles — one Tab stop per row, not one per tile.
  // Seeded on '[tabindex]' rather than '.stat' because stat() only makes a
  // tile focusable when it carries a tip, so "first tile" and "first
  // focusable tile" are not guaranteed to be the same element.
  seedRoving(stats, '.stat[tabindex]');
  return stats;
}
// cardGaugeLabels is generated FROM web/gauge.ts below (epic 0002 "shell
// decomposition", slice 2, forty-seventh cut) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedCardGaugeLabels.toString()}
function cardGauge(c) {
  var gwrap = el('div', 'card-gauge');
  var glabel = el('div', 'gauge-label');
  var labels = cardGaugeLabels(c, fmtAgo);
  var findingsText = labels.findingsText;
  var findingsEl = el('span', null, findingsText);
  findingsEl.setAttribute('tabindex', '0');
  findingsEl.setAttribute('data-tip', 'Unresolved review findings for this project — see the breakdown below');
  findingsEl.setAttribute('aria-label', findingsText);
  glabel.appendChild(findingsEl);
  var activityText = labels.activityText;
  var activityEl = el('span', 'muted', activityText);
  activityEl.setAttribute('tabindex', '0');
  activityEl.setAttribute('data-tip', 'When this project last had any activity');
  activityEl.setAttribute('aria-label', 'last activity: ' + activityText);
  glabel.appendChild(activityEl);
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): the
  // findings count and last-activity timestamp used to each be their own Tab
  // stop — the remaining per-item stop flagged when the stat-tile family fix
  // shipped. Only the first is a Tab stop now; wireRoving() below moves it.
  seedRoving(glabel, '[tabindex]');
  gwrap.appendChild(glabel);
  gwrap.appendChild(gaugeBar(c.gauge));
  return gwrap;
}
// cardRemoveTip/cardRemoveAriaLabel are generated FROM web/card-actions.ts
// below (epic 0002 "shell decomposition", slice 2, seventy-first cut) —
// their real compiled source via .toString(), not a hand-retyped copy. They
// can no longer drift apart.
${sharedCardRemoveTip.toString()}
${sharedCardRemoveAriaLabel.toString()}
function cardActions(c) {
  var actions = el('div', 'card-actions');
  if (c.soulProposed) actions.appendChild(soulProposalPanel(c.id, c.soulProposed));
  if (c.soulPrevious) actions.appendChild(soulUnratifyChip(c.id));
  actions.appendChild(soulEditorPanel(c.id, c.soul));
  var rm = el('button', 'card-remove', 'Remove');
  rm.setAttribute('type', 'button');
  rm.setAttribute('data-i18n', 'removeCard');
  rm.setAttribute('data-remove', c.id);
  rm.setAttribute('data-name', c.name);
  rm.setAttribute('data-tip', cardRemoveTip(c.name));
  // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): aria-label stops
  // duplicating the tip's full sentence — see cardRemoveAriaLabel.
  rm.setAttribute('aria-label', cardRemoveAriaLabel(c.name));
  actions.appendChild(rm);
  return actions;
}
// The SOUL evolution loop's "proposed" surface (B5 closure): a post-flight
// step may PROPOSE a SOUL amendment (packages/store's soul_proposed column,
// never applied automatically) — this disclosure lets the operator read the
// pending text before ratifying (replaces the live SOUL) or dismissing
// (discards it, live SOUL untouched) it. <details> keeps the text out of the
// way until opened, with zero focus-trap/modal complexity.
function soulProposalPanel(projectId, proposedText) {
  var details = el('details', 'soul-proposal');
  var summaryEl = el('summary', 'soul-proposal-summary', '◇ SOUL proposal pending — review');
  summaryEl.setAttribute('data-i18n', 'soulProposalSummary');
  details.appendChild(summaryEl);
  details.appendChild(el('pre', 'soul-proposal-text', proposedText));
  var row = el('div', 'soul-proposal-row');
  var ratifyTip = "Replace this project's live SOUL prompt with the proposed text above — undoable afterward with ↺ un-ratify";
  var ratifyBtn = el('button', 'soul-ratify-btn', '✓ ratify');
  ratifyBtn.setAttribute('type', 'button');
  ratifyBtn.setAttribute('data-i18n', 'soulRatify');
  ratifyBtn.setAttribute('data-soul-ratify', projectId);
  ratifyBtn.setAttribute('data-tip', ratifyTip);
  ratifyBtn.setAttribute('aria-label', ratifyTip);
  row.appendChild(ratifyBtn);
  var dismissTip = 'Discard this proposed SOUL amendment — the live SOUL prompt is unchanged';
  var dismissBtn = el('button', 'soul-dismiss-btn', '✗ dismiss');
  dismissBtn.setAttribute('type', 'button');
  dismissBtn.setAttribute('data-i18n', 'soulDismiss');
  dismissBtn.setAttribute('data-soul-dismiss', projectId);
  dismissBtn.setAttribute('data-tip', dismissTip);
  dismissBtn.setAttribute('aria-label', dismissTip);
  row.appendChild(dismissBtn);
  details.appendChild(row);
  return details;
}
// The SOUL evolution loop's "undo" surface (board web-mswqemor-ab3jsu) —
// ratify used to overwrite the live SOUL with no way back short of a manual
// SQL edit (the incident that opened this item: an operator ratified by
// mistake and had the flag "restored by hand"). Shown exactly as long as the
// store has a soul_previous snapshot to restore (cleared by the next ratify
// or by using this chip); POST handler below.
function soulUnratifyChip(projectId) {
  var wrap = el('div', 'soul-unratify-row');
  var tip = "Undo the last SOUL ratification — restores this project's SOUL text to what it was before";
  var btn = el('button', 'soul-unratify-btn', '↺ un-ratify');
  btn.setAttribute('type', 'button');
  btn.setAttribute('data-i18n', 'soulUnratify');
  btn.setAttribute('data-soul-unratify', projectId);
  btn.setAttribute('data-tip', tip);
  btn.setAttribute('aria-label', tip);
  wrap.appendChild(btn);
  return wrap;
}
// FLEET WISDOM (board web-msnt26xe-pc4pzp): the fleet-wide pending wisdom
// amendment's review surface — the fleet-scoped counterpart to
// soulProposalPanel above (same disclosure shape, same CSS), minus the
// project id: there is exactly one pending proposal for the whole fleet.
// Mined post-flight (flight/fleet-wisdom-mining.ts), never applied
// automatically — this banner is where the operator ratifies or dismisses.
function fleetWisdomPanel(proposedText, wisdomKind) {
  var details = el('details', 'soul-proposal fleet-wisdom-panel');
  var summaryText = wisdomKind
    ? '◆ Fleet wisdom proposal pending (' + wisdomKind + ') — review'
    : '◆ Fleet wisdom proposal pending — review';
  var summaryEl = el('summary', 'soul-proposal-summary', summaryText);
  details.appendChild(summaryEl);
  details.appendChild(el('pre', 'soul-proposal-text fleet-wisdom-text', proposedText));
  var row = el('div', 'soul-proposal-row');
  var ratifyTip = "Apply this amendment as the live fleet-wide wisdom — every project's next firing carries it";
  var ratifyBtn = el('button', 'soul-ratify-btn', '✓ ratify');
  ratifyBtn.setAttribute('type', 'button');
  ratifyBtn.setAttribute('data-fleet-wisdom-ratify', '');
  ratifyBtn.setAttribute('data-tip', ratifyTip);
  ratifyBtn.setAttribute('aria-label', ratifyTip);
  row.appendChild(ratifyBtn);
  var dismissTip = 'Discard this proposed fleet wisdom — the live shared wisdom is unchanged';
  var dismissBtn = el('button', 'soul-dismiss-btn', '✗ dismiss');
  dismissBtn.setAttribute('type', 'button');
  dismissBtn.setAttribute('data-fleet-wisdom-dismiss', '');
  dismissBtn.setAttribute('data-tip', dismissTip);
  dismissBtn.setAttribute('aria-label', dismissTip);
  row.appendChild(dismissBtn);
  details.appendChild(row);
  return details;
}
// wisdomProposed is deliberately NOT part of fleetStateSig (fleet-view.ts),
// so the banner does its own cheap dirty check — DOM identity (an open
// <details>, a focused button) survives ticks where the text is unchanged.
var lastFleetWisdomProposed = null;
function renderFleetWisdom(state) {
  var host = document.getElementById('fleet-wisdom');
  if (!host) return;
  var text = state.wisdomProposed || null;
  if (text === lastFleetWisdomProposed) return;
  lastFleetWisdomProposed = text;
  host.replaceChildren();
  if (!text) { host.hidden = true; return; }
  host.hidden = false;
  host.appendChild(fleetWisdomPanel(text, state.wisdomKind || null));
}
// The SOUL evolution loop's "editor" surface — the remaining half of board
// web-mswqemor-ab3jsu after confirm-before-ratify and the un-ratify chip
// above: a way to VIEW a project's current live SOUL text and PROPOSE a
// hand-written edit, without waiting for an automated post-flight mining
// step. Submitting lands in the exact same soul_proposed pending slot (and
// ratify/dismiss/confirm flow, POST handler below) a mined proposal already
// goes through — this never overwrites the live SOUL directly. <details>
// keeps the full text out of the way until opened, same as soulProposalPanel
// above. Always rendered, even with no SOUL text yet (empty textarea) — the
// entry point itself must always be findable.
function soulEditorPanel(projectId, soulText) {
  var details = el('details', 'soul-editor');
  var summary = el('summary', 'soul-editor-summary', '✎ view/edit SOUL');
  summary.setAttribute('data-i18n', 'soulEditorSummary');
  details.appendChild(summary);
  var form = document.createElement('form');
  form.className = 'soul-editor-form';
  form.setAttribute('data-soul-edit', projectId);
  var textareaId = 'soul-editor-text-' + projectId;
  var label = el('label', null, "This project's live SOUL text — edit and propose a change");
  label.setAttribute('for', textareaId);
  label.setAttribute('data-i18n', 'soulEditorLabel');
  var textarea = document.createElement('textarea');
  textarea.id = textareaId;
  textarea.name = 'text';
  textarea.rows = 8;
  textarea.value = soulText || '';
  var btn = el('button', null, 'Propose edit');
  btn.setAttribute('data-i18n', 'soulEditorSubmit');
  btn.setAttribute('type', 'submit');
  var tip = 'Propose this text as the new live SOUL prompt — it only takes effect once you ratify it, same as an automated proposal';
  btn.setAttribute('data-tip', tip);
  btn.setAttribute('aria-label', tip);
  form.appendChild(label);
  form.appendChild(textarea);
  form.appendChild(btn);
  details.appendChild(form);
  var status = el('p', 'sr-only');
  status.setAttribute('aria-live', 'polite');
  status.id = 'soul-editor-status-' + projectId;
  details.appendChild(status);
  return details;
}
// Insert/remove/replace a fixed, ordered set of optional child sections in
// place — a section whose node reference is unchanged between prev and
// next (see cardSectionSigs/detailSectionSigs) is never touched, so any
// focus, scroll position, or text selection inside it survives a patch.
// prev/next are { key: Node-or-null } maps.
function patchSections(container, order, prev, next) {
  var cursor = null;
  for (var i = 0; i < order.length; i++) {
    var key = order[i];
    var prevNode = prev[key] || null;
    var nextNode = next[key] || null;
    if (prevNode !== nextNode) {
      if (prevNode && prevNode.parentNode === container) container.removeChild(prevNode);
      if (nextNode) container.insertBefore(nextNode, cursor ? cursor.nextSibling : container.firstChild);
    }
    if (nextNode) cursor = nextNode;
  }
}
var CARD_SECTION_ORDER = ['head', 'meta', 'worker', 'office', 'stats', 'gauge', 'detail', 'actions'];
var CARD_SECTION_BUILDERS = {
  head: cardHead,
  meta: cardMeta,
  worker: liveWorkerCard,
  office: officeMapSection,
  stats: cardStats,
  gauge: cardGauge,
  actions: cardActions,
};
// cardSectionSigs is generated FROM web/card-sections.ts below (epic 0002
// "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedCardSectionSigs.toString()}
// Build a fresh card, or patch an existing one (prev, as returned by a
// previous renderCard call for the same project id) in place, section by
// section. prev is null/undefined for a brand-new project id.
function renderCard(c, prev) {
  var sigs = cardSectionSigs(c);
  var prevSigs = (prev && prev.sigs) || {};
  var prevNodes = (prev && prev.nodes) || {};
  var nodes = {};
  for (var oi = 0; oi < CARD_SECTION_ORDER.length; oi++) {
    var key = CARD_SECTION_ORDER[oi];
    if (key === 'detail') continue;
    nodes[key] = prev && prevSigs[key] === sigs[key] ? prevNodes[key] : CARD_SECTION_BUILDERS[key](c);
  }
  var detailState = updateDetailPanel(c, prev && prev.detailState);
  nodes.detail = detailState.det;
  var art = (prev && prev.art) || el('article', 'card');
  if (!prev) art.dataset.project = c.id; // stable key so live re-renders can restore open state
  patchSections(art, CARD_SECTION_ORDER, prevNodes, nodes);
  return { art: art, sigs: sigs, nodes: nodes, detailState: detailState };
}
function card(c) {
  return renderCard(c, null).art;
}
// langBarSegments is generated FROM web/lang-bar.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${sharedLangBarSegments.toString()}
// langSegMeta/langLegendLine are generated FROM web/lang-bar.ts below (epic
// 0002 "shell decomposition", slice 2, seventy-seventh cut) — their real
// compiled source via .toString(), not hand-retyped copies. They can no
// longer drift apart.
${sharedLangSegMeta.toString()}
${sharedLangLegendLine.toString()}
function langBar(langs) {
  var segs = langBarSegments(langs);
  if (!segs.length) return null;
  var wrap = el('div', 'langbar');
  for (var i = 0; i < segs.length; i++) {
    var seg = el('span', 'langseg');
    seg.style.flex = String(segs[i].bytes);
    seg.style.opacity = String(segs[i].opacity);
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only
    // the first language segment is a Tab stop, not one per language — the
    // same fix already shipped for task-row chips below. The keydown/focusin
    // handlers after this function move it.
    seg.setAttribute('tabindex', i === 0 ? '0' : '-1');
    seg.setAttribute('role', 'img');
    var segMeta = langSegMeta(segs[i], fmtBytes);
    seg.setAttribute('data-tip', segMeta.tip);
    seg.setAttribute('aria-label', segMeta.ariaLabel);
    wrap.appendChild(seg);
  }
  return wrap;
}
// Generic roving-tabindex wiring (APG pattern) for a group of same-kind
// focusable items: moves the single Tab stop with Left/Right/Home/End, and
// on mouse/programmatic focus. Delegated on document since every caller
// rebuilds its items wholesale on re-render, and shared across callers
// (task-row chips, language-bar segments, gauge segments, spark bars,
// heatmap cells) instead of hand-copying the same ~15 lines per widget,
// which is what pushed the core bundle over its budget last time (board
// ap-mtcktgq1-0's "VERDICT split" already flagged this duplication). The
// #live-workers chip strip is the one holdout that still hand-copies this
// pattern rather than calling wireRoving: it persists the roving index
// across SSE re-renders (liveWorkersRovingIndex) instead of always
// resetting the Tab stop to item 0, a real behavioral difference this
// helper doesn't support.
function wireRoving(itemSel, groupSel) {
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    var item = e.target && e.target.closest && e.target.closest(itemSel);
    if (!item) return;
    // Nested widgets (D1 TAB-STOP ROVING): a keypress on a focusable
    // DESCENDANT of an item — a fleet stat tile's inner spark bars, their own
    // roving group — belongs to that inner widget, never to the group around
    // it. closest() would otherwise resolve the outer item too and both groups
    // would move focus on the same keystroke.
    if (item !== e.target) return;
    var group = item.closest(groupSel);
    if (!group) return;
    var items = Array.prototype.slice.call(group.querySelectorAll(itemSel));
    var idx = items.indexOf(item);
    if (idx < 0) return;
    var next = idx;
    if (e.key === 'ArrowLeft') next = Math.max(0, idx - 1);
    else if (e.key === 'ArrowRight') next = Math.min(items.length - 1, idx + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === idx) return;
    e.preventDefault();
    item.setAttribute('tabindex', '-1');
    items[next].setAttribute('tabindex', '0');
    items[next].focus();
  });
  document.addEventListener('focusin', function (e) {
    var item = e.target && e.target.closest && e.target.closest(itemSel);
    if (!item) return;
    // Same nested-widget rule as keydown above: focus landing on an item's
    // focusable descendant must not re-seed the outer group.
    if (item !== e.target) return;
    var group = item.closest(groupSel);
    if (!group) return;
    var items = Array.prototype.slice.call(group.querySelectorAll(itemSel));
    for (var i = 0; i < items.length; i++) items[i].setAttribute('tabindex', items[i] === item ? '0' : '-1');
  });
}
wireRoving('.langbar .langseg', '.langbar');
// The fleet card's .card-meta chip row and .card-stats tile row (cardMeta/
// cardStats above; the project page's Metrics panel in web/features/
// metrics.ts reuses the .card-stats shape and seeds itself the same way).
wireRoving('.card-meta .chip', '.card-meta');
wireRoving('.card-stats .stat[tabindex]', '.card-stats');
// The detail panel's Gate/Backup facts (factsNode above).
wireRoving('.facts [tabindex]', '.facts');
// The stat-tile family (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): the
// fleet-wide #totals count bar (renderTotals) and every .stat-tiles grid —
// the fleet-wide #stat-tiles bento bar (renderStatTiles) plus the project
// page's DORA / parallel-gate / warm-sessions grids (web/features/
// process-health.ts) and approval-summary grid (web/features/evolution.ts).
// Each bar/grid is one group; the fleet tiles' inner sparks stay their own
// (.spark .spark-bar above) via wireRoving's nested-widget guard.
wireRoving('.totals .total', '.totals');
wireRoving('.stat-tiles .stat-tile', '.stat-tiles');
// Seeds the initial roving Tab stop for a wireRoving() group: only the first
// matching item (in DOM order) starts as a real Tab stop; the rest start at
// -1 until a keydown/focusin handler above moves it. The gauge/langbar/task-
// chip groups bake i===0?'0':'-1' straight into their own build loop since
// their items are a simple homogeneous array — the flight-log row groups
// below can't do that: dot/item/chips/sha/cost/real-cost/ago are built as
// separate conditional fields, not one loop, so "which one is first" is only
// knowable once the row is fully assembled.
function seedRoving(container, itemSel) {
  var items = Array.prototype.slice.call(container.querySelectorAll(itemSel));
  for (var i = 0; i < items.length; i++) items[i].setAttribute('tabindex', i === 0 ? '0' : '-1');
}
function listOf(items, toText) {
  var ul = el('ul', 'legend');
  for (var i = 0; i < items.length; i++) ul.appendChild(el('li', null, toText(items[i])));
  return ul;
}
// factsMeta is generated FROM web/card-facts.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${sharedFactsMeta.toString()}
function factsNode(c) {
  var facts = el('dl', 'facts');
  var meta = factsMeta(c);
  if (meta.gate) {
    var gateDt = el('dt', null, 'Gate');
    gateDt.setAttribute('data-i18n', 'gate');
    facts.appendChild(gateDt);
    var gateDd = el('dd', null, meta.gate.text);
    gateDd.setAttribute('tabindex', '0');
    gateDd.setAttribute('data-tip', meta.gate.tip);
    gateDd.setAttribute('aria-label', meta.gate.ariaLabel);
    facts.appendChild(gateDd);
  }
  if (meta.backup) {
    var backupDt = el('dt', null, 'Backup');
    backupDt.setAttribute('data-i18n', 'backup');
    facts.appendChild(backupDt);
    var backupDd = el('dd', null, meta.backup.text);
    backupDd.setAttribute('tabindex', '0');
    backupDd.setAttribute('data-tip', meta.backup.tip);
    backupDd.setAttribute('aria-label', meta.backup.ariaLabel);
    facts.appendChild(backupDd);
  }
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): the Gate
  // and Backup facts used to each be their own Tab stop — the remaining
  // per-item stop flagged when the stat-tile family fix shipped. Only the
  // first is a Tab stop now; wireRoving() below moves it.
  seedRoving(facts, '[tabindex]');
  return facts.childNodes.length ? facts : null;
}
function languagesNode(c) {
  var langs = c.languages || [];
  if (!langs.length) return null;
  var wrap = el('div', 'detail-section');
  var languagesH = el('h3', 'detail-h', 'Languages');
  languagesH.setAttribute('data-i18n', 'languages');
  wrap.appendChild(languagesH);
  var bar = langBar(langs);
  if (bar) wrap.appendChild(bar);
  wrap.appendChild(
    listOf(langs, function (l) {
      return langLegendLine(l, fmtBytes);
    }),
  );
  return wrap;
}
function dirsNode(c) {
  var dirs = c.topDirs || [];
  if (!dirs.length) return null;
  var wrap = el('div', 'detail-section');
  var dirsH = el('h3', 'detail-h', 'Top directories');
  dirsH.setAttribute('data-i18n', 'topDirectories');
  wrap.appendChild(dirsH);
  wrap.appendChild(
    listOf(dirs, function (d) {
      return (d.dir || '.') + ' — ' + d.files + ' files';
    }),
  );
  return wrap;
}
function hotFilesNode(c) {
  if (!c.hotFiles || !c.hotFiles.length) return null;
  var wrap = el('div', 'detail-section');
  var hotH = el('h3', 'detail-h', 'Hot files');
  hotH.setAttribute('data-i18n', 'hotFiles');
  hotH.setAttribute('tabindex', '0');
  hotH.setAttribute(
    'data-tip',
    'The largest tracked files by byte size — "hot" means big here, not frequently changed',
  );
  hotH.setAttribute(
    'aria-label',
    'Hot files: the largest tracked files by byte size, not frequently changed',
  );
  hotH.setAttribute('data-i18n-aria', 'hotFilesAria');
  wrap.appendChild(hotH);
  wrap.appendChild(
    listOf(c.hotFiles, function (f) {
      return f;
    }),
  );
  return wrap;
}
// flightLogDisplayRows/flightDetailLine/sliceChipMeta/flightLogMoreMeta are
// generated FROM web/flight-log-rows.ts below (epic 0002 "shell
// decomposition", slice 2) — their real compiled source via .toString(), not
// a hand-retyped copy. They can no longer drift apart.
${sharedFlightLogDisplayRows.toString()}
${sharedFlightDetailLine.toString()}
${sharedSliceChipMeta.toString()}
${sharedFlightLogMoreMeta.toString()}
function flightLogNode(c) {
  var log = (c.flightLog || []).concat(flightLogExtra[c.id] || []);
  var logHasMore = c.id in flightLogMore ? flightLogMore[c.id] : !!c.flightLogHasMore;
  if (!log.length) return null;
  var wrap = el('div', 'detail-section');
  var flightLogH = el('h3', 'detail-h', 'Flight log');
  flightLogH.setAttribute('data-i18n', 'flightLog');
  flightLogH.setAttribute('tabindex', '0');
  flightLogH.setAttribute(
    'data-tip',
    'Every firing this project has flown, newest first — click a row to expand its full story; consecutive slices of the same open task collapse into one group row',
  );
  flightLogH.setAttribute(
    'aria-label',
    'Flight log: every firing this project has flown, newest first, click a row to expand it',
  );
  flightLogH.setAttribute('data-i18n-aria', 'flightLogAria');
  wrap.appendChild(flightLogH);
  // Progressive disclosure (operator: "it's overloaded — chips I can click"):
  // each firing is a COMPACT one-line chip — verdict dot, truncated headline,
  // cost, ago — that expands on click to the full story (whole title, kind,
  // sha, turns, gate detail). First rows only; the rest behind "Show all".
  var logTaskById = taskMap(c.tasks);
  // Group consecutive firings that all advanced the SAME open task (a
  // "slice" run) into ONE expandable row — otherwise a slice-heavy day
  // floods the compact view with rows that all share the same task title
  // (operator: "identical epic titles x15 read as duplication"). An
  // isolated slice (no run partner) still shows its own commit subject
  // with a "slice of <task>" chip, same as before.
  var displayRows = flightLogDisplayRows(log);
  var visibleRows = openFlightLogAll[c.id]
    ? displayRows.length
    : Math.min(displayRows.length, FLIGHTLOG_COMPACT_ROWS);
  var ol = el('ol', 'flightlog');
  for (var k = 0; k < visibleRows; k++) {
    var entry = displayRows[k];
    if (entry.isGroup) {
      ol.appendChild(flightGroupRow(c, entry, logTaskById));
      continue;
    }
    var f = entry.row;
    // Honest verdicts + headlines — the SHARED derivation (flightVerdictOf /
    // flightHeadlineOf); the per-firing trace uses the same two functions.
    var verdict = flightVerdictOf(f);
    var logHeadline = flightHeadlineOf(f, logTaskById);
    var logMeta = flightLogRowMeta(logHeadline, verdict, f.sha);
    // Guard BOTH halves on f.id existing: an id-less log row (older server,
    // minimal fixture) must never read as "open" via the undefined ===
    // undefined trap — which then threw on f.id.split below and took the
    // whole render down into refresh()'s offline catch (observed: the
    // ADAPTIVE TASK BUDGET chip suite failing with zero cards rendered).
    var isOpenRow = f.id !== undefined && f.id !== null && openFlightRow[c.id] === f.id;
    var isSlice = f.completion === 'slice' && !!f.item;
    var li = el('li', 'flight' + (isOpenRow ? ' flight-open' : ''));

    var head = document.createElement('button');
    head.type = 'button';
    head.className = 'flight-head';
    head.setAttribute('data-flight-row', f.id);
    head.setAttribute('data-flight-pid', c.id);
    head.setAttribute('aria-expanded', String(isOpenRow));
    var dotEl = el('span', 'flight-dot flight-' + verdict.split(' ')[0], '');
    dotEl.setAttribute('tabindex', '0');
    dotEl.setAttribute('data-tip', logMeta.dotTip);
    dotEl.setAttribute('aria-label', logMeta.dotAriaLabel);
    head.appendChild(dotEl);
    var logItemEl = el('span', 'flight-item', logMeta.itemText);
    logItemEl.setAttribute('tabindex', '0');
    logItemEl.setAttribute('data-tip', logMeta.itemTip);
    // D1 ATTRIBUTE PAYLOAD (epic 0015, board web-mtd1wmqc-v7h6cq): no
    // aria-label duplicating the tip — the full headline rides
    // aria-describedby into a visually-hidden span appended after the row
    // button below (inside the button its text would join the button's own
    // accessible name, same reasoning as the per-firing trace headline fix).
    var logItemDescId = 'flight-item-desc-' + c.id + '-' + k;
    logItemEl.setAttribute('aria-describedby', logItemDescId);
    head.appendChild(logItemEl);
    if (isSlice) {
      var sliceTask = logTaskById[f.item];
      var sliceTaskTitle = sliceTask && sliceTask.title;
      if (sliceTaskTitle) {
        var sliceMeta = sliceChipMeta(sliceTaskTitle);
        head.appendChild(
          tipChip(sliceMeta.text, sliceMeta.tip, sliceMeta.ariaLabel, 'flight-slice-chip'),
        );
      }
    }
    if (f.autoformatRescued) {
      head.appendChild(
        tipChip(
          '🔧 auto-fixed',
          'The gate failed a formatting check; mechanical remediation fixed it automatically and this firing shipped clean instead of reverting.',
          'auto-fixed: formatting was mechanically remediated before this firing shipped',
          'flight-autoformat-chip',
        ),
      );
    }
    if (f.guardDenials) {
      var logGuardMeta = guardDenialChipMeta(f.guardDenials);
      head.appendChild(
        tipChip(logGuardMeta.label, logGuardMeta.tip, logGuardMeta.ariaLabel, 'flight-guard-chip'),
      );
    }
    if (f.sha) {
      var logShaEl = el('span', 'flight-sha', logMeta.shaText);
      logShaEl.setAttribute('tabindex', '0');
      logShaEl.setAttribute('data-tip', logMeta.shaTip);
      logShaEl.setAttribute('aria-label', logMeta.shaAriaLabel);
      head.appendChild(logShaEl);
    }
    var logCostAgo = flightCostAgoMeta(
      'Total spend for this firing',
      'When this firing happened',
      f.cost,
      f.at,
      fmtCost,
      fmtAgo,
      f.realCostUsd,
    );
    var logCostEl = el('span', 'flight-cost muted', fmtCost(f.cost));
    logCostEl.setAttribute('tabindex', '0');
    logCostEl.setAttribute('data-tip', logCostAgo.costTip);
    logCostEl.setAttribute('aria-label', logCostAgo.costAriaLabel);
    head.appendChild(logCostEl);
    if (logCostAgo.realCostText) {
      var logRealCostEl = el('span', 'flight-real-cost muted', logCostAgo.realCostText);
      logRealCostEl.setAttribute('tabindex', '0');
      logRealCostEl.setAttribute('data-tip', logCostAgo.realCostTip);
      logRealCostEl.setAttribute('aria-label', logCostAgo.realCostAriaLabel);
      head.appendChild(logRealCostEl);
    }
    var logAgoEl = el('span', 'flight-ago muted', fmtAgo(f.at));
    logAgoEl.setAttribute('tabindex', '0');
    logAgoEl.setAttribute('data-tip', logCostAgo.agoTip);
    logAgoEl.setAttribute('aria-label', logCostAgo.agoAriaLabel);
    head.appendChild(logAgoEl);
    // Same roving fix as flightGroupRow's header (D1 TAB-STOP ROVING, board
    // web-mtd1wyte-ssntzi) — only the first field in THIS row is a Tab stop.
    seedRoving(head, '[tabindex]');
    li.appendChild(head);
    // .sr-only is position:absolute, so this adds no phantom flex-gap row to
    // the flight-log list.
    var logItemDesc = el('span', 'sr-only', logMeta.itemTip);
    logItemDesc.id = logItemDescId;
    li.appendChild(logItemDesc);

    if (isOpenRow) {
      var rowDetail = el('div', 'flight-detail');
      rowDetail.appendChild(el('p', 'flight-detail-title', logHeadline));
      var rowMeta = el('p', 'muted');
      rowMeta.textContent = flightDetailLine(f, verdict, fmtCost);
      rowMeta.setAttribute('tabindex', '0');
      rowMeta.setAttribute(
        'data-tip',
        'Verdict, change kind, short commit sha, turns spent, and total spend for this firing — the same facts shown individually in the collapsed row above',
      );
      rowMeta.setAttribute('aria-label', rowMeta.textContent);
      rowDetail.appendChild(rowMeta);
      rowDetail.appendChild(el('p', 'muted', 'Full trace: see the per-firing section below (' + String(f.id).split(':').pop() + ').'));
      li.appendChild(rowDetail);
    }
    ol.appendChild(li);
  }
  wrap.appendChild(ol);
  if (displayRows.length > FLIGHTLOG_COMPACT_ROWS) {
    var moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'flight-more';
    moreBtn.setAttribute('data-flightlog-all', c.id);
    moreBtn.setAttribute('aria-expanded', String(!!openFlightLogAll[c.id]));
    var moreMeta = flightLogMoreMeta(!!openFlightLogAll[c.id], displayRows.length, FLIGHTLOG_COMPACT_ROWS);
    moreBtn.textContent = moreMeta.text;
    moreBtn.setAttribute('data-tip', moreMeta.tip);
    moreBtn.setAttribute('aria-label', moreMeta.tip);
    wrap.appendChild(moreBtn);
  }
  // A real server round-trip for OLDER firings than the initial window ever
  // carried (web-msnf2heh-2znbbu) — only offered once "Show all" already
  // reveals every locally-held row, so it never competes with that toggle.
  if (openFlightLogAll[c.id] && logHasMore) {
    var loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'flight-more';
    loadMoreBtn.setAttribute('data-flightlog-more', c.id);
    loadMoreBtn.disabled = !!flightLogLoading[c.id];
    loadMoreBtn.textContent = flightLogLoading[c.id] ? 'Loading…' : 'Load older firings';
    var loadMoreTip = 'Fetch firings older than what the browser already holds — a real server round-trip, not a local reveal';
    loadMoreBtn.setAttribute('data-tip', loadMoreTip);
    loadMoreBtn.setAttribute('aria-label', loadMoreTip);
    wrap.appendChild(loadMoreBtn);
  }
  return wrap;
}
wireRoving('.flight-head [tabindex]', '.flight-head');
wireRoving('.flight-group-member [tabindex]', '.flight-group-member');
function detailSectionNode(heading, content, i18nKey) {
  if (!content) return null;
  var wrap = el('div', 'detail-section');
  var h = el('h3', 'detail-h', heading);
  if (i18nKey) h.setAttribute('data-i18n', i18nKey);
  wrap.appendChild(h);
  wrap.appendChild(content);
  return wrap;
}
function activityDetailNode(c) {
  return detailSectionNode('Activity', activitySection(c), 'activity');
}
function firingTimelineNode(c) {
  var firingTimeline = firingTimelineSection(c);
  if (!firingTimeline) return null;
  var wrap = el('div', 'detail-section');
  var traceH = el('h3', 'detail-h', 'Per-firing trace');
  traceH.setAttribute('data-i18n', 'firingTrace');
  traceH.setAttribute('tabindex', '0');
  traceH.setAttribute(
    'data-tip',
    'Every firing for this project, grouped and collapsible — unlike Activity above, which only shows the raw feed of the last flight',
  );
  traceH.setAttribute(
    'aria-label',
    'Per-firing trace: every firing for this project, grouped and collapsible, unlike the Activity feed above which only shows the last flight',
  );
  traceH.setAttribute('data-i18n-aria', 'firingTraceAria');
  wrap.appendChild(traceH);
  wrap.appendChild(firingTimeline);
  return wrap;
}
function metricsDetailNode(c) {
  // metrics rides /panels.js (defer). By the first fleet tick every defer script
  // has executed, so this guard is a boot-window formality, never a user-visible
  // gap — same contract as maybeNotifyFleet/syncPoolClientProjects.
  return typeof metricsSection === 'function' ? detailSectionNode('Metrics', metricsSection(c), 'metrics') : detailSectionNode('Metrics', el('div', 'muted'), 'metrics');
}
var DETAIL_SECTION_ORDER = ['facts', 'languages', 'dirs', 'hotfiles', 'flightlog', 'activity', 'timeline', 'metrics'];
var DETAIL_SECTION_BUILDERS = {
  facts: factsNode,
  languages: languagesNode,
  dirs: dirsNode,
  hotfiles: hotFilesNode,
  flightlog: flightLogNode,
  activity: activityDetailNode,
  timeline: firingTimelineNode,
  metrics: metricsDetailNode,
};
// detailSectionSigs is generated FROM web/detail-sections.ts below (epic
// 0002 "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedDetailSectionSigs.toString()}
function detailSectionSigsFor(c) {
  return detailSectionSigs(
    c,
    flightLogExtra[c.id],
    flightLogMore[c.id],
    openFlightLogAll[c.id],
    openFlightRow[c.id],
    flightLogLoading[c.id],
    openPhases[c.id],
    openFirings[c.id],
  );
}
// The card's "Details" panel keeps ONE <details> DOM node per project for its
// whole life (never rebuilt wholesale) — its open/closed state and any
// scroll position inside it are native DOM state, not something a re-render
// needs to restore by hand. Only the individual subsections whose own data
// changed are rebuilt and swapped in; a subsection nobody touched (e.g. the
// flight log, while only live activity is ticking) keeps its exact node, so
// a reader's scroll position or text selection inside it survives.
function updateDetailPanel(c, prev) {
  var det = (prev && prev.det) || el('details', 'detail');
  var body = (prev && prev.body) || el('div', 'detail-body');
  if (!prev) {
    var detSummary = el('summary', null, 'Details');
    detSummary.setAttribute('data-i18n', 'detailsSummary');
    det.appendChild(detSummary);
    det.appendChild(body);
  }
  var sigs = detailSectionSigsFor(c);
  var prevSigs = (prev && prev.sigs) || {};
  var prevNodes = (prev && prev.nodes) || {};
  var nodes = {};
  for (var i = 0; i < DETAIL_SECTION_ORDER.length; i++) {
    var key = DETAIL_SECTION_ORDER[i];
    nodes[key] = prev && prevSigs[key] === sigs[key] ? prevNodes[key] : DETAIL_SECTION_BUILDERS[key](c);
  }
  patchSections(body, DETAIL_SECTION_ORDER, prevNodes, nodes);
  return { det: det, body: body, sigs: sigs, nodes: nodes };
}
// taskFocusActive/taskQueueCounts are generated FROM web/task-queue.ts below
// (epic 0002 "shell decomposition", slice 2) — their real compiled source
// via .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedTaskFocusActive.toString()}
${sharedTaskQueueCounts.toString()}
// taskHistoryMoreMeta is generated FROM web/task-queue.ts below (epic 0002
// "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedTaskHistoryMoreMeta.toString()}
// taskBurnLabel/taskRunawayTip are generated FROM web/task-queue.ts below
// (epic 0002 "shell decomposition", slice 2) — their real compiled source
// via .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedTaskBurnLabel.toString()}
${sharedTaskRunawayTip.toString()}
// suggestedTurnBudget/taskBudgetRiskTip/DEFAULT_FIRING_TURNS are generated
// FROM web/task-queue.ts below (ADAPTIVE TASK BUDGET, board
// web-msnt26wf-wnv3w7) — their real compiled source via .toString(), not a
// hand-retyped copy. They can no longer drift apart.
${sharedSuggestedTurnBudget.toString()}
${sharedTaskBudgetRiskTip.toString()}
${sharedTaskDimensionBudgetRiskTip.toString()}
var DEFAULT_FIRING_TURNS = ${DEFAULT_FIRING_TURNS};
// taskStalenessDays/taskStalenessTip/STALE_TASK_DAYS are generated FROM
// web/task-queue.ts below (TRIAGE V2 UX-EXPRESSION, web-mssnofje-bboigi) —
// their real compiled source via .toString(), not a hand-retyped copy.
${sharedTaskStalenessDays.toString()}
${sharedTaskStalenessTip.toString()}
var STALE_TASK_DAYS = ${STALE_TASK_DAYS};
// taskTitleTip/taskMoveTip are generated FROM web/task-queue.ts below (epic
// 0002 "shell decomposition", slice 2) — their real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedTaskTitleTip.toString()}
${sharedTaskMoveTip.toString()}
// taskFocusTip/taskActionTip are generated FROM web/task-queue.ts below (epic
// 0002 "shell decomposition", slice 2) — their real compiled source via
// .toString(), not a hand-retyped copy.
${sharedTaskFocusTip.toString()}
${sharedTaskActionTip.toString()}
// taskDimensionChip/taskSeverityChip are generated FROM web/task-queue.ts
// below (epic 0002 "shell decomposition") — their real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedTaskDimensionChip.toString()}
${sharedTaskSeverityChip.toString()}
// queueForecastMeta/QUEUE_FORECAST_WINDOW are generated FROM web/task-queue.ts
// below (QUEUE FORECAST, board web-msnsxugi-99uxhx) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedQueueForecastMeta.toString()}
var QUEUE_FORECAST_WINDOW = ${QUEUE_FORECAST_WINDOW};
function tasksSection(c) {
  var tasks = c.tasks || [];
  var anyFocus = taskFocusActive(tasks);
  var wrap = el('article', 'card');
  var head = el('h3', 'detail-h', anyFocus ? 'Tasks — 🎯 FOCUS MODE' : 'Tasks');
  head.setAttribute('data-i18n', anyFocus ? 'tasksFocusMode' : 'tasks');
  wrap.appendChild(head);
  if (anyFocus) {
    wrap.appendChild(el('p', 'focus-note', 'Focus locked: flights work ONLY the focused task(s) until done.'));
  }
  if (!tasks.length) {
    wrap.appendChild(el('p', 'muted', 'No tasks yet — add one below, or let the autopilot seed its own board as it flies.'));
  } else {
    var ul = el('ul', 'tasks');
    // Announcements for keyboard reorder (research: live region, GitHub pattern).
    var live = el('p', 'sr-only');
    live.setAttribute('aria-live', 'polite');
    live.id = 'task-reorder-live';
    wrap.appendChild(live);
    var openIdx = 0;
    // Closed (done/deferred) history is capped to a chunk; the open queue
    // above it is never truncated — recentTasks() already sorts open before
    // closed, so closed rows are the contiguous tail of the tasks array.
    var queueCounts = taskQueueCounts(tasks, openTaskHistory[c.id], TASK_HISTORY_CHUNK);
    var openCount = queueCounts.openCount;
    var closedTotal = queueCounts.closedTotal;
    var closedVisible = queueCounts.closedVisible;
    // QUEUE FORECAST (board web-msnsxugi-99uxhx): at the recent completion
    // pace, when does the open queue drain — an extrapolation that says so.
    var forecast = queueForecastMeta(openCount, c.flightLog || [], fmtCost);
    if (forecast) {
      var forecastEl = el('p', 'queue-forecast muted', forecast.text);
      forecastEl.setAttribute('tabindex', '0');
      forecastEl.setAttribute('data-tip', forecast.tip);
      forecastEl.setAttribute('aria-label', forecast.tip);
      wrap.appendChild(forecastEl);
    }
    var closedIdx = 0;
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      var isOpen = t.status !== 'done' && t.status !== 'deferred';
      if (!isOpen) {
        closedIdx++;
        if (closedIdx > closedVisible) continue;
      }
      // Reorder/focus apply only to WORKABLE tasks — a proposal awaiting the
      // operator's approve/reject decision can't be prioritized or focused yet.
      var isWorkable = t.status === 'queued' || t.status === 'in_progress';
      var li = el('li', 'task' + (t.focus ? ' task-focused' : anyFocus ? ' task-dimmed' : ''));
      li.setAttribute('data-task-id', t.id);
      if (isWorkable) {
        openIdx++;
        // Pointer drag reorder — the primary interaction for sighted mouse/touch
        // users; feeds the SAME /api/task/reorder as the ↑/↓ buttons below,
        // which stay the accessible primary for keyboard/screen-reader users.
        li.setAttribute('draggable', 'true');
        var handle = el('span', 'task-drag-handle', '⠿');
        handle.setAttribute('aria-hidden', 'true');
        // data-tip (not title) to match the shell's shared tooltip primitive —
        // no tabindex here: this is decorative (aria-hidden) and drag-reorder
        // already has an accessible equivalent in the ↑/↓ buttons below, so it
        // must stay out of the keyboard focus order rather than become a
        // focusable-but-hidden element.
        handle.setAttribute('data-tip', 'Drag to reorder');
        li.appendChild(handle);
        // Reorder controls — the accessible primary (keyboard-first; no-DnD-quirks).
        var up = el('button', 'task-move', '↑');
        up.setAttribute('type', 'button');
        up.setAttribute('data-task-move', 'up');
        var upTip = taskMoveTip('up', t.title, openIdx, openCount);
        up.setAttribute('data-tip', upTip);
        up.setAttribute('aria-label', upTip);
        var down = el('button', 'task-move', '↓');
        down.setAttribute('type', 'button');
        down.setAttribute('data-task-move', 'down');
        var downTip = taskMoveTip('down', t.title, openIdx, openCount);
        down.setAttribute('data-tip', downTip);
        down.setAttribute('aria-label', downTip);
        li.appendChild(up);
        li.appendChild(down);
        // Focus toggle — the operator's WIP-limit-1 lock.
        var focusBtn = el('button', 'task-focus-btn' + (t.focus ? ' on' : ''), '🎯');
        focusBtn.setAttribute('type', 'button');
        focusBtn.setAttribute('data-task-focus', t.id);
        focusBtn.setAttribute('aria-pressed', String(!!t.focus));
        var focusTip = taskFocusTip(t.title, !!t.focus);
        focusBtn.setAttribute('data-tip', focusTip);
        focusBtn.setAttribute('aria-label', focusTip);
        li.appendChild(focusBtn);
      }
      li.appendChild(statusPill('pill task-', t.status, TASK_STATUS_TIPS));
      // Title itself was the last silent element on the row — TaskEntry carries
      // at/priority but nothing ever displayed them (app-wide interactivity
      // audit v2 follow-up: every panel drills down).
      var titleEl = el('span', 'task-title', t.title);
      titleEl.setAttribute('tabindex', '0');
      var titleTipMeta = taskTitleTip(t.at, t.priority, fmtAgo, t.body);
      titleEl.setAttribute('data-tip', titleTipMeta.tip);
      // D1 ATTRIBUTE PAYLOAD (epic 0015): the title's own text already gives
      // it an accessible name, so the tip's facts ride aria-describedby into
      // a visually-hidden span instead of a title-prefixed aria-label that
      // would duplicate data-tip verbatim.
      var titleDescId = 'task-title-desc-' + t.id;
      titleEl.setAttribute('aria-describedby', titleDescId);
      li.appendChild(titleEl);
      var titleDesc = el('span', 'sr-only', titleTipMeta.tip);
      titleDesc.id = titleDescId;
      li.appendChild(titleDesc);
      if (t.source === 'self') {
        li.appendChild(
          tipChip(
            '✦ proposed',
            'The autopilot proposed this task itself — it stays out of the flight queue until you approve or reject it',
            'Self-proposed task, awaiting your approval',
            'chip-proposed',
          ),
        );
      }
      if (t.source === 'inbox') {
        li.appendChild(
          tipChip(
            '📥 inbox',
            'Auto-triaged from a note you dropped in INBOX/ — already queued, no approval needed',
            'From your INBOX, auto-triaged into this task',
            'chip-inbox',
          ),
        );
      }
      if (t.source === 'backlog') {
        li.appendChild(
          tipChip(
            '📋 backlog',
            'The autopilot lifted this from an open docs/BACKLOG-999.md item — it stays out of the flight queue until you approve or reject it',
            'Backlog-sourced task, awaiting your approval',
            'chip-backlog',
          ),
        );
      }
      if (t.severity) {
        var sevChip = taskSeverityChip(t.severity);
        li.appendChild(tipChip(sevChip[0], sevChip[1], sevChip[2], sevChip[3]));
      }
      if (t.dimension) {
        var dimChip = taskDimensionChip(String(t.dimension));
        li.appendChild(tipChip(dimChip[0], dimChip[1], dimChip[2]));
      }
      var burn = taskBurnOf(t.id, c.flightLog);
      if (burn.slices > 0) {
        var burnLabel = taskBurnLabel(burn, fmtCost, fmtDuration);
        // D1 ATTRIBUTE PAYLOAD (epic 0015, measured 08-28: 3,925 chars/row):
        // aria-label carries the same short text the chip already shows, not
        // the tip's full explanatory sentence duplicated verbatim.
        li.appendChild(tipChip('🔥 ' + burnLabel.text, burnLabel.tip, 'Burn: ' + burnLabel.text, 'chip-burn'));
      }
      if (t.isRunaway) {
        var runawayTip = taskRunawayTip(t.cumulativeCostUsd, t.firingCount, fmtCost);
        var runawayAriaLabel =
          'Runaway: ' +
          fmtCost(t.cumulativeCostUsd) +
          ' across ' +
          t.firingCount +
          (t.firingCount === 1 ? ' firing' : ' firings');
        li.appendChild(tipChip('⚠️ runaway', runawayTip, runawayAriaLabel, 'chip-runaway'));
      }
      // ADAPTIVE TASK BUDGET (board web-msnt26wf-wnv3w7): a task that has
      // hit the turn cap before suggests the next firing needs more than the
      // default budget — surfaced here rather than only in the triage
      // prompt, so the operator sees the risk before assigning the task too.
      var budgetSignal = taskBudgetSignalOf(t.id, c.flightLog);
      var suggestedBudget = suggestedTurnBudget(budgetSignal.turnCapped, DEFAULT_FIRING_TURNS);
      if (suggestedBudget) {
        var budgetTip = taskBudgetRiskTip(budgetSignal.turnCapped, suggestedBudget, DEFAULT_FIRING_TURNS);
        li.appendChild(
          tipChip(
            '⏱ try ' + suggestedBudget + 't',
            budgetTip,
            'Budget risk: try ' + suggestedBudget + ' turns',
            'chip-budget-risk',
          ),
        );
      } else if (t.dimension) {
        // Breadth fallback (board web-msnt26wf-wnv3w7): this task has never
        // itself turn-capped, but if OTHER tasks in the same dimension have,
        // that is still a useful risk signal BEFORE working it — "similar
        // work" standing in for the file/hub breadth this task hasn't
        // touched yet.
        var dimSignal = taskDimensionBudgetSignalOf(t, tasks, c.flightLog);
        var dimSuggested = suggestedTurnBudget(dimSignal.turnCapped, DEFAULT_FIRING_TURNS);
        if (dimSuggested) {
          var dimTip = taskDimensionBudgetRiskTip(
            t.dimension,
            dimSignal.turnCapped,
            dimSuggested,
            DEFAULT_FIRING_TURNS,
          );
          li.appendChild(
            tipChip(
              '⏱ try ' + dimSuggested + 't?',
              dimTip,
              'Budget risk from similar work: try ' + dimSuggested + ' turns',
              'chip-budget-risk-dim',
            ),
          );
        }
      }
      if (t.status === 'queued') {
        var stalenessDays = taskStalenessDays(t.at, Date.now());
        if (stalenessDays >= STALE_TASK_DAYS) {
          var staleTip = taskStalenessTip(stalenessDays);
          li.appendChild(
            tipChip(
              '🕒 ' + stalenessDays + 'd stale',
              staleTip,
              'Stale: ' + stalenessDays + (stalenessDays === 1 ? ' day' : ' days'),
              'chip-stale',
            ),
          );
        }
      }
      if (t.status === 'needs_approval') {
        // The operator's decision on a PROPOSED task: approve → workable queue,
        // reject → gone. Until then flights skip it entirely.
        var approveBtn = el('button', 'task-done-btn task-approve-btn', '✓ approve');
        approveBtn.setAttribute('type', 'button');
        approveBtn.setAttribute('data-task-approve', t.id);
        var approveTip = taskActionTip('approve', t.title);
        approveBtn.setAttribute('data-tip', approveTip);
        approveBtn.setAttribute('aria-label', approveTip);
        li.appendChild(approveBtn);
        var rejectBtn = el('button', 'task-delete-btn', '✗ reject');
        rejectBtn.setAttribute('type', 'button');
        rejectBtn.setAttribute('data-task-delete', t.id);
        rejectBtn.setAttribute('data-confirm', 'no');
        var rejectTip = taskActionTip('reject', t.title);
        rejectBtn.setAttribute('data-tip', rejectTip);
        rejectBtn.setAttribute('aria-label', rejectTip);
        li.appendChild(rejectBtn);
      } else if (isOpen) {
        var doneBtn = el('button', 'task-done-btn', '✓ done');
        doneBtn.setAttribute('type', 'button');
        doneBtn.setAttribute('data-task-done', t.id);
        var doneTip = taskActionTip('done', t.title);
        doneBtn.setAttribute('data-tip', doneTip);
        doneBtn.setAttribute('aria-label', doneTip);
        li.appendChild(doneBtn);
        var delBtn = el('button', 'task-delete-btn', '🗑');
        delBtn.setAttribute('type', 'button');
        delBtn.setAttribute('data-task-delete', t.id);
        delBtn.setAttribute('data-confirm', 'yes');
        delBtn.setAttribute('data-name', t.title);
        var delTip = taskActionTip('delete', t.title);
        delBtn.setAttribute('data-tip', delTip);
        delBtn.setAttribute('aria-label', delTip);
        li.appendChild(delBtn);
      }
      // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): a
      // heavily-tagged task row can carry the status pill, the title, and
      // several informational chips at once (source/severity/dimension/burn/
      // runaway/budget-risk/stale) — each used to be its own Tab stop,
      // multiplying tab stops per row the same way the fleet-card gauge
      // segments and heatmap cells did before their own D1 slices. The chips
      // got their own roving group first; the pill and title were the
      // remaining per-item stops flagged then. All three kinds are now ONE
      // roving group — only the pill (first in DOM order) is a Tab stop; the
      // keydown/focusin handlers below move it. Read straight off the row's
      // own [tabindex] elements (not a shared index), since many task rows
      // exist at once.
      seedRoving(li, '[tabindex]');
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    if (closedTotal > closedVisible) {
      var historyBtn = document.createElement('button');
      historyBtn.type = 'button';
      historyBtn.className = 'flight-more';
      historyBtn.setAttribute('data-task-history-more', c.id);
      var historyMeta = taskHistoryMoreMeta(closedVisible, closedTotal, TASK_HISTORY_CHUNK);
      historyBtn.textContent = historyMeta.text;
      historyBtn.setAttribute('data-tip', historyMeta.tip);
      historyBtn.setAttribute('aria-label', historyMeta.tip);
      wrap.appendChild(historyBtn);
    }
  }
  // Add a task — the human side of the board (source: dashboard).
  var form = document.createElement('form');
  form.className = 'task-add';
  form.setAttribute('data-task-add', c.id);
  var label = el('label', null, 'New task');
  label.setAttribute('for', 'task-new-title');
  var input = document.createElement('input');
  input.type = 'text';
  input.id = 'task-new-title';
  input.name = 'title';
  input.placeholder = 'what should this autopilot do?';
  input.autocomplete = 'off';
  var btn = el('button', null, 'Add');
  btn.setAttribute('type', 'submit');
  var addTip = 'Queue a new operator task for the autopilot to pick up';
  btn.setAttribute('data-tip', addTip);
  btn.setAttribute('aria-label', addTip);
  form.appendChild(label);
  form.appendChild(input);
  form.appendChild(btn);
  wrap.appendChild(form);
  // Drop a note into the operator's own INBOX/ (backlog I) — a free-form
  // message every firing reads fresh at the start, ahead of ORIENT, distinct
  // from the structured task board above. The heading stays a plain,
  // always-visible label (detail-panel-i18n.test.ts's existing contract),
  // but the form itself — a rare, occasional action — now sits behind a
  // closed-by-default <details> (UX weakness sweep, epic 0015, board
  // web-mtju8ekq-dlpe9n, cut 2 of 3), the same shape the Contribute-upstream
  // PR form and soulEditorPanel's .soul-editor already use.
  var inboxH = el('h3', 'detail-h', 'Inbox');
  inboxH.setAttribute('data-i18n', 'inbox');
  wrap.appendChild(inboxH);
  var inboxDetails = document.createElement('details');
  inboxDetails.className = 'inbox-details';
  var inboxSummary = el('summary', 'inbox-summary', '📝 Drop a note');
  inboxSummary.setAttribute('data-i18n', 'inboxSummary');
  inboxDetails.appendChild(inboxSummary);
  var inboxForm = document.createElement('form');
  inboxForm.className = 'inbox-add';
  inboxForm.setAttribute('data-inbox-add', c.id);
  var inboxLabelId = 'inbox-new-message-' + c.id;
  var inboxLabel = el('label', null, 'Drop a note for the next firing');
  inboxLabel.setAttribute('for', inboxLabelId);
  var inboxTextarea = document.createElement('textarea');
  inboxTextarea.id = inboxLabelId;
  inboxTextarea.name = 'message';
  inboxTextarea.rows = 3;
  inboxTextarea.placeholder = 'context, a plan, a correction — read fresh at the start of the next firing';
  var inboxBtn = el('button', null, 'Drop note');
  inboxBtn.setAttribute('type', 'submit');
  var inboxTip = 'Write a note into INBOX/ — every firing reads it fresh, ahead of ORIENT';
  inboxBtn.setAttribute('data-tip', inboxTip);
  inboxBtn.setAttribute('aria-label', inboxTip);
  inboxForm.appendChild(inboxLabel);
  inboxForm.appendChild(inboxTextarea);
  inboxForm.appendChild(inboxBtn);
  inboxDetails.appendChild(inboxForm);
  var inboxStatus = el('p', 'sr-only');
  inboxStatus.setAttribute('aria-live', 'polite');
  inboxStatus.id = 'inbox-status-' + c.id;
  inboxDetails.appendChild(inboxStatus);
  wrap.appendChild(inboxDetails);
  return wrap;
}
// Roving-tabindex keyboard support for the task-row pill/title/chips built
// above (.task [tabindex]), via the shared wireRoving() helper (defined
// alongside the language-bar wiring above). Many task rows exist at once, so
// like the language bar (and unlike the single global live-workers strip),
// state lives in each row's own tabindex attributes rather than a shared
// module-level index — wireRoving() re-derives the group's items fresh on
// every key/focus event rather than caching them.
wireRoving('.task [tabindex]', '.task');
// Task-board actions (event-delegated: they survive live re-renders).
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-task-done]');
  if (!b) return;
  b.disabled = true;
  fetch('/api/task/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: b.getAttribute('data-task-done'), status: 'done' }),
  })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Ratify a project's SOUL (◐ SOUL unreviewed) — SOUL evolution loop, B5.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-soul-review]');
  if (!b) return;
  b.disabled = true;
  fetch('/api/project/soul-reviewed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: b.getAttribute('data-soul-review') }),
  })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Apply a pending SOUL proposal (✓ ratify) — SOUL evolution loop, B5 closure.
// Confirmed: this overwrites the project's live SOUL prompt (undoable
// afterward with ↺ un-ratify, below — board web-mswqemor-ab3jsu).
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-soul-ratify]');
  if (!b) return;
  if (!window.confirm(tr('soulRatifyConfirm'))) return;
  b.disabled = true;
  fetch('/api/project/soul-ratify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: b.getAttribute('data-soul-ratify') }),
  })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Undo a ratified SOUL proposal (↺ un-ratify) — SOUL evolution loop, board
// web-mswqemor-ab3jsu: the fix for "founder ratified by MISTAKE; flag
// restored by hand" — a click instead of a manual SQL edit. Confirmed: this
// overwrites the live SOUL prompt with the pre-ratify snapshot.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-soul-unratify]');
  if (!b) return;
  if (!window.confirm(tr('soulUnratifyConfirm'))) return;
  b.disabled = true;
  fetch('/api/project/soul-unratify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: b.getAttribute('data-soul-unratify') }),
  })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Discard a pending SOUL proposal (✗ dismiss) — SOUL evolution loop, B5
// closure. No confirm: the live SOUL is untouched, only the proposal is lost.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-soul-dismiss]');
  if (!b) return;
  b.disabled = true;
  fetch('/api/project/soul-dismiss', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: b.getAttribute('data-soul-dismiss') }),
  })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Apply the fleet-wide pending wisdom amendment (✓ ratify — board
// web-msnt26xe-pc4pzp): the fleet-scoped counterpart to soul-ratify above,
// minus the {id} body — the server route acts on the fleet's single
// pending proposal. Confirmed: this replaces the live shared wisdom text.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-fleet-wisdom-ratify]');
  if (!b) return;
  if (!window.confirm(tr('fleetWisdomRatifyConfirm'))) return;
  b.disabled = true;
  fetch('/api/fleet/wisdom-ratify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Discard the fleet-wide pending wisdom amendment (✗ dismiss) — no confirm:
// the live shared wisdom is untouched, only the proposal is lost.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-fleet-wisdom-dismiss]');
  if (!b) return;
  b.disabled = true;
  fetch('/api/fleet/wisdom-dismiss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// The SOUL editor entry's submit action (board web-mswqemor-ab3jsu) —
// event-delegated, like task-add/inbox-add elsewhere, so it survives live
// re-renders. Never overwrites the live SOUL directly: it only queues a
// pending proposal, ratified or dismissed through the existing flow above.
document.addEventListener('submit', function (e) {
  var f = e.target && e.target.closest && e.target.closest('[data-soul-edit]');
  if (!f) return;
  e.preventDefault();
  var pid = f.getAttribute('data-soul-edit');
  var textarea = f.querySelector('textarea[name="text"]');
  var text = textarea && textarea.value ? textarea.value.trim() : '';
  var status = document.getElementById('soul-editor-status-' + pid);
  if (!text) return;
  var btn = f.querySelector('button');
  if (btn) btn.disabled = true;
  fetch('/api/project/soul-propose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: pid, text: text }),
  })
    .then(function (r) {
      return r
        .json()
        .catch(function () { return {}; })
        .then(function (body) { return { ok: r.ok, body: body }; });
    })
    .then(function (res) {
      if (res.ok) {
        if (status) status.textContent = 'Proposed — review it above to ratify or dismiss.';
        refresh();
      } else if (status) {
        status.textContent = (res.body && res.body.error) || 'Could not propose the edit — try again.';
      }
    })
    .catch(function () {
      if (status) status.textContent = 'Could not propose the edit — try again.';
    })
    .then(function () { if (btn) btn.disabled = false; });
});
// Approve a PROPOSED task (✓ approve) — needs_approval → queued (workable).
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-task-approve]');
  if (!b) return;
  b.disabled = true;
  fetch('/api/task/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: b.getAttribute('data-task-approve'), status: 'queued' }),
  })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Delete/reject a task (✗ reject on proposals — no confirm; 🗑 on operator
// tasks — confirms first, since it removes real planning state).
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-task-delete]');
  if (!b) return;
  if (b.getAttribute('data-confirm') === 'yes') {
    var name = b.getAttribute('data-name') || 'this task';
    if (!window.confirm(tr('taskDeleteConfirm', name))) return;
  }
  b.disabled = true;
  fetch('/api/task/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: b.getAttribute('data-task-delete') }),
  })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Focus lock/release (🎯) — WIP-limit-1: flights work ONLY focused tasks.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-task-focus]');
  if (!b) return;
  b.disabled = true;
  var next = b.getAttribute('aria-pressed') !== 'true';
  fetch('/api/task/focus', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: b.getAttribute('data-task-focus'), focus: next }),
  })
    .then(function () { refresh(); })
    .catch(function () { b.disabled = false; });
});
// Reorder — shared by the ↑/↓ buttons and pointer drag: POST the given full
// order (open + closed ids; only order among open ones matters) and announce
// the result for assistive tech.
function commitTaskOrder(ids, pid, message) {
  var liveEl = document.getElementById('task-reorder-live');
  if (liveEl && message) liveEl.textContent = message;
  fetch('/api/task/reorder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid, ids: ids }),
  })
    .then(function () { refresh(); })
    .catch(function () {});
}
// domTaskOrder/moveTaskOrder are generated FROM web/task-queue.ts below
// (epic 0002 "shell decomposition", slice 2) — their real compiled source
// via .toString(), not a hand-retyped copy. They can no longer drift apart.
${sharedDomTaskOrder.toString()}
${sharedMoveTaskOrder.toString()}
// Reorder (↑/↓) — compute the new full order via the pure moveTaskOrder, POST it, announce it.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-task-move]');
  if (!b) return;
  var li = b.closest('[data-task-id]');
  var pid = document.body.dataset.project || '';
  if (!li || !pid) return;
  var items = domTaskOrder(li.parentElement);
  var dir = b.getAttribute('data-task-move') === 'up' ? -1 : 1;
  var result = moveTaskOrder(items, li.getAttribute('data-task-id'), dir);
  if (!result) return;
  commitTaskOrder(result.order, pid, 'Moved to position ' + (result.toIndex + 1) + ' of ' + result.order.length);
});
// Reorder (pointer drag) — HTML5 DnD, zero deps. dragstart marks the source
// row; dragover live-repositions it among the other OPEN rows only (closed
// history never becomes a drop target); dragend commits whatever order the
// DOM ends up in — same commitTaskOrder() the ↑/↓ buttons use.
document.addEventListener('dragstart', function (e) {
  var li = e.target && e.target.closest && e.target.closest('.task[draggable="true"]');
  if (!li) return;
  draggedTaskId = li.getAttribute('data-task-id');
  draggedTaskList = li.parentElement;
  li.classList.add('task-dragging');
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', draggedTaskId || ''); } catch (err) { /* Firefox requires setData; ignore elsewhere */ }
  }
});
// dragBeforeIndex is generated FROM web/drag-reorder.ts below (epic 0002
// "shell decomposition", slice 2, eightieth cut) — its real compiled source
// via .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedDragBeforeIndex.toString()}
document.addEventListener('dragover', function (e) {
  if (!draggedTaskId || !draggedTaskList) return;
  var list = e.target && e.target.closest && e.target.closest('ul.tasks');
  if (list !== draggedTaskList) return;
  e.preventDefault();
  var dragging = list.querySelector('.task-dragging');
  if (!dragging) return;
  var open = list.querySelectorAll('.task[draggable="true"]:not(.task-dragging)');
  var boxes = [];
  for (var i = 0; i < open.length; i++) boxes.push(open[i].getBoundingClientRect());
  var idx = dragBeforeIndex(boxes, e.clientY);
  if (idx !== null) list.insertBefore(dragging, open[idx]);
  else if (open.length) list.insertBefore(dragging, open[open.length - 1].nextSibling);
});
document.addEventListener('drop', function (e) {
  if (!draggedTaskList) return;
  if (e.target && e.target.closest && e.target.closest('ul.tasks') === draggedTaskList) e.preventDefault();
});
document.addEventListener('dragend', function (e) {
  var li = e.target && e.target.closest && e.target.closest('.task[draggable="true"]');
  if (li) li.classList.remove('task-dragging');
  var pid = document.body.dataset.project || '';
  var list = draggedTaskList;
  draggedTaskId = null;
  draggedTaskList = null;
  if (!list || !pid) return;
  commitTaskOrder(domTaskOrder(list), pid, 'Reordered by drag.');
});
document.addEventListener('submit', function (e) {
  var f = e.target && e.target.closest && e.target.closest('[data-task-add]');
  if (!f) return;
  e.preventDefault();
  var input = f.querySelector('input[name="title"]');
  var title = input && input.value ? input.value.trim() : '';
  if (!title) return;
  var btn = f.querySelector('button');
  if (btn) btn.disabled = true;
  fetch('/api/task/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: f.getAttribute('data-task-add'), title: title }),
  })
    .then(function () { if (input) input.value = ''; refresh(); })
    .catch(function () {})
    .then(function () { if (btn) btn.disabled = false; });
});
// Drop a note into the operator's own INBOX/ (backlog I) — event-delegated,
// like the task-add form above, so it survives live re-renders.
document.addEventListener('submit', function (e) {
  var f = e.target && e.target.closest && e.target.closest('[data-inbox-add]');
  if (!f) return;
  e.preventDefault();
  var pid = f.getAttribute('data-inbox-add');
  var textarea = f.querySelector('textarea[name="message"]');
  var message = textarea && textarea.value ? textarea.value.trim() : '';
  var status = document.getElementById('inbox-status-' + pid);
  if (!message) return;
  var btn = f.querySelector('button');
  if (btn) btn.disabled = true;
  fetch('/api/inbox/add', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid, message: message }),
  })
    .then(function (r) {
      return r
        .json()
        .catch(function () { return {}; })
        .then(function (body) { return { ok: r.ok, body: body }; });
    })
    .then(function (res) {
      if (res.ok) {
        if (textarea) textarea.value = '';
        if (status) status.textContent = 'Note dropped — the next firing will read it.';
      } else if (status) {
        status.textContent = (res.body && res.body.error) || 'Could not drop the note — try again.';
      }
    })
    .catch(function () {
      if (status) status.textContent = 'Could not drop the note — try again.';
    })
    .then(function () { if (btn) btn.disabled = false; });
});
// EXECUTE the GitHub sync (event-delegated so it survives card re-renders,
// BOARD web-mss4lpwi-p0w1d0 "GITHUB 2/5"). Confirms first — this runs a real
// 'gh repo create --private|--public --source --push' (first sync) or 'git
// push' (re-sync) against the operator's own authenticated gh/git. 'public'
// is the epic's confirm-guarded SECOND choice: it only fires when the
// adjacent checkbox is explicitly checked, and gets its own, more severe
// confirm() wording — never the same prompt as the private default. Same
// result-in-place pattern as release execute above (no alert()).
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-github-sync]');
  if (!b) return;
  var pid = b.getAttribute('data-github-sync');
  var name = b.getAttribute('data-name') || 'this project';
  var resultEl = b.parentElement && b.parentElement.querySelector('.github-sync-result');
  var publicBox = b.parentElement && b.parentElement.querySelector('[data-github-public="' + pid + '"]');
  var visibility = publicBox && publicBox.checked ? 'public' : 'private';
  var syncConfirmKey = visibility === 'public' ? 'githubSyncConfirmPublic' : 'githubSyncConfirmPrivate';
  if (!window.confirm(tr(syncConfirmKey, name))) return;
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = 'Syncing…';
  fetch('/api/github-sync/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid, visibility: visibility }),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      b.disabled = false;
      b.textContent = originalText;
      if (!resultEl) return;
      var result = githubSyncExecuteResult(r.data);
      resultEl.className = result.className;
      resultEl.textContent = result.text;
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'github-sync-result github-sync-result-fail';
        resultEl.textContent = '✗ Request failed — try again shortly.';
      }
    });
});
// EXECUTE the "contribute upstream" PR (event-delegated so it survives
// project-page re-renders, epic 0006 "GitHub connected mode" slice 5 — the
// fork + branch-push + gh pr create half; mirrors the github-sync click
// handler above and the CONNECT popover's gh-issue-form submit handler).
// Confirms first — this forks the upstream repo, pushes this project's
// current branch to that fork, and runs a real 'gh pr create' against the
// operator's own authenticated gh/git.
document.addEventListener('submit', function (e) {
  var f = e.target && e.target.closest && e.target.closest('[data-github-pr-form]');
  if (!f) return;
  e.preventDefault();
  var pid = f.getAttribute('data-github-pr-form');
  var name = f.getAttribute('data-name') || 'this project';
  var titleEl = f.querySelector('.github-pr-title');
  var bodyEl = f.querySelector('.github-pr-body');
  var resultEl = f.querySelector('.github-pr-result');
  var title = titleEl ? titleEl.value.trim() : '';
  if (!title) return;
  // CAUGHT BY THE FREE-VARIABLE GUARD (client-bundle-syntax-guard): this
  // delegated click handler has no "state" in scope — that is renderFleet's
  // parameter. Read the module-level cache renderFleet maintains instead;
  // at click time it always holds the latest fleet tick (same pattern the
  // landing/release panels use), and a pre-first-tick click degrades to the
  // no-issue-number prefill rather than throwing.
  var prProjects = (lastFleetState && lastFleetState.projects) || [];
  var prProject = null;
  for (var ppi = 0; ppi < prProjects.length; ppi++) if (prProjects[ppi].id === pid) prProject = prProjects[ppi];
  var prIssueNumber = poolDeliveryIssueNumber(prProject ? prProject.tasks || [] : []);
  var prConfirmMsg =
    tr('githubPrConfirm', { name: name, title: title }) +
    (prIssueNumber === undefined ? '' : tr('githubPrConfirmIssueClause', { issueNumber: prIssueNumber }));
  if (!window.confirm(prConfirmMsg)) return;
  var body = bodyEl ? bodyEl.value : '';
  var submitBtn = f.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  if (resultEl) { resultEl.className = 'github-pr-result'; resultEl.textContent = 'opening…'; }
  var prReqBody = { project: pid, title: title, body: body };
  if (prIssueNumber !== undefined) prReqBody.issueNumber = prIssueNumber;
  fetch('/api/github-pr/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(prReqBody),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      if (submitBtn) submitBtn.disabled = false;
      if (!resultEl) return;
      var result = githubPrExecuteResult(r.data);
      resultEl.className = result.className;
      resultEl.textContent = result.text;
      if (r.data && r.data.ok && titleEl) titleEl.value = '';
      if (r.data && r.data.ok && bodyEl) bodyEl.value = '';
    })
    .catch(function () {
      if (submitBtn) submitBtn.disabled = false;
      if (resultEl) {
        resultEl.className = 'github-pr-result github-pr-result-fail';
        resultEl.textContent = '✗ Request failed — try again shortly.';
      }
    });
});
// totalsTileItems/statTileItems are generated FROM web/stat-tiles.ts below
// (epic 0002 "shell decomposition", slice 2, twenty-eighth cut) — their real
// compiled source via .toString(), not a hand-retyped copy. They can no longer
// drift apart. statTileAriaLabel (spliced earlier, alongside stat()) joins them
// here too. doraTileItems/gateParallelTileItems/warmSessionTileItems moved out
// with their panels to web/features/process-health.ts.
${sharedTotalsTileItems.toString()}
${sharedStatTileItems.toString()}
// liveWorkerItems/liveWorkerChipMeta are generated FROM web/stat-tiles.ts
// below (epic 0002 "shell decomposition", slice 2) — their real compiled
// source via .toString(), not a hand-retyped copy. They can no longer drift
// apart.
${sharedLiveWorkerItems.toString()}
${sharedLiveWorkerChipMeta.toString()}
// One .stat-tile cell (value/label/tabindex/tip/aria-label) — the shared
// M3 surface the fleet-wide header bar (renderStatTiles) and the four
// project-page stat-tile panels (doraSection/gateParallelSection/
// warmSessionsSection in web/features/process-health.ts, evolutionSection in
// web/features/evolution.ts) each build tiles into. Those four once
// hand-rolled this exact seven-line loop body verbatim (PARALLEL UNLOCK A2,
// web-msuflffa-imy6ne), the same hand-sync duplication class
// statTileAriaLabel's own doc comment already named for their aria-label line
// alone; this closes the rest of the loop body too. Distinct from stat() above
// — that one builds .stat/.stat-n/.stat-l (cardStats/metricsSection's smaller
// tile), a different CSS shape, so the two stay separate rather than merged.
function statTile(value, label, tip, extra) {
  var tile = el('div', 'stat-tile');
  tile.appendChild(el('span', 'stat-tile-n', String(value)));
  tile.appendChild(el('span', 'stat-tile-l', label));
  if (extra) tile.appendChild(extra);
  tile.setAttribute('tabindex', '0');
  tile.setAttribute('data-tip', tip);
  tile.setAttribute('aria-label', statTileAriaLabel([String(value), label, tip]));
  return tile;
}
// doraSection/gateParallelSection/warmSessionsSection — the three
// process-health stat-tile panels that each called statTile above — moved out
// as one coherent cluster to web/features/process-health.ts (epic 0002 "shell
// decomposition", SHELL HUB RELIEF). evaluationTrendPanel/evolutionSection —
// the two "is the agent improving?" evolution-cluster panels — moved out the
// same way to web/features/evolution.ts. They all ride featureModulesJs()
// into the same concatenated bundle, so renderProjectPage() still calls them
// by name below.
// startOverTip is generated FROM web/card-actions.ts below (epic 0002
// "shell decomposition", slice 2, seventy-first cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${sharedStartOverTip.toString()}
// githubSyncTip is generated FROM web/card-actions.ts below (BOARD
// web-mss4lpwi-p0w1d0 "GITHUB 2/5") — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${sharedGithubSyncTip.toString()}
// githubSyncExecuteResult is generated FROM web/card-actions.ts below (epic
// 0002 "shell decomposition") — real compiled source via .toString(), not a
// hand-retyped copy. githubSyncConfirmMessage stays IN card-actions.ts (kept
// as the English source STRINGS.githubSyncConfirmPrivate/Public mirror,
// still unit-tested there) but is no longer embedded here — the
// [data-github-sync] click handler above reads the translated text straight
// from tr(key, name) instead (i18n foundation, board web-msnsndki-dz3vn1).
${sharedGithubSyncExecuteResult.toString()}
// githubPrLabel/githubPrSubmitTip/githubPrExecuteResult are generated FROM
// web/card-actions.ts below (epic 0006 "GitHub connected mode", slice 5
// "contribute upstream" — the fork + branch-push + gh pr create half) —
// real compiled source via .toString(), not a hand-retyped copy.
// githubPrConfirmMessage stays IN card-actions.ts (kept as the English
// source STRINGS.githubPrConfirm/githubPrConfirmIssueClause mirror, still
// unit-tested there) but is no longer embedded here — the
// [data-github-pr-form] submit handler above reads the translated text
// straight from tr(key, subs) instead (i18n foundation, board
// web-msnsndki-dz3vn1).
${sharedGithubPrLabel.toString()}
${sharedGithubPrSubmitTip.toString()}
${sharedGithubPrExecuteResult.toString()}
// poolDeliveryIssueNumber is generated FROM web/card-actions.ts below (epic
// 0007 "PLATFORM 6/7" pool-client's PR-delivery leg) — real compiled source
// via .toString(), not a hand-retyped copy. Prefills the "Contribute
// upstream" form's Closes-# target from the project's own pool-linked tasks.
${sharedPoolDeliveryIssueNumber.toString()}
// REPORT_REGIONS is the single source of truth right-click REPORT-FROM-HERE
// (features/report-menu.ts, features/report-capture-client.ts) resolves an
// owning module from (BOARD web-mss50ia8-nthtf3, "PLATFORM 5/7"; REPORT
// UNIFICATION 2/2, epic 0015). Declared with var at this script's top
// level, so — like every other chunk sharing this page's one global scope
// (web/chunks.ts's header comment) — it is reachable as a real global
// (window.REPORT_REGIONS) from report-capture-client.ts's /panels.js
// chunk, deferred and therefore always executing after this core script:
// the client reads the real top-level literal directly, no attribute
// plumbing. renderProjectPage() below tags each region's own container
// with REPORT_REGION_ATTR (imported from report-capture.ts, spliced by
// value below) at render — the resolver then walks up from whatever
// element a contextmenu fired on to the nearest tagged ancestor and looks
// its regionId up here. Spliced under REPORT_REGION_ATTR_VALUE, not
// REPORT_REGION_ATTR — report-capture-client.ts's assembled output already
// declares its own REPORT_REGION_ATTR const from the same source constant,
// and every chunk on this page shares one global scope, so reusing that
// exact name here would collide.
var REPORT_REGION_ATTR_VALUE = ${JSON.stringify(REPORT_REGION_ATTR)};
var REPORT_REGIONS = {
  'flight-console': {
    regionId: 'flight-console',
    regionLabel: 'Flight console',
    moduleSources: ['apps/dashboard/src/web/features/flight-console.ts'],
  },
  'issue-triage': {
    regionId: 'issue-triage',
    regionLabel: 'KEEPER issue triage',
    moduleSources: [
      'apps/dashboard/src/web/features/issue-triage.ts',
      'apps/dashboard/src/flight/issue-triage.ts',
    ],
  },
  'backlog': {
    regionId: 'backlog',
    regionLabel: 'Detected backlog',
    moduleSources: ['apps/dashboard/src/web/features/backlog.ts'],
  },
  'docs': {
    regionId: 'docs',
    regionLabel: 'Docs',
    moduleSources: ['apps/dashboard/src/web/features/docs-viewer.ts'],
  },
  'round': {
    regionId: 'round',
    regionLabel: 'This round',
    moduleSources: ['apps/dashboard/src/web/features/round-panel.ts'],
  },
  'release': {
    regionId: 'release',
    regionLabel: 'Next release',
    moduleSources: ['apps/dashboard/src/web/shell.ts', 'packages/engine/src/release.ts'],
  },
  'landing': {
    regionId: 'landing',
    regionLabel: 'Landing',
    moduleSources: [
      'apps/dashboard/src/web/features/landing.ts',
      'apps/dashboard/src/landing/execute.ts',
    ],
  },
  'tasks': {
    regionId: 'tasks',
    regionLabel: 'Tasks',
    moduleSources: ['apps/dashboard/src/web/shell.ts', 'apps/dashboard/src/web/task-queue.ts'],
  },
};
function renderProjectPage(state, pid) {
  var fleet = document.getElementById('fleet');
  if (!fleet) return;
  fleet.classList.add('project-mode'); // one full-width column, not card cells
  fleet.replaceChildren();
  fleet.setAttribute('aria-busy', 'false');
  var back = el('p', 'back');
  var a = document.createElement('a');
  a.href = '/';
  a.textContent = '← Fleet';
  back.appendChild(a);
  fleet.appendChild(back);
  var c = null;
  var list = state.projects || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === pid) c = list[i];
  if (!c) {
    var e = el('div', 'empty');
    e.appendChild(el('h2', null, 'Project not found'));
    e.appendChild(el('p', 'muted', 'It may have been removed from the dashboard. Head back to the fleet.'));
    fleet.appendChild(e);
    return;
  }
  // The human story first: what shipped, what it cost, which task it closed.
  var summary = flightSummarySection(c);
  if (summary) fleet.appendChild(summary);
  // What's next: unmerged commits sitting on the checked-out branch, ready to land.
  var landingEl = landingSection(pid, c.flightLog, c.tasks);
  landingEl.setAttribute(REPORT_REGION_ATTR_VALUE, 'landing');
  fleet.appendChild(landingEl);
  // The raw process console — collapsed by default, lazy-loaded on expand.
  var flightConsoleEl = flightConsoleSection(pid);
  flightConsoleEl.setAttribute(REPORT_REGION_ATTR_VALUE, 'flight-console');
  fleet.appendChild(flightConsoleEl);
  var heatmap = contributionHeatmap(c);
  if (heatmap) fleet.appendChild(heatmap);
  var evalTrend = evaluationTrendPanel(c);
  if (evalTrend) fleet.appendChild(evalTrend);
  // The trend chart's own stat-tile summary sits right after it (UX weakness
  // sweep cut 3/3, epic 0015, board web-mtju8ekq-dlpe9n) — both read the
  // same evaluationLabelDayCounts window, so scattering them apart (this
  // used to sit below DORA/gate-parallel/warm-sessions) made the summary
  // read as an unrelated, disconnected repeat of "Evolution" rather than the
  // chart's own companion row.
  var evolution = evolutionSection(c);
  if (evolution) fleet.appendChild(evolution);
  var cardEl = card(c);
  var det = cardEl.querySelector('details.detail');
  if (det) det.open = true; // the inside page shows everything, always
  fleet.appendChild(cardEl);
  var dora = doraSection(c);
  if (dora) fleet.appendChild(dora);
  var gateParallel = gateParallelSection(c);
  if (gateParallel) fleet.appendChild(gateParallel);
  var warmSessions = warmSessionsSection(c);
  if (warmSessions) fleet.appendChild(warmSessions);
  var tasksEl = tasksSection(c);
  tasksEl.setAttribute(REPORT_REGION_ATTR_VALUE, 'tasks');
  fleet.appendChild(tasksEl);
  // KEEPER issue triage: incoming GitHub issues judged accept-or-duplicate
  // against this project's board/backlog — sits right before Detected
  // backlog, since an accepted issue becomes a new task that panel itself
  // could later flag as shipped.
  var issueTriageEl = issueTriageSection(pid);
  issueTriageEl.setAttribute(REPORT_REGION_ATTR_VALUE, 'issue-triage');
  fleet.appendChild(issueTriageEl);
  // Detected backlog: open tasks a recent commit may have already shipped
  // (interactive-session work with no METRICS line) — sits right after the
  // task board it proposes edits to.
  var backlogEl = backlogSection(pid);
  backlogEl.setAttribute(REPORT_REGION_ATTR_VALUE, 'backlog');
  fleet.appendChild(backlogEl);
  // Fleet coordination: which sibling lanes hold what board claim / what a
  // sibling branch is touching right now — sits right after Detected
  // backlog, since a board claim is the same "who already has this?"
  // question an operator would otherwise have to piece together by hand.
  fleet.appendChild(coordinationSection(pid));
  // Pipeline view (epic 0015 D4): the OTLP span graph — which firings ran in
  // which lane, and what continued what — server-rendered by /api/pipeline
  // and fetched on demand, right after Fleet coordination since both answer
  // the same "what is the fleet actually doing?" question at different depths.
  fleet.appendChild(pipelineSection(pid));
  var docsEl = docsSection(pid);
  docsEl.setAttribute(REPORT_REGION_ATTR_VALUE, 'docs');
  fleet.appendChild(docsEl);
  // This round: the non-destructive answer to "how am I doing lately?" —
  // pairs with Start over just below, which is the destructive version of
  // the same question.
  var roundEl = roundSection(pid);
  roundEl.setAttribute(REPORT_REGION_ATTR_VALUE, 'round');
  fleet.appendChild(roundEl);
  // Next release: the SemVer bump the commits since the last release tag
  // would cut, if any — pairs with This round just above (same "since the
  // last tag" boundary, different question: how am I doing vs. what ships next).
  var releaseEl = releaseSection(pid);
  releaseEl.setAttribute(REPORT_REGION_ATTR_VALUE, 'release');
  fleet.appendChild(releaseEl);
  // Start over: a DECLARED telemetry reset (fresh 0/0 round) — the project,
  // its tasks, its index, and its git backups are untouched.
  var so = el('section', 'start-over');
  var soBtn = document.createElement('button');
  soBtn.type = 'button';
  soBtn.textContent = '↺ Start over';
  soBtn.setAttribute('data-start-over', c.id);
  soBtn.setAttribute('data-name', c.name);
  var soTip = startOverTip(c.name);
  soBtn.setAttribute('data-tip', soTip);
  soBtn.setAttribute('aria-label', soTip);
  so.appendChild(soBtn);
  so.appendChild(el('span', 'muted', 'Resets firings + ship-rate counters to 0/0. Tasks, index, and backups are kept.'));
  fleet.appendChild(so);
  // Sync to GitHub (BOARD web-mss4lpwi-p0w1d0, "GITHUB 2/5 - sync any
  // project"): one action = 'gh repo create --private --source --push' when
  // this project has no remote yet, or a plain 'git push' re-sync when it
  // already does — the server decides which, this button just triggers it.
  var gh = el('section', 'github-sync');
  var ghBtn = document.createElement('button');
  ghBtn.type = 'button';
  ghBtn.textContent = '⇪ Sync to GitHub';
  ghBtn.setAttribute('data-github-sync', c.id);
  ghBtn.setAttribute('data-name', c.name);
  var ghTip = githubSyncTip(c.name);
  ghBtn.setAttribute('data-tip', ghTip);
  ghBtn.setAttribute('aria-label', ghTip);
  gh.appendChild(ghBtn);
  gh.appendChild(el('span', 'muted', 'Private by default. Creates a repo on first sync, pushes on every one after.'));
  // "public" is the epic's confirm-guarded SECOND choice (BOARD
  // web-mss4lpwi-p0w1d0): an explicit opt-in checkbox, off by default, read
  // at click time by the sync handler below to pick which confirm() wording
  // (and which visibility) the request uses — never a silent default.
  var ghPublicLabel = document.createElement('label');
  ghPublicLabel.className = 'github-sync-public';
  var ghPublicCheckbox = document.createElement('input');
  ghPublicCheckbox.type = 'checkbox';
  ghPublicCheckbox.setAttribute('data-github-public', c.id);
  ghPublicLabel.appendChild(ghPublicCheckbox);
  ghPublicLabel.appendChild(document.createTextNode(' Make public instead (visible to everyone)'));
  gh.appendChild(ghPublicLabel);
  var ghResult = el('span', 'github-sync-result');
  ghResult.setAttribute('aria-live', 'polite');
  gh.appendChild(ghResult);
  fleet.appendChild(gh);
  // Contribute upstream (epic 0006 "GitHub connected mode", slice 5
  // "contribute upstream" — the fork + branch-push + 'gh pr create' half;
  // the sibling issue-report half lives in the CONNECT popover's
  // '.gh-issue-form' instead, global rather than per-project since a bug
  // report isn't tied to any one branch). One submit = 'gh repo fork' +
  // 'git push' + 'gh pr create' against the upstream AUTOPILOT repo, run
  // from this project's current branch. UX weakness sweep (epic 0015, board
  // web-mtju8ekq-dlpe9n): this form used to render fully expanded on every
  // visit even though opening a PR is a rare, occasional action — now it
  // sits behind a closed-by-default <details>, same shape as
  // soulEditorPanel's .soul-editor.
  var ghPr = el('section', 'github-pr');
  var ghPrDetails = document.createElement('details');
  ghPrDetails.className = 'github-pr-details';
  var ghPrSummary = el('summary', 'github-pr-summary', '🔀 Contribute upstream');
  ghPrSummary.setAttribute('data-i18n', 'githubPrSummary');
  ghPrDetails.appendChild(ghPrSummary);
  var ghPrForm = document.createElement('form');
  ghPrForm.className = 'gh-issue-form';
  ghPrForm.setAttribute('data-github-pr-form', c.id);
  ghPrForm.setAttribute('data-name', c.name);
  var ghPrTitleId = 'github-pr-title-' + c.id;
  var ghPrBodyId = 'github-pr-body-' + c.id;
  var ghPrTitleLabel = el('label', null, githubPrLabel(c.name));
  ghPrTitleLabel.setAttribute('for', ghPrTitleId);
  ghPrTitleLabel.setAttribute('data-i18n-template', 'githubPrLabel');
  ghPrTitleLabel.setAttribute('data-i18n-name', c.name);
  ghPrForm.appendChild(ghPrTitleLabel);
  var ghPrTitle = document.createElement('input');
  ghPrTitle.type = 'text';
  ghPrTitle.id = ghPrTitleId;
  ghPrTitle.name = 'title';
  ghPrTitle.className = 'github-pr-title';
  ghPrTitle.placeholder = 'Title';
  ghPrTitle.setAttribute('data-i18n-placeholder', 'titlePlaceholder');
  ghPrTitle.autocomplete = 'off';
  ghPrTitle.required = true;
  ghPrForm.appendChild(ghPrTitle);
  var ghPrBodyLabel = el('label', null, 'Details (optional)');
  ghPrBodyLabel.setAttribute('for', ghPrBodyId);
  ghPrBodyLabel.setAttribute('data-i18n', 'detailsOptionalPlaceholder');
  ghPrForm.appendChild(ghPrBodyLabel);
  var ghPrBody = document.createElement('textarea');
  ghPrBody.id = ghPrBodyId;
  ghPrBody.name = 'body';
  ghPrBody.className = 'github-pr-body';
  ghPrBody.rows = 3;
  ghPrForm.appendChild(ghPrBody);
  var ghPrSubmit = document.createElement('button');
  ghPrSubmit.type = 'submit';
  ghPrSubmit.textContent = 'Open pull request';
  ghPrSubmit.setAttribute('data-i18n', 'openPullRequest');
  var ghPrSubmitTip = githubPrSubmitTip(c.name);
  ghPrSubmit.setAttribute('data-tip', ghPrSubmitTip);
  ghPrSubmit.setAttribute('aria-label', ghPrSubmitTip);
  ghPrForm.appendChild(ghPrSubmit);
  var ghPrResult = el('span', 'github-pr-result');
  ghPrResult.setAttribute('aria-live', 'polite');
  ghPrForm.appendChild(ghPrResult);
  ghPrDetails.appendChild(ghPrForm);
  ghPr.appendChild(ghPrDetails);
  fleet.appendChild(ghPr);
  // Pin the search/ask bar to this project.
  var sel = document.getElementById('search-project');
  if (sel) sel.value = pid;
}
function renderTotals(t) {
  var bar = document.getElementById('totals');
  if (!bar) return;
  bar.replaceChildren();
  var items = totalsTileItems(t, fmtCost);
  for (var i = 0; i < items.length; i++) {
    var cell = el('div', 'total');
    cell.appendChild(el('span', 'total-n', String(items[i][0])));
    cell.appendChild(el('span', 'total-l', items[i][1]));
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only
    // the first count is a Tab stop, not one per cell — seven or eight stops
    // before a keyboard user ever reached the stat-tile grid below.
    // wireRoving('.totals .total', '.totals') moves it.
    cell.setAttribute('tabindex', i === 0 ? '0' : '-1');
    cell.setAttribute('data-tip', items[i][2]);
    cell.setAttribute('aria-label', statTileAriaLabel(items[i]));
    bar.appendChild(cell);
  }
}
// Fleet-wide "who works on what" rollup (backlog web-mssn106m-bqvxi8, fourth
// slice; multi-lane board web-mtbp0t86-rnimyi): every currently-flying LANE
// alongside the model running it — the whole-fleet complement to the
// per-project live-worker card's model badge (previous slice, liveWorkerCard)
// and the Metrics panel's historical MODEL MIX breakdown (modelMixItems),
// which only covers *finished* firings. Hidden entirely when nothing is
// flying rather than showing an empty strip. A project running several
// concurrent worktree lanes at once contributes one chip per lane, not one
// per project — see liveWorkerItems (web/stat-tiles.ts).
function renderLiveWorkers(state) {
  var section = document.getElementById('live-workers');
  if (!section) return;
  var cards = (state.projects || []).map(function (p) {
    return { id: p.id, name: p.name, lives: liveFirings(p) };
  });
  var items = liveWorkerItems(cards);
  section.replaceChildren();
  section.hidden = items.length === 0;
  if (items.length === 0) return;
  if (liveWorkersRovingIndex >= items.length) liveWorkersRovingIndex = items.length - 1;
  if (liveWorkersRovingIndex < 0) liveWorkersRovingIndex = 0;
  section.appendChild(el('span', 'live-workers-label', 'flying now'));
  for (var i = 0; i < items.length; i++) {
    var w = items[i];
    var meta = liveWorkerChipMeta(w, OFFICE_TIPS);
    var chip = tipChip(meta.text, meta.tip, meta.ariaLabel, 'live-worker-chip');
    chip.setAttribute('tabindex', i === liveWorkersRovingIndex ? '0' : '-1');
    section.appendChild(chip);
  }
}
// Roving-tabindex keyboard support for the #live-workers strip above: moves
// the single Tab stop with Left/Right/Home/End instead of leaving every chip
// individually tabbable. Delegated on document (chips are rebuilt wholesale
// on every SSE re-render, so per-chip listeners would need re-attaching).
document.addEventListener('keydown', function (e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  var chip = e.target && e.target.closest && e.target.closest('.live-worker-chip');
  if (!chip) return;
  var group = chip.closest('.live-workers');
  if (!group) return;
  var chips = Array.prototype.slice.call(group.querySelectorAll('.live-worker-chip'));
  var i = chips.indexOf(chip);
  if (i < 0) return;
  var next = i;
  if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
  else if (e.key === 'ArrowRight') next = Math.min(chips.length - 1, i + 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = chips.length - 1;
  if (next === i) return;
  e.preventDefault();
  chip.setAttribute('tabindex', '-1');
  chips[next].setAttribute('tabindex', '0');
  chips[next].focus();
  liveWorkersRovingIndex = next;
});
// Mouse/programmatic focus also moves the roving tab stop (APG roving-
// tabindex recommendation) so Tabbing away and back lands where the user
// last was, not always back at chip 0.
document.addEventListener('focusin', function (e) {
  var chip = e.target && e.target.closest && e.target.closest('.live-worker-chip');
  if (!chip) return;
  var group = chip.closest('.live-workers');
  if (!group) return;
  var chips = Array.prototype.slice.call(group.querySelectorAll('.live-worker-chip'));
  var i = chips.indexOf(chip);
  if (i < 0 || i === liveWorkersRovingIndex) return;
  for (var j = 0; j < chips.length; j++) chips[j].setAttribute('tabindex', j === i ? '0' : '-1');
  liveWorkersRovingIndex = i;
});
// The fleet's derived-rate metrics (not raw counts, see renderTotals) as an M3
// elevated bento grid — v1 (2352ce3) shipped these as plain .total cells
// mixed into the counts row; 5404a89 gave them their own M3 card surface
// (elevation + shape scale, hover/focus lift) but with plain numbers, no
// trend. Each tile now also carries a spark built from the same merged,
// real fleet-wide firing series (state.recentFirings, see read/fleet.ts's
// fleetChronoLog) — never a fake/interpolated series.
function renderStatTiles(state) {
  var t = state.totals;
  var grid = document.getElementById('stat-tiles');
  if (!grid) return;
  grid.replaceChildren();
  var log = state.recentFirings || [];
  var tasks = (state.projects || []).reduce(function (acc, p) { return acc.concat(p.tasks || []); }, []);
  var items = statTileItems(t, fmtCost);
  var sparks = [
    fleetCostSpark(log, tasks),
    fleetFormSpark(log, tasks),
    fleetFormSpark(log, tasks),
    fleetTurnsSpark(log, tasks),
    fleetCacheSpark(log, tasks),
  ];
  for (var i = 0; i < items.length; i++) {
    grid.appendChild(statTile(items[i][0], items[i][1], items[i][2], sparks[i]));
  }
  // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): one Tab
  // stop for the grid, not one per tile. Seeded by .stat-tile, NOT [tabindex]
  // — each tile wraps a spark whose bars are their own roving group.
  seedRoving(grid, '.stat-tile');
}
var lastFleetSig = null;
var lastFleetState = null;
var fleetCardsById = {};
var fleetCardStates = {}; // id -> renderCard() result, reused/patched section by section
var fleetShowingEmpty = null; // null = not yet rendered
// BE-RIGHT-BACK overlay state (BOARD web-msqgho43-yeqne3): brbFailStreak
// counts consecutive refresh() failures; brbEl is the lazily-created
// full-screen card. BRB_FAIL_THRESHOLD/brbOverlayVisible are generated FROM
// web/be-right-back.ts below (epic 0002 "shell decomposition", slice 2) —
// the constant via JSON.stringify() (the same embedding convention this
// bundle uses for other shared constants), the function via its real
// compiled source via .toString(), not a hand-retyped copy. They can no
// longer drift apart.
var BRB_FAIL_THRESHOLD = ${JSON.stringify(BRB_FAIL_THRESHOLD)};
${sharedBrbOverlayVisible.toString()}
var brbFailStreak = 0;
var brbEl = null;
function setBrbVisible(visible) {
  if (visible) {
    if (!brbEl) {
      brbEl = el('div', 'brb-overlay');
      brbEl.setAttribute('role', 'status');
      brbEl.setAttribute('aria-live', 'polite');
      var card = el('div', 'brb-card');
      card.appendChild(el('span', 'brb-plane', '✈️'));
      card.appendChild(el('p', 'brb-title', 'Be right back'));
      card.appendChild(el('p', 'brb-sub', 'Building something cool while we reconnect…'));
      var bar = el('div', 'brb-progress');
      bar.setAttribute('aria-hidden', 'true');
      bar.appendChild(el('span', ''));
      card.appendChild(bar);
      brbEl.appendChild(card);
      document.body.appendChild(brbEl);
    }
    brbEl.hidden = false;
  } else if (brbEl) {
    brbEl.hidden = true;
  }
}
// fleetStateSig is generated FROM web/fleet-view.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${sharedFleetStateSig.toString()}
function renderFleet(state) {
  lastFleetState = state; // kept so UI-only toggles (phase drill) can re-render instantly
  // Notifications channel (board web-msnsndlk-exw3t9): evaluated every tick,
  // ahead of the dirty-check sig below — a needs-you/death-cluster condition
  // must still fire a notification even on a tick where nothing else in the
  // rendered DOM changed. maybeNotifyFleet is defined in
  // features/notifications.ts; hoisting makes it callable here despite that
  // module's script text landing after fleetJs()'s in the concatenated
  // clientJs() bundle (same contract translateDom relies on, below).
  if (typeof maybeNotifyFleet === 'function') maybeNotifyFleet(state.projects || []);
  // Refresh the "updated Xs ago" stamp cheaply every tick (just text, no repaint).
  // Every write below is guarded — setAttribute queues a MutationObserver
  // record even when the new value equals the old one, and this runs every
  // tick: an idempotent tick must mutate nothing (cockpit epic 0015, D2).
  var u = document.getElementById('updated');
  if (u) {
    var updatedText = 'updated ' + fmtAgo(state.generatedAt);
    if (u.textContent !== updatedText) u.textContent = updatedText;
    // i18n (board web-msnsndki-dz3vn1): the SSR placeholder ("connecting…")
    // carries data-i18n="updatedConnecting" so a Hebrew reader sees it
    // translated before the first tick lands — but once real "ago" data
    // replaces it, that marker must go, or a LATER translateDom() sweep
    // (this same renderFleet() calls one below on every rebuilt tick) would
    // revert this line straight back to the placeholder text forever.
    if (u.hasAttribute('data-i18n')) u.removeAttribute('data-i18n');
    if (u.getAttribute('tabindex') !== '0') u.setAttribute('tabindex', '0');
    var updatedTip = 'When the live fleet stream last pushed fresh data';
    if (u.getAttribute('data-tip') !== updatedTip) u.setAttribute('data-tip', updatedTip);
  }
  // Env-driven, fixed for the process's life (see server/main.ts) — a plain
  // show/hide, not part of the dirty-check sig below.
  var otlpChip = document.getElementById('otlp-chip');
  var otlpHidden = !state.otlpConfigured;
  if (otlpChip && otlpChip.hidden !== otlpHidden) otlpChip.hidden = otlpHidden;
  // FLEET WISDOM banner (board web-msnt26xe-pc4pzp): evaluated every tick,
  // ahead of the dirty-check sig below — wisdomProposed is not part of
  // fleetStateSig, so the banner runs its own dirty check.
  renderFleetWisdom(state);
  // Only rebuild the DOM when the DATA actually changed. The live stream ticks
  // every ~1.5s even when nothing moved; rebuilding identical cards is what makes
  // the page "flash". Exclude generatedAt (it changes every push) from the compare.
  var sig = fleetStateSig(state);
  if (sig === lastFleetSig) return;
  lastFleetSig = sig;

  renderTotals(state.totals);
  renderLiveWorkers(state);
  renderStatTiles(state);
  // The per-project inside page: same live state, one project, everything open.
  var pinned = document.body.dataset.project || '';
  if (pinned) {
    renderProjectPage(state, pinned);
    if (typeof syncSearchProjects === 'function') syncSearchProjects(state.projects || []);
    if (typeof syncFlyFolderOptions === 'function') syncFlyFolderOptions(state.projects || []);
    if (typeof syncPoolClientProjects === 'function') syncPoolClientProjects(state.projects || []);
    var sel2 = document.getElementById('search-project');
    if (sel2) sel2.value = pinned;
    translateDom(document.documentElement.lang || 'en');
    return;
  }
  var fleet = document.getElementById('fleet');
  if (fleet) {
    fleet.setAttribute('aria-busy', 'false');
    if (state.empty) {
      if (fleetShowingEmpty !== true) {
        fleet.replaceChildren();
        var empty = el('div', 'empty');
        empty.appendChild(el('h2', null, 'No projects flying yet'));
        empty.appendChild(el('p', 'muted', 'Onboard a repo to watch it here. To see the dashboard populated now, run:'));
        empty.appendChild(el('code', 'cmd', 'pnpm dashboard:demo'));
        fleet.appendChild(empty);
        fleetCardsById = {};
        fleetCardStates = {};
        fleetShowingEmpty = true;
        // tour rides /panels.js (defer) — if its script has not executed yet,
        // leave a flag the tour module's own tail consumes on load, so the
        // empty-fleet gate decided HERE still governs the auto-open there.
        if (typeof maybeAutoOpenTour === 'function') maybeAutoOpenTour();
        else window.__apTourAutoOpenPending = true;
      }
    } else {
      if (fleetShowingEmpty !== false) {
        fleet.replaceChildren();
        fleetCardsById = {};
        fleetCardStates = {};
        fleetShowingEmpty = false;
      }
      // Keyed per-project diff (operator report: SSE ticks jump and reset
      // scroll) — patch only the SECTIONS whose data actually changed (see
      // renderCard/cardSectionSigs) and reposition the rest in place, instead
      // of tearing down whole cards every tick. A section left untouched
      // keeps its DOM identity, so an open <details>, a focused control, a
      // text selection, or an inner scrollable region's scrollTop all survive
      // a live update elsewhere in the fleet — or elsewhere in the SAME card.
      var seen = {};
      for (var i = 0; i < state.projects.length; i++) {
        var proj = state.projects[i];
        var id = proj.id;
        var cardState = renderCard(proj, fleetCardStates[id]);
        fleetCardStates[id] = cardState;
        fleetCardsById[id] = cardState.art;
        seen[id] = true;
        var ref = fleet.children[i];
        if (ref !== cardState.art) fleet.insertBefore(cardState.art, ref || null);
      }
      for (var oldId in fleetCardsById) {
        if (!seen[oldId]) {
          var oldNode = fleetCardsById[oldId];
          if (oldNode && oldNode.parentNode === fleet) fleet.removeChild(oldNode);
          delete fleetCardsById[oldId];
          delete fleetCardStates[oldId];
        }
      }
    }
  }
  // Keep the search bar's project picker in sync with the live fleet.
  if (typeof syncSearchProjects === 'function') syncSearchProjects(state.projects || []);
  // Keep the fly bar's known-folders datalist in sync too (FLY-BAR folder UX).
  if (typeof syncFlyFolderOptions === 'function') syncFlyFolderOptions(state.projects || []);
  // Keep the pool client's project picker in sync too (epic 0007 slice 6).
  if (typeof syncPoolClientProjects === 'function') syncPoolClientProjects(state.projects || []);
  // Fleet cards are client-rendered and patched on every tick — a card built
  // or patched after the page's one-time applyLocale() call would otherwise
  // render in English regardless of the active locale (board
  // web-msnsndki-dz3vn1). translateDom() is defined in features/locale.ts;
  // hoisting makes it callable here despite that module's script text
  // landing after fleetJs()'s in the concatenated clientJs() bundle.
  translateDom(document.documentElement.lang || 'en');
}
function refresh() {
  fetch('/api/state', { headers: { accept: 'application/json' } })
    .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
    .then(renderFleet)
    .then(function () {
      // Healed: one success clears the streak and the overlay instantly,
      // however long the outage lasted (BOARD web-msqgho43-yeqne3).
      brbFailStreak = 0;
      setBrbVisible(false);
    })
    .catch(function () {
      var u = document.getElementById('updated');
      if (u) {
        var offlineText = tr('offlineRetrying');
        if (u.textContent !== offlineText) u.textContent = offlineText;
        u.setAttribute('tabindex', '0');
        u.setAttribute('data-tip', tr('offlineRetryingTip'));
      }
      brbFailStreak++;
      setBrbVisible(brbOverlayVisible(brbFailStreak));
    });
}
function startFleetStream() {
  refresh(); // immediate first paint
  if (typeof EventSource !== 'undefined') {
    try {
      var es = new EventSource('/api/stream');
      es.onmessage = function (e) {
        try { renderFleet(JSON.parse(e.data)); } catch (err) {}
      };
      setInterval(refresh, 15000); // slow backup poll behind the live stream
      return;
    } catch (err) {}
  }
  setInterval(refresh, REFRESH_MS); // no SSE — fall back to polling
}
// Remove a project (event-delegated so it survives card re-renders). Confirms
// first, and is explicit that only the dashboard record is removed.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-remove]');
  if (!b) return;
  var id = b.getAttribute('data-remove');
  var name = b.getAttribute('data-name') || 'this project';
  if (!window.confirm(tr('removeProjectConfirm', name))) return;
  b.disabled = true;
  b.textContent = 'Removing…';
  fetch('/api/project/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: id }),
  })
    .then(function (res) {
      if (!res.ok) throw new Error('delete failed');
      refresh();
    })
    .catch(function () { b.disabled = false; b.textContent = 'Remove'; });
});
// Flight-log chips (event-delegated): expand one row / toggle full history.
// The re-render is DEFERRED past the click dispatch (rebuilding the DOM while
// the event bubbles through it is fragile) and goes through refresh() — fresh
// state objects every time; re-rendering a CACHED state object aliases DOM
// nodes some sections memoize per-object (observed: HierarchyRequestError).
function rerenderSoon() {
  setTimeout(function () {
    lastFleetSig = null;
    refresh();
  }, 0);
}
document.addEventListener('click', function (e) {
  var row = e.target && e.target.closest && e.target.closest('[data-flight-row]');
  if (row) {
    var rpid = row.getAttribute('data-flight-pid');
    var fid = row.getAttribute('data-flight-row');
    openFlightRow[rpid] = openFlightRow[rpid] === fid ? null : fid;
    rerenderSoon();
    return;
  }
  var all = e.target && e.target.closest && e.target.closest('[data-flightlog-all]');
  if (all) {
    var apid = all.getAttribute('data-flightlog-all');
    openFlightLogAll[apid] = !openFlightLogAll[apid];
    rerenderSoon();
    return;
  }
  var more = e.target && e.target.closest && e.target.closest('[data-flightlog-more]');
  if (more) {
    var mpid = more.getAttribute('data-flightlog-more');
    if (flightLogLoading[mpid]) return;
    var proj = null;
    var projects = (lastFleetState && lastFleetState.projects) || [];
    for (var pi = 0; pi < projects.length; pi++) {
      if (projects[pi].id === mpid) { proj = projects[pi]; break; }
    }
    var offset = ((proj && proj.flightLog) || []).length + (flightLogExtra[mpid] || []).length;
    flightLogLoading[mpid] = true;
    rerenderSoon();
    fetch('/api/firings?project=' + encodeURIComponent(mpid) + '&offset=' + offset, {
      headers: { accept: 'application/json' },
    })
      .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
      .then(function (page) {
        flightLogExtra[mpid] = (flightLogExtra[mpid] || []).concat(page.entries || []);
        flightLogMore[mpid] = !!page.hasMore;
      })
      .catch(function () {
        // Leave flightLogMore untouched so the button reappears for a retry.
      })
      .then(function () {
        flightLogLoading[mpid] = false;
        rerenderSoon();
      });
    return;
  }
  var hist = e.target && e.target.closest && e.target.closest('[data-task-history-more]');
  if (hist) {
    var hpid = hist.getAttribute('data-task-history-more');
    openTaskHistory[hpid] = (openTaskHistory[hpid] || TASK_HISTORY_CHUNK) + TASK_HISTORY_CHUNK;
    rerenderSoon();
  }
});
// Phase drill-down (event-delegated): click orient/do/gate/commit to look
// inside that phase — pure UI state, re-rendered from the cached fleet state.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-phase-toggle]');
  if (!b) return;
  var pid = b.getAttribute('data-phase-pid');
  var phase = b.getAttribute('data-phase-toggle');
  openPhases[pid] = openPhases[pid] === phase ? null : phase;
  if (lastFleetState) {
    lastFleetSig = null; // force the rebuild (data unchanged, UI state changed)
    renderFleet(lastFleetState);
  }
});
// "Start over" (event-delegated): clears telemetry ONLY after an explicit,
// honest confirm. Counters restart at 0/0; nothing else is touched.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-start-over]');
  if (!b) return;
  var id = b.getAttribute('data-start-over');
  var name = b.getAttribute('data-name') || 'this project';
  if (!window.confirm(tr('startOverConfirm', name))) return;
  b.disabled = true;
  b.textContent = 'Resetting…';
  fetch('/api/project/reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: id }),
  })
    .then(function (res) {
      if (!res.ok) throw new Error('reset failed');
      refresh();
      b.disabled = false;
      b.textContent = '↺ Start over';
    })
    .catch(function () { b.disabled = false; b.textContent = '↺ Start over'; });
});
startFleetStream();
`.trim();
}

/** The full client script served at /app.js (theme switcher + live fleet + connect + fly + search). */
export function clientJs(): string {
  // PRODUCTION LOAD ORDER, not the barrel's alphabetical order: core
  // (/app.js) first, then /project.js, then the deferred /panels.js — the
  // exact sequence a browser executes the three served chunks in. Function
  // declarations hoist across the whole concatenation either way, but
  // top-level STATEMENTS do not: locale-data.ts (deferred, sorts
  // alphabetically BEFORE locale.ts) runs `Object.assign(STRINGS, …)`
  // against core locale.ts's `let STRINGS` — alphabetical concatenation
  // put that assign in the let's temporal dead zone and crashed the whole
  // bundle eval ("Cannot access 'STRINGS' before initialization"), an
  // order production never loads in. Composing from the chunk composers
  // keeps this test/guard surface byte-complete (the chunks test asserts
  // the three together carry the same module set as the barrel) while
  // matching the only execution order that is contractual.
  return `${coreClientJs()}\n${projectClientJs()}\n${panelsClientJs()}`;
}

/**
 * CLIENT CODE-SPLITTING (epic 0002 slice 2 / BUNDLE DIET): the three chunks
 * the server actually serves — see `web/chunks.ts` for the chunk map and the
 * safety argument. `clientJs()` above stays the FULL concatenation: it is
 * what the jsdom test suites evaluate and what the bundle-wide free-variable
 * guard analyzes, and hoisting makes resolution order-independent, so
 * validating the whole is exactly as strong as before. The chunk composers
 * below are the transport split only — together they carry byte-for-byte the
 * same module set (the chunk test asserts that).
 */
export function coreClientJs(): string {
  return `${fleetJs()}\n${coreFeatureModulesJs()}`;
}

/** The `/project.js` chunk — renderProjectPage's panels, `/p/<id>` pages only. */
export function projectClientJs(): string {
  return projectFeatureModulesJs();
}

/** The `/panels.js` chunk — self-init operator panels, every page, defer. */
export function panelsClientJs(): string {
  return deferredFeatureModulesJs();
}

/**
 * A short content hash of the served bundle. Appended to the /app.js and
 * /tokens.css URLs so ANY code change produces a new URL the browser cannot have
 * cached — a stale bundle can never survive a restart (belt to `no-store`'s
 * suspenders). Cheap djb2 over the JS + CSS; recomputed per render (fine — the
 * shell is served no-store anyway).
 */
export function assetVersion(): string {
  const s = `${clientJs()}\n${layoutCss()}\n${fontFaceCss()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** The full HTML document for `GET /` (fleet) or `/p/<id>` (one project). */
export function renderShell(project?: string): string {
  const v = assetVersion();
  const anchor = project !== undefined ? ` data-project="${escapeAttr(project)}"` : '';
  return `<!doctype html>
<html lang="en" data-theme="${DEFAULT_THEME}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AUTOPILOT — dashboard</title>
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#0a0d12" />
  ${PRELOAD_FONT_PATHS.map((p) => `<link rel="preload" href="${p}" as="font" type="font/woff2" crossorigin="anonymous" />`).join('\n  ')}
  <link rel="stylesheet" href="/tokens.css?v=${v}" />
</head>
<body${anchor}>
  <a class="skip-link" href="#fleet" data-i18n="skipToFleet">Skip to fleet</a>
  <div id="update-banner" class="update-banner" role="status" aria-live="polite" data-i18n-aria="updateBannerAria" aria-label="Software update available" hidden></div>
  <header class="masthead">
    <div class="brand"><span class="brand-mark" aria-hidden="true">${gogglesMarkInlineSvg()}</span>AUTOPILOT</div>
    <div class="masthead-right">
      <span class="updated" id="updated" role="status" aria-live="polite" data-i18n="updatedConnecting">connecting…</span>
      <span class="chip otlp-chip" id="otlp-chip" tabindex="0" data-tip="An OTEL_EXPORTER_OTLP_* endpoint is configured — every flight exports its spans there" data-i18n-tip="otlpExportTip" aria-label="OTLP export: configured" data-i18n-aria="otlpExportConfigured" hidden>OTLP</span>
      <details class="connect" id="connect">
        <summary id="connect-summary"><span class="conn-dot" id="conn-dot" aria-hidden="true"></span><span id="connect-label" data-i18n="connect">Connect</span></summary>
        <div class="connect-body">
          <p class="connect-status" id="connect-status" role="status" aria-live="polite" data-i18n="connectCheckingConnection">checking connection…</p>
          <div class="connect-actions">
            <button type="button" class="connect-login" id="connect-login" data-i18n="loginClaude">Log in with Claude</button>
            <button type="button" class="connect-test" id="connect-test" data-i18n="testConnection">Test connection</button>
          </div>
          <hr class="connect-sep" />
          <form class="connect-form" id="connect-form">
            <label for="connect-mode" data-i18n="claudeAuthLabel">Claude authentication</label>
            <select id="connect-mode" name="mode">
              <option value="subscription" data-i18n="authModeSubscription">Subscription (default)</option>
              <option value="api-key" data-i18n="authModeApiKey">API key</option>
              <option value="oauth-token" data-i18n="authModeOauthToken">Subscription token (headless)</option>
            </select>
            <label for="connect-secret" id="connect-secret-label" data-i18n="credentialLabel" hidden>Credential</label>
            <input type="password" id="connect-secret" name="secret" autocomplete="off" spellcheck="false" hidden />
            <button type="submit" data-i18n="saveVerify">Save &amp; verify</button>
            <p class="connect-hint" id="connect-hint"></p>
          </form>
          <hr class="connect-sep" />
          <div class="connect-gh">
            <p class="connect-status" id="gh-status" role="status" aria-live="polite" data-i18n="ghChecking">checking GitHub…</p>
            <p class="connect-hint" id="gh-hint"></p>
            <p class="connect-status" id="gh-lts" role="status" aria-live="polite" data-i18n="ltsChecking">checking for updates…</p>
            <button type="button" class="connect-test" id="gh-lts-check" data-i18n="checkForUpdates">Check for updates</button>
            <form class="gh-issue-form" id="gh-issue-form">
              <label for="gh-issue-title" data-i18n="reportBugLabel">Report a bug or request a feature upstream</label>
              <input type="text" id="gh-issue-title" name="title" placeholder="Title" data-i18n-placeholder="titlePlaceholder" autocomplete="off" required />
              <textarea id="gh-issue-body" name="body" placeholder="Details (optional)" data-i18n-placeholder="detailsOptionalPlaceholder" rows="3"></textarea>
              <button type="submit" data-i18n="openGithubIssue">Open GitHub issue</button>
              <p class="gh-issue-result" id="gh-issue-result" role="status" aria-live="polite"></p>
            </form>
          </div>
        </div>
      </details>
      <nav class="switch" aria-label="Theme" data-i18n-aria="themeNav">${themeButtons()}</nav>
      <nav class="switch" aria-label="Language" data-i18n-aria="languageNav">${langButtons()}</nav>
      <details class="connect notify" id="notify">
        <summary id="notify-summary" data-tip="Browser notifications when a flight needs you or is dying" data-i18n-tip="notifySettingsTip" aria-label="Notification settings" data-i18n-aria="notifySettings">🔔</summary>
        <div class="connect-body">
          <label class="notify-enable" for="notify-enable">
            <input type="checkbox" id="notify-enable" />
            <span data-i18n="notifyEnable">Notify me when a flight needs me or is dying</span>
          </label>
          <div class="notify-quiet">
            <label for="notify-quiet-start" data-i18n="quietHours">Quiet hours</label>
            <input type="time" id="notify-quiet-start" aria-label="Quiet hours start" data-i18n-aria="quietHoursStart" />
            <span aria-hidden="true">–</span>
            <input type="time" id="notify-quiet-end" aria-label="Quiet hours end" data-i18n-aria="quietHoursEnd" />
          </div>
          <p class="connect-hint" id="notify-hint" role="status" aria-live="polite"></p>
        </div>
      </details>
      <button type="button" class="tour-btn" id="tour-btn" aria-haspopup="dialog" data-tip="A short guided tour: firing, slice, gate, flight" data-i18n-tip="tourTip" data-i18n="tour">Tour</button>
    </div>
  </header>
  <section class="totals" id="totals" aria-label="Fleet summary" data-i18n-aria="fleetSummary"></section>
  <section class="live-workers" id="live-workers" role="group" aria-label="Who's flying now" data-i18n-aria="liveWorkers" hidden></section>
  <section class="stat-tiles" id="stat-tiles" aria-label="Fleet performance" data-i18n-aria="fleetPerformance"></section>
  <section class="pr-review-panel" id="pr-review-panel" aria-label="KEEPER PR review" data-i18n-aria="keeperPrReview" hidden></section>
  <section class="pool-client-panel" id="pool-client-panel" aria-label="Contributor pool" data-i18n-aria="poolClientPanel" hidden></section>
  <nav class="publicity-panel" id="publicity-panel" aria-label="Publicity" data-i18n-aria="publicityPanel" hidden></nav>
  <section class="fleet-wisdom" id="fleet-wisdom" aria-label="Fleet wisdom proposal" data-i18n-aria="fleetWisdomProposal" hidden></section>
  <section class="flightbar" id="flightbar" aria-label="Fly a folder" data-i18n-aria="flyFolder" hidden>
    <form class="fly-form" id="fly-form">
      <label for="fly-folder" data-i18n="flyFolder">Fly a folder</label>
      <input type="text" id="fly-folder" name="folder" list="fly-folder-options" placeholder="absolute path to a git repo" data-i18n-placeholder="flyFolderPlaceholder" autocomplete="off" spellcheck="false" />
      <datalist id="fly-folder-options"></datalist>
      <button type="button" id="fly-browse-btn" aria-haspopup="dialog" data-tip="Browse the filesystem to pick a folder" data-i18n="browse">Browse…</button>
      <label for="fly-mode" class="visually-hidden" data-i18n="budgetModeLabel">Budget mode</label>
      <select id="fly-mode" name="mode" aria-label="Budget mode: fixed firing count or total spend target" data-i18n-aria="budgetMode">
        <option value="firings" selected data-i18n="byCount">by count</option>
        <option value="total" data-i18n="byTotal">by total $</option>
      </select>
      <label for="fly-firings" id="fly-firings-label" data-i18n="firings">Firings</label>
      <input type="number" id="fly-firings" name="firings" min="1" max="20" value="1" />
      <label for="fly-total" id="fly-total-label" data-i18n="stopAtTotal" hidden>Stop at total $</label>
      <input type="number" id="fly-total" name="total" min="0.5" step="0.5" value="30" hidden />
      <label for="fly-budget" data-i18n="perFiringBudget">$ / firing</label>
      <input type="number" id="fly-budget" name="budget" min="0.5" step="0.5" value="10" />
      <label for="fly-lanes" data-i18n="lanes">Lanes</label>
      <input type="number" id="fly-lanes" name="lanes" min="1" max="8" value="1" />
      <button type="button" id="fly-lucky" aria-label="I'm feeling lucky — probe this machine and fill a calibrated launch" data-i18n-aria="flyLuckyAria"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 11.5C9.8 9.6 7.6 8.8 7.7 6.6 7.8 4.6 10.2 3.9 12 6.1 13.8 3.9 16.2 4.6 16.3 6.6 16.4 8.8 14.2 9.6 12 11.5Z"/><path d="M12 11.5C9.8 9.6 7.6 8.8 7.7 6.6 7.8 4.6 10.2 3.9 12 6.1 13.8 3.9 16.2 4.6 16.3 6.6 16.4 8.8 14.2 9.6 12 11.5Z" transform="rotate(90 12 12)"/><path d="M12 11.5C9.8 9.6 7.6 8.8 7.7 6.6 7.8 4.6 10.2 3.9 12 6.1 13.8 3.9 16.2 4.6 16.3 6.6 16.4 8.8 14.2 9.6 12 11.5Z" transform="rotate(180 12 12)"/><path d="M12 11.5C9.8 9.6 7.6 8.8 7.7 6.6 7.8 4.6 10.2 3.9 12 6.1 13.8 3.9 16.2 4.6 16.3 6.6 16.4 8.8 14.2 9.6 12 11.5Z" transform="rotate(270 12 12)"/><path d="M12.5 12.5c.9 2.7 2 4.5 3.6 5.9l-1.1 1.1c-1.8-1.6-3.1-3.7-4-6.5Z"/></svg></button>
      <button type="submit" id="fly-go" data-i18n="flyIt">Fly it</button>
      <button type="button" id="fly-pause" data-i18n="pause" hidden>Pause</button>
      <button type="button" id="fly-stop" data-i18n="stop" hidden>Stop</button>
      <span class="fly-status" id="fly-status" role="status" aria-live="polite"></span>
      <p class="fly-hint" id="fly-hint"></p>
      <p class="muted fly-progress-label" id="fly-progress-label" hidden></p>
      <div class="fly-progress" id="fly-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" tabindex="0" hidden>
        <div class="fly-progress-fill" id="fly-progress-fill"></div>
      </div>
    </form>
    <div class="fly-flights" id="fly-flights" role="group" aria-label="Active flights" data-i18n-aria="activeFlights"></div>
  </section>
  <section class="searchbar" id="searchbar" aria-label="Search a project" data-i18n-aria="searchProject" hidden>
    <form class="search-form" id="search-form">
      <label for="search-project" data-i18n="search">Search</label>
      <select id="search-project" name="project"></select>
      <input type="search" id="search-q" name="q" list="search-history" placeholder="find code — or ask a question…" data-i18n-placeholder="searchPlaceholder" aria-label="Search query or question" data-i18n-aria="searchQueryAria" autocomplete="off" spellcheck="false" />
      <datalist id="search-history"></datalist>
      <button type="submit" id="search-go" data-i18n="search" data-tip="Find matching code in the selected project — hits list the file, line, and surrounding excerpt.">Search</button>
      <label for="ask-deep" class="ask-deep-label" data-tip="Escalate to a read-only agentic session (Read/Grep/Glob, up to 10 turns) that can go looking for the answer instead of relying on the indexed excerpts">
        <input type="checkbox" id="ask-deep" />
        <span data-i18n="deep">Deep</span>
      </label>
      <button type="button" id="ask-go" data-i18n="ask" data-tip="Ask the question instead of searching — an AI answer built from the indexed code streams in below.">Ask</button>
      <span class="switch ask-persona" id="ask-persona" role="group" aria-label="Ask persona" data-i18n-aria="askPersona">
        <button type="button" data-persona-btn="genius" aria-pressed="true" data-i18n="personaGenius" data-tip="Read-only persona (default): answers questions but never touches the dashboard.">GENIUS</button>
        <button type="button" data-persona-btn="architect" aria-pressed="false" data-i18n="personaArchitect" data-tip="Can propose dashboard actions for you to approve — opt-in per session, resets to GENIUS on reload.">ARCHITECT</button>
      </span>
    </form>
    <div class="ask-activity" id="ask-activity" aria-live="polite"></div>
    <div class="ask-answer" id="ask-answer" role="status" aria-live="polite"></div>
    <div class="ask-proposal" id="ask-proposal" role="status" aria-live="polite"></div>
    <div class="search-results" id="search-results" aria-live="polite"></div>
  </section>
  <main id="fleet" tabindex="-1" aria-label="Fleet" data-i18n-aria="fleetMain" aria-busy="true">
    <p class="hint" id="placeholder" data-i18n="connectingFleet">Connecting to the fleet…</p>
  </main>
  <script src="/app.js?v=${v}"></script>${
    project !== undefined
      ? `
  <script src="/project.js?v=${v}" defer></script>`
      : ''
  }
  <script src="/panels.js?v=${v}" defer></script>
</body>
</html>
`;
}
