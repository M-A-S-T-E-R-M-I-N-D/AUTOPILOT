// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's VERSIONS panel (board ap-mui2h3s1-1, slice 4): the
 * locked repo's MYTH, LEGACY and flight log, newest first, and for each
 * version a "What changed" disclosure listing the files it changed against
 * the version before it. Slices 1–3 built the reads and served them at
 * `GET /api/versions` and `GET /api/versions/diff`; this is their first
 * expression. Read-only: the one-click additive restore is a later slice.
 *
 * `versionsSection(pid)` is called from `fleetJs()`'s `renderProjectPage()`
 * inside the panel cache, so the timeline is fetched once per landed firing,
 * never per state tick, and a diff is fetched only when its disclosure first
 * opens. `el`/`panelHeading`/`fmtAgo`/`tr` are bare hoisted identifiers from
 * the core bundle, the same contract `round-panel.ts` relies on.
 *
 * i18n: every literal line is born through `tr()` and tagged `data-i18n` (or
 * `data-i18n-template` with its values), so a locale switch's `translateDom`
 * sweep repaints it; the toggle swaps its tag with its label. Commit subjects
 * and paths stay as git printed them.
 */
import { versionRows } from '../versions-panel.js';

/** The VERSIONS panel client — vanilla, external (keeps CSP script-src 'self'). */
export function versionsJs(): string {
  return `
// versionRows is generated FROM web/versions-panel.ts — its real compiled
// source via .toString(), not a hand-retyped copy.
${versionRows.toString()}
var VERSION_KIND_KEY = { myth: 'versionsMyth', legacy: 'versionsLegacy', flight: 'versionsFlight' };
// A templated line carries its values as data-i18n-args, so the sweep refills
// the slots instead of painting the bare template.
function versionsText(tag, key, subs) {
  var e = el(tag, 'muted', tr(key, subs));
  e.setAttribute(subs ? 'data-i18n-template' : 'data-i18n', key);
  if (subs) e.setAttribute('data-i18n-args', JSON.stringify(subs));
  return e;
}
function versionsNote(key, subs) {
  return versionsText('p', key, subs);
}
function versionsFetch(url, done) {
  fetch(url)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(done, function () { done(null); });
}
function renderVersionDiff(out, diff) {
  if (!diff) {
    delete out.dataset.loaded; // the next open asks again
    out.replaceChildren(versionsNote('versionsDiffUnavailable'));
    return;
  }
  if (!diff.totals.files) {
    out.replaceChildren(versionsNote('versionsDiffEmpty'));
    return;
  }
  out.replaceChildren(versionsNote('versionsDiffTotal', diff.totals));
  var ul = el('ul', 'version-files');
  for (var i = 0; i < diff.files.length; i++) {
    var f = diff.files[i];
    var li = el('li', 'version-file');
    li.appendChild(el('code', null, f.path));
    li.appendChild(f.added === null ? versionsText('span', 'versionsBinary') : el('span', 'muted', '+' + f.added + ' −' + f.removed));
    ul.appendChild(li);
  }
  out.appendChild(ul);
  if (diff.truncated) out.appendChild(versionsNote('versionsDiffTruncated', { count: diff.files.length }));
}
function toggleVersionDiff(pid, row, btn, out) {
  var open = btn.getAttribute('aria-expanded') !== 'true';
  var key = open ? 'versionsHideChanges' : 'versionsShowChanges';
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('data-i18n', key);
  btn.textContent = tr(key);
  out.hidden = !open;
  if (!open || out.dataset.loaded) return;
  out.dataset.loaded = '1';
  out.replaceChildren(versionsNote('versionsLoading'));
  versionsFetch('/api/versions/diff?project=' + encodeURIComponent(pid) + '&from=' + row.diffFrom + '&to=' + row.sha, function (data) {
    if (out.isConnected) renderVersionDiff(out, data && data.diff);
  });
}
function versionItem(pid, row) {
  var li = el('li', 'version-row');
  var kindKey = VERSION_KIND_KEY[row.kind];
  var kind = el('span', 'chip version-kind version-' + row.kind, tr(kindKey));
  kind.setAttribute('data-i18n', kindKey);
  li.appendChild(kind);
  li.appendChild(el('code', 'version-sha', row.sha.slice(0, 7)));
  li.appendChild(el('span', 'version-subject', row.subject));
  var at = Date.parse(row.committedAt);
  if (!isNaN(at)) li.appendChild(el('span', 'muted', fmtAgo(at)));
  if (!row.diffFrom) return li;
  var out = el('div', 'version-diff');
  out.id = 'version-diff-' + row.sha;
  out.hidden = true;
  var btn = el('button', 'diff-toggle', tr('versionsShowChanges'));
  btn.type = 'button';
  btn.setAttribute('data-i18n', 'versionsShowChanges');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', out.id);
  btn.addEventListener('click', function () { toggleVersionDiff(pid, row, btn, out); });
  li.appendChild(btn);
  li.appendChild(out);
  return li;
}
function renderVersionsBody(body, pid, timeline) {
  // No LEGACY means never locked: the flight log has no start to list from.
  if (!timeline || !timeline.legacy) {
    body.replaceChildren(versionsNote(timeline ? 'versionsNotLocked' : 'versionsUnavailable'));
    return;
  }
  var list = el('ol', 'version-list');
  var rows = versionRows(timeline);
  for (var i = 0; i < rows.length; i++) list.appendChild(versionItem(pid, rows[i]));
  body.replaceChildren(list);
  if (timeline.truncated) body.appendChild(versionsNote('versionsTruncated', { count: timeline.flight.length }));
}
function versionsSection(pid) {
  var wrap = el('section', 'versions-panel');
  wrap.appendChild(panelHeading('h3', 'versions-title', 'versionsTitle', 'clock'));
  var body = el('div', 'versions-body');
  body.appendChild(versionsNote('versionsLoading'));
  wrap.appendChild(body);
  versionsFetch('/api/versions?project=' + encodeURIComponent(pid), function (data) {
    if (body.isConnected) renderVersionsBody(body, pid, data && data.versions);
  });
  return wrap;
}
`.trim();
}
