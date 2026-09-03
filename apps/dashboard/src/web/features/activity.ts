// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's Activity feed panel cluster — the phase rail
 * (`phaseRail`), its "look INTO a phase" drill-down (`phaseDetail`), the
 * files-in-flight map (`flightMap`), and the panel assembler itself
 * (`activitySection`), a whole bundle-composing region extracted out of
 * `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/release.ts` for
 * the prior cluster extraction of this shape).
 * `web/shell.ts`'s `clientJs()` calls this module indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `activityJs`
 * export the same way it already finds `release.ts`'s. This file carries
 * real relative-import splices of its own — `phaseCounts`/`phaseTipText`/
 * `phaseDetailRows`/`PHASE_DETAIL_CAP` (from `web/phase-rail.ts`),
 * `activityFileNodes`/`DEFAULT_FILE_NODE_CAP` (from
 * `shared/file-nodes.ts`), `fnodeTip` (from `web/flight-map.ts`), and
 * `activityLiveLabel` (from `web/activity-log.ts`) — now resolved relative
 * to this file instead of `shell.ts`; a function's `.toString()` output is
 * unaffected by which local name imports it under, so this remains
 * byte-for-byte the same generated text.
 * `actRow`/`actIcon` — the per-entry row renderer `phaseDetail`/
 * `activitySection` both call — stay inline in `fleetJs()` rather than
 * moving with this cluster: `actRow` is ALSO called by `firingTimelineSection`
 * (the "Per-firing trace" panel's replay/drill-down view, still inline),
 * which is the same "shared helper stays behind, the moved cluster calls it
 * as a bare hoisted identifier" shape the issue-triage cut's own
 * `decisionItemHeadMeta` relocation already established — just in the
 * opposite direction here, since the STILL-INLINE caller is the one that
 * needs the helper to stay put, not the moved one. `el`/`OFFICE_TIPS`/
 * `openPhases`/`liveFiring`/`basename` all stay inline too — broadly shared
 * (`liveFiring`/`basename` are already relied on the same way by
 * `liveWorkerCard`/`officeMapSection`/`narratorTarget`) or fleet-wide module
 * state (`openPhases`, read here and written by the `[data-phase-toggle]`
 * click handler that stays inline) — called/read by name inside these
 * functions, they hoist the same way every whole-region move in this epic
 * already relies on for `el`/`tipChip`.
 *
 * `activitySection(c)` (declared below) is called from `fleetJs()`'s
 * `activityDetailNode(c)` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text, the same reason
 * every whole-region move's own call site already relies on.
 */
import { phaseCounts, phaseTipText, phaseDetailRows, PHASE_DETAIL_CAP } from '../phase-rail.js';
import { DEFAULT_FILE_NODE_CAP, activityFileNodes } from '../../shared/file-nodes.js';
import { fnodeTip } from '../flight-map.js';
import { activityLiveLabel } from '../activity-log.js';

/** The Activity feed panel cluster client — vanilla, external (keeps CSP script-src 'self'). */
export function activityJs(): string {
  return `
// phaseCounts/phaseTipText are generated FROM web/phase-rail.ts below (epic
// 0002 "shell decomposition", slice 2) — their real compiled source via
// .toString(), not a hand-retyped copy. They can no longer drift apart.
${phaseCounts.toString()}
${phaseTipText.toString()}
function phaseRail(acts, pid) {
  var phases = ['orient', 'do', 'gate', 'commit'];
  var counts = phaseCounts(acts);
  var rail = el('div', 'phaserail');
  for (var j = 0; j < phases.length; j++) {
    // Each phase is a BUTTON: click to look INSIDE it (what did orient read?
    // which gate commands ran? what got committed?) — the operator's request.
    var seg = document.createElement('button');
    seg.type = 'button';
    seg.className = 'phase phase-' + phases[j] + (counts[phases[j]] > 0 ? ' phase-on' : '');
    seg.setAttribute('data-phase-toggle', phases[j]);
    seg.setAttribute('data-phase-pid', pid);
    seg.setAttribute('aria-expanded', String(openPhases[pid] === phases[j]));
    // "orient"/"gate"/"commit" name AUTOPILOT's own flight phases, not English
    // words a first-time operator would define the same way — reuse the same
    // OFFICE_TIPS definitions the live office map already shows for these
    // phases instead of leaving the tip to just restate the segment's own label.
    var phaseTip = phaseTipText(phases[j], counts[phases[j]], OFFICE_TIPS);
    seg.setAttribute('data-tip', phaseTip);
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the button's own text (phase name +
    // count) already gives it a concise accessible name, so the tip rides
    // aria-describedby into a visually-hidden sibling span instead of an
    // aria-label that would clobber that name and duplicate data-tip
    // verbatim (same fix as the actLabel heading below). The desc is a
    // SIBLING of the button, not a child — nested, its text would bleed
    // into the button's content-computed accessible name.
    var phaseDescId = 'phase-desc-' + pid + '-' + phases[j];
    seg.setAttribute('aria-describedby', phaseDescId);
    seg.appendChild(el('span', 'phase-name', phases[j]));
    seg.appendChild(el('span', 'phase-count', String(counts[phases[j]])));
    rail.appendChild(seg);
    var phaseDesc = el('span', 'sr-only', phaseTip);
    phaseDesc.id = phaseDescId;
    rail.appendChild(phaseDesc);
    if (j < phases.length - 1) rail.appendChild(el('span', 'phase-arrow', '›'));
  }
  return rail;
}
// phaseDetailRows/PHASE_DETAIL_CAP are generated FROM web/phase-rail.ts below
// (epic 0002 "shell decomposition", slice 2) — their real compiled source via
// .toString(), not a hand-retyped copy. They can no longer drift apart.
var PHASE_DETAIL_CAP = ${PHASE_DETAIL_CAP};
${phaseDetailRows.toString()}
// The inside of one phase: its activities, newest first, capped. This is the
// "look INTO the orient/do/gate/commit" view — real tool uses, real targets.
function phaseDetail(acts, phase) {
  var rows = phaseDetailRows(acts, phase, PHASE_DETAIL_CAP);
  var wrap = el('div', 'phase-detail phase-detail-' + phase);
  wrap.appendChild(el('h4', 'phase-detail-title', 'inside ' + phase + ' (' + rows.length + (rows.length === PHASE_DETAIL_CAP ? '+' : '') + ' recent)'));
  if (!rows.length) {
    wrap.appendChild(el('p', 'muted', 'No ' + phase + ' activity captured yet in this window.'));
    return wrap;
  }
  var ul = el('ul', 'activity phase-acts');
  for (var k = 0; k < rows.length; k++) {
    ul.appendChild(actRow(rows[k]));
  }
  // D1 TAB-STOP ROVING: one Tab stop for the whole list — see the
  // wireRoving('.activity [tabindex]', ...) registration next to actRow.
  seedRoving(ul, '[tabindex]');
  wrap.appendChild(ul);
  return wrap;
}
// activityFileNodes is generated FROM shared/file-nodes.ts below (epic 0002
// "shell decomposition", slice 1) — its real compiled source via
// .toString(), not a hand-retyped copy (nor the separate local baseName()
// this used to call). It can no longer drift from the server's own
// function; see file-nodes-parity.test.ts. Basename resolution is injected
// (flightMap below passes the sharedBasename block spliced further down,
// narrator.ts) rather than imported, same as heatmapDays/verdictOf.
var DEFAULT_FILE_NODE_CAP = ${DEFAULT_FILE_NODE_CAP};
${activityFileNodes.toString()}
// fnodeTip is generated FROM web/flight-map.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${fnodeTip.toString()}
function flightMap(acts, pid) {
  var nodes = activityFileNodes(acts, basename, 8);
  if (!nodes.length) return null;
  var frag = document.createDocumentFragment();
  var ul = el('ul', 'flightmap');
  ul.setAttribute('aria-label', 'Files in flight');
  frag.appendChild(ul);
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var li = el('li', 'fnode fnode-' + (n.phase || 'other'));
    var tip = fnodeTip(n);
    // Roving tabindex (D1 TAB-STOP ROVING): every file node gave itself its
    // own Tab stop — the same anti-pattern already fixed for the fleet-card
    // gauge, language bar, contribution heatmap, flight-log rows, task-row
    // chips, flight timeline strip, office map, and DETECTED BACKLOG rows. A
    // flight touching many files turned this map into a long keyboard trap.
    // Only the first node is now a Tab stop; wireRoving() below moves it.
    li.setAttribute('tabindex', i === 0 ? '0' : '-1');
    li.setAttribute('data-tip', tip);
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the node's own text (basename +
    // touch count) already names it concisely, so the tip rides
    // aria-describedby into a visually-hidden span instead of an aria-label
    // duplicating data-tip verbatim (same fix as the phase-rail segments
    // above). The descs sit AFTER the ul, in the fragment — a ul may only
    // hold li children, and nested inside the li the text would read back
    // as list-item content.
    var fnodeDescId = 'fnode-desc-' + pid + '-' + i;
    li.setAttribute('aria-describedby', fnodeDescId);
    li.appendChild(el('span', 'fnode-name', n.name));
    if (n.touches > 1) li.appendChild(el('span', 'fnode-count', String(n.touches)));
    ul.appendChild(li);
    var fnodeDesc = el('span', 'sr-only', tip);
    fnodeDesc.id = fnodeDescId;
    frag.appendChild(fnodeDesc);
  }
  return frag;
}
wireRoving('.flightmap .fnode', '.flightmap');
// activityLiveLabel is generated FROM web/activity-log.ts below (epic 0002
// "shell decomposition", slice 2, forty-eighth cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${activityLiveLabel.toString()}
function activitySection(c) {
  var acts = c.activity || [];
  if (!acts.length) return null;
  var wrap = el('div', 'act-wrap');
  // Honest framing (operator: "shouldn't this reset?"): the rail/feed are a
  // DEBRIEF of the last flight once nothing is live — say so instead of
  // looking like a stuck live view. Live gets a pulsing badge instead.
  var isLive = !!liveFiring(c);
  var labelMeta = activityLiveLabel(isLive);
  var actLabel = el('h4', labelMeta.className, labelMeta.text);
  actLabel.setAttribute('tabindex', '0');
  actLabel.setAttribute('data-tip', labelMeta.tip);
  // D1 ATTRIBUTE PAYLOAD (epic 0015): the heading's own text already gives it
  // an accessible name, so the tip rides aria-describedby into a
  // visually-hidden sibling span instead of an aria-label that would restate
  // the heading and duplicate data-tip verbatim (same fix as the backlog-row
  // title span). The desc is a SIBLING of the heading, not a child — nested,
  // its text would bleed back into the heading's own accessible name.
  var actDescId = 'act-label-desc-' + c.id;
  actLabel.setAttribute('aria-describedby', actDescId);
  wrap.appendChild(actLabel);
  var actDesc = el('span', 'sr-only', labelMeta.tip);
  actDesc.id = actDescId;
  wrap.appendChild(actDesc);
  wrap.appendChild(phaseRail(acts, c.id));
  if (openPhases[c.id]) wrap.appendChild(phaseDetail(acts, openPhases[c.id]));
  var map = flightMap(acts, c.id);
  if (map) wrap.appendChild(map);
  var ul = el('ul', 'activity');
  for (var i = 0; i < acts.length; i++) {
    ul.appendChild(actRow(acts[i]));
  }
  // D1 TAB-STOP ROVING: the compact feed used to add one Tab stop per tool
  // call. Only its first tip-carrying sentence is a stop now; wireRoving()
  // (registered next to actRow) moves it with Left/Right/Home/End.
  seedRoving(ul, '[tabindex]');
  wrap.appendChild(ul);
  return wrap;
}
`.trim();
}
