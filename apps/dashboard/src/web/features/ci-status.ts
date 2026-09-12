// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The dashboard's CI-health panel (board web-mtq70abw-opouz8): a small,
 * read-only stat tile consuming `GET /api/ci-status` (`control/ci-status.ts`
 * + `server/ci-status-route.ts`), so the per-workflow `gh run list` report
 * `dashboard ci-status` already prints is visible in the browser too — no
 * retry/cancel/re-dispatch action, surfacing what needs a look is the whole
 * job, same stance as the CLI report and `flight/publicity.ts`'s panel.
 * `discoverFeatureModules('web/features')` finds this file's `ciStatusJs`
 * export the same way it finds `foundation.ts`'s. Independent of any flown
 * project — CI health is a fact about THIS repo, not a stored one — so it
 * self-initializes on its own poll timer matching the server's cache TTL
 * (`CI_STATUS_CACHE_TTL_MS`) rather than riding the per-project SSE state,
 * the same shape `pool-client.ts` uses. Stays hidden entirely while the
 * report is empty (no `.github/workflows` files, or `gh` unavailable and
 * returning zero entries) — an install with nothing to show gets no panel,
 * not an empty shell.
 *
 * i18n (board web-msnsndki-dz3vn1): the title is an `el()`-built `<h3>` the
 * `pnpm i18n:untagged` regex scanner cannot see, tagged `data-i18n=
 * "ciStatusTitle"` like `pool-client.ts`'s `poolTitle`; the section's
 * `aria-label` carries `data-i18n-aria="ciStatusPanel"`. Both keys exist in
 * `packages/tokens/src/strings.ts` for every locale. Each workflow's own
 * detail text (`w.detail`, e.g. "success (1h ago)") comes straight from `gh`
 * via the server and stays in English — the same un-translated shape the
 * CLI report `docs/RUNBOOK.md` documents already has.
 */

/** The CI-health panel client — vanilla, external (keeps CSP script-src 'self'). */
export function ciStatusJs(): string {
  return `
// CI-health panel (board web-mtq70abw-opouz8): GET /api/ci-status browses
// the latest gh run per workflow file, read-only. Polls on its own timer
// (matching the server's cache TTL) rather than the per-project SSE state —
// independent of any flown project, same as the Pool panel above — and
// stays hidden entirely when the report is empty.
var CI_STATUS_POLL_MS = 60000;
function renderCiStatusPanel(workflows) {
  var section = document.getElementById('ci-status-panel');
  if (!section) return;
  workflows = workflows || [];
  section.replaceChildren();
  // Guarded write: assigning the same boolean still queues a MutationObserver
  // record, and this runs every poll tick — an idempotent tick must mutate
  // nothing (cockpit epic 0015, D2 dedup).
  var ciPanelHidden = workflows.length === 0;
  if (section.hidden !== ciPanelHidden) section.hidden = ciPanelHidden;
  if (ciPanelHidden) return;
  var title = el('h3', 'ci-status-title', '⚙️ CI status');
  title.setAttribute('data-i18n', 'ciStatusTitle');
  section.appendChild(title);
  var list = el('div', 'ci-status-list');
  for (var i = 0; i < workflows.length; i++) {
    var w = workflows[i];
    var badgeClass = 'ci-status-badge-' + (w.ok ? 'ok' : 'fail');
    list.appendChild(tipChip(w.workflow, w.detail, w.workflow + ': ' + w.detail, badgeClass));
  }
  section.appendChild(list);
  // This panel rebuilds on its own poll (CI_STATUS_POLL_MS above), not the
  // fleet stream's tick, so it needs the same fix renderPoolClientPanel()/
  // renderFleet() apply: a data-i18n element built after the page's one-time
  // applyLocale() call would otherwise render in English regardless of the
  // active locale (board web-msnsndki-dz3vn1).
  translateDom(document.documentElement.lang || 'en');
}
function loadCiStatusPanel() {
  fetch('/api/ci-status', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : { workflows: [] }; })
    .then(function (data) { renderCiStatusPanel(data && data.workflows); })
    .catch(function () {});
}
loadCiStatusPanel();
setInterval(loadCiStatusPanel, CI_STATUS_POLL_MS);
`.trim();
}
