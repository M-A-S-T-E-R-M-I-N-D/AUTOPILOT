// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT'S NEW — the `/whats-new.js` chunk (operator, 2026-09-24).
 *
 * The first time a new version runs, a message opens with what changed in
 * it: the release's changes counted and charted, what is newly possible, the
 * current round's numbers, and the repository's open issues, pull requests
 * and CI. Closing it hides it until the next version; "Don't show again"
 * hides it for good; Settings always reopens it.
 *
 * WHY ITS OWN CHUNK: `/app.js` and `/panels.js` both sit at their byte
 * budgets, and this code runs once per version. Its strings live here too, in
 * English and Hebrew, chosen by the page's `lang` — putting them in the shared
 * `STRINGS` table would add every English line to the core bundle.
 *
 * WHEN IT OPENS: never on a first-ever visit — the guided tour speaks then,
 * and this only records the version. After that, whenever the recorded
 * version differs from the running one, unless the viewer said never.
 *
 * Built as a string, like every client module here: no regex literals and no
 * backslashes, because a template string would eat them.
 */

/** localStorage keys — exported so the e2e helper and the tests seed the same names. */
export const WHATS_NEW_SEEN_KEY = 'ap-motd-seen';
export const WHATS_NEW_NEVER_KEY = 'ap-motd-never';

const STRINGS = {
  en: {
    title: "What's new in v{v}",
    released: 'Released {d}',
    unreleased: 'This build has no release notes yet.',
    added: 'Added',
    fixed: 'Fixed',
    also: 'Also',
    changes: 'Changes',
    nowYouCan: 'What you can do now',
    more: 'and {n} more',
    allFixes: 'Every fix in this release ({n})',
    round: 'This round',
    firings: 'Firings',
    shipped: 'Shipped',
    shipRate: 'Ship rate',
    perShipped: 'Cost per shipped',
    github: 'On GitHub',
    issues: 'Open issues',
    prs: 'Open pull requests',
    ci: 'CI workflows',
    ciPassing: '{n} passing',
    ciFailing: '{n} failing',
    unknown: 'unknown',
    never: "Don't show this again",
    close: 'Close',
    changelog: 'Full changelog',
    loading: 'Loading…',
    failed: 'Could not load the details. Settings can open this again.',
    menu: "What's new",
  },
  he: {
    title: 'מה חדש בגרסה v{v}',
    released: 'יצאה ב-{d}',
    unreleased: 'לגרסה הזו עוד אין הערות שחרור.',
    added: 'נוסף',
    fixed: 'תוקן',
    also: 'עוד',
    changes: 'שינויים',
    nowYouCan: 'מה אפשר לעשות עכשיו',
    more: 'ועוד {n}',
    allFixes: 'כל התיקונים בגרסה ({n})',
    round: 'הסבב הנוכחי',
    firings: 'הפעלות',
    shipped: 'נשלחו',
    shipRate: 'שיעור שליחה',
    perShipped: 'עלות לשליחה',
    github: 'ב-GitHub',
    issues: 'בעיות פתוחות',
    prs: 'בקשות משיכה פתוחות',
    ci: 'תהליכי CI',
    ciPassing: '{n} עוברים',
    ciFailing: '{n} נכשלים',
    unknown: 'לא ידוע',
    never: 'אל תציג שוב',
    close: 'סגור',
    changelog: 'יומן השינויים המלא',
    loading: 'טוען…',
    failed: 'לא הצלחנו לטעון את הפרטים. אפשר לפתוח את זה שוב מההגדרות.',
    menu: 'מה חדש',
  },
} as const;

/** The English and Hebrew tables carry the same keys — pinned by the tests. */
export const WHATS_NEW_STRINGS = STRINGS;

/**
 * The message's styles. Served inside `/tokens.css`, never injected: the
 * dashboard's CSP is `default-src 'self'`, which blocks an inline `<style>`
 * element — the first cut injected one, and in a real browser the dialog
 * rendered unstyled at the foot of the page while jsdom, which enforces no
 * CSP, passed every test.
 */
export function whatsNewCss(): string {
  return WHATS_NEW_CSS;
}

