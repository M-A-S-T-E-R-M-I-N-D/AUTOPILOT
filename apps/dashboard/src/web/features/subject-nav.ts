// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * APP SHELL — the shell's client (epic 0021): subject navigation (slice 2),
 * project-page tabs (slice 5), focus mode (slice 8) and the command palette
 * (slice 7). One module because they share one fact — what the page's
 * subjects are — and one discipline: guarded writes, nothing persisted that
 * could trap a reader.
 *
 * A SUBJECT is a place in the app: every body-level section declares the one
 * it belongs to (`data-subject` on the element, set by `renderShell`), and
 * `<body data-subject>` names the active one. The stylesheet does the rest:
 * below the `lg` breakpoint only the active subject's sections render; from
 * `lg` up every subject is stacked in DOM order and the nav is a scroll-spy.
 * Nothing here reorders the DOM — screen-reader order and the masthead
 * census stay exactly what they were (epic 0021 law 4).
 *
 * Rides the DEFERRED chunk: it self-initializes and nothing in core calls
 * it. The one-subject-at-a-time rule keys on body[data-nav="on"], which
 * ONLY this module sets at boot — so before it executes (or if it never
 * does) every subject is on the page and the nav is plain href="#id"
 * anchors that scroll the stack; nothing hides behind an attribute no
 * script wrote. Every DOM write is guarded (identical fact ⇒ zero writes),
 * and so is the localStorage write, so the "hidden"-attribute observer
 * below cannot become a repaint loop under the fleet's poll ticks (epic
 * 0018 law 3).
 */

