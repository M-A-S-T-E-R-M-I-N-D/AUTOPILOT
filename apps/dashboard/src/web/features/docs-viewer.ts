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
// docFileTip is generated FROM web/docs-panel.ts below (epic 0002 "shell
// decomposition", slice 2) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${docFileTip.toString()}
function docsSection(pid) {
  var wrap = el('section', 'docs-panel');
  var head = el('h3', 'docs-title', '📚 Docs');
  wrap.appendChild(head);
  var list = el('ul', 'docs-list');
  list.setAttribute('data-docs-list', pid);
  wrap.appendChild(list);
  var viewer = el('div', 'docs-viewer');
  viewer.setAttribute('data-docs-viewer', pid);
  wrap.appendChild(viewer);
  fetch('/api/docs?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { files: [] }; })
    .then(function (data) {
      // The panel may have been re-rendered (SSE tick / UI toggle) while this
      // request was in flight — appending into a detached node is a stale
      // paint at best and a DOM error at worst. Bail if we're orphaned.
      if (!list.isConnected) return;
      var files = data.files || [];
      if (!files.length) {
        list.appendChild(el('li', 'muted', 'No indexed documents yet.'));
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
      if (openDoc[pid]) loadDoc(pid, openDoc[pid], viewer);
    })
    .catch(function () { list.appendChild(el('li', 'muted', 'Docs unavailable.')); });
  return wrap;
}
function loadDoc(pid, path, viewer) {
  viewer.replaceChildren(el('p', 'muted', 'Loading ' + path + '…'));
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
    })
    .catch(function () { viewer.replaceChildren(el('p', 'muted', 'Could not load ' + path + '.')); });
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
