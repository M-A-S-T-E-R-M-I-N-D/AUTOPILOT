// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's FLEET COORDINATION panel — a whole bundle-composing
 * assembler function extracted out of `shell.ts`'s `fleetJs()` into its own
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF — see `web/features/backlog.ts` for the prior extraction of this
 * exact shape). `web/shell.ts`'s `clientJs()` calls it indirectly through
 * `featureModulesJs()`, so its return value — not its compiled source — is
 * what lands in the served `/app.js` text.
 * `discoverFeatureModules('web/features')` finds this file's `coordinationJs`
 * export the same way it finds every sibling feature module's.
 *
 * BOARD web-mtbp0t8z-aftrnm ("NO VISIBLE INTER-LANE COORDINATION"): lanes
 * already coordinate via the store (leases, board claims) and git (declared
 * `.autopilot-intent` files, unlanded sibling commits) — `GET
 * /api/coordination` (`read/project-detail.ts`'s `readCoordinationState`)
 * already reuses `flight/fleet-digest.ts`'s `buildFleetDigest`, the exact
 * "who else has claimed what / what is each sibling branch touching" lines a
 * firing's own prompt carries — but nothing rendered it anywhere an operator
 * could see it. This panel IS that surface: fetched on demand, same
 * not-worth-polling-every-tick reasoning as the LANDING/ROUND/BACKLOG panels.
 * Read-only — there is no action to take from here, only visibility into who
 * holds what and who might collide with whom.
 *
 * Embedded in `renderProjectPage()` (commit c0e4ba26): the panel had been
 * deferred once already (SHELL DECOMP 2/5, web-msr0ufy0-8pht13, a standing
 * FLEET claim actively editing `shell.ts` at the time — the same "landing a
 * new section there right now would collide with that in-flight
 * restructuring" reasoning the `/api/coordination` endpoint itself was
 * deferred under, commit ca3dc12b) — that claim has since cleared, and
 * `coordinationSection(pid)` now renders right after Detected backlog.
 *
 * `coordinationLineMeta` is generated FROM `web/coordination-panel.ts` below
 * (epic 0002 "shell decomposition") — its real compiled source via
 * `.toString()`, not a hand-retyped copy. It can no longer drift apart.
 */
import { coordinationLineMeta } from '../coordination-panel.js';

/** The FLEET COORDINATION panel client — vanilla, external (keeps CSP script-src 'self'). */
export function coordinationJs(): string {
  return `
${coordinationLineMeta.toString()}
function renderCoordinationBody(body, lines) {
  body.replaceChildren();
  lines = lines || [];
  if (!lines.length) {
    body.appendChild(el('p', 'muted', 'No sibling claims or in-flight intents detected right now.'));
    return;
  }
  var ul = el('ul', 'coordination-list');
  for (var i = 0; i < lines.length; i++) {
    var meta = coordinationLineMeta(lines[i]);
    var li = el('li', 'coordination-line coordination-line-' + meta.kind);
    var textEl = el('span', null, meta.text);
    // D1 TAB-STOP ROVING (epic 0015): one Tab stop for the whole list — a
    // busy round (10+ lanes, each with a claim and an intent) would otherwise
    // cost one Tab press per line. wireRoving() below moves it.
    textEl.setAttribute('tabindex', i === 0 ? '0' : '-1');
    textEl.setAttribute('data-tip', meta.tip);
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the span's own text already gives it
    // an accessible name, so the tip rides aria-describedby into a
    // visually-hidden sibling span instead of an aria-label that would
    // restate the line and duplicate data-tip verbatim (same fix as
    // a83d8697 for the backlog panel's title span).
    var descId = 'coordination-desc-' + i;
    textEl.setAttribute('aria-describedby', descId);
    li.appendChild(textEl);
    var desc = el('span', 'sr-only', meta.tip);
    desc.id = descId;
    li.appendChild(desc);
    ul.appendChild(li);
  }
  body.appendChild(ul);
}
// Shared roving-tabindex wiring (APG pattern) — wireRoving is a hoisted
// function declaration from fleetJs()'s text in the same concatenated
// bundle, the exact top-level call shape evolution.ts's eval-trend grid
// already relies on. Delegated on document, so renderCoordinationBody's
// wholesale re-renders keep working without re-wiring.
wireRoving('.coordination-list [tabindex]', '.coordination-list');
function coordinationSection(pid) {
  var wrap = el('section', 'coordination-panel');
  wrap.appendChild(el('h3', 'coordination-title', '🤝 Fleet coordination'));
  var body = el('div', 'coordination-body');
  body.appendChild(el('p', 'muted', 'Checking for sibling claims and in-flight intents…'));
  wrap.appendChild(body);
  fetch('/api/coordination?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { lines: [] }; })
    .then(function (data) {
      if (!body.isConnected) return;
      renderCoordinationBody(body, data && data.lines);
    })
    .catch(function () {
      if (!body.isConnected) return;
      body.replaceChildren(el('p', 'muted', 'Fleet coordination unavailable.'));
    });
  return wrap;
}
`.trim();
}
