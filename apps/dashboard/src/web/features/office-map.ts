// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The agent office map panel — the SVG rail of ORIENT/DO/GATE/COMMIT zones
 * with the live firing rendered as a dot eased toward its current phase
 * (`officeMapSection`), its per-satellite subagent-orbit drawing
 * (`officeSatellites`), and the reduced-motion guard the tween checks
 * (`prefersReducedMotion`) — a whole bundle-composing region extracted out
 * of `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/activity.ts` for
 * the prior cluster extraction of this shape).
 * `web/shell.ts`'s `clientJs()` calls this module indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change. This is still just
 * DOM code embedded as string content inside the returned template literal,
 * the same shape every other `web/features/*.ts` file already uses — unlike
 * a real, type-checked TS function it needs no DOM lib in this package's
 * tsconfig, which is why `web/office-map.ts` itself still keeps this half
 * DOM-free (see that file's own doc comment).
 * `discoverFeatureModules('web/features')` finds this file's `officeMapJs`
 * export the same way it already finds `activity.ts`'s. This file carries
 * real relative-import splices of its own — `OFFICE_PHASES`/`OFFICE_LABELS`/
 * `OFFICE_W`/`OFFICE_H`/`OFFICE_ZONE_W`/`OFFICE_ZONE_H`/`OFFICE_ZONE_Y`/
 * `OFFICE_GAP`/`OFFICE_IDLE_X`/`OFFICE_IDLE_Y`/`OFFICE_ANIM_MS`/
 * `OFFICE_SATELLITE_R`/`OFFICE_SATELLITE_ORBIT`/`officeZoneX`/
 * `officeTargetFor`/`officeEase`/`officeSatellitePos`/`officeTweenPos`
 * (from `web/office-map.ts`) — now resolved relative to this file instead
 * of `shell.ts`; a value/function's `JSON.stringify()`/`.toString()` output
 * is unaffected by which local name imports it under, so this remains
 * byte-for-byte the same generated text. `OFFICE_TIPS` — the one constant
 * from that same module `officeMapSection` also reads — stays inline in
 * `fleetJs()` instead of moving here: it's ALSO read by `liveWorkerCard`
 * (the still-inline live-worker chip), `renderStatTiles`, and
 * `web/features/activity.ts`'s `phaseRail`, so unlike the other office
 * constants it isn't cluster-local — called by name here, it hoists the
 * same way every whole-region move in this epic already relies on for
 * `el`/`tipChip`. `el`/`liveFiring` stay inline too, broadly shared
 * (`liveFiring` is already relied on the same way by `liveWorkerCard`/
 * `activitySection`/`narratorTarget`).
 *
 * `officeMapSection(c)` (declared below) is called from `fleetJs()`'s
 * `CARD_SECTION_BUILDERS.office` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text, the same reason
 * every whole-region move's own call site already relies on.
 */
import {
  OFFICE_PHASES,
  OFFICE_LABELS,
  OFFICE_W,
  OFFICE_H,
  OFFICE_ZONE_W,
  OFFICE_ZONE_H,
  OFFICE_ZONE_Y,
  OFFICE_GAP,
  OFFICE_IDLE_X,
  OFFICE_IDLE_Y,
  OFFICE_ANIM_MS,
  OFFICE_SATELLITE_R,
  OFFICE_SATELLITE_ORBIT,
  officeZoneX as sharedOfficeZoneX,
  officeTargetFor as sharedOfficeTargetFor,
  officeEase as sharedOfficeEase,
  officeSatellitePos as sharedOfficeSatellitePos,
  officeTweenPos as sharedOfficeTweenPos,
} from '../office-map.js';

/** The agent office map panel client — vanilla, external (keeps CSP script-src 'self'). */
export function officeMapJs(): string {
  return `
// The agent office map — ORIENT/DO/GATE/COMMIT as soft zones on a rail, with
// the live firing rendered as a dot that eases toward its current phase's zone
// (parked, dimmed, when nothing is flying). A full data change rebuilds the
// whole card (see renderFleet's signature check), so the dot's last position is
// kept in officeMapPos, keyed by project id — each render starts a fresh
// requestAnimationFrame tween from THAT spot to the new target instead of
// snapping, even though the SVG element itself is brand new every time.
// OFFICE_* constants + officeZoneX/officeTargetFor/officeEase/
// officeSatellitePos/officeTweenPos are generated FROM web/office-map.ts
// below (epic 0002 "shell decomposition", slice 2) — their real
// values/compiled source via JSON.stringify()/.toString(), not a
// hand-retyped copy. They can no longer drift apart; see office-map.test.ts.
var OFFICE_PHASES = ${JSON.stringify(OFFICE_PHASES)};
var OFFICE_LABELS = ${JSON.stringify(OFFICE_LABELS)};
var OFFICE_W = ${OFFICE_W}, OFFICE_H = ${OFFICE_H};
var OFFICE_ZONE_W = ${OFFICE_ZONE_W}, OFFICE_ZONE_H = ${OFFICE_ZONE_H}, OFFICE_ZONE_Y = ${OFFICE_ZONE_Y}, OFFICE_GAP = ${OFFICE_GAP};
var OFFICE_IDLE_X = ${OFFICE_IDLE_X}, OFFICE_IDLE_Y = ${OFFICE_IDLE_Y};
var OFFICE_ANIM_MS = ${OFFICE_ANIM_MS};
var OFFICE_SATELLITE_R = ${OFFICE_SATELLITE_R}, OFFICE_SATELLITE_ORBIT = ${OFFICE_SATELLITE_ORBIT};
var officeMapPos = {}; // project id -> last {x, y} (survives full-card rebuilds)
var officeMapRaf = {}; // project id -> in-flight requestAnimationFrame id
${sharedOfficeZoneX.toString()}
${sharedOfficeTargetFor.toString()}
${sharedOfficeEase.toString()}
${sharedOfficeSatellitePos.toString()}
${sharedOfficeTweenPos.toString()}
function prefersReducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch (e) { return false; }
}
// One small orbiting circle per live subagent (Agent/Task tool call), spread
// evenly around the main dot's target — the "who else is in the room" view.
function officeSatellites(svg, NS, center, subagents) {
  var n = subagents.length;
  for (var i = 0; i < n; i++) {
    var pos = officeSatellitePos(i, n, center);
    var sat = document.createElementNS(NS, 'circle');
    sat.setAttribute('r', String(OFFICE_SATELLITE_R));
    sat.setAttribute('cx', String(pos.x));
    sat.setAttribute('cy', String(pos.y));
    sat.setAttribute('class', 'office-satellite');
    // data-tip (not a native <title>) to match the shell's shared tooltip
    // primitive — every other office-map shape (zones) already explains
    // itself on hover+focus, not hover-only.
    // Roving tabindex (D1 TAB-STOP ROVING): only the first satellite is a Tab
    // stop, not one per live subagent — the same fix already shipped for the
    // fleet-card gauge, language bar, and contribution heatmap. wireRoving()
    // below (shared helper defined in web/shell.ts, in scope here since
    // clientJs() concatenates fleetJs() before featureModulesJs()) moves it.
    sat.setAttribute('tabindex', i === 0 ? '0' : '-1');
    sat.setAttribute('role', 'img');
    sat.setAttribute('data-tip', 'Subagent — ' + subagents[i].label);
    sat.setAttribute('aria-label', 'Subagent — ' + subagents[i].label);
    svg.appendChild(sat);
  }
}
wireRoving('.office-satellite', '.office-map');
function officeMapSection(c) {
  var NS = 'http://www.w3.org/2000/svg';
  var live = liveFiring(c);
  // The office only appears when someone is IN it — an idle map is noise
  // (operator feedback: "why do I see this when nothing is running?").
  if (!live) return null;
  var target = officeTargetFor(live ? live.phase : null);
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + OFFICE_W + ' ' + OFFICE_H);
  svg.setAttribute('class', 'office-map');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Agent office map — currently ' + (live ? live.phase : 'idle'));
  for (var i = 0; i < OFFICE_PHASES.length; i++) {
    var phase = OFFICE_PHASES[i];
    var active = !!live && live.phase === phase;
    var x = officeZoneX(i);
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(OFFICE_ZONE_Y));
    rect.setAttribute('width', String(OFFICE_ZONE_W));
    rect.setAttribute('height', String(OFFICE_ZONE_H));
    rect.setAttribute('rx', '8');
    rect.setAttribute('class', 'office-zone' + (active ? ' office-zone-active' : ''));
    // Roving tabindex (D1 TAB-STOP ROVING): only the first zone is a Tab
    // stop, not one per phase — the same fix already shipped for the
    // fleet-card gauge, language bar, and contribution heatmap. wireRoving()
    // below moves it.
    rect.setAttribute('tabindex', i === 0 ? '0' : '-1');
    rect.setAttribute('role', 'img');
    rect.setAttribute('aria-label', OFFICE_TIPS[phase] + (active ? ' — current phase' : ''));
    rect.setAttribute('data-tip', OFFICE_TIPS[phase] + (active ? ' (current)' : ''));
    svg.appendChild(rect);
    var label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(x + OFFICE_ZONE_W / 2));
    label.setAttribute('y', String(OFFICE_ZONE_Y + OFFICE_ZONE_H + 12));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'office-zone-label' + (active ? ' office-zone-label-active' : ''));
    label.setAttribute('aria-hidden', 'true');
    label.textContent = OFFICE_LABELS[phase];
    svg.appendChild(label);
  }
  var from = officeMapPos[c.id] || target;
  var dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', '6');
  dot.setAttribute('cx', String(from.x));
  dot.setAttribute('cy', String(from.y));
  dot.setAttribute('class', 'office-dot' + (live ? '' : ' office-dot-idle'));
  // The dot is a sibling <circle>, not nested in the zone rect, so hovering it
  // directly missed the zone's tip (data-tip lookup is closest()-based) — every
  // other office-map shape (zones, satellites) already explains itself.
  var dotTip = 'Agent — ' + (OFFICE_TIPS[live.phase] || 'currently ' + live.phase);
  dot.setAttribute('tabindex', '0');
  dot.setAttribute('role', 'img');
  dot.setAttribute('data-tip', dotTip);
  dot.setAttribute('aria-label', dotTip);
  svg.appendChild(dot);

  if (live && live.subagents && live.subagents.length) {
    officeSatellites(svg, NS, target, live.subagents);
  }

  if (officeMapRaf[c.id]) {
    try { cancelAnimationFrame(officeMapRaf[c.id]); } catch (e) {}
    delete officeMapRaf[c.id];
  }
  if (from.x === target.x && from.y === target.y) {
    officeMapPos[c.id] = target;
  } else if (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
    dot.setAttribute('cx', String(target.x));
    dot.setAttribute('cy', String(target.y));
    officeMapPos[c.id] = target;
  } else {
    // Elapsed time is measured via Date.now(), not the rAF callback's own
    // timestamp — the two clocks can drift apart under a faked/throttled timer
    // (background tab, test harness), and Date.now() is what stays authoritative.
    var start = null;
    var step = function () {
      var now = Date.now();
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / OFFICE_ANIM_MS);
      var pos = officeTweenPos(from, target, t);
      dot.setAttribute('cx', String(pos.x));
      dot.setAttribute('cy', String(pos.y));
      officeMapPos[c.id] = pos;
      if (t < 1) officeMapRaf[c.id] = requestAnimationFrame(step);
      else delete officeMapRaf[c.id];
    };
    officeMapRaf[c.id] = requestAnimationFrame(step);
  }

  var wrap = el('div', 'office-map-wrap');
  wrap.appendChild(svg);
  return wrap;
}
wireRoving('.office-zone', '.office-map');
`.trim();
}