const WHATS_NEW_CSS = `
.wn-overlay { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; padding: var(--space-4); }
.wn-overlay[hidden] { display: none; }
.wn-dialog { width: 100%; max-width: 640px; max-height: calc(100vh - 2 * var(--space-4)); overflow: auto; background: var(--color-surface-raised); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-5); box-shadow: var(--elevation-level-2); display: flex; flex-direction: column; gap: var(--space-4); }
.wn-head h2 { margin: 0; font-size: var(--text-xl, 1.25rem); }
.wn-sub { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--text-sm); }
.wn-section .wn-section { margin-top: var(--space-4); }
.wn-section h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
.wn-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: var(--space-2); margin: 0; }
.wn-tile { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--shape-small); padding: var(--space-2) var(--space-3); }
.wn-tile dt { font-size: var(--text-sm); color: var(--color-text-muted); }
.wn-tile dd { margin: 0; font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.wn-bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--color-surface-sunken); margin-top: var(--space-2); }
.wn-bar span { display: block; height: 100%; }
.wn-k-added { background: var(--color-accent); }
.wn-k-fixed { background: var(--color-success); }
.wn-k-also { background: var(--color-text-muted); }
.wn-legend { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-1); font-size: var(--text-sm); color: var(--color-text-muted); }
.wn-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-inline-end: var(--space-1); }
.wn-list { margin: 0; padding-inline-start: var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); }
.wn-scope { display: inline-block; font-size: 0.6875rem; font-weight: 700; padding: 0 var(--space-1); margin-inline-end: var(--space-1); border-radius: var(--shape-extra-small); border: 1px solid var(--color-border); color: var(--color-text-muted); }
.wn-fail { display: block; font-size: var(--text-sm); font-weight: 400; }
.wn-meter { height: 6px; border-radius: 3px; background: var(--color-surface-sunken); margin-top: var(--space-1); overflow: hidden; }
.wn-meter span { display: block; height: 100%; background: var(--color-success); }
.wn-ci { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-1); }
.wn-ci span { width: 12px; height: 12px; border-radius: 3px; }
.wn-ok { background: var(--color-success); }
.wn-bad { background: var(--color-sev-high); }
.wn-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.wn-foot label { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
.wn-foot a { color: var(--color-accent); font-size: var(--text-sm); }
.wn-close { font: inherit; cursor: pointer; padding: var(--space-1) var(--space-4); border-radius: var(--shape-extra-small); border: 1px solid var(--color-accent); background: var(--color-accent); color: var(--color-accent-text); }
.wn-close:focus-visible, .wn-foot input:focus-visible, .wn-foot a:focus-visible, .wn-dialog summary:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.wn-menu-btn { font: inherit; font-size: var(--text-sm); cursor: pointer; background: none; border: 1px solid var(--color-border); border-radius: var(--shape-extra-small); padding: var(--space-1) var(--space-2); color: var(--color-text); white-space: nowrap; min-inline-size: 44px; min-block-size: 44px; flex: 0 0 auto; }
`;

/** The chunk's logic. A constant, not the function's return template, so the
 *  splice discovery (which reads functions returning a template) does not
 *  take this served-chunk source for a client-visible splice. */
