// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ONBOARDING LADDER (epic 0032), client half — the panel that turns
 * `web/onboarding.ts`'s pure model into seven micro-tasks a newcomer can
 * actually press.
 *
 * Three rules this module exists to keep:
 *
 *  1. A step that CAN be performed from here performs it. "Add the calculator
 *     sample" copies a real project and fills the Fly bar with its path; it
 *     does not tell the reader to go and find a folder. That is the whole
 *     difference between this and the tour (`features/tour.ts`).
 *  2. It nudges once, about one thing. `computeOnboarding()` names a single
 *     current step, and "remind me later" puts the panel away for the rest of
 *     the day — the operator's standing rule against nagging.
 *  3. Nothing here invents state. Signals come from the fleet poll the page
 *     already runs (`syncOnboarding`, called from `renderFleet`) plus marks
 *     this module writes when an action of its own succeeds.
 *
 * `ONBOARDING_STEPS`, `computeOnboarding` and the icon shapes are spliced in
 * from their real modules via `JSON.stringify()`/`.toString()`, so the served
 * checklist and the tested model cannot drift apart — the same technique
 * `features/tour.ts` uses for `TOUR_STEPS`.
 *
 * DOM built with `createElement` + `textContent` only, never `innerHTML`
 * (`features/search.ts`'s rule); icons are assembled from `ICON_SHAPES` with
 * `createElementNS`, the way `features/office-map.ts` draws its satellites.
 */

import { ONBOARDING_STEPS, computeOnboarding, isStepDone, LEVEL_META } from '../onboarding.js';
import { ICON_SHAPES } from '../icons.js';

/** The icon shapes this panel can draw — only the ladder's own, so the
 *  splice stays small instead of shipping the whole registry twice. */
export const LADDER_ICONS = Object.fromEntries(
  ONBOARDING_STEPS.map((step) => [step.icon, ICON_SHAPES[step.icon] ?? []]),
);

export function onboardingJs(): string {
  return `
// ── THE ONBOARDING LADDER (epic 0032) ──────────────────────────────────────
// Seven micro-tasks across two levels. Everything below the comment is the
// model's REAL value and REAL compiled source, spliced from web/onboarding.ts
// — including every binding computeOnboarding closes over, under its own
// name, because a free variable left behind is a ReferenceError on paint.
var ONBOARDING_STEPS = ${JSON.stringify(ONBOARDING_STEPS)};
var LEVEL_META = ${JSON.stringify(LEVEL_META)};
var OB_ICONS = ${JSON.stringify(LADDER_ICONS)};
${isStepDone.toString()}
${computeOnboarding.toString()}

// Marks: the four facts no poll can tell us (a sample was added, a record was
// read, a finding was published, a fix was submitted). Written once, kept —
// a checklist that un-ticks itself is a checklist nobody trusts.
var OB_MARKS_KEY = 'ap-ob-marks';
// A snooze is a DATE, not a flag: "later" means later today, and the panel
// comes back the next day the dashboard is opened. A permanent dismissal is
// the "hide" button, which sets the far-future sentinel below.
var OB_SNOOZE_KEY = 'ap-ob-snooze';
var OB_SNOOZE_FOREVER = 'forever';
var obState = null;

function obMarks() {
  try { return JSON.parse(localStorage.getItem(OB_MARKS_KEY) || '{}') || {}; }
  catch (err) { return {}; }
}
function obMark(id) {
  var marks = obMarks();
  if (marks[id]) return;
  marks[id] = 1;
  try { localStorage.setItem(OB_MARKS_KEY, JSON.stringify(marks)); } catch (err) {}
  if (typeof syncOnboarding === 'function') syncOnboarding(obLastState);
}
function obToday() { return new Date().toISOString().slice(0, 10); }
function obSnoozed() {
  var v = '';
  try { v = localStorage.getItem(OB_SNOOZE_KEY) || ''; } catch (err) {}
  return v === OB_SNOOZE_FOREVER || v === obToday();
}

// The SVG icon for a step, drawn from the spliced shapes — createElementNS,
// never innerHTML (features/search.ts's rule).
var OB_SVG_NS = 'http://www.w3.org/2000/svg';
function obIcon(name) {
  var svg = document.createElementNS(OB_SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.className.baseVal = 'icon';
  var shapes = OB_ICONS[name] || [];
  for (var i = 0; i < shapes.length; i++) {
    var node = document.createElementNS(OB_SVG_NS, shapes[i][0]);
    var attrs = shapes[i][1] || {};
    for (var key in attrs) if (Object.prototype.hasOwnProperty.call(attrs, key)) node.setAttribute(key, attrs[key]);
    svg.appendChild(node);
  }
  return svg;
}

// ── the signals ────────────────────────────────────────────────────────────
// Everything the model needs, assembled out of the fleet state this page
// already polls plus this module's own marks. No new endpoint, no new poll.
var obLastState = null;
function obSignals(state) {
  var projects = (state && state.projects) || [];
  var firings = 0;
  for (var i = 0; i < projects.length; i++) firings += Number(projects[i].firings || 0);
  var marks = obMarks();
  return {
    sampleAdded: marks['add-sample'] === 1,
    projectCount: projects.length,
    firingCount: firings,
    readBack: marks['read-back'] === 1,
    githubConnected: obGithubConnected(),
    findingPublished: marks['publish-finding'] === 1,
    fixSubmitted: marks['submit-fix'] === 1,
  };
}
// Whether \`gh\` is signed in on this machine.
//
// This used to read a dataset flag off the Connect panel's status line that
// nothing in the product ever wrote, so the step could never tick no matter
// how connected the machine was (operator, 2026-09-15: "I click it, nothing
// happens, and I think I am already connected"). Ask the same endpoint the
// Connect panel asks, once, and re-sync when the answer lands. Its test
// censuses the old attribute name so the guess cannot come back.
function obGithubConnected() {
  if (obMarks()['connect-github'] === 1) return true;
  // features/connect.ts resolves this once and publishes it; asking again
  // here would be a second request for the same fact, which the boot smoke
  // test rightly counts. A hoisted var read before that load yields
  // undefined, which is "not connected" — correct, and it re-syncs when the
  // real answer lands.
  return apGhAuthenticated === true;
}

// ── painting ───────────────────────────────────────────────────────────────
function syncOnboarding(state) {
  obLastState = state || obLastState;
  var panel = document.getElementById('onboarding');
  if (!panel) return;
  obState = computeOnboarding(obSignals(obLastState));
  // The ladder disappears for good once both ticks are earned — it has
  // nothing left to say, and a permanent checklist reads as clutter.
  if (obState.complete || obSnoozed()) { panel.hidden = true; return; }
  panel.hidden = false;
  obPaintProgress();
  obPaintSteps();
  obPaintBadges();
}

function obPaintProgress() {
  var bar = document.getElementById('ob-progress');
  var label = document.getElementById('ob-progress-label');
  if (bar) {
    bar.setAttribute('aria-valuenow', String(obState.percent));
    var fill = document.getElementById('ob-progress-fill');
    if (fill) fill.style.width = obState.percent + '%';
  }
  if (label) {
    var done = 0;
    for (var i = 0; i < obState.steps.length; i++) if (obState.steps[i].done) done++;
    label.textContent = tr('obProgress', { done: done, total: obState.steps.length });
  }
}

function obPaintSteps() {
  var list = document.getElementById('ob-steps');
  if (!list) return;
  list.textContent = '';
  var levelSeen = {};
  for (var i = 0; i < obState.steps.length; i++) {
    var entry = obState.steps[i];
    var step = entry.step;
    // Level 2 gets its own heading and its "no hurry" sentence, printed once,
    // the first time a level-2 step appears.
    if (!levelSeen[step.level]) {
      levelSeen[step.level] = 1;
      list.appendChild(obLevelHeader(step.level));
    }
    list.appendChild(obStepItem(entry));
  }
}

function obLevelHeader(level) {
  var li = document.createElement('li');
  li.className = 'ob-level';
  var h = document.createElement('h3');
  h.className = 'ob-level-title';
  h.textContent = tr(level === 1 ? 'obLevel1' : 'obLevel2');
  li.appendChild(h);
  if (level === 2) {
    var note = document.createElement('p');
    note.className = 'ob-level-note muted';
    note.textContent = tr('obLevel2Intro');
    li.appendChild(note);
  }
  return li;
}

function obStepItem(entry) {
  var step = entry.step;
  var li = document.createElement('li');
  li.className = 'ob-step' + (entry.done ? ' is-done' : '') + (entry.current ? ' is-current' : '');
  li.dataset.step = step.id;

  var mark = document.createElement('span');
  mark.className = 'ob-step-mark';
  if (entry.done) {
    mark.appendChild(obTick());
    // The tick is decorative; the state is announced in words below, so a
    // screen reader hears "Done" rather than a glyph name.
  } else {
    mark.appendChild(obIcon(step.icon));
  }
  li.appendChild(mark);

  var body = document.createElement('div');
  body.className = 'ob-step-body';
  var title = document.createElement('p');
  title.className = 'ob-step-title';
  title.textContent = tr(step.titleKey);
  var status = document.createElement('span');
  status.className = 'ob-step-status';
  status.textContent = entry.done ? tr('obStepDone') : entry.current ? tr('obStepCurrent') : '';
  if (status.textContent) title.appendChild(status);
  body.appendChild(title);
  var text = document.createElement('p');
  text.className = 'ob-step-text muted';
  text.textContent = tr(step.bodyKey);
  body.appendChild(text);

  if (!entry.done && step.actionKey) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ob-step-action';
    btn.textContent = tr(step.actionKey);
    btn.dataset.obAction = step.id;
    btn.addEventListener('click', (function (id, button) {
      return function () { obRunStep(id, button); };
    })(step.id, btn));
    body.appendChild(btn);
  }
  li.appendChild(body);
  return li;
}

function obTick() {
  var svg = document.createElementNS(OB_SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  var path = document.createElementNS(OB_SVG_NS, 'polyline');
  path.setAttribute('points', '20 6 9 17 4 12');
  svg.appendChild(path);
  return svg;
}

// The two ticks: one per level, lit when that level is complete. These are
// the same two a contributor carries beside their name on the standing board.
function obPaintBadges() {
  var host = document.getElementById('ob-badges');
  if (!host) return;
  host.textContent = '';
  for (var i = 0; i < obState.levels.length; i++) {
    var level = obState.levels[i];
    var badge = document.createElement('span');
    badge.className = 'ob-badge' + (level.complete ? ' is-earned' : '');
    var label = document.createElement('span');
    label.className = 'ob-badge-name';
    label.textContent = tr(level.badgeKey);
    badge.appendChild(label);
    var state = document.createElement('span');
    state.className = 'ob-badge-state';
    state.textContent = level.complete
      ? tr('obBadgeEarned')
      : tr('obProgress', { done: level.done, total: level.total });
    badge.appendChild(state);
    // The whole badge reads as one sentence to a screen reader: name, then
    // whether it is earned — never colour alone (WCAG 1.4.1).
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', label.textContent + ' — ' + state.textContent);
    host.appendChild(badge);
  }
}

// ── the actions ────────────────────────────────────────────────────────────
function obRunStep(id, btn) {
  if (id === 'add-sample') return obAddSample(btn);
  if (id === 'lock-on') return obLockOn();
  if (id === 'read-back') return obReadBack();
  if (id === 'connect-github') return obOpenConnect();
  if (id === 'publish-finding') return obPublishFinding();
  if (id === 'submit-fix') return obOpenSubject('keeper');
}

// One click, a real project. The server copies samples/<name> OUT of this
// checkout into ~/AUTOPILOT-samples/<name> and registers it — see
// flight/sample-project.ts for why a copy, not the original.
function obAddSample(btn) {
  btn.disabled = true;
  fetch('/api/onboarding/sample', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sample: 'calculator-materials' }),
  })
    .then(function (r) { return r.json().catch(function () { return null; }); })
    .then(function (res) {
      btn.disabled = false;
      if (!res || res.ok !== true) {
        snack((res && res.message) || (res && res.error) || tr('obAddSample'), 'err');
        return;
      }
      obMark('add-sample');
      // Fill the Fly bar with the copy's path: the next step is already done
      // for them, which is the point of a micro-task.
      var folder = document.getElementById('fly-folder');
      if (folder && res.folder) {
        folder.value = res.folder;
        folder.dispatchEvent(new Event('input', { bubbles: true }));
      }
      snack(res.message, 'ok');
      // fleetJs()'s own poll — a hoisted global in the concatenated bundle.
      if (typeof refresh === 'function') refresh();
    })
    .catch(function () { btn.disabled = false; snack(tr('obAddSample'), 'err'); });
}

// Connect is a masthead POPOVER (<details id="connect">), not one of the
// subject panels — so the generic subject opener found nothing and the
// button did nothing at all (operator, 2026-09-15). Open the popover, then
// put focus on the control the step is actually asking them to press.
function obOpenConnect() {
  var panel = document.getElementById('connect');
  if (!panel) { snack(tr('obConnectGithubBody'), 'info'); return; }
  panel.open = true;
  var summary = document.getElementById('connect-summary');
  if (summary && typeof summary.scrollIntoView === 'function') {
    summary.scrollIntoView({ block: 'nearest' });
  }
  var login = document.getElementById('gh-login');
  if (login && typeof login.focus === 'function') login.focus();
  else if (summary && typeof summary.focus === 'function') summary.focus();
}

function obLockOn() {
  var folder = document.getElementById('fly-folder');
  if (!folder) return;
  var bar = document.getElementById('flightbar');
  if (bar) bar.hidden = false;
  folder.focus();
  folder.select && folder.select();
}

// "Read what came back" is the only step whose completion is a reading, not a
// write — so opening the record IS the completion.
function obReadBack() {
  obMark('read-back');
  obOpenSubject('fleet');
  var first = document.querySelector('#fleet [data-project-id]');
  if (first && typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center' });
}

function obPublishFinding() {
  var btn = document.getElementById('report-btn');
  if (btn) btn.click();
  // Marked by report-from-here's own success path (obMark('publish-finding')),
  // never here: opening the composer is not publishing anything.
}

function obOpenSubject(subject) {
  var link = document.querySelector('[data-subject-link="' + subject + '"]');
  if (link && typeof link.click === 'function') { link.click(); return; }
  var panel = document.querySelector('[data-subject="' + subject + '"]');
  if (panel && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ block: 'start' });
}

function obSnooze(forever) {
  try { localStorage.setItem(OB_SNOOZE_KEY, forever ? OB_SNOOZE_FOREVER : obToday()); } catch (err) {}
  var panel = document.getElementById('onboarding');
  if (panel) panel.hidden = true;
  snack(tr('obSnoozeDone'), 'info');
}

// THE HAND-OVER, receiving end (operator, 2026-09-15). The tour's last step
// calls this. A reader who just learned the four words lands on the first
// thing to do, with it actually visible — a snooze from an earlier day must
// not swallow a hand-over they asked for by pressing the button.
function obFocusLadder() {
  try { localStorage.removeItem(OB_SNOOZE_KEY); } catch (err) {}
  syncOnboarding(obLastState);
  var panel = document.getElementById('onboarding');
  if (!panel || panel.hidden) return;
  if (typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ block: 'center' });
  // Focus the one step being nudged about, not the top of the panel.
  var current = panel.querySelector('.ob-step.is-current .ob-step-action');
  if (current && typeof current.focus === 'function') current.focus();
}

function onboardingInit() {
  var later = document.getElementById('ob-snooze');
  if (later) later.addEventListener('click', function () { obSnooze(false); });
  // …and the way back: the ladder tells you what to DO, the tour tells you
  // what the words MEAN. Either one should be able to reach the other.
  var toTour = document.getElementById('ob-tour-link');
  if (toTour) {
    toTour.addEventListener('click', function () {
      if (typeof openTour === 'function') openTour();
    });
  }
  syncOnboarding(null);
}
onboardingInit();
`.trim();
}
