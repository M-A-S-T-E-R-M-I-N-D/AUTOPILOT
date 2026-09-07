// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's Docs reader panel — a whole bundle-composing assembler
 * function extracted out of `shell.ts`'s `fleetJs()` into its own file under
 * `web/features/` (epic 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/flight-console.ts`
 * for the prior extraction of this shape). `web/shell.ts`'s `clientJs()`
 * calls it indirectly through `featureModulesJs()`, so its return value — not
 * its compiled source — is what lands in the served `/app.js` text; moving
 * the function itself (not splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `docsViewerJs`
 * export the same way it already finds `flight-console.ts`'s. Like
 * `flight-console.ts`, this one still carries a real relative-import splice
 * of its own — `docFileTip`, embedded via `.toString()` — now resolved
 * relative to this file instead of `shell.ts`.
 *
 * `docsSection(pid)` (declared below) is called from `fleetJs()`'s
 * `renderProjectPage()` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text. That works because
 * the served bundle is one concatenated non-module script (`clientJs()` =
 * `fleetJs()` + `featureModulesJs()`): `docsSection` is a hoisted `function`
 * declaration, and by the time `renderProjectPage()` actually calls it (only
 * once a project page is opened, well after the whole script has already run
 * once), every feature module's functions — this one included — are already
 * defined in the same shared top-level scope, the same way
 * `flight-console.ts`'s `flightConsoleSection` call site already relies on.
 * The module-level click delegate that opens a doc (`[data-doc-open]`) moves
 * along with it — the same "whole region, not just its own top-level" move
 * `tour.ts`'s masthead `#tour-btn` click delegate already proved — since it
 * reads/writes `openDoc` and calls `loadDoc`, both declared here.
 *
 * `docsSection(pid)` is called on every `renderProjectPage()` tick (epic
 * 0018 "calm cockpit" slice 1, docs/epics/0018-calm-cockpit.md) — that
 * function rebuilds the whole project page whenever the live-state signature
 * changes, so without `docsPanelCache` this panel's wrap/list/viewer nodes
 * would be discarded and recreated from scratch on every tick, resetting the
 * viewer's scroll position and re-fetching the open doc mid-read. Caching
 * the mounted nodes per project id lets `renderProjectPage()`'s own
 * `replaceChildren()` + `appendChild()` cycle just reattach the same nodes.
 *
 * i18n (board web-msnsndki-dz3vn1): this panel's own literal text — the
 * "📚 Docs" title (created once, the first time a project's panel mounts)
 * and the empty/fetch-failure states inside `refreshDocsList` (rebuilt on
 * every list refresh, cached panel or not) — carries its English default AND
 * a `data-i18n` tag, then is swept by `translateDom()` (a bare hoisted
 * identifier from `web/features/locale.ts`'s splice, same as `fleetJs()`'s
 * call sites), the exact shape `web/features/round-panel.ts` already
 * follows.
 */
import { docFileTip } from '../docs-panel.js';

/** The Docs reader panel client — vanilla, external (keeps CSP script-src 'self'). */
export function docsViewerJs(): string {
  return `
// The Docs reader (completes checkpoint 0264f5d's unit): list the project's
// indexed documents (README, LICENSE, docs/*) and render the chosen one through
// the same DOM-only Markdown engine the ask answer uses. Content comes from the
// search INDEX (never the filesystem) — root-jailed by construction.
var openDoc = {}; // project id -> currently open doc path (survives SSE re-renders)
// docsPanelCache holds the mounted wrap/list/viewer nodes per project (epic
// 0018 "calm cockpit", STABILITY LAW "the reader is sacred"). shell.ts's
// renderProjectPage() tears down and rebuilds the whole project page on
// every live-state tick; without this cache docsSection(pid) would hand back
// brand-new, empty nodes each time, wiping the viewer's scroll position and
// re-triggering a "Loading…" flash + refetch of a doc the reader never asked
// to reload. Reusing the same nodes means shell.ts's replaceChildren()+
// appendChild() cycle just reattaches them, scroll and content intact.
var docsPanelCache = {}; // project id -> { wrap, list, viewer }
// docFileTip is generated FROM web/docs-panel.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${docFileTip.toString()}
function docsSection(pid) {
  var cached = docsPanelCache[pid];
  if (cached) {
    refreshDocsList(pid, cached.list, cached.viewer);
    return cached.wrap;
  }
  var wrap = el('section', 'docs-panel');
  var head = el('h3', 'docs-title', '📚 Docs');
  head.setAttribute('data-i18n', 'docsTitle');
  wrap.appendChild(head);
  var list = el('ul', 'docs-list');
  list.setAttribute('data-docs-list', pid);
  wrap.appendChild(list);
  var viewer = el('div', 'docs-viewer');
  viewer.setAttribute('data-docs-viewer', pid);
  wrap.appendChild(viewer);
  docsPanelCache[pid] = { wrap: wrap, list: list, viewer: viewer };
  translateDom(document.documentElement.lang || 'en');
  refreshDocsList(pid, list, viewer);
  return wrap;
}
function refreshDocsList(pid, list, viewer) {
  fetch('/api/docs?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { files: [] }; })
    .then(function (data) {
      // The panel may have been re-rendered (SSE tick / UI toggle) while this
      // request was in flight — appending into a detached node is a stale
      // paint at best and a DOM error at worst. Bail if we're orphaned.
      if (!list.isConnected) return;
      list.replaceChildren(); // re-mounted panel already has the last tick's entries
      var files = data.files || [];
      if (!files.length) {
        var empty = el('li', 'muted', 'No indexed documents yet.');
        empty.setAttribute('data-i18n', 'docsEmpty');
        list.appendChild(empty);
        translateDom(document.documentElement.lang || 'en');
        return;
      }
      for (var i = 0; i < files.length; i++) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        var isOpenDoc = openDoc[pid] === files[i];
        btn.type = 'button';
        btn.className = 'docs-file' + (isOpenDoc ? ' on' : '');
        btn.textContent = files[i];
        btn.setAttribute('data-doc-open', files[i]);
        btn.setAttribute('data-doc-pid', pid);
        btn.setAttribute('aria-pressed', String(isOpenDoc));
        var docTip = docFileTip(files[i], isOpenDoc);
        btn.setAttribute('data-tip', docTip);
        // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): no
        // aria-label duplicating the tip — the button's own text (the
        // filename) already gives it an accessible name; the "Open …"/
        // "Currently viewing …" sentence rides aria-describedby into a
        // visually-hidden sibling span instead (same fix as the
        // SOUL-unreviewed badge and the flight-log headline).
        var docDescId = 'docs-file-desc-' + pid + '-' + i;
        btn.setAttribute('aria-describedby', docDescId);
        li.appendChild(btn);
        var docDesc = el('span', 'sr-only', docTip);
        docDesc.id = docDescId;
        li.appendChild(docDesc);
        list.appendChild(li);
      }
      // The reader is sacred (epic 0018): only (re)load the open doc when
      // it isn't already the one sitting in the viewer — reloading an
      // unchanged doc on every tick is exactly the flash-and-scroll-reset
      // this cache exists to stop.
      if (openDoc[pid] && viewer.dataset.loadedPath !== openDoc[pid]) loadDoc(pid, openDoc[pid], viewer);
    })
    .catch(function () {
      if (!list.isConnected) return;
      list.replaceChildren();
      var unavailable = el('li', 'muted', 'Docs unavailable.');
      unavailable.setAttribute('data-i18n', 'docsUnavailable');
      list.appendChild(unavailable);
      translateDom(document.documentElement.lang || 'en');
    });
}
function loadDoc(pid, path, viewer) {
  viewer.replaceChildren(el('p', 'muted', 'Loading ' + path + '…'));
  viewer.dataset.loadedPath = '';
  fetch('/api/file?project=' + encodeURIComponent(pid) + '&path=' + encodeURIComponent(path))
    .then(function (r) { if (!r.ok) throw new Error('nope'); return r.json(); })
    .then(function (data) {
      if (!viewer.isConnected) return; // re-rendered while loading — stale paint
      viewer.replaceChildren();
      viewer.appendChild(el('h4', 'docs-viewer-path', data.path));
      var body = el('div', 'docs-viewer-body');
      if (/\\.md$/i.test(data.path)) renderMarkdown(body, data.content);
      else { var pre = document.createElement('pre'); pre.appendChild(el('code', null, data.content)); body.appendChild(pre); }
      viewer.appendChild(body);
      viewer.dataset.loadedPath = path;
    })
    .catch(function () {
      viewer.replaceChildren(el('p', 'muted', 'Could not load ' + path + '.'));
      viewer.dataset.loadedPath = '';
    });
}
// Docs reader (event-delegated): open an indexed document in the viewer.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-doc-open]');
  if (!b) return;
  var pid = b.getAttribute('data-doc-pid');
  var path = b.getAttribute('data-doc-open');
  openDoc[pid] = path;
  var listEl = document.querySelector('[data-docs-list="' + pid + '"]');
  if (listEl) {
    var btns = listEl.querySelectorAll('[data-doc-open]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i] === b;
      btns[i].className = 'docs-file' + (on ? ' on' : '');
      btns[i].setAttribute('aria-pressed', String(on));
    }
  }
  var viewer = document.querySelector('[data-docs-viewer="' + pid + '"]');
  if (viewer) loadDoc(pid, path, viewer);
});
`.trim();
}