const CHUNK_BODY = `var K_TOUR = 'ap-tour-seen';
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function wt(key, subs) {
  var lang = document.documentElement.lang === 'he' ? 'he' : 'en';
  var s = WN[lang][key] || WN.en[key] || key;
  if (subs) for (var name in subs) s = s.split('{' + name + '}').join(String(subs[name]));
  return s;
}
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}
function fmtNum(n) {
  try { return Number(n).toLocaleString(document.documentElement.lang || 'en'); } catch (e) { return String(n); }
}
var overlay = null;
var lastFocus = null;
function tile(label, value) {
  var box = el('div', 'wn-tile');
  box.appendChild(el('dt', null, label));
  box.appendChild(el('dd', null, value));
  return box;
}
function kindOf(title) {
  var t = String(title).toLowerCase();
  if (t.indexOf('added') === 0) return 'added';
  if (t.indexOf('fixed') === 0) return 'fixed';
  return 'also';
}
function releaseSection(rel) {
  var sec = el('section', 'wn-section');
  var counts = { added: 0, fixed: 0, also: 0 };
  var added = [];
  var fixed = [];
  for (var i = 0; i < rel.groups.length; i++) {
    var g = rel.groups[i];
    var k = kindOf(g.title);
    counts[k] += g.items.length;
    if (k === 'added') added = added.concat(g.items);
    if (k === 'fixed') fixed = fixed.concat(g.items);
  }
  var total = counts.added + counts.fixed + counts.also;
  var tiles = el('dl', 'wn-tiles');
  tiles.appendChild(tile(wt('changes'), fmtNum(total)));
  tiles.appendChild(tile(wt('added'), fmtNum(counts.added)));
  tiles.appendChild(tile(wt('fixed'), fmtNum(counts.fixed)));
  tiles.appendChild(tile(wt('also'), fmtNum(counts.also)));
  sec.appendChild(tiles);
  if (total > 0) {
    var bar = el('div', 'wn-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', wt('added') + ' ' + counts.added + ', ' + wt('fixed') + ' ' + counts.fixed + ', ' + wt('also') + ' ' + counts.also);
    var legend = el('div', 'wn-legend');
    var kinds = ['added', 'fixed', 'also'];
    for (var j = 0; j < kinds.length; j++) {
      var kk = kinds[j];
      if (counts[kk] === 0) continue;
      var seg = el('span', 'wn-k-' + kk);
      seg.style.width = (counts[kk] * 100 / total).toFixed(2) + '%';
      bar.appendChild(seg);
      var item = el('span', null);
      item.appendChild(el('span', 'wn-dot wn-k-' + kk));
      item.appendChild(document.createTextNode(wt(kk) + ' ' + counts[kk]));
      legend.appendChild(item);
    }
    sec.appendChild(bar);
    sec.appendChild(legend);
  }
  if (added.length > 0) {
    var now = el('section', 'wn-section');
    now.appendChild(el('h3', null, wt('nowYouCan')));
    now.appendChild(itemList(added, 8));
    sec.appendChild(now);
  }
  if (fixed.length > 0) {
    var det = el('details', 'wn-section');
    det.appendChild(el('summary', null, wt('allFixes', { n: fixed.length })));
    det.appendChild(itemList(fixed, fixed.length));
    sec.appendChild(det);
  }
  return sec;
}
function itemList(items, cap) {
  var ul = el('ul', 'wn-list');
  var shown = Math.min(items.length, cap);
  for (var i = 0; i < shown; i++) {
    var li = el('li', null);
    li.dir = 'auto';
    if (items[i].scope) li.appendChild(el('span', 'wn-scope', items[i].scope));
    li.appendChild(document.createTextNode(items[i].text));
    ul.appendChild(li);
  }
  if (items.length > shown) ul.appendChild(el('li', 'wn-sub', wt('more', { n: items.length - shown })));
  return ul;
}
function roundSection(r) {
  var sec = el('section', 'wn-section');
  sec.appendChild(el('h3', null, wt('round')));
  var tiles = el('dl', 'wn-tiles');
  tiles.appendChild(tile(wt('firings'), fmtNum(r.firings)));
  tiles.appendChild(tile(wt('shipped'), fmtNum(r.shipped)));
  var rate = r.shipRate === null ? null : Math.round(r.shipRate * 100);
  var rateTile = tile(wt('shipRate'), rate === null ? wt('unknown') : rate + '%');
  if (rate !== null) {
    var meter = el('div', 'wn-meter');
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', wt('shipRate') + ' ' + rate + '%');
    var fill = el('span', null);
    fill.style.width = Math.max(0, Math.min(100, rate)) + '%';
    meter.appendChild(fill);
    rateTile.lastChild.appendChild(meter);
  }
  tiles.appendChild(rateTile);
  tiles.appendChild(tile(wt('perShipped'), r.costPerShipped === null ? wt('unknown') : '$' + Number(r.costPerShipped).toFixed(2)));
  sec.appendChild(tiles);
  return sec;
}
function githubSection(gh, ci) {
  var sec = el('section', 'wn-section');
  sec.appendChild(el('h3', null, wt('github')));
  var tiles = el('dl', 'wn-tiles');
  if (gh) {
    tiles.appendChild(tile(wt('issues'), gh.openIssues === null ? wt('unknown') : fmtNum(gh.openIssues)));
    tiles.appendChild(tile(wt('prs'), gh.openPrs === null ? wt('unknown') : fmtNum(gh.openPrs)));
  }
  if (ci && ci.workflows.length > 0) {
    var ciTile = tile(wt('ci'), wt('ciPassing', { n: ci.passing }));
    if (ci.failing > 0) ciTile.lastChild.appendChild(el('span', 'wn-sub wn-fail', wt('ciFailing', { n: ci.failing })));
    var dots = el('div', 'wn-ci');
    for (var i = 0; i < ci.workflows.length; i++) {
      var w = ci.workflows[i];
      var d = el('span', w.ok ? 'wn-ok' : 'wn-bad');
      d.setAttribute('title', w.workflow);
      dots.appendChild(d);
    }
    ciTile.lastChild.appendChild(dots);
    tiles.appendChild(ciTile);
  }
  sec.appendChild(tiles);
  return sec;
}
function paint(dialog, data) {
  var body = dialog.querySelector('.wn-body');
  body.replaceChildren();
  var sub = dialog.querySelector('.wn-sub');
  if (data && data.release) {
    sub.textContent = data.release.date ? wt('released', { d: data.release.date }) : '';
    body.appendChild(releaseSection(data.release));
  } else {
    sub.textContent = data ? wt('unreleased') : wt('failed');
  }
  if (data && data.round && data.round.firings > 0) body.appendChild(roundSection(data.round));
  if (data && (data.github || (data.ci && data.ci.workflows.length > 0))) body.appendChild(githubSection(data.github, data.ci));
  var link = dialog.querySelector('.wn-changelog');
  if (data && data.github && data.github.repo) {
    link.href = 'https://github.com/' + data.github.repo + '/blob/main/CHANGELOG.md';
    link.hidden = false;
  }
}
function focusables(dialog) {
  return dialog.querySelectorAll('button, a[href]:not([hidden]), input, summary');
}
function onKey(e) {
  if (!overlay) return;
  if (e.key === 'Escape') { e.preventDefault(); closeWhatsNew(); return; }
  if (e.key !== 'Tab') return;
  var f = focusables(overlay);
  if (f.length === 0) return;
  var first = f[0];
  var last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function closeWhatsNew() {
  if (!overlay) return;
  lsSet(K_SEEN, V);
  overlay.remove();
  overlay = null;
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}
function openWhatsNew() {
  if (overlay) return;
  lastFocus = document.activeElement;
  overlay = el('div', 'wn-overlay');
  overlay.addEventListener('keydown', onKey);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeWhatsNew(); });
  var dialog = el('div', 'wn-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'wn-title');
  var head = el('header', 'wn-head');
  var h = el('h2', null, wt('title', { v: V }));
  h.id = 'wn-title';
  head.appendChild(h);
  head.appendChild(el('p', 'wn-sub', wt('loading')));
  dialog.appendChild(head);
  dialog.appendChild(el('div', 'wn-body'));
  var foot = el('footer', 'wn-foot');
  var label = el('label', null);
  var never = document.createElement('input');
  never.type = 'checkbox';
  never.className = 'wn-never';
  never.checked = lsGet(K_NEVER) === '1';
  never.addEventListener('change', function () { if (never.checked) lsSet(K_NEVER, '1'); else lsDel(K_NEVER); });
  label.appendChild(never);
  label.appendChild(document.createTextNode(wt('never')));
  foot.appendChild(label);
  var link = el('a', 'wn-changelog', wt('changelog'));
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.hidden = true;
  foot.appendChild(link);
  var close = el('button', 'wn-close', wt('close'));
  close.type = 'button';
  close.addEventListener('click', closeWhatsNew);
  foot.appendChild(close);
  dialog.appendChild(foot);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  close.focus();
  var shown = overlay;
  fetch('/api/whats-new', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (data) { if (overlay === shown) paint(dialog, data); });
}
function addMenuItem() {
  var body = document.querySelector('#settings-menu .settings-body') || document.querySelector('#version-menu .version-body');
  if (!body || body.querySelector('.wn-menu-btn')) return;
  var btn = el('button', 'connect-test wn-menu-btn', wt('menu'));
  btn.type = 'button';
  btn.addEventListener('click', openWhatsNew);
  var row = el('div', 'connect-actions wn-menu-row');
  row.appendChild(btn);
  body.appendChild(row);
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function () { btn.textContent = wt('menu'); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
}
function init() {
  addMenuItem();
  var seen = lsGet(K_SEEN);
  if (seen === V) return;
  if (seen === null && lsGet(K_TOUR) !== '1') { lsSet(K_SEEN, V); return; }
  if (lsGet(K_NEVER) === '1') return;
  openWhatsNew();
}
window.__apOpenWhatsNew = openWhatsNew;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
`;

/** The chunk's source, with the running version baked in at serve time so
 *  the decision to open needs no request. */
export function whatsNewClientJs(version: string): string {
  return (
    '(function () { var V = ' +
    JSON.stringify(version) +
    '; var K_SEEN = ' +
    JSON.stringify(WHATS_NEW_SEEN_KEY) +
    '; var K_NEVER = ' +
    JSON.stringify(WHATS_NEW_NEVER_KEY) +
    '; var WN = ' +
    JSON.stringify(STRINGS) +
    ';' +
    CHUNK_BODY +
    '})();'
  );
}
