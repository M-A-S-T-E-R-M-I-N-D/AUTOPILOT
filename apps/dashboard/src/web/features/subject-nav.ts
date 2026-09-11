// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * APP SHELL — subject navigation (epic 0021, slice 2).
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
var SUBJECT_NAMES = ['fleet', 'fly', 'keeper', 'community'];
var subjectScrollMemo = {};
var subjectStored = null;
function subjectIsStacked() {
  return typeof window.matchMedia === 'function' && window.matchMedia(SUBJECT_STACKED_MQ).matches;
}
function subjectLinks() {
  return Array.prototype.slice.call(document.querySelectorAll('#subject-nav [data-subject-link]'));
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
  var kids = document.body.children;
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    if (k.dataset && k.dataset.subject === name && !k.hidden) return true;
  }
  return false;
}
function markSubjectLinks(active) {
  subjectLinks().forEach(function (a) {
    var name = a.dataset.subjectLink;
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
  if (SUBJECT_NAMES.indexOf(name) < 0) name = 'fleet';
  var body = document.body;
  var previous = body.dataset.subject || 'fleet';
  if (previous !== name) {
    if (!subjectIsStacked()) subjectScrollMemo[previous] = window.scrollY || 0;
    body.dataset.subject = name;
    // Each subject keeps its own scroll (epic 0018: switching never reflows
    // a sibling; here the sibling is not even rendered).
    if (!subjectIsStacked()) window.scrollTo(0, subjectScrollMemo[name] || 0);
  }
  var empty = document.getElementById('subject-empty');
  var showEmpty = !subjectIsStacked() && !subjectHasContent(name);
  if (empty && empty.hidden === showEmpty) empty.hidden = !showEmpty;
  if (subjectStored !== name) {
    try { localStorage.setItem(SUBJECT_KEY, name); } catch (e) { /* private mode */ }
    subjectStored = name;
  }
  markSubjectLinks(name);
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
  showSubject(fromHash || stored || 'fleet');
  if (fromHash) {
    var target = document.getElementById(location.hash.slice(1));
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView();
  }
  window.addEventListener('hashchange', function () {
    var s = subjectFromLocation();
    if (s) showSubject(s);
  });
  if (typeof window.matchMedia === 'function') {
    var mq = window.matchMedia(SUBJECT_STACKED_MQ);
    var onRegime = function () { showSubject(document.body.dataset.subject || 'fleet'); };
    if (mq.addEventListener) mq.addEventListener('change', onRegime);
  }
  // Panels hide/show themselves on every poll; the nav's "nothing here yet"
  // state and each link's aria-disabled follow them. One subtree observer on
  // the body sees every section's "hidden" flip; the guarded writes above
  // keep an identical tick silent (epic 0018 law 3).
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].target && records[i].target.id === 'subject-empty') continue; // our own write
        showSubject(document.body.dataset.subject || 'fleet');
        return;
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  }
  // From lg up every subject is on the page: the rail follows the reader.
  if (typeof IntersectionObserver === 'function') {
    var visible = {};
    var spy = new IntersectionObserver(function (entries) {
      if (!subjectIsStacked()) return;
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting ? en.intersectionRatio : 0; });
      var best = '', bestRatio = 0;
      Object.keys(visible).forEach(function (id) {
        if (visible[id] > bestRatio) { bestRatio = visible[id]; best = subjectOfId(id); }
      });
      if (best) markSubjectLinks(best);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    Array.prototype.forEach.call(document.body.children, function (k) {
      if (k.dataset && k.dataset.subject && k.id) spy.observe(k);
    });
  }
}
bootSubjectNav();
`.trim();
}
