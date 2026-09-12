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
 *
 * SELF-EXPLAINING SWITCHES (report-element-mb528l: "Pipeline view section UX
 * needs clarification") — every other interactive control on the dashboard
 * carries the shared `[data-tip]` hover/focus tooltip (`web/shell.ts`'s
 * `showTip`/`hideTip`), but the six lens/mode/layout buttons shipped with
 * only a single unexplained word each ("Fleet", "Files", "Grouped", "Flat",
 * "Layered", "Compact") — jargon an operator has no way to decode without
 * reading source. Each option in `pipelineSwitchGroup`'s `options` array now
 * carries a `tip` alongside its `label`/`i18nKey`, applied as `data-tip` on
 * the button the same way `showTip` already reads every other tip in the
 * app. English literal only for now, the same stance `features/report-menu.ts`'s
 * copy-toolkit labels took ("the i18n lane's sweep is the ritual that
 * upgrades them") — `@autopilot/tokens`'s `strings.ts` was mid-edit by a
 * fleet sibling when this slice landed, so wiring `data-i18n-tip` +
 * `STRINGS` keys for these six tips is the tracked follow-up rather than
 * this same-firing fix waiting on that file.
 */
import {
  planStepKinds,
  planApiUrl,
  planDraftKey,
  parseCommandLine,
  planStepsFromSpec,
  planSpecFromSteps,
} from '../plan-editor.js';
import {
  pipelineApiUrl,
  parseViewBox,
  zoomViewBox,
  panViewBox,
  formatViewBox,
} from '../pipeline-panel.js';

/** The PIPELINE VIEW panel client — vanilla, external (keeps CSP script-src 'self'). */
export function pipelineJs(): string {
  return `
${pipelineApiUrl.toString()}
// PLAN CANVAS camera math (epic 0021 slice 3) — generated FROM
// web/pipeline-panel.ts via .toString(), never a hand-retyped copy.
${parseViewBox.toString()}
${zoomViewBox.toString()}
${panViewBox.toString()}
${formatViewBox.toString()}
// FLIGHT PLAN EDITOR (epic 0021 slice 3, second cut) — pure half, spliced from web/plan-editor.ts.
${planStepKinds.toString()}
${planApiUrl.toString()}
${planDraftKey.toString()}
${parseCommandLine.toString()}
${planStepsFromSpec.toString()}
${planSpecFromSteps.toString()}
// PLAN CANVAS (epic 0021 slice 3, first cut): the pipeline SVG is a camera.
// Wheel or pinch zooms about the pointer, a drag on the background pans, a
// node press never pans (it selects), double-click or 0 fits, +/- and the
// arrows work from the keyboard. The camera lives in the section's state so
// the poll's re-render (body.innerHTML) keeps it; a new drawing resets it.
function wirePlanCanvas(body, state) {
  var svg = body.querySelector('svg.pipeline-canvas');
  if (!svg) return null;
  var base = parseViewBox(svg.getAttribute('viewBox'));
  if (!base) return null;
  var baseKey = base.join(' ');
  if (state.planBaseKey !== baseKey) { state.planBaseKey = baseKey; state.planViewBox = null; }
  var vb = state.planViewBox ? state.planViewBox.slice() : base.slice();
  function apply(next) {
    vb = next;
    state.planViewBox = next.slice();
    var attr = formatViewBox(next);
    if (svg.getAttribute('viewBox') !== attr) svg.setAttribute('viewBox', attr);
  }
  function box() { return svg.getBoundingClientRect(); }
  function toUnits(clientX, clientY) {
    var r = box();
    return [vb[0] + (clientX - r.left) * vb[2] / (r.width || 1), vb[1] + (clientY - r.top) * vb[3] / (r.height || 1)];
  }
  function centre() { return [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2]; }
  function zoomAt(factor, p) { apply(zoomViewBox(vb, factor, p[0], p[1], base)); }
  function dist(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }
  apply(vb);
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('aria-label', typeof tr === 'function' ? tr('planCanvasAria') : 'Plan canvas');
  svg.setAttribute('data-i18n-aria', 'planCanvasAria');
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(Math.pow(1.0015, -e.deltaY), toUnits(e.clientX, e.clientY));
  }, { passive: false });
  var pointers = {};
  var lastDist = 0;
  var dragging = false;
  var last = null;
  svg.addEventListener('pointerdown', function (e) {
    if (e.target && e.target.closest && e.target.closest('.pipeline-node')) return;
    pointers[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 1) { dragging = true; last = [e.clientX, e.clientY]; svg.classList.add('is-panning'); }
    else { lastDist = dist(pointers[ids[0]], pointers[ids[1]]); dragging = false; }
    if (typeof svg.setPointerCapture === 'function') { try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } }
  });
  svg.addEventListener('pointermove', function (e) {
    if (!(e.pointerId in pointers)) return;
    pointers[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pointers);
    if (ids.length >= 2) {
      var d = dist(pointers[ids[0]], pointers[ids[1]]);
      if (lastDist > 0 && d > 0) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        zoomAt(d / lastDist, toUnits((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
      }
      lastDist = d;
    } else if (dragging && last) {
      var r = box();
      apply(panViewBox(vb, (e.clientX - last[0]) * vb[2] / (r.width || 1), (e.clientY - last[1]) * vb[3] / (r.height || 1)));
      last = [e.clientX, e.clientY];
    }
  });
  function endPointer(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length === 0) { dragging = false; last = null; lastDist = 0; svg.classList.remove('is-panning'); }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('dblclick', function () { apply(base.slice()); });
  svg.addEventListener('keydown', function (e) {
    var step = vb[2] * 0.1;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.25, centre()); }
    else if (e.key === '-') { e.preventDefault(); zoomAt(0.8, centre()); }
    else if (e.key === '0') { e.preventDefault(); apply(base.slice()); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); apply(panViewBox(vb, step, 0)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); apply(panViewBox(vb, -step, 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); apply(panViewBox(vb, 0, step)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); apply(panViewBox(vb, 0, -step)); }
  });
  var bar = document.createElement('div');
  bar.className = 'plan-zoom';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', typeof tr === 'function' ? tr('planCanvasAria') : 'Plan canvas');
  bar.setAttribute('data-i18n-aria', 'planCanvasAria');
  [['+', 'planZoomIn', function () { zoomAt(1.25, centre()); }],
   ['−', 'planZoomOut', function () { zoomAt(0.8, centre()); }],
   ['⤢', 'planFit', function () { apply(base.slice()); }]].forEach(function (spec) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = spec[0];
    var name = typeof tr === 'function' ? tr(spec[1]) : spec[1];
    b.setAttribute('aria-label', name);
    b.setAttribute('data-i18n-aria', spec[1]);
    b.setAttribute('data-tip', name);
    b.setAttribute('data-i18n-tip', spec[1]);
    b.addEventListener('click', spec[2]);
    bar.appendChild(b);
  });
  svg.parentNode.insertBefore(bar, svg);
  return { svg: svg, viewBox: function () { return vb.slice(); } };
}
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
    b.setAttribute('data-tip', opt.tip);
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
// ---- FLIGHT PLAN EDITOR (epic 0021 slice 3, second cut) ----
// The gate pipeline as an editable chain: each step a node (typecheck →
// lint → format → test → build), the selected one editable in a properties
// pane. Edits autosave to a local DRAFT (localStorage, per project) and go
// live only on Publish — the draft-then-publish idiom every 2026 workflow
// builder converged on — so a half-typed command never reaches a landing.
// Discard returns to the published plan. Read-only wherever /api/plan is not
// served (visitors, the e2e fixtures).
function planEditorSection(pid) {
  var wrap = el('section', 'plan-editor');
  var title = el('h3', 'plan-editor-title', '✍️ Flight plan');
  title.setAttribute('data-i18n', 'planEditorTitle');
  wrap.appendChild(title);
  var body = el('div', 'plan-editor-body');
  body.appendChild(el('p', 'muted', tr('planEditorLoading')));
  wrap.appendChild(body);
  var state = { published: null, draft: null, selected: 'typecheck', note: '' };
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function dirty() { return JSON.stringify(state.draft) !== JSON.stringify(state.published); }
  function saveDraft() {
    try {
      if (dirty()) localStorage.setItem(planDraftKey(pid), JSON.stringify(state.draft));
      else localStorage.removeItem(planDraftKey(pid));
    } catch (e) { /* private mode */ }
  }
  function prop(labelKey, control) {
    var label = el('label', 'plan-prop');
    var text = el('span', null, tr(labelKey));
    text.setAttribute('data-i18n', labelKey);
    label.appendChild(text);
    label.appendChild(control);
    return label;
  }
  function render() {
    body.replaceChildren();
    var steps = planStepsFromSpec(state.draft);
    var chain = el('div', 'plan-chain');
    var selected = null;
    steps.forEach(function (s, i) {
      if (i > 0) { var arrow = el('span', 'plan-arrow', '→'); arrow.setAttribute('aria-hidden', 'true'); chain.appendChild(arrow); }
      var isSel = s.kind === state.selected;
      if (isSel) selected = s;
      var node = el('button', 'plan-step' + (s.enabled ? '' : ' plan-step-off') + (isSel ? ' plan-step-selected' : ''));
      node.type = 'button';
      node.setAttribute('data-plan-step', s.kind);
      node.setAttribute('aria-pressed', String(isSel));
      node.appendChild(el('span', 'plan-step-kind', s.kind));
      var off = el('span', 'plan-step-label', s.enabled ? s.command : tr('planEditorStepOff'));
      if (!s.enabled) off.setAttribute('data-i18n', 'planEditorStepOff');
      node.appendChild(off);
      chain.appendChild(node);
    });
    body.appendChild(chain);
    if (selected) {
      var props = el('div', 'plan-props');
      var enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = selected.enabled;
      enabled.setAttribute('data-plan-enabled', selected.kind);
      props.appendChild(prop('planEditorEnabled', enabled));
      var cmd = document.createElement('input');
      cmd.type = 'text';
      cmd.value = selected.command;
      cmd.spellcheck = false;
      cmd.disabled = !selected.enabled;
      cmd.setAttribute('data-plan-command', selected.kind);
      props.appendChild(prop('planEditorCommand', cmd));
      var lbl = document.createElement('input');
      lbl.type = 'text';
      lbl.value = selected.label;
      lbl.disabled = !selected.enabled;
      lbl.setAttribute('data-plan-label', selected.kind);
      props.appendChild(prop('planEditorLabel', lbl));
      body.appendChild(props);
    }
    var isDirty = dirty();
    var status = el('p', 'plan-status ' + (isDirty ? 'plan-status-draft' : 'plan-status-published'), state.note || tr(isDirty ? 'planEditorDraft' : 'planEditorPublished'));
    status.setAttribute('role', 'status');
    body.appendChild(status);
    var actions = el('div', 'plan-actions');
    var publish = el('button', 'plan-publish', tr('planEditorPublish'));
    publish.type = 'button';
    publish.setAttribute('data-plan-publish', '');
    publish.setAttribute('data-i18n', 'planEditorPublish');
    publish.disabled = !isDirty;
    actions.appendChild(publish);
    var discard = el('button', 'plan-discard', tr('planEditorDiscard'));
    discard.type = 'button';
    discard.setAttribute('data-plan-discard', '');
    discard.setAttribute('data-i18n', 'planEditorDiscard');
    discard.disabled = !isDirty;
    actions.appendChild(discard);
    body.appendChild(actions);
  }
  function applyEdit(kind, patch) {
    var steps = planStepsFromSpec(state.draft).map(function (s) {
      if (s.kind !== kind) return s;
      var next = { kind: s.kind, enabled: s.enabled, command: s.command, label: s.label };
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      if (next.enabled && next.command.trim().length === 0) next.command = 'pnpm run ' + kind;
      return next;
    });
    state.draft = planSpecFromSteps(steps, state.draft);
    state.note = '';
    saveDraft();
    render();
  }
  body.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-plan-step], [data-plan-publish], [data-plan-discard]') : null;
    if (!t) return;
    if (t.hasAttribute('data-plan-step')) { state.selected = t.getAttribute('data-plan-step'); render(); return; }
    if (t.hasAttribute('data-plan-discard')) { state.draft = clone(state.published); state.note = ''; saveDraft(); render(); return; }
    t.disabled = true;
    fetch('/api/plan/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: pid, spec: state.draft }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: !!(r.ok && j && j.ok), error: j && j.error }; }); })
      .then(function (res) {
        if (!body.isConnected) return;
        if (res.ok) { state.published = clone(state.draft); state.note = tr('planEditorPublishedNow'); saveDraft(); }
        else state.note = tr('planEditorPublishFailed') + (res.error ? ' — ' + res.error : '');
        render();
      })
      .catch(function () { if (!body.isConnected) return; state.note = tr('planEditorPublishFailed'); render(); });
  });
  body.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.hasAttribute('data-plan-enabled')) applyEdit(t.getAttribute('data-plan-enabled'), { enabled: !!t.checked });
    else if (t.hasAttribute('data-plan-command')) applyEdit(t.getAttribute('data-plan-command'), { command: t.value });
    else if (t.hasAttribute('data-plan-label')) applyEdit(t.getAttribute('data-plan-label'), { label: t.value });
  });
  fetch(planApiUrl(pid))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!body.isConnected) return;
      if (!data || !data.ok || !data.spec) { body.replaceChildren(el('p', 'muted', tr('planEditorUnavailable'))); return; }
      state.published = data.spec;
      state.draft = clone(data.spec);
      try {
        var saved = localStorage.getItem(planDraftKey(pid));
        if (saved) { var parsed = JSON.parse(saved); if (parsed && typeof parsed === 'object') state.draft = parsed; }
      } catch (e) { /* private mode or a stale draft */ }
      render();
    })
    .catch(function () { if (!body.isConnected) return; body.replaceChildren(el('p', 'muted', tr('planEditorUnavailable'))); });
  return wrap;
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
        wirePlanCanvas(body, state);
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
    { value: 'fleet', label: 'Fleet', i18nKey: 'pipelineLensFleet', tip: 'Every recorded trace across the fleet.' },
    { value: 'file', label: 'Files', i18nKey: 'pipelineLensFiles', tip: 'Only files touched by gate-passed firings.' },
  ], state, 'lens', load));
  controls.appendChild(pipelineSwitchGroup('pipeline-mode-switch', 'Pipeline node grouping', 'pipelineModeLabel', [
    { value: 'grouped', label: 'Grouped', i18nKey: 'pipelineModeGrouped', tip: 'Folds each trace or file into a single node.' },
    { value: 'flat', label: 'Flat', i18nKey: 'pipelineModeFlat', tip: 'One node per individual span.' },
  ], state, 'mode', load));
  controls.appendChild(pipelineSwitchGroup('pipeline-layout-switch', 'Pipeline canvas layout', 'pipelineLayoutLabel', [
    { value: 'layered', label: 'Layered', i18nKey: 'pipelineLayoutLayered', tip: 'Gives every trace its own row.' },
    { value: 'compact', label: 'Compact', i18nKey: 'pipelineLayoutCompact', tip: 'Merges connected traces and grids single-span ones.' },
  ], state, 'layout', load));
  wrap.appendChild(controls);
  wrap.appendChild(body);
  load();
  return wrap;
}
`.trim();
}
