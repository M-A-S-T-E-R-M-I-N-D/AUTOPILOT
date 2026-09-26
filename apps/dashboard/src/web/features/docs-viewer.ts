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
 * "Docs" title (created once, the first time a project's panel mounts, epic
 * 0025 slice 2: a `panelHeading()`-built `book-open` icon beside the label,
 * the emoji it replaced) and the empty/fetch-failure states inside
 * `refreshDocsList` (rebuilt on every list refresh, cached panel or not) —
 * carries its English default AND a `data-i18n` tag, then is swept by
 * `translateDom()` (a bare hoisted identifier from `web/features/locale.ts`'s
 * splice, same as `fleetJs()`'s call sites), the exact shape
 * `web/features/round-panel.ts` already follows.
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
// docsRawContent holds the last-loaded RAW markdown text per project (epic
// 0023 "the docs reader" slice 3, the editor): the read view only ever gets
// the rendered DOM, so the editor needs its own copy of the source text to
// seed the textarea without a second fetch.
var docsRawContent = {};
// docsPanelCache holds the mounted wrap/list/viewer nodes per project (epic
// 0018 "calm cockpit", STABILITY LAW "the reader is sacred"). shell.ts's
// renderProjectPage() tears down and rebuilds the whole project page on
// every live-state tick; without this cache docsSection(pid) would hand back
// brand-new, empty nodes each time, wiping the viewer's scroll position and
// re-triggering a "Loading…" flash + refetch of a doc the reader never asked
// to reload. Reusing the same nodes means shell.ts's replaceChildren()+
// appendChild() cycle just reattaches them, scroll and content intact.
var docsPanelCache = {}; // project id -> { wrap, list, viewer }
// STANDING explainer (board ap-mtu6l8ct-3, CONTRIBUTOR JOURNEY slice 4/4):
// renders CONTRIBUTOR-STANDING.md's tiers table in-app instead of leaving it
// undiscoverable in the alphabetical doc list. Reuses the SAME fetch+
// renderMarkdown pipeline as every other doc (zero drift risk — the tiers
// table lives in exactly one place), so this is only a pin-to-top + friendlier
// label, not a rebuilt viewer. Not every flown project ships this file —
// refreshDocsList only pins it when the indexed list actually contains it, so
// a project without one gets the unchanged plain list, never a dead entry.
var STANDING_DOC_PATH = '.github/CONTRIBUTOR-STANDING.md';
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
  var head = panelHeading('h3', 'docs-title', 'docsTitle', 'book-open');
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
      // Pin the Standing explainer to the top instead of wherever it falls
      // alphabetically — same file, reordered, never duplicated.
      var standingIdx = files.indexOf(STANDING_DOC_PATH);
      if (standingIdx > 0) {
        files = files.slice();
        files.splice(standingIdx, 1);
        files.unshift(STANDING_DOC_PATH);
      }
      for (var i = 0; i < files.length; i++) {
        var isStanding = files[i] === STANDING_DOC_PATH;
        // Superseded records (epic 0023 slice 5 "hygiene"): the 2026-09-12
        // audit (commit 4d50c153) already moved these under docs/archive/
        // and gave them their own index, but the reader's list still showed
        // them exactly like current doctrine — "the tree the reader shows"
        // was not yet "the tree we mean".
        var isArchived = files[i].indexOf('docs/archive/') === 0;
        var li = document.createElement('li');
        var btn = document.createElement('button');
        var isOpenDoc = openDoc[pid] === files[i];
        btn.type = 'button';
        btn.className =
          'docs-file' +
          (isOpenDoc ? ' on' : '') +
          (isStanding ? ' docs-file-pinned' : '') +
          (isArchived ? ' docs-file-archived' : '');
        // English-only label for now, deliberately: packages/tokens/src/
        // strings.ts is a hot shared file with another fleet lane's unlanded
        // work on it as of this slice (epic 0021 hit the identical
        // collision) — tagging data-i18n here waits for a firing where that
        // file is clear, not a gap in this one.
        //
        // The row is two spans, not one raw path (operator-reported
        // 2026-09-17: the docs view reads strangely). A flat list of full
        // repo-relative paths at chip size is a wall of near-identical
        // prefixes — docs/epics/ repeated twenty times — with the one word
        // that identifies each document buried at the end. Split at the last
        // separator so the stylesheet can feed the directory to the ellipsis
        // and keep the basename, the same idiom the pipeline tree uses. The
        // concatenated text is still exactly the path, so the button's
        // accessible name is unchanged.
        if (isStanding) {
          // The pinned explainer keeps its friendly name — and loses the
          // emoji it carried, which epic 0025 is removing everywhere. Its
          // accent comes from .docs-file-pinned now, not from a glyph.
          btn.appendChild(el('span', 'docs-file-name', 'Contributor Standing'));
        } else {
          var cut = files[i].lastIndexOf('/');
          if (cut >= 0) btn.appendChild(el('span', 'docs-file-dir', files[i].slice(0, cut + 1)));
          btn.appendChild(el('span', 'docs-file-name', files[i].slice(cut + 1)));
        }
        // The badge is real button content — not an aria-only aside — so a
        // sighted reader sees it and a screen reader picks it up as part of
        // the button's own accessible name, with zero extra wiring.
        if (isArchived) btn.appendChild(el('span', 'docs-file-archived-badge', 'Archived'));
        btn.setAttribute('data-doc-open', files[i]);
        btn.setAttribute('data-doc-pid', pid);
        btn.setAttribute('aria-pressed', String(isOpenDoc));
        var docTip =
          docFileTip(files[i], isOpenDoc) + (isArchived ? ' — archived, kept for citations' : '');
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
      // this cache exists to stop. When it IS already loaded, epic 0023
      // slice 4 still wants to know whether the file changed on disk since —
      // that check runs quietly instead of a full reload.
      if (openDoc[pid] && viewer.dataset.loadedPath !== openDoc[pid]) {
        loadDoc(pid, openDoc[pid], viewer);
      } else if (openDoc[pid]) {
        checkDocLive(pid, openDoc[pid], viewer);
      }
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
// Table of contents (epic 0023 "the docs reader" slice 2, "Findable... a
// table of contents per page"): every ATX heading in the RAW markdown text,
// in document order, linking through the exact same data-doc-anchor
// mechanism the parity slice's in-document links already use — so clicking
// an entry scrolls this body to renderMarkdown's own doc-prefixed heading id
// with zero new plumbing. headingOf/headingSlug are hoisted, bare, from
// search.ts's splice (chunks.ts's verified docs-viewer to search edge, the
// same one renderMarkdown itself already relies on: search is CORE,
// docs-viewer is a project-page chunk, and core always finishes executing
// before any deferred chunk starts). A single-heading doc gets no ToC — a
// list whose only entry points at the page's own title says nothing.
function buildToc(content) {
  var lines = content.split('\\n');
  var headings = [];
  for (var i = 0; i < lines.length; i++) {
    var h = headingOf(lines[i]);
    if (h) headings.push(h);
  }
  if (headings.length < 2) return null;
  var nav = el('nav', 'docs-toc');
  nav.setAttribute('aria-label', 'Table of contents');
  var list = el('ul', 'docs-toc-list');
  for (var j = 0; j < headings.length; j++) {
    var li = document.createElement('li');
    li.className = 'docs-toc-h' + headings[j].level;
    var a = document.createElement('a');
    a.href = '#';
    a.className = 'docs-toc-link';
    a.setAttribute('data-doc-anchor', headingSlug(headings[j].text));
    a.textContent = headings[j].text;
    li.appendChild(a);
    list.appendChild(li);
  }
  nav.appendChild(list);
  return nav;
}
// "What links here" (epic 0023 "the docs reader" slice 2, "Findable... a
// 'what links here' list from the link census"): every OTHER indexed doc the
// server found linking to this one (project-detail.ts's docLinksHere), each
// entry wired through the SAME data-doc-open attribute (and the module-level
// click delegate below) the docs list buttons and in-body doc links already
// use — opening a backlink is just opening a doc, zero new plumbing. No
// entries (or a server that never supplied the dep) paints nothing, same as
// buildToc's null-return-skips-the-nav contract.
function buildLinksHere(pid, linksHere) {
  if (!linksHere || !linksHere.length) return null;
  var nav = el('nav', 'docs-linkshere');
  nav.setAttribute('aria-label', 'What links here');
  nav.appendChild(el('p', 'docs-linkshere-heading', 'What links here'));
  var list = el('ul', 'docs-linkshere-list');
  for (var i = 0; i < linksHere.length; i++) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#';
    a.className = 'docs-linkshere-link';
    a.textContent = linksHere[i];
    a.setAttribute('data-doc-open', linksHere[i]);
    a.setAttribute('data-doc-pid', pid);
    li.appendChild(a);
    list.appendChild(li);
  }
  nav.appendChild(list);
  return nav;
}
// Paints each rendered doc/anchor link inside body whose resolved target
// (data-doc-open, set by renderMarkdown/classifyHref) is in brokenLinks — the
// server-checked "not in the project's index" census (epic 0023 slice 1).
// English-only for now, deliberately: packages/tokens/src/strings.ts is a hot
// shared file another fleet lane may still be mid-edit on, same reason the
// docs list labels above stay untagged until a firing finds it clear.
function markDeadDocLinks(body, brokenLinks) {
  if (!brokenLinks || !brokenLinks.length) return;
  var dead = {};
  for (var i = 0; i < brokenLinks.length; i++) dead[brokenLinks[i]] = true;
  var links = body.querySelectorAll('[data-doc-open]');
  for (var j = 0; j < links.length; j++) {
    var link = links[j];
    if (!dead[link.getAttribute('data-doc-open')]) continue;
    link.classList.add('docs-link-dead');
    link.setAttribute('data-tip', 'Broken link — target not found in the index');
    link.appendChild(el('span', 'sr-only', ' (broken link)'));
  }
}
function loadDoc(pid, path, viewer) {
  viewer.replaceChildren(el('p', 'muted', 'Loading ' + path + '…'));
  viewer.dataset.loadedPath = '';
  fetch('/api/file?project=' + encodeURIComponent(pid) + '&path=' + encodeURIComponent(path))
    .then(function (r) { if (!r.ok) throw new Error('nope'); return r.json(); })
    .then(function (data) {
      if (!viewer.isConnected) return; // re-rendered while loading — stale paint
      paintDoc(pid, viewer, data);
    })
    .catch(function () {
      viewer.replaceChildren(el('p', 'muted', 'Could not load ' + path + '.'));
      viewer.dataset.loadedPath = '';
    });
}
// Paints a /api/file response into viewer from scratch — split out of loadDoc
// (epic 0023 "the docs reader" slice 4) so checkDocLive below can repaint an
// already-open doc without loadDoc's own "Loading…" placeholder flash, which
// would be exactly the disruption epic law #1 ("Live") rules out.
function paintDoc(pid, viewer, data) {
  viewer.replaceChildren();
  var isMd = /\\.md$/i.test(data.path);
  docsRawContent[pid] = data.content;
  var headRow = el('div', 'docs-viewer-headrow');
  headRow.appendChild(el('h4', 'docs-viewer-path', data.path));
  // The split-preview editor (epic 0023 "the docs reader" slice 3): only
  // offered for Markdown — the split preview IS a Markdown feature, and
  // every writable root (docs/, README.md, CHANGELOG.md) is Markdown.
  // The server's allow-list (flight/docs-write.ts) is the real gate; a
  // save attempt outside it still refuses with a readable reason.
  if (isMd) headRow.appendChild(buildEditToggle(pid, data.path));
  viewer.appendChild(headRow);
  // Freshness (epic 0023 "the docs reader" slice 1): the doc's last real
  // commit, reused from flight/doc-freshness.ts's gitLastTouchedAt —
  // never a guess, and absent entirely for an untracked path or a
  // project whose root can't be resolved (server degrades to null).
  if (data.touchedAt) {
    var freshness = el('p', 'docs-viewer-freshness');
    var freshTime = document.createElement('time');
    var freshIso = new Date(data.touchedAt).toISOString();
    freshTime.setAttribute('datetime', freshIso);
    freshTime.textContent = freshIso.slice(0, 10);
    freshness.appendChild(document.createTextNode('Last updated '));
    freshness.appendChild(freshTime);
    viewer.appendChild(freshness);
  }
  var readView = el('div', 'docs-viewer-readview');
  var body = el('div', 'docs-viewer-body');
  // The viewer hands the renderer its project and this document's path,
  // so a relative link opens the linked document HERE and an in-document
  // link scrolls within this body (the parity slice, 2026-09-18).
  if (isMd) {
    renderMarkdown(body, data.content, { pid: pid, basePath: data.path });
    var toc = buildToc(data.content);
    if (toc) body.insertBefore(toc, body.firstChild);
  } else { var pre = document.createElement('pre'); pre.appendChild(el('code', null, data.content)); body.appendChild(pre); }
  readView.appendChild(body);
  // Dead-link census (epic 0023 "the docs reader" slice 1: "every
  // internal link is checked as it renders"): the server already
  // resolved and checked every local link against the project's index —
  // paint the ones it found dead, matched by the same resolved path
  // renderMarkdown put in each doc link's data-doc-open.
  markDeadDocLinks(body, data.brokenLinks);
  // "What links here" (epic 0023 "the docs reader" slice 2): rendered
  // after the body, same as a wiki's backlinks footer — it answers "what
  // else references this" only once the reader has read the page itself.
  var linksHere = buildLinksHere(pid, data.linksHere);
  if (linksHere) readView.appendChild(linksHere);
  viewer.appendChild(readView);
  viewer.dataset.loadedPath = data.path;
}
// Live re-render on disk change (epic 0023 "the docs reader" slice 4, law
// #1 "Live": "the page re-renders as the file changes on disk... through the
// same SSE tick the rest of the cockpit uses; a changed page keeps the
// reader's scroll position and marks the diff for a few seconds"). Called
// from refreshDocsList's own per-tick pass whenever the open doc is already
// the one loaded (the ONLY case that used to do nothing): re-fetches it and
// repaints only if the content actually differs, restoring scroll and
// flashing the change rather than a silent identical repaint.
// Skipped while the editor is open — overwriting a textarea mid-draft with
// the server's own copy would silently discard the operator's unsaved edit.
function checkDocLive(pid, path, viewer) {
  if (viewer.querySelector('.docs-editor')) return;
  fetch('/api/file?project=' + encodeURIComponent(pid) + '&path=' + encodeURIComponent(path))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      // The panel may have moved on (doc closed, another opened, re-mounted)
      // while this request was in flight — never paint over a stale target.
      if (!data || !viewer.isConnected || viewer.dataset.loadedPath !== path) return;
      if (data.content === docsRawContent[pid]) return; // unchanged — nothing to do
      var oldBody = viewer.querySelector('.docs-viewer-body');
      var scrollTop = oldBody ? oldBody.scrollTop : 0;
      paintDoc(pid, viewer, data);
      var newBody = viewer.querySelector('.docs-viewer-body');
      if (!newBody) return;
      newBody.scrollTop = scrollTop;
      flashDocChanged(newBody);
    })
    .catch(function () {}); // a transient failure just skips this tick's check
}
// The diff highlight (epic 0023 slice 4 design direction: "the diff
// highlight fades on the compositor; nothing else moves"): an absolutely
// positioned overlay that fades its own opacity via a CSS animation. The
// setTimeout is a reduced-motion fallback — layout-css.ts's global
// prefers-reduced-motion block strips the animation entirely, which would
// otherwise leave this overlay dimming the doc forever with no animationend
// to clean it up.
function flashDocChanged(body) {
  var flash = el('div', 'docs-viewer-diff-flash');
  body.insertBefore(flash, body.firstChild);
  var remove = function () { if (flash.parentNode) flash.remove(); };
  flash.addEventListener('animationend', remove);
  setTimeout(remove, 2200);
}
// The split-preview editor (epic 0023 "the docs reader" slice 3, board
// web-mtywp7to-rbebh4): the guarded POST /api/docs/write endpoint
// (docs/write.ts + flight/docs-write.ts) landed with no caller — this is
// that caller. buildEditToggle is the pencil-icon button loadDoc plants
// beside the path heading; the editor itself is built lazily on first click
// (buildDocsEditor) rather than kept mounted for every doc, since most reads
// never open it.
function buildEditToggle(pid, path) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'docs-viewer-edit-btn';
  btn.setAttribute('data-doc-edit-toggle', '');
  btn.setAttribute('data-doc-edit-pid', pid);
  btn.setAttribute('aria-pressed', 'false');
  btn.appendChild(iconEl('pencil'));
  var label = el('span', null, tr('docsEditToggle'));
  label.setAttribute('data-i18n', 'docsEditToggle');
  btn.appendChild(label);
  btn.setAttribute('aria-label', tr('docsEditToggle') + ': ' + path);
  return btn;
}
// Re-renders the editor's live preview through the SAME renderMarkdown
// pipeline the read view uses (the epic's own law: "one Markdown pipeline
// for both, never two renderers that drift") — replaceChildren first since
// renderMarkdown only ever appends, never clears.
function updateEditorPreview(pid, path, previewEl, text) {
  previewEl.replaceChildren();
  if (/\\.md$/i.test(path)) {
    renderMarkdown(previewEl, text, { pid: pid, basePath: path });
  } else {
    var pre = document.createElement('pre');
    pre.appendChild(el('code', null, text));
    previewEl.appendChild(pre);
  }
}
function buildDocsEditor(pid, path, content) {
  var wrap = el('div', 'docs-editor');
  var panes = el('div', 'docs-editor-panes');
  var textarea = document.createElement('textarea');
  textarea.className = 'docs-editor-textarea';
  textarea.value = content;
  textarea.spellcheck = false;
  textarea.setAttribute('aria-label', 'Edit ' + path);
  var preview = el('div', 'docs-editor-preview docs-viewer-body');
  preview.setAttribute('aria-label', 'Live preview of ' + path);
  panes.appendChild(textarea);
  panes.appendChild(preview);
  wrap.appendChild(panes);
  var actions = el('div', 'docs-editor-actions');
  var saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'docs-editor-save';
  saveBtn.setAttribute('data-doc-edit-save', '');
  saveBtn.setAttribute('data-doc-edit-pid', pid);
  saveBtn.setAttribute('data-doc-edit-path', path);
  var saveLabel = el('span', null, tr('docsEditSave'));
  saveLabel.setAttribute('data-i18n', 'docsEditSave');
  saveBtn.appendChild(saveLabel);
  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'docs-editor-cancel';
  cancelBtn.setAttribute('data-doc-edit-cancel', '');
  cancelBtn.setAttribute('data-doc-edit-pid', pid);
  var cancelLabel = el('span', null, tr('docsEditCancel'));
  cancelLabel.setAttribute('data-i18n', 'docsEditCancel');
  cancelBtn.appendChild(cancelLabel);
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  var result = el('p', 'docs-editor-result');
  result.setAttribute('data-doc-edit-result', pid);
  actions.appendChild(result);
  wrap.appendChild(actions);
  updateEditorPreview(pid, path, preview, content);
  textarea.addEventListener('input', function () {
    updateEditorPreview(pid, path, preview, textarea.value);
  });
  return wrap;
}
function closeDocsEditor(pid) {
  var viewer = document.querySelector('[data-docs-viewer="' + pid + '"]');
  if (!viewer) return;
  var editor = viewer.querySelector('.docs-editor');
  if (editor) editor.remove();
  var readView = viewer.querySelector('.docs-viewer-readview');
  if (readView) readView.hidden = false;
  var toggle = viewer.querySelector('[data-doc-edit-toggle]');
  if (toggle) toggle.setAttribute('aria-pressed', 'false');
}
// Edit/Cancel (event-delegated, one listener for both since they share the
// same open/close state machine): Edit swaps the read view for the editor;
// Cancel (or Edit again, defensively) swaps back without saving anything.
document.addEventListener('click', function (e) {
  var cancel = e.target && e.target.closest && e.target.closest('[data-doc-edit-cancel]');
  var toggle = !cancel && e.target && e.target.closest && e.target.closest('[data-doc-edit-toggle]');
  var b = cancel || toggle;
  if (!b) return;
  var pid = b.getAttribute('data-doc-edit-pid');
  var viewer = document.querySelector('[data-docs-viewer="' + pid + '"]');
  if (!viewer) return;
  if (cancel || viewer.querySelector('.docs-editor')) {
    closeDocsEditor(pid);
    return;
  }
  var path = openDoc[pid];
  if (!path) return;
  var readView = viewer.querySelector('.docs-viewer-readview');
  if (readView) readView.hidden = true;
  viewer.appendChild(buildDocsEditor(pid, path, docsRawContent[pid] || ''));
  b.setAttribute('aria-pressed', 'true');
});
// Save (epic 0023 slice 3): POST /api/docs/write, then reload the doc from
// disk on success so the reader shows exactly what was persisted — including
// the provenance line the server appends — the same
// success-refetches-reality convention pool-client/pr-review execute already
// use, rather than trusting the in-memory textarea value as the new truth.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-doc-edit-save]');
  if (!b) return;
  var pid = b.getAttribute('data-doc-edit-pid');
  var path = b.getAttribute('data-doc-edit-path');
  var viewer = document.querySelector('[data-docs-viewer="' + pid + '"]');
  if (!viewer) return;
  var textarea = viewer.querySelector('.docs-editor-textarea');
  var result = viewer.querySelector('[data-doc-edit-result="' + pid + '"]');
  if (!textarea) return;
  b.disabled = true;
  fetch('/api/docs/write', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid, path: path, content: textarea.value }),
  })
    .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
    .then(function (res) {
      b.disabled = false;
      if (res.ok && res.data && res.data.ok) {
        closeDocsEditor(pid);
        loadDoc(pid, path, viewer);
      } else if (result) {
        result.textContent = '✗ ' + ((res.data && res.data.reason) || 'Save failed.');
      }
    })
    .catch(function () {
      b.disabled = false;
      if (result) result.textContent = '✗ Save failed — network error.';
    });
});
// Docs reader (event-delegated): open an indexed document in the viewer.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-doc-open]');
  if (!b) return;
  // A rendered relative link is an <a href="#"> — its default would jump the
  // page to the top and change the hash the subject router watches.
  if (b.tagName === 'A') e.preventDefault();
  var pid = b.getAttribute('data-doc-pid');
  var path = b.getAttribute('data-doc-open');
  openDoc[pid] = path;
  var listEl = document.querySelector('[data-docs-list="' + pid + '"]');
  if (listEl) {
    var btns = listEl.querySelectorAll('[data-doc-open]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i] === b;
      // Toggle only the open flag. Rebuilding className from scratch here
      // would silently strip docs-file-pinned off the standing explainer the
      // first time any OTHER document is opened — the row would lose its
      // marker and never get it back until the whole list refreshed.
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-pressed', String(on));
    }
  }
  var viewer = document.querySelector('[data-docs-viewer="' + pid + '"]');
  if (viewer) loadDoc(pid, path, viewer);
});
// In-document links ("[see below](#heading)") scroll within the body they
// sit in: heading ids are prefixed doc- (renderMarkdown), so they can
// never collide with the page's own anchors, and the lookup stays inside
// THIS viewer — two projects' readers may show the same document.
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest && e.target.closest('[data-doc-anchor]');
  if (!a) return;
  e.preventDefault();
  var body = a.closest('.docs-viewer-body');
  if (!body) return;
  var target = body.querySelector('[id="doc-' + a.getAttribute('data-doc-anchor') + '"]');
  if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'start' });
});
`.trim();
}
