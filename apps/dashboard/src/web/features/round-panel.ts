// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's CURRENT ROUND panel — a whole bundle-composing
 * assembler function extracted out of `shell.ts`'s `fleetJs()` into its own
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF — see docs/epics/0002-shell-decomposition.md, and
 * `web/features/docs-viewer.ts` for the prior extraction of this shape).
 * `web/shell.ts`'s `clientJs()` calls it indirectly through
 * `featureModulesJs()`, so its return value — not its compiled source — is
 * what lands in the served `/app.js` text; moving the function itself (not
 * splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `roundPanelJs`
 * export the same way it already finds `docs-viewer.ts`'s. Like
 * `docs-viewer.ts`, this one still carries real relative-import splices of
 * its own — `roundSinceLabel`/`roundStatItems`, embedded via `.toString()` —
 * now resolved relative to this file instead of `shell.ts`. Unlike
 * `tour.ts`/`flight-console.ts`/`docs-viewer.ts`, this panel keeps no
 * module-level state at all: every render fetches fresh and paints from the
 * response, with no `pid`-keyed map surviving between renders — an even
 * simpler case of the same "no read of `lastFleetState` or any other
 * fleet-wide mutable state `fleetJs()` owns" self-containment those cuts
 * already proved extractable.
 *
 * `roundSection(pid)` (declared below) is called from `fleetJs()`'s
 * `renderProjectPage()` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text. That works because
 * the served bundle is one concatenated non-module script (`clientJs()` =
 * `fleetJs()` + `featureModulesJs()`): `roundSection` is a hoisted `function`
 * declaration, and by the time `renderProjectPage()` actually calls it (only
 * once a project page is opened, well after the whole script has already run
 * once), every feature module's functions — this one included — are already
 * defined in the same shared top-level scope, the same way
 * `docs-viewer.ts`'s `docsSection` call site already relies on. `fmtAgo`/
 * `fmtCost`, called by name inside `renderRoundBody`, hoist the same way from
 * `fleetJs()`'s own splice of `web/format.ts`.
 *
 * i18n (board web-msnsndki-dz3vn1): this panel's own literal text (title,
 * loading/unavailable states, the "no release tags yet" fallback, and the
 * "since &lt;tag&gt;" chip's tip) is created with its English default AND a
 * `data-i18n`/`data-i18n-tip` tag, then swept by `translateDom()` (`tr`/
 * `translateDom` are bare hoisted identifiers from `web/features/locale.ts`'s
 * splice, same as `fleetJs()`'s call sites) — the panel fetches once on page
 * load, well after the page's own one-time `applyLocale()` sweep, so freshly
 * created text needs its own sweep call the same way
 * `web/features/pr-review.ts`'s `renderPrReviewPanel` needs one for its own
 * poll-built DOM. `roundSinceLabel`/`roundStatItems`'s own chip labels
 * (`web/stat-tiles.ts`) stay English-only for now — a follow-up slice, the
 * same incremental-surface-at-a-time approach `web/pr-review-panel.ts`'s own
 * module note already documents.
 */
import { roundSinceLabel, roundStatItems } from '../stat-tiles.js';

/** The CURRENT ROUND panel client — vanilla, external (keeps CSP script-src 'self'). */
export function roundPanelJs(): string {
  return `
// CURRENT ROUND (web-msntc6cx-yios2n): totals since the project's last git
// release tag — a non-destructive alternative to "Start over", which the
// section below this one actually deletes firing history to achieve. Fetched
// on demand (GET /api/round), same wasteful-on-every-tick reasoning as the
// LANDING panel above, so it is never folded into the polled /api/state.
// roundSinceLabel/roundStatItems are generated FROM web/stat-tiles.ts below
// (epic 0002 "shell decomposition", slice 2, forty-ninth cut) — their real
// compiled source via .toString(), not a hand-retyped copy. They can no
// longer drift apart.
${roundSinceLabel.toString()}
${roundStatItems.toString()}
function renderRoundBody(body, round) {
  body.replaceChildren();
  if (!round) {
    var unavailable = el('p', 'muted', 'Round totals unavailable.');
    unavailable.setAttribute('data-i18n', 'roundUnavailable');
    body.appendChild(unavailable);
    translateDom(document.documentElement.lang || 'en');
    return;
  }
  var line = el('p', 'round-line');
  var since = roundSinceLabel(round, fmtAgo);
  if (since) {
    var sinceChip = tipChip(since.text, tr('roundSinceTagTip'), since.ariaLabel, 'round-since');
    sinceChip.setAttribute('data-i18n-tip', 'roundSinceTagTip');
    line.appendChild(sinceChip);
  } else {
    var noTags = el('span', 'muted', 'No release tags yet — every firing counts toward the round so far.');
    noTags.setAttribute('data-i18n', 'roundNoTags');
    line.appendChild(noTags);
  }
  body.appendChild(line);
  var stats = el('p', 'round-stats');
  var items = roundStatItems(round, fmtCost);
  for (var i = 0; i < items.length; i++) stats.appendChild(tipChip(items[i][0], items[i][1], items[i][2]));
  body.appendChild(stats);
  translateDom(document.documentElement.lang || 'en');
}
function roundSection(pid) {
  var wrap = el('section', 'round-panel');
  var title = el('h3', 'round-title', '🔄 This round');
  title.setAttribute('data-i18n', 'roundTitle');
  wrap.appendChild(title);
  var body = el('div', 'round-body');
  var loading = el('p', 'muted', 'Loading round totals…');
  loading.setAttribute('data-i18n', 'roundLoading');
  body.appendChild(loading);
  wrap.appendChild(body);
  fetch('/api/round?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { round: null }; })
    .then(function (data) {
      if (!body.isConnected) return;
      renderRoundBody(body, data && data.round);
    })
    .catch(function () {
      if (!body.isConnected) return;
      var unavailable = el('p', 'muted', 'Round totals unavailable.');
      unavailable.setAttribute('data-i18n', 'roundUnavailable');
      body.replaceChildren(unavailable);
      translateDom(document.documentElement.lang || 'en');
    });
  translateDom(document.documentElement.lang || 'en');
  return wrap;
}
`.trim();
}