/** The subject-nav client — vanilla, external (keeps CSP script-src 'self'). */
export function subjectNavJs(): string {
  return `
// APP SHELL subject navigation (epic 0021 slice 2). See web/features/subject-nav.ts.
var SUBJECT_KEY = 'ap-subject';
var SUBJECT_STACKED_MQ = '(min-width: 64rem)';
// CONTEXT RAIL (slice 6): the sections that become the supporting pane from xl.
var CONTEXT_RAIL_MQ = '(min-width: 80rem)';
var CONTEXT_RAIL_IDS = ['live-workers', 'pr-review-panel', 'pool-client-panel'];
var contextRailHome = {};
var subjectScrollMemo = {};
var subjectStored = null;
/** Project pages are TABS (epic 0018): one subject at every width. The fleet
 *  page stacks every subject from lg up. */
function subjectIsStacked() {
  if (document.body.dataset.subjectMode === 'tabs') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia(SUBJECT_STACKED_MQ).matches;
}
function subjectLinks() {
  return Array.prototype.slice.call(document.querySelectorAll('#subject-nav [data-subject-link]'));
}
/** The page's subjects are whatever its nav offers — four on the fleet page,
 *  six on a project page — never a list this module has to know. */
function subjectNames() {
  return subjectLinks().map(function (a) { return a.dataset.subjectLink; });
}
/** Every element that declares a subject: body-level sections, and on a
 *  project page the sections renderProjectPage tags inside main#fleet. */
function subjectSections() {
  var out = Array.prototype.filter.call(document.body.children, function (k) { return k.dataset && k.dataset.subject; });
  var main = document.getElementById('fleet');
  if (main) {
    Array.prototype.forEach.call(main.children, function (k) { if (k.dataset && k.dataset.subject) out.push(k); });
  }
  var rail = document.getElementById('context-rail');
  if (rail) {
    Array.prototype.forEach.call(rail.children, function (k) { if (k.dataset && k.dataset.subject) out.push(k); });
  }
  return out;
}
/** Below lg (and always on a project page) the inactive subjects leave the
 *  page through ONE attribute the stylesheet hides. Set only by this module,
 *  so without it every subject is on the page and the bar's anchors scroll
 *  the stack. Guarded: an identical tick writes nothing. */
function markInactiveSections(active) {
  var stacked = subjectIsStacked();
  subjectSections().forEach(function (k) {
    var inactive = !stacked && k.dataset.subject !== active ? 'true' : null;
    if (k.getAttribute('data-subject-inactive') !== inactive) {
      if (inactive) k.setAttribute('data-subject-inactive', inactive); else k.removeAttribute('data-subject-inactive');
    }
  });
}
/** The subject owning an element id (walks up to the body-level section). */
function subjectOfId(id) {
  var el = id ? document.getElementById(id) : null;
  while (el && el !== document.body) {
    if (el.dataset && el.dataset.subject) return el.dataset.subject;
    el = el.parentElement;
  }
  return '';
}
function subjectHasContent(name) {
  var sections = subjectSections();
  for (var i = 0; i < sections.length; i++) {
    if (sections[i].dataset.subject === name && !sections[i].hidden) return true;
  }
  return false;
}
/** KEEPER (epic 0021 slice 4, first cut): everything waiting on a human,
 *  counted where it renders — PR cards, pool rows, triage plans, mirror
 *  findings, backlog candidates, a pending wisdom proposal. */
// KEEPER QUEUE (epic 0021 slice 4): one list of everything waiting on a
// human. A VIEW over the panels, never a second source: every row is read
// from the DOM the panels already render — the same items the badge counts
// — with its source, what it is, why it waits, one primary exit action
// proxied to the panel's own button, and Open, which lands on the item.
// Keyboard-first (the Linear / GitHub-inbox idiom): j/k or the arrows move,
// Enter opens, "a" acts. Guarded: an identical tick rewrites nothing.
var KEEPER_SOURCES = [
  { selector: '.pr-review-item', source: 'keeperSourcePr', fallback: 'PR', title: '.pr-review-pr-title', head: '.pr-review-head', action: '.pr-review-actions button' },
  { selector: '.pool-client-item', source: 'keeperSourcePool', fallback: 'Pool', title: '.pool-client-issue-title', head: '.pool-client-head', action: '[data-pool-client-execute]' },
  { selector: '.issue-triage-item', source: 'keeperSourceTriage', fallback: 'Triage', title: '.issue-triage-issue-title', head: '.issue-triage-head', action: null },
  { selector: '.mirror-pass-item', source: 'keeperSourceMirror', fallback: 'Mirror', title: null, head: null, action: null },
  { selector: '.backlog-item', source: 'keeperSourceBacklog', fallback: 'Backlog', title: 'span', head: null, action: '[data-task-done]' }
];
function trOr(key, fallback, subs) {
  if (typeof tr === 'function') { var s = tr(key, subs); if (s && s !== key) return s; }
  return fallback;
}
function keeperQueueItems() {
  var items = [];
  subjectSections().forEach(function (k) {
    if (k.dataset.subject !== 'keeper' || k.hidden || k.id === 'keeper-queue') return;
    if (k.id === 'fleet-wisdom') {
      var d = k.querySelector('details');
      var s = d ? d.querySelector('summary') : null;
      items.push({ key: 'wisdom', source: 'keeperSourceWisdom', fallback: 'Wisdom', title: (s ? s.textContent : k.textContent).trim().slice(0, 120), why: '', tip: '', el: d || k, action: k.querySelector('[data-fleet-wisdom-ratify]') });
      return;
    }
    KEEPER_SOURCES.forEach(function (src) {
      var nodes = k.querySelectorAll(src.selector);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        // A settled item — a triage plan or a PR review whose decision is
        // "skip" (already answered on a previous pass) — waits on nobody:
        // it stays in its panel for the record and leaves the queue and the
        // count (seen live: 41 skipped triage rows counted as "waiting").
        if (n.querySelector('[class*="-badge-skip"]')) continue;
        var titleEl = src.title ? n.querySelector(src.title) : null;
        var head = src.head ? n.querySelector(src.head) : null;
        var num = head ? head.firstElementChild : null;
        var chip = head && head.children.length > 1 ? head.lastElementChild : n.querySelector('.backlog-match');
        var title = (titleEl ? titleEl.textContent : n.textContent).trim();
        var number = num ? num.textContent.trim() : '';
        items.push({
          key: src.source + ':' + (number || String(i)) + ':' + title,
          source: src.source,
          fallback: src.fallback,
          title: (number ? number + ' ' : '') + title,
          why: chip ? chip.textContent.trim() : '',
          tip: chip ? chip.getAttribute('data-tip') || '' : '',
          el: n,
          action: src.action ? n.querySelector(src.action) : null
        });
      }
    });
  });
  var approvals = document.querySelectorAll('[data-task-approve]');
  for (var a = 0; a < approvals.length; a++) {
    var btn = approvals[a];
    var row = btn.closest ? btn.closest('li') : null;
    var t = row ? row.querySelector('.task-title') : null;
    items.push({
      key: 'approval:' + (btn.getAttribute('data-task-approve') || String(a)),
      source: 'keeperSourceApproval',
      fallback: 'Approval',
      title: (t ? t.textContent : (row || btn).textContent).trim().slice(0, 160),
      why: trOr('taskStatusNeedsApproval', 'needs approval'),
      tip: btn.getAttribute('data-tip') || '',
      el: row || btn,
      action: btn
    });
  }
  return items;
}
function keeperWaitingCount() {
  return keeperQueueItems().length;
}
var keeperQueueLive = [];
/** The queue's host section: created once, placed as the first Keeper
 *  section outside the context rail (so it reads first under Keeper at
 *  every width), else ahead of Community; re-placed when the page rebuilds
 *  around it (renderProjectPage). Never created for an empty queue. */
function keeperQueueHost(create) {
  var host = document.getElementById('keeper-queue');
  if (!host && !create) return null;
  var sections = subjectSections();
  var rail = document.getElementById('context-rail');
  var anchor = null;
  for (var i = 0; i < sections.length && !anchor; i++) {
    var k = sections[i];
    if (k.id !== 'keeper-queue' && k.dataset.subject === 'keeper' && !(rail && k.parentElement === rail)) anchor = k;
  }
  for (var j = 0; j < sections.length && !anchor; j++) if (sections[j].dataset.subject === 'community') anchor = sections[j];
  if (!host) {
    host = document.createElement('section');
    host.id = 'keeper-queue';
    host.className = 'keeper-queue';
    host.dataset.subject = 'keeper';
    host.hidden = true;
    host.setAttribute('aria-label', trOr('keeperQueueTitle', 'Waiting on you'));
    host.addEventListener('click', keeperQueueClick);
    host.addEventListener('keydown', keeperQueueKeydown);
  }
  if (anchor && anchor.parentElement && host.nextElementSibling !== anchor) anchor.parentElement.insertBefore(host, anchor);
  else if (!anchor && !host.parentElement) document.body.appendChild(host);
  return host;
}
function keeperQueueOpenItem(i) {
  var it = keeperQueueLive[i];
  if (!it || !it.el) return;
  if (it.el.tagName === 'DETAILS') it.el.open = true;
  if (typeof it.el.scrollIntoView === 'function') it.el.scrollIntoView({ block: 'center' });
  var target = it.el.querySelector('a[href], button:not([disabled]), [tabindex]');
  if (!target) { it.el.setAttribute('tabindex', '-1'); target = it.el; }
  if (typeof target.focus === 'function') target.focus();
}
function keeperQueueClick(e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-keeper-open], [data-keeper-act]') : null;
  if (!t) return;
  if (t.hasAttribute('data-keeper-open')) { keeperQueueOpenItem(Number(t.getAttribute('data-keeper-open'))); return; }
  var it = keeperQueueLive[Number(t.getAttribute('data-keeper-act'))];
  if (it && it.action && !it.action.disabled) it.action.click();
}
function keeperQueueKeydown(e) {
  var host = e.currentTarget;
  var opens = Array.prototype.slice.call(host.querySelectorAll('.keeper-queue-open'));
  var cur = opens.indexOf(document.activeElement);
  if (cur < 0) return;
  var next = -1;
  if (e.key === 'ArrowDown' || e.key === 'j') next = Math.min(cur + 1, opens.length - 1);
  else if (e.key === 'ArrowUp' || e.key === 'k') next = Math.max(cur - 1, 0);
  else if (e.key === 'a') {
    var it = keeperQueueLive[cur];
    if (it && it.action && !it.action.disabled) { e.preventDefault(); it.action.click(); }
    return;
  } else return;
  e.preventDefault();
  if (next === cur) return;
  opens.forEach(function (b, i) { b.setAttribute('tabindex', i === next ? '0' : '-1'); });
  opens[next].focus();
}
function renderKeeperQueue() {
  var items = keeperQueueItems();
  var host = keeperQueueHost(items.length > 0);
  if (!host) return;
  var sig = items.map(function (it) { return it.key + '|' + it.why + '|' + (it.action ? it.action.textContent + (it.action.disabled ? '!' : '') : ''); }).join('\\n');
  keeperQueueLive = items;
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  host.replaceChildren();
  if (!items.length) { if (!host.hidden) host.hidden = true; return; }
  var h = document.createElement('h2');
  h.className = 'keeper-queue-title';
  h.textContent = trOr('keeperQueueTitle', 'Waiting on you') + ' · ' + items.length;
  host.appendChild(h);
  var hint = document.createElement('p');
  hint.className = 'keeper-queue-hint';
  hint.textContent = trOr('keeperQueueHint', 'j / k or the arrows move · Enter opens · a acts');
  host.appendChild(hint);
  var list = document.createElement('ol');
  list.className = 'keeper-queue-list';
  items.forEach(function (it, i) {
    var li = document.createElement('li');
    li.className = 'keeper-queue-item';
    li.setAttribute('data-keeper-key', it.key);
    var src = document.createElement('span');
    src.className = 'keeper-queue-source';
    src.textContent = trOr(it.source, it.fallback);
    li.appendChild(src);
    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'keeper-queue-open';
    open.textContent = it.title;
    open.setAttribute('data-keeper-open', String(i));
    open.setAttribute('tabindex', i === 0 ? '0' : '-1');
    if (it.tip) open.setAttribute('data-tip', it.tip);
    li.appendChild(open);
    var why = document.createElement('span');
    why.className = 'keeper-queue-why';
    why.textContent = it.why;
    li.appendChild(why);
    if (it.action) {
      var act = document.createElement('button');
      act.type = 'button';
      act.className = 'keeper-queue-act';
      act.textContent = (it.action.textContent || '').trim();
      act.setAttribute('data-keeper-act', String(i));
      act.setAttribute('tabindex', '-1');
      act.disabled = !!it.action.disabled;
      li.appendChild(act);
    }
    list.appendChild(li);
  });
  host.appendChild(list);
  if (host.hidden) host.hidden = false;
}
function markKeeperBadge(a) {
  var n = keeperWaitingCount();
  var badge = a.querySelector('.subject-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'subject-badge';
    badge.setAttribute('aria-hidden', 'true');
    a.appendChild(badge);
  }
  var text = n > 0 ? String(n) : '';
  if (badge.textContent !== text) badge.textContent = text;
  if (badge.hidden !== (n === 0)) badge.hidden = n === 0;
  var labelEl = a.querySelector('span[data-i18n]');
  var label = ((labelEl || a).textContent || '').trim();
  if (n > 0 && typeof tr === 'function') label += ', ' + tr('keeperWaiting', { n: String(n) });
  if (a.getAttribute('aria-label') !== label) a.setAttribute('aria-label', label);
}
function markSubjectLinks(active) {
  subjectLinks().forEach(function (a) {
    var name = a.dataset.subjectLink;
    if (name === 'keeper') markKeeperBadge(a);
    var current = name === active ? 'page' : null;
    if (a.getAttribute('aria-current') !== current) {
      if (current) a.setAttribute('aria-current', current); else a.removeAttribute('aria-current');
    }
    // data-empty, not aria-disabled: the link stays a real, working control
    // (an empty subject explains itself on arrival), so screen readers are
    // never told a control that works is disabled.
    var empty = subjectHasContent(name) ? null : 'true';
    if (a.getAttribute('data-empty') !== empty) {
      if (empty) a.setAttribute('data-empty', empty); else a.removeAttribute('data-empty');
    }
  });
}
function showSubject(name) {
  if (subjectNames().indexOf(name) < 0) name = 'fleet';
  var body = document.body;
  var previous = body.dataset.subject || 'fleet';
  if (previous !== name) {
    if (!subjectIsStacked()) subjectScrollMemo[previous] = window.scrollY || 0;
    body.dataset.subject = name;
    // Each subject keeps its own scroll (epic 0018: switching never reflows
    // a sibling; here the sibling is not even rendered).
    if (!subjectIsStacked()) window.scrollTo(0, subjectScrollMemo[name] || 0);
  }
  markInactiveSections(name);
  var empty = document.getElementById('subject-empty');
  var showEmpty = !subjectIsStacked() && !subjectHasContent(name);
  if (empty && empty.hidden === showEmpty) empty.hidden = !showEmpty;
  if (subjectStored !== name) {
    try { localStorage.setItem(SUBJECT_KEY, name); } catch (e) { /* private mode */ }
    subjectStored = name;
  }
  renderKeeperQueue();
  markSubjectLinks(name);
  markContextRailEmpty();
}
/** From xl on the fleet page the lanes and the Keeper queue live in the
 *  aside (M3 supporting pane); below it, exactly where they were. Each
 *  move remembers the section's home so the way back is the same DOM
 *  order the server rendered — screen-reader order below xl is untouched. */
function contextRailWanted() {
  if (document.body.dataset.subjectMode === 'tabs') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia(CONTEXT_RAIL_MQ).matches;
}
function layoutContextRail() {
  var rail = document.getElementById('context-rail');
  if (!rail) return;
  var on = contextRailWanted();
  CONTEXT_RAIL_IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (on && el.parentElement !== rail) {
      contextRailHome[id] = { parent: el.parentElement, next: el.nextSibling };
      rail.appendChild(el);
    } else if (!on && el.parentElement === rail && contextRailHome[id]) {
      var home = contextRailHome[id];
      home.parent.insertBefore(el, home.next && home.next.parentElement === home.parent ? home.next : null);
      delete contextRailHome[id];
    }
  });
  if (rail.hidden !== !on) rail.hidden = !on;
  var mark = on ? 'on' : undefined;
  if (document.body.dataset.rail !== mark) {
    if (on) document.body.dataset.rail = 'on'; else delete document.body.dataset.rail;
  }
}
/** The rail says so when nothing flies and nothing waits — its sections
 *  hide themselves on every poll, and an empty column explains nothing. */
function markContextRailEmpty() {
  var rail = document.getElementById('context-rail');
  if (!rail || rail.hidden) return;
  var empty = rail.querySelector('.context-rail-empty');
  if (!empty) return;
  var any = false;
  Array.prototype.forEach.call(rail.children, function (k) { if (k !== empty && !k.hidden) any = true; });
  if (empty.hidden !== any) empty.hidden = any;
}
function subjectFromLocation() {
  var hash = (location.hash || '').slice(1);
  return hash ? subjectOfId(hash) : '';
}
function bootSubjectNav() {
  var nav = document.getElementById('subject-nav');
  if (!nav) return;
  // From here on the stylesheet may hide the inactive subjects (below lg).
  if (document.body.dataset.nav !== 'on') document.body.dataset.nav = 'on';
  nav.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('[data-subject-link]') : null;
    if (!a) return;
    var name = a.dataset.subjectLink;
    if (subjectIsStacked()) { showSubject(name); return; } // the anchor jump is the navigation
    e.preventDefault();
    showSubject(name);
  });
  // A deep link (#pool-client-panel from a GitHub comment) lands on the
  // subject that owns it — the legible-surface doctrine applied to the shell.
  var fromHash = subjectFromLocation();
  var stored = '';
  try { stored = localStorage.getItem(SUBJECT_KEY) || ''; } catch (e) { /* private mode */ }
  subjectStored = stored || null;
  layoutContextRail();
  showSubject(fromHash || stored || 'fleet');
  if (fromHash) {
    var target = document.getElementById(location.hash.slice(1));
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView();
  }
  window.addEventListener('hashchange', function () {
    var s = subjectFromLocation();
    if (s) showSubject(s);
  });
  // renderProjectPage rebuilds main#fleet's sections on every render and
  // announces it; the active subject's inactive marks are re-applied to
  // the new nodes (guarded, so an identical render writes nothing).
  document.addEventListener('ap:subjects-changed', function () {
    showSubject(document.body.dataset.subject || 'fleet');
  });
  if (typeof window.matchMedia === 'function') {
    var mq = window.matchMedia(SUBJECT_STACKED_MQ);
    var onRegime = function () { showSubject(document.body.dataset.subject || 'fleet'); };
    if (mq.addEventListener) mq.addEventListener('change', onRegime);
    var railMq = window.matchMedia(CONTEXT_RAIL_MQ);
    var onRail = function () { layoutContextRail(); showSubject(document.body.dataset.subject || 'fleet'); };
    if (railMq.addEventListener) railMq.addEventListener('change', onRail);
  }
  // Panels hide/show themselves on every poll; the nav's "nothing here yet"
  // state and each link's aria-disabled follow them. One subtree observer on
  // the body sees every section's "hidden" flip; the guarded writes above
  // keep an identical tick silent (epic 0018 law 3).
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function (records) {
      // A record can arrive while the page is being torn down (unload, or a
      // test harness closing its document): nothing to mark on nothing.
      if (typeof document === 'undefined' || !document.body) return;
      for (var i = 0; i < records.length; i++) {
        if (records[i].target && records[i].target.id === 'subject-empty') continue; // our own write
        showSubject(document.body.dataset.subject || 'fleet');
        return;
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  }
  // From lg up every subject is on the page: the rail follows the reader.
  if (typeof IntersectionObserver === 'function') {
    var visible = {};
    var spy = new IntersectionObserver(function (entries) {
      if (typeof document === 'undefined' || !document.body) return;
      if (!subjectIsStacked()) return;
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting ? en.intersectionRatio : 0; });
      var best = '', bestRatio = 0;
      Object.keys(visible).forEach(function (id) {
        if (visible[id] > bestRatio) { bestRatio = visible[id]; best = subjectOfId(id); }
      });
      if (best) markSubjectLinks(best);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    Array.prototype.forEach.call(document.body.children, function (k) {
      // The rail's sections are context, always in view from xl: they never steer the spy.
      if (k.dataset && k.dataset.subject && k.id && CONTEXT_RAIL_IDS.indexOf(k.id) < 0) spy.observe(k);
    });
  }
}
// ---- FOCUS MODE (epic 0021 slice 8): the chrome leaves, the work stays. ----
// Opt-in and never persisted — a reload is the way home a less technical
// operator always has. Escape exits (unless the palette owns the key).
function setFocusMode(on) {
  var body = document.body;
  var next = on ? 'on' : null;
  if ((body.dataset.focus || null) !== next) {
    if (next) body.dataset.focus = next; else delete body.dataset.focus;
  }
  var toggle = document.getElementById('focus-toggle');
  if (toggle && toggle.getAttribute('aria-pressed') !== String(!!on)) toggle.setAttribute('aria-pressed', String(!!on));
  var exit = document.getElementById('focus-exit');
  if (exit && exit.hidden === !!on) exit.hidden = !on;
}
function bootFocusMode() {
  var toggle = document.getElementById('focus-toggle');
  var exit = document.getElementById('focus-exit');
  if (!toggle || !exit) return;
  toggle.addEventListener('click', function () { setFocusMode(document.body.dataset.focus !== 'on'); });
  exit.addEventListener('click', function () {
    setFocusMode(false);
    if (typeof toggle.focus === 'function') toggle.focus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.dataset.focus === 'on' && !paletteIsOpen()) setFocusMode(false);
  });
}
// ---- COMMAND PALETTE (epic 0021 slice 7, closes 0017 slice 4) ----
// Ctrl/⌘-K. A combobox over a listbox: the input keeps focus, the active
// option is a virtual highlight (aria-activedescendant), Enter runs it.
// Items are read from the page itself — its subject links, its project
// cards, the theme and language buttons, focus, the tour — so a new place
// or action appears here the day it appears on the page.
var paletteAll = [];
var paletteShown = [];
var paletteActive = 0;
function paletteEl() { return document.getElementById('palette'); }
function paletteIsOpen() { var d = paletteEl(); return !!(d && d.hasAttribute('open')); }
function paletteText(key, name) {
  if (typeof tr === 'function') return name === undefined ? tr(key) : tr(key, { name: name });
  return name === undefined ? key : key + ' ' + name;
}
function paletteCollect() {
  var items = [];
  subjectLinks().forEach(function (a) {
    var name = (a.textContent || '').trim();
    items.push({ label: paletteText('paletteGoTo', name), run: function () { a.click(); } });
  });
  Array.prototype.forEach.call(document.querySelectorAll('a.card-link[href^="/p/"]'), function (a) {
    var name = (a.textContent || '').trim();
    if (name) items.push({ label: paletteText('paletteOpenProject', name), run: function () { location.href = a.getAttribute('href'); } });
  });
  var fly = document.getElementById('fly-folder');
  if (fly) items.push({ label: paletteText('flyFolder'), run: function () { showSubject('fly'); fly.focus(); } });
  var q = document.getElementById('search-q');
  if (q) items.push({ label: paletteText('paletteSearch'), run: function () { showSubject('fly'); q.focus(); } });
  Array.prototype.forEach.call(document.querySelectorAll('[data-theme-btn]'), function (b) {
    items.push({ label: paletteText('paletteTheme', (b.textContent || '').trim()), run: function () { b.click(); } });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-lang-btn]'), function (b) {
    items.push({ label: paletteText('paletteLanguage', (b.textContent || '').trim()), run: function () { b.click(); } });
  });
  if (document.getElementById('focus-toggle')) {
    var on = document.body.dataset.focus === 'on';
    items.push({ label: paletteText(on ? 'focusExit' : 'focusMode'), run: function () { setFocusMode(!on); } });
  }
  var tour = document.getElementById('tour-btn');
  if (tour) items.push({ label: paletteText('tour'), run: function () { tour.click(); } });
  return items;
}
function paletteRender() {
  var list = document.getElementById('palette-list');
  var input = document.getElementById('palette-input');
  if (!list || !input) return;
  var q = (input.value || '').trim().toLowerCase();
  paletteShown = paletteAll.filter(function (it) { return !q || it.label.toLowerCase().indexOf(q) >= 0; });
  if (paletteActive >= paletteShown.length) paletteActive = 0;
  list.replaceChildren();
  if (paletteShown.length === 0) {
    var none = document.createElement('li');
    none.className = 'palette-empty';
    none.textContent = paletteText('paletteEmpty');
    list.appendChild(none);
    input.removeAttribute('aria-activedescendant');
    return;
  }
  paletteShown.forEach(function (it, i) {
    var li = document.createElement('li');
    li.id = 'palette-opt-' + i;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === paletteActive));
    li.textContent = it.label;
    li.addEventListener('click', function () { paletteRun(i); });
    list.appendChild(li);
  });
  input.setAttribute('aria-activedescendant', 'palette-opt-' + paletteActive);
}
function paletteRun(i) {
  var it = paletteShown[i];
  paletteClose();
  if (it) it.run();
}
function paletteOpen() {
  var d = paletteEl();
  var input = document.getElementById('palette-input');
  if (!d || !input) return;
  paletteAll = paletteCollect();
  paletteActive = 0;
  input.value = '';
  if (!d.hasAttribute('open')) {
    // showModal traps focus and gives Escape for free; where it is missing or
    // unimplemented (jsdom throws), the open attribute still shows the dialog.
    var modal = false;
    if (typeof d.showModal === 'function') { try { d.showModal(); modal = true; } catch (e) { modal = false; } }
    if (!modal) d.setAttribute('open', '');
  }
  paletteRender();
  input.focus();
}
function paletteClose() {
  var d = paletteEl();
  if (!d) return;
  if (d.hasAttribute('open')) {
    var closed = false;
    if (typeof d.close === 'function') { try { d.close(); closed = true; } catch (e) { closed = false; } }
    if (!closed || d.hasAttribute('open')) d.removeAttribute('open');
  }
  var btn = document.getElementById('palette-btn');
  if (btn && typeof btn.focus === 'function') btn.focus();
}
function bootCommandPalette() {
  var d = paletteEl();
  var input = document.getElementById('palette-input');
  if (!d || !input) return;
  var btn = document.getElementById('palette-btn');
  if (btn) btn.addEventListener('click', function () { if (paletteIsOpen()) paletteClose(); else paletteOpen(); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (paletteIsOpen()) paletteClose(); else paletteOpen();
    }
  });
  input.addEventListener('input', function () { paletteActive = 0; paletteRender(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (paletteShown.length) { paletteActive = (paletteActive + 1) % paletteShown.length; paletteRender(); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (paletteShown.length) { paletteActive = (paletteActive - 1 + paletteShown.length) % paletteShown.length; paletteRender(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      paletteRun(paletteActive);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      paletteClose();
    }
  });
  // A click on the backdrop (the dialog element itself, outside its content) closes.
  d.addEventListener('click', function (e) { if (e.target === d) paletteClose(); });
}
bootSubjectNav();
bootFocusMode();
bootCommandPalette();
`.trim();
}
