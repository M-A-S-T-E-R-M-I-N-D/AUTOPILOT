// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's PIPELINE VIEW panel (epic 0015 D4, board
 * web-mtdc6wq3-5wuc6i) — the fetch-and-inject slice `GET /api/pipeline`'s
 * commit trail promised: the panel every prior D4 slice built
 * (`readPipelineSpans` → `spansToGraph` → `renderPipelinePanel`) finally
 * rendered somewhere an operator can SEE it. Same `web/features/` assembler
 * shape as `coordination.ts` (its return value — not its compiled source —
 * lands in the served chunk text), fetched on demand with the endpoint's own
 * defaults (fleet lens, grouped mode, layered layout — the richest honest
 * view of today's one-span-per-firing traces).
 *
 * `pipelineApiUrl` is spliced FROM `web/pipeline-panel.ts` (its real compiled
 * source via `.toString()`, never a hand-retyped copy — the same no-drift
 * contract `coordination.ts` holds with `coordinationLineMeta`), so the
 * fetch path and the server route can only move together.
 *
 * INNERHTML TRUST BOUNDARY — the one sanctioned exception to the shell's
 * "createElement + textContent, never innerHTML" rule: this panel is
 * server-rendered BY DESIGN (the whole D4 chain composes markup server-side
 * so the pure renderers stay golden-file-testable), and the injected string
 * comes exclusively from this dashboard's own same-origin, loopback-only
 * `/api/pipeline` endpoint, whose renderers (`web/pipeline-svg.ts`,
 * `web/pipeline-tree-html.ts`) HTML-escape every store-derived value. No
 * model- or user-authored text ever rides this path unescaped, and CSP
 * (script-src 'self', no unsafe-inline) blocks script/handler execution as
 * defense in depth. Model-derived text (search, ask) keeps the DOM-API rule.
 *
 * LAYOUT SWAPPABILITY — the operator's 2026-08-28 directive marks per-lens
 * layered/compact modes as acceptance, not a follow-on. `server/server.ts`'s
 * `GET /api/pipeline` validates `lens` (fleet/file), `mode` (flat/grouped)
 * and `layout` (layered/compact) query params (`PIPELINE_LENSES`,
 * `PIPELINE_MODES`, `PIPELINE_LAYOUTS`); this section is the client control
 * surface for all three. The lens switch joined LAST: it stayed
 * server-default ('fleet') while `FiringRecord.filesTouched` was never
 * populated — a Files button that always emptied the panel is not a control —
 * and became a real option once the orchestrator started recording
 * gate-passed firings' touched files (`packages/engine/src/firing.ts`), which
 * `spansToGraph`'s `lens: 'file'` projects into the file-collision graph via
 * the exporter's `autopilot.files` attribute (`read/pipeline-graph.ts`).
 * Traces recorded before that engine change carry no attribute and honestly
 * stay outside the file lens.
 * Each switch follows the theme switcher's `.switch` / `aria-pressed`
 * pattern (`features/switcher.ts`) — a `role="group"` of toggle buttons,
 * scoped to this section's own closure rather than a global click listener,
 * since (unlike the one page-wide theme switcher) a project page can mount
 * this section once per page load.
 *
 * SELECTION INTERACTION — `read/pipeline-selection.ts`'s "one selection
 * model" (`resolveSelection`/`moveTreeSelection`) had two server-rendered
 * expressions (tree `aria-selected`/roving `tabindex`, canvas
 * `data-selected`/`data-connected`) but no client wiring: a keyboard user
 * could Tab to exactly one `role="treeitem"` and never reach another, and no
 * input picked a node at all. Click and Left/Right/Up/Down on a
 * `.pipeline-item` now select — mirroring `moveTreeSelection`'s row
 * (lane)/column (item) grid semantics (`up`/`down` a lane, `left`/`right` an
 * item, clamped not wrapped) by walking the ALREADY-RENDERED
 * `.pipeline-lane`/`.pipeline-item` DOM, and restyling in place from the
 * `.pipeline-edge` `data-edge-from`/`-to` hooks already on the canvas —
 * `resolveSelection`'s own connected-neighbours computation, done locally so
 * picking a node is instant (no fetch, no re-render, no focus loss) instead
 * of round-tripping the whole panel through `/api/pipeline` on every arrow
 * key. `mode`/`layout` switches still trigger a real refetch (the graph
 * itself changes shape), which is why `state.selectedId` still rides that
 * request too — so a selection survives a mode/layout swap via the server's
 * own `resolveSelection` re-run against the new graph.
 *
 * I18N (board web-msnsndki-dz3vn1, `@autopilot/tokens`'s `strings.ts`) — the
 * title, the three switch groups' `aria-label`s, and their six button labels
 * are tagged `data-i18n`/`data-i18n-aria`: `pipelineSection()` runs
 * synchronously inside `renderProjectPage()`, before `renderFleet()`'s own
 * `translateDom()` call, so they're swept for free on first paint and again
 * on any later locale switch. `load()`'s loading/unavailable copy reads
 * `tr(key)` directly instead, since a lens/mode/layout button's own click
 * handler can re-run `load()` well outside `renderFleet()`'s sweep — the
 * same reason `features/fly.ts`'s `browseDrives`/`browseUpParent` do.
 */
import { pipelineApiUrl } from '../pipeline-panel.js';

/** The PIPELINE VIEW panel client — vanilla, external (keeps CSP script-src 'self'). */
export function pipelineJs(): string {
  return `
${pipelineApiUrl.toString()}
function pipelineSwitchGroup(cls, label, labelI18nKey, options, state, key, onChange) {
  var group = el('div', 'switch ' + cls);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  group.setAttribute('data-i18n-aria', labelI18nKey);
  var buttons = [];
  options.forEach(function (opt) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt.label;
    b.setAttribute('data-i18n', opt.i18nKey);
    b.dataset.value = opt.value;
    b.setAttribute('aria-pressed', String(opt.value === state[key]));
    b.addEventListener('click', function () {
      if (state[key] === opt.value) return;
      state[key] = opt.value;
      buttons.forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(btn.dataset.value === opt.value));
      });
      onChange();
    });
    buttons.push(b);
    group.appendChild(b);
  });
  return group;
}
function pipelineSection(pid) {
  var wrap = el('section', 'pipeline-section');
  var title = el('h3', 'pipeline-title', '🛠️ Pipeline view');
  title.setAttribute('data-i18n', 'pipelineViewTitle');
  wrap.appendChild(title);
  var state = { lens: 'fleet', mode: 'grouped', layout: 'layered', selectedId: null };
  var body = el('div', 'pipeline-body');
  function load() {
    body.replaceChildren(el('p', 'muted', tr('pipelineLoading')));
    var url = pipelineApiUrl(pid) + '&lens=' + state.lens + '&mode=' + state.mode + '&layout=' + state.layout;
    if (state.selectedId) url += '&selected=' + encodeURIComponent(state.selectedId);
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!body.isConnected) return;
        if (!data || typeof data.html !== 'string') {
          body.replaceChildren(el('p', 'muted', tr('pipelineUnavailable')));
          return;
        }
        // Same-origin server-rendered markup, escaped at the renderer — see module header.
        body.innerHTML = data.html;
      })
      .catch(function () {
        if (!body.isConnected) return;
        body.replaceChildren(el('p', 'muted', tr('pipelineUnavailable')));
      });
  }
  // Selects id by restyling the already-rendered tree + canvas in place — see the module
  // header's SELECTION INTERACTION note. No fetch: connected neighbours come from the
  // canvas's own data-edge-from/-to hooks, the same signal resolveSelection computes server-side.
  function selectNode(id) {
    if (id === state.selectedId) return;
    state.selectedId = id;
    var connected = {};
    var edges = Array.prototype.slice.call(body.querySelectorAll('.pipeline-edge'));
    for (var i = 0; i < edges.length; i++) {
      var from = edges[i].dataset.edgeFrom;
      var to = edges[i].dataset.edgeTo;
      if (from === id || to === id) {
        connected[from] = true;
        connected[to] = true;
        edges[i].setAttribute('data-connected', 'true');
      } else {
        edges[i].removeAttribute('data-connected');
      }
    }
    delete connected[id];
    var items = Array.prototype.slice.call(body.querySelectorAll('.pipeline-item'));
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var isSelected = item.dataset.nodeId === id;
      item.setAttribute('aria-selected', String(isSelected));
      item.setAttribute('tabindex', isSelected ? '0' : '-1');
      if (connected[item.dataset.nodeId]) item.setAttribute('data-connected', 'true');
      else item.removeAttribute('data-connected');
      if (isSelected) item.focus();
    }
    var nodes = Array.prototype.slice.call(body.querySelectorAll('.pipeline-node'));
    for (var k = 0; k < nodes.length; k++) {
      var node = nodes[k];
      if (node.dataset.nodeId === id) node.setAttribute('data-selected', 'true');
      else node.removeAttribute('data-selected');
      if (connected[node.dataset.nodeId]) node.setAttribute('data-connected', 'true');
      else node.removeAttribute('data-connected');
    }
  }
  // moveTreeSelection's own row(lane)/column(item) grid walk, against the rendered DOM instead
  // of buildPipelineTree's lanes — up/down move a lane at the same item index, left/right move
  // an item in the current lane, clamped at grid edges (no wrap), same as the pure model.
  function nextSelection(direction) {
    var laneEls = Array.prototype.slice.call(body.querySelectorAll('.pipeline-lane'));
    var lanes = [];
    var laneIndex = -1;
    var itemIndex = -1;
    for (var i = 0; i < laneEls.length; i++) {
      var itemEls = Array.prototype.slice.call(laneEls[i].querySelectorAll('.pipeline-item'));
      var ids = [];
      for (var j = 0; j < itemEls.length; j++) {
        ids.push(itemEls[j].dataset.nodeId);
        if (itemEls[j].dataset.nodeId === state.selectedId) {
          laneIndex = i;
          itemIndex = j;
        }
      }
      lanes.push(ids);
    }
    if (laneIndex === -1) {
      for (var l = 0; l < lanes.length; l++) {
        if (lanes[l].length > 0) return lanes[l][0];
      }
      return null;
    }
    if (direction === 'left') return lanes[laneIndex][Math.max(0, itemIndex - 1)];
    if (direction === 'right') {
      var rowItems = lanes[laneIndex];
      return rowItems[Math.min(rowItems.length - 1, itemIndex + 1)];
    }
    var targetLaneIndex = direction === 'up' ? laneIndex - 1 : laneIndex + 1;
    if (targetLaneIndex < 0 || targetLaneIndex >= lanes.length) return state.selectedId;
    var targetItems = lanes[targetLaneIndex];
    if (targetItems.length === 0) return state.selectedId;
    return targetItems[Math.min(itemIndex, targetItems.length - 1)];
  }
  body.addEventListener('click', function (e) {
    var item = e.target && e.target.closest && e.target.closest('.pipeline-item');
    if (item && item.dataset.nodeId) selectNode(item.dataset.nodeId);
  });
  body.addEventListener('keydown', function (e) {
    var item = e.target && e.target.closest && e.target.closest('.pipeline-item');
    if (!item) return;
    var dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    var direction = dirs[e.key];
    if (!direction) return;
    e.preventDefault();
    var next = nextSelection(direction);
    if (next) selectNode(next);
  });
  var controls = el('div', 'pipeline-controls');
  controls.appendChild(pipelineSwitchGroup('pipeline-lens-switch', 'Pipeline lens', 'pipelineLensLabel', [
    { value: 'fleet', label: 'Fleet', i18nKey: 'pipelineLensFleet' },
    { value: 'file', label: 'Files', i18nKey: 'pipelineLensFiles' },
  ], state, 'lens', load));
  controls.appendChild(pipelineSwitchGroup('pipeline-mode-switch', 'Pipeline node grouping', 'pipelineModeLabel', [
    { value: 'grouped', label: 'Grouped', i18nKey: 'pipelineModeGrouped' },
    { value: 'flat', label: 'Flat', i18nKey: 'pipelineModeFlat' },
  ], state, 'mode', load));
  controls.appendChild(pipelineSwitchGroup('pipeline-layout-switch', 'Pipeline canvas layout', 'pipelineLayoutLabel', [
    { value: 'layered', label: 'Layered', i18nKey: 'pipelineLayoutLayered' },
    { value: 'compact', label: 'Compact', i18nKey: 'pipelineLayoutCompact' },
  ], state, 'layout', load));
  wrap.appendChild(controls);
  wrap.appendChild(body);
  load();
  return wrap;
}
`.trim();
}
