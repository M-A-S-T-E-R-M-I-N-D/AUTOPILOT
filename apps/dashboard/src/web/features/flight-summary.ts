// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's "Recently shipped" flight summary panel
 * (`flightSummarySection`) — a whole bundle-composing assembler function
 * extracted out of `shell.ts`'s `fleetJs()` into its own file under
 * `web/features/` (epic 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/round-panel.ts`
 * for the prior extraction of this shape).
 * `web/shell.ts`'s `clientJs()` calls this module indirectly through
 * `featureModulesJs()`, so its return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the function
 * itself (not splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's
 * `flightSummaryJs` export the same way it already finds `round-panel.ts`'s.
 * Like `round-panel.ts`, this panel keeps no module-level state at all and
 * has no click handler of its own — every render reads only the passed
 * project card `c`; its one top-level side effect is the shared
 * `wireRoving()` registration below (delegated on `document`, stateless). This file carries real relative-import splices of its
 * own — `finishedFlightSummaries` (from `shared/flight-summary.ts`) and
 * `flightSummaryLineMeta` (from `web/flight-summary-panel.ts`), both used
 * nowhere else in `shell.ts` — now resolved relative to this file instead of
 * `shell.ts`; a function's `.toString()` output is unaffected by which local
 * name imports it under, so this remains byte-for-byte the same generated
 * text. `flightSummarySection(c)` (declared below) is called from
 * `fleetJs()`'s `renderProjectPage()` — a call site that stays a bare,
 * unimported identifier reference in `fleetJs()`'s own served text, the same
 * cross-module hoisted-call shape every whole-region move in this epic
 * already relies on, since the served bundle is one concatenated non-module
 * script (`clientJs()` = `fleetJs()` + `featureModulesJs()`). `el`/`fmtCost`/
 * `fmtAgo` stay inline in `fleetJs()` — broadly shared across many panels
 * beyond this one, called from this cluster as bare hoisted identifiers.
 *
 * I18N (board web-msnsndki-dz3vn1, `@autopilot/tokens`'s `strings.ts`) — the
 * panel's own "Recently shipped" heading is tagged `data-i18n`; the per-flight
 * headline/cost/closed-task/timestamp text stays untranslated, same as every
 * other per-project, data-derived string in this table.
 */
import { finishedFlightSummaries } from '../../shared/flight-summary.js';
import { flightSummaryLineMeta } from '../flight-summary-panel.js';

/** The "Recently shipped" flight summary panel client — vanilla, external (keeps CSP script-src 'self'). */
export function flightSummaryJs(): string {
  return `
// finishedFlightSummaries is generated FROM shared/flight-summary.ts below
// (epic 0002 "shell decomposition", slice 1) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift from the
// server's own function; see flight-summary-parity.test.ts.
${finishedFlightSummaries.toString()}
// flightSummaryLineMeta is generated FROM web/flight-summary-panel.ts below
// (epic 0002 "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${flightSummaryLineMeta.toString()}
function flightSummarySection(c) {
  var summaries = finishedFlightSummaries(c);
  if (!summaries.length) return null;
  var wrap = el('div', 'flight-summary');
  var title = el('h2', 'detail-h', 'Recently shipped');
  title.setAttribute('data-i18n', 'flightSummaryTitle');
  wrap.appendChild(title);
  var ul = el('ul', 'flight-summary-list');
  for (var i = 0; i < summaries.length; i++) {
    var s = summaries[i];
    var meta = flightSummaryLineMeta(s, fmtCost, fmtAgo);
    var li = el('li', 'flight-summary-line');
    // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): one Tab stop per line —
    // the headline always leads, so it seeds '0' directly (no seedRoving
    // pass needed); the conditional fields after it all start at -1 and
    // wireRoving() below moves the stop with Left/Right/Home/End.
    var headlineEl = el('span', 'flight-summary-headline', s.headline);
    headlineEl.setAttribute('tabindex', '0');
    headlineEl.setAttribute('data-tip', meta.headlineTip);
    headlineEl.setAttribute('aria-label', meta.headlineAriaLabel);
    li.appendChild(headlineEl);
    var costEl = el('span', 'flight-summary-cost', meta.costText);
    costEl.setAttribute('tabindex', '-1');
    costEl.setAttribute('data-tip', meta.costTip);
    costEl.setAttribute('aria-label', meta.costAriaLabel);
    li.appendChild(costEl);
    if (meta.realCostText) {
      var realCostEl = el('span', 'flight-summary-cost', meta.realCostText);
      realCostEl.setAttribute('tabindex', '-1');
      realCostEl.setAttribute('data-tip', meta.realCostTip);
      realCostEl.setAttribute('aria-label', meta.realCostAriaLabel);
      li.appendChild(realCostEl);
    }
    if (meta.closedText) {
      var closedEl = el('span', 'flight-summary-task', meta.closedText);
      closedEl.setAttribute('tabindex', '-1');
      closedEl.setAttribute('data-tip', meta.closedTip);
      closedEl.setAttribute('aria-label', meta.closedAriaLabel);
      li.appendChild(closedEl);
    }
    var agoEl = el('span', 'flight-summary-ago muted', meta.agoText);
    agoEl.setAttribute('tabindex', '-1');
    agoEl.setAttribute('data-tip', meta.agoTip);
    agoEl.setAttribute('aria-label', meta.agoAriaLabel);
    li.appendChild(agoEl);
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}
// Shared roving-tabindex wiring (APG pattern) — wireRoving is a hoisted
// function declaration from fleetJs()'s text in the same concatenated
// bundle, the exact top-level call shape coordination.ts already relies on.
// Delegated on document, so wholesale panel re-renders keep working.
wireRoving('.flight-summary-line [tabindex]', '.flight-summary-line');
`.trim();
}
