// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * BUSY STATES — the ritual scrim (operator, 2026-09-13: "spinners and
 * progress bars while we wait; blur and hold the screen while the AI writes,
 * sends to GitHub or performs an action — or let the user minimize, with a
 * warning that the software may not respond while the update runs").
 *
 * Doctrine, from the Material 3 progress/loading-indicator guidelines, the
 * Apple HIG progress-indicator and Loading pages, and the loading-UX
 * literature (see docs/epics/0028-busy-states.md):
 * - ACKNOWLEDGE AT ONCE: the pressed button keeps its width and goes
 *   aria-busy; the scrim is up within the same frame.
 * - DETERMINATE WHEN KNOWABLE, never fake: the landing job reports its real
 *   gate steps (step N of M, each with its verdict) and the bar follows
 *   them; every other ritual is honestly indeterminate — a sweep, an elapsed
 *   clock, and the step it is on.
 * - BLOCK ONLY OUTWARD, IRREVERSIBLE WORK: a merge+push, a tag+release, a
 *   comment/assign/label on GitHub, an issue opened in the fleet's name, the
 *   model composing text that is about to be sent. One modal scrim; every
 *   sibling of the scrim is `inert`; reads keep flowing beneath it (the SSE
 *   stream still paints).
 * - ALWAYS AN ESCAPE: Minimize (or Escape) collapses the scrim to a corner
 *   pill and un-freezes the page — but every OTHER write button stays locked
 *   with a spoken reason until the ritual ends. That is the "minimize, but
 *   the software may not respond" warning, made precise. Never Cancel: the
 *   server-side action cannot be recalled once sent, and a Cancel that does
 *   nothing would be a lie.
 * - REDUCED MOTION: the sheet's global kill switch stops the spinner and the
 *   sweep; the words carry the state. REDUCED TRANSPARENCY: a solid scrim
 *   instead of glass.
 *
 * One API for every ritual: `ritualFetch(kind, url, init, opts)` — a drop-in
 * for `fetch` that opens the scrim, resolves the very same Response, and
 * closes the scrim (done/failed, read off the response) once it settles.
 * The landing is the determinate exception: `{ follow: true }` keeps the
 * scrim open past the POST and `ritualFollowLandingJob(pid, job)` (called by
 * `landing.ts`'s poller) paints the job's real steps and closes on
 * `finished` — so the scrim outlives a self-healing wait or a self-restart.
 *
 * Rides the CORE chunk: `landing.ts` (project chunk) and the deferred panels
 * call `ritualFetch` as a hoisted global, so it must be defined before either
 * `defer` script runs. Every DOM write is guarded (identical fact ⇒ zero
 * writes) so a poll tick never repaints a settled scrim (epic 0018 law 3).
 */

/** The busy-state client — vanilla, external (keeps CSP script-src 'self'). */
export function busyJs(): string {
  return `
// BUSY STATES (2026-09-13) — the ritual scrim. See web/features/busy.ts.
var RITUAL_TITLE_KEYS = {
  landing: 'ritualLanding',
  release: 'ritualRelease',
  claim: 'ritualClaim',
  'pr-review': 'ritualPrReview',
  'issue-triage': 'ritualIssueTriage',
  'mirror-pass': 'ritualMirrorPass',
  'discussions-triage': 'ritualDiscussionsTriage',
  report: 'ritualReport',
  'github-issue': 'ritualGithubIssue',
  compose: 'ritualCompose',
  update: 'ritualUpdate',
};
// Every button that sends an outward write. While a ritual runs, a press on
// any of them is refused with a spoken reason (the capture-phase guard
// below) — the operator's "the software may not respond" warning, made
// precise: reads flow, writes wait.
var RITUAL_WRITE_SELECTOR = '.landing-execute, .release-execute, .pr-review-execute, .issue-triage-execute, .pool-client-execute, .pool-client-fly, .mirror-pass-execute, .discussions-triage-execute, .report-execute, .gh-issue-form button, .update-banner button';
var RITUAL_DONE_LINGER_MS = 1800;
var RITUAL_FAIL_LINGER_MS = 8000;
var ritual = null;
var ritualDom = null;
function ritualNodes() {
  if (ritualDom) return ritualDom;
  var scrim = el('div', 'ritual-scrim');
  scrim.id = 'ritual-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-labelledby', 'ritual-title');
  scrim.setAttribute('aria-describedby', 'ritual-note');
  scrim.hidden = true;
  var card = el('div', 'ritual-card');
  var head = el('div', 'ritual-head');
  var spinner = el('span', 'ritual-spinner');
  spinner.setAttribute('aria-hidden', 'true');
  var title = el('h2', 'ritual-title');
  title.id = 'ritual-title';
  var clock = el('span', 'ritual-clock');
  clock.setAttribute('aria-hidden', 'true');
  head.appendChild(spinner);
  head.appendChild(title);
  head.appendChild(clock);
  var note = el('p', 'ritual-note');
  note.id = 'ritual-note';
  note.setAttribute('aria-live', 'polite');
  var bar = el('div', 'ritual-progress');
  bar.setAttribute('role', 'progressbar');
  // Its accessible name is the ritual's title (axe: aria-progressbar-name).
  bar.setAttribute('aria-labelledby', 'ritual-title');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  var fill = el('div', 'ritual-progress-fill');
  bar.appendChild(fill);
  var steps = el('ol', 'ritual-steps');
  var warning = el('p', 'ritual-warning');
  var actions = el('div', 'ritual-actions');
  var action = el('button', 'ritual-minimize');
  action.type = 'button';
  action.addEventListener('click', function () {
    if (ritual && ritual.done) ritualClose();
    else ritualMinimize();
  });
  actions.appendChild(action);
  card.appendChild(head);
  card.appendChild(note);
  card.appendChild(bar);
  card.appendChild(steps);
  card.appendChild(warning);
  card.appendChild(actions);
  scrim.appendChild(card);
  var pill = el('button', 'ritual-pill');
  pill.id = 'ritual-pill';
  pill.type = 'button';
  pill.hidden = true;
  pill.setAttribute('aria-live', 'polite');
  var pillDot = el('span', 'ritual-pill-dot');
  pillDot.setAttribute('aria-hidden', 'true');
  var pillText = el('span', 'ritual-pill-text');
  var pillClock = el('span', 'ritual-pill-clock');
  pill.appendChild(pillDot);
  pill.appendChild(pillText);
  pill.appendChild(pillClock);
  pill.addEventListener('click', function () { ritualMaximize(); });
  var toast = el('div', 'ritual-toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  document.body.appendChild(scrim);
  document.body.appendChild(pill);
  document.body.appendChild(toast);
  ritualDom = { scrim: scrim, title: title, clock: clock, note: note, bar: bar, fill: fill, steps: steps, warning: warning, action: action, pill: pill, pillText: pillText, pillClock: pillClock, toast: toast };
  return ritualDom;
}
function ritualTitleText(r) {
  var key = RITUAL_TITLE_KEYS[r.kind];
  var base = key ? tr(key) : r.kind;
  return r.subject ? base + ' · ' + r.subject : base;
}
function ritualSetText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
function ritualSetAttr(node, name, value) {
  if (value === null || value === undefined) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
  } else if (node.getAttribute(name) !== String(value)) {
    node.setAttribute(name, String(value));
  }
}
// Freeze = every sibling of the scrim/pill/toast is inert. The stream keeps
// painting beneath (a hidden-by-inert panel still receives its DOM writes);
// only focus and pointer are held back.
function ritualFreeze(on) {
  var kids = document.body.children;
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    if (k.id === 'ritual-scrim' || k.id === 'ritual-pill' || k.classList.contains('ritual-toast')) continue;
    if (on) { if (!k.hasAttribute('inert')) k.setAttribute('inert', ''); }
    else if (k.hasAttribute('inert')) k.removeAttribute('inert');
  }
}
// A ritual belongs to the page that started it: once that document is
// replaced (a rewritten page, a test boot), its scrim is disconnected and the
// ritual is dead — its guard must never hold the NEXT page's buttons.
function ritualStale() {
  return !!ritualDom && !ritualDom.scrim.isConnected;
}
function ritualState() {
  if (!ritual) return 'idle';
  if (!ritual.done) return 'running';
  return ritual.ok ? 'done' : 'failed';
}
function ritualPaint() {
  if (!ritual) return;
  var d = ritualNodes();
  var r = ritual;
  var state = ritualState();
  ritualSetAttr(d.scrim, 'data-ritual-state', state);
  ritualSetAttr(d.pill, 'data-ritual-state', state);
  ritualSetText(d.title, ritualTitleText(r));
  ritualSetAttr(d.clock, 'data-elapsed-from', r.done ? null : String(r.startedAt));
  if (r.done) ritualSetText(d.clock, fmtDuration(r.endedAt - r.startedAt));
  var note = r.done ? (r.message || (r.ok ? tr('ritualDone') : tr('ritualFailed'))) : (r.note || tr('ritualWorking'));
  ritualSetText(d.note, note);
  var total = r.stepTotal || 0;
  var determinate = total > 0;
  var pct = 100;
  if (!r.done) {
    if (determinate) {
      var passed = 0;
      var running = 0;
      for (var i = 0; i < r.steps.length; i++) {
        if (r.steps[i].state === 'pass' || r.steps[i].state === 'fail') passed++;
        else if (r.steps[i].state === 'running') running++;
      }
      pct = Math.round(((passed + running * 0.5) / total) * 100);
    }
  }
  ritualSetAttr(d.bar, 'data-indeterminate', !r.done && !determinate ? '' : null);
  ritualSetAttr(d.bar, 'aria-valuenow', !r.done && !determinate ? null : String(pct));
  var stepText = determinate && !r.done ? tr('ritualStepOf', { index: String(r.stepIndex || Math.min(r.steps.length, total)), total: String(total) }) : note;
  ritualSetAttr(d.bar, 'aria-valuetext', stepText);
  var fillSize = (!r.done && !determinate) ? '' : pct + '%';
  if (d.fill.style.inlineSize !== fillSize) d.fill.style.inlineSize = fillSize;
  // Steps: rebuild only when their signature changes (a poll tick with the
  // same job state writes nothing).
  var sig = r.steps.map(function (s) { return s.label + ':' + s.state + ':' + (s.durationMs || ''); }).join('|');
  if (d.steps.getAttribute('data-sig') !== sig) {
    d.steps.setAttribute('data-sig', sig);
    d.steps.replaceChildren();
    for (var j = 0; j < r.steps.length; j++) {
      var s = r.steps[j];
      var li = el('li', 'ritual-step');
      li.setAttribute('data-state', s.state);
      li.appendChild(el('span', 'ritual-step-label', s.label));
      if (s.durationMs) li.appendChild(el('span', 'ritual-step-time', fmtDuration(s.durationMs)));
      d.steps.appendChild(li);
    }
  }
  ritualSetText(d.warning, r.done ? '' : tr('ritualWarning'));
  ritualSetText(d.action, r.done ? tr('ritualClose') : tr('ritualMinimize'));
  var scrimHidden = r.minimized && !r.done ? true : (r.done && r.closed);
  if (d.scrim.hidden !== scrimHidden) d.scrim.hidden = scrimHidden;
  var pillHidden = !(r.minimized && !r.closed);
  if (d.pill.hidden !== pillHidden) d.pill.hidden = pillHidden;
  ritualSetText(d.pillText, ritualTitleText(r) + ' · ' + (r.done ? (r.ok ? tr('ritualDone') : tr('ritualFailed')) : tr('ritualWritesPaused')));
  ritualSetAttr(d.pillClock, 'data-elapsed-from', r.done ? null : String(r.startedAt));
  if (r.done) ritualSetText(d.pillClock, '');
  ritualSetAttr(d.pill, 'data-tip', tr('ritualPillTip'));
  ritualSetAttr(d.pill, 'aria-label', ritualTitleText(r) + ' — ' + tr('ritualPillTip'));
  var busy = r.done ? null : r.kind;
  ritualSetAttr(document.documentElement, 'data-busy', busy);
  ritualFreeze(!r.done && !r.minimized && !scrimHidden);
}
function ritualBegin(kind, opts) {
  opts = opts || {};
  if (ritualStale()) { ritualDom = null; ritual = null; }
  if (ritual && !ritual.done) return ritual;
  ritual = {
    kind: kind,
    subject: opts.subject || '',
    note: opts.note || '',
    startedAt: Date.now(),
    endedAt: 0,
    steps: [],
    stepIndex: 0,
    stepTotal: 0,
    done: false,
    ok: null,
    message: '',
    minimized: false,
    closed: false,
    follow: !!opts.follow,
    prevFocus: document.activeElement,
  };
  ritualPaint();
  var d = ritualNodes();
  try { d.action.focus(); } catch (e) {}
  return ritual;
}
function ritualNote(text) {
  if (!ritual || ritual.done) return;
  ritual.note = text || '';
  ritualPaint();
}
function ritualSteps(steps, index, total) {
  if (!ritual || ritual.done) return;
  ritual.steps = steps || [];
  ritual.stepIndex = index || 0;
  ritual.stepTotal = total || 0;
  ritualPaint();
}
function ritualEnd(ok, message) {
  if (!ritual || ritual.done) return;
  ritual.done = true;
  ritual.ok = !!ok;
  ritual.message = message || '';
  ritual.endedAt = Date.now();
  ritualPaint();
  var mine = ritual;
  // A green outcome lingers just long enough to be read, then the panel's
  // own result line takes over; a failure stays until the operator closes it.
  setTimeout(function () { if (ritual === mine && !mine.closed) ritualClose(); }, ok ? RITUAL_DONE_LINGER_MS : RITUAL_FAIL_LINGER_MS);
}
function ritualClose() {
  if (!ritual) return;
  ritual.closed = true;
  ritual.minimized = false;
  ritualPaint();
  var prev = ritual.prevFocus;
  if (prev && prev.isConnected && typeof prev.focus === 'function') { try { prev.focus(); } catch (e) {} }
}
function ritualMinimize() {
  if (!ritual || ritual.closed) return;
  ritual.minimized = true;
  ritualPaint();
  var d = ritualNodes();
  try { d.pill.focus(); } catch (e) {}
}
function ritualMaximize() {
  if (!ritual || ritual.closed) return;
  ritual.minimized = false;
  ritualPaint();
  var d = ritualNodes();
  try { d.action.focus(); } catch (e) {}
}
var ritualToastTimer = null;
function ritualToast(text) {
  var d = ritualNodes();
  ritualSetText(d.toast, text);
  if (d.toast.hidden) d.toast.hidden = false;
  if (ritualToastTimer) clearTimeout(ritualToastTimer);
  ritualToastTimer = setTimeout(function () { d.toast.hidden = true; }, 3200);
}
function ritualResultOf(res, data) {
  if (!res.ok) return { ok: false, message: (data && (data.error || data.details)) || (res.status + '') };
  if (data && data.ok === false) return { ok: false, message: data.details || data.error || data.reason || '' };
  if (data && data.error) return { ok: false, message: String(data.error) };
  return { ok: true, message: (data && data.details) || '' };
}
// The drop-in: fetch with the scrim around it. Resolves the SAME Response
// the caller would have had, so every existing handler keeps its own parse.
function ritualFetch(kind, url, init, opts) {
  opts = opts || {};
  ritualBegin(kind, opts);
  var mine = ritual;
  return fetch(url, init).then(function (res) {
    if (opts.follow) return res;
    var clone = res.clone ? res.clone() : res;
    return Promise.resolve()
      .then(function () { return clone.json(); })
      .then(function (data) { if (ritual === mine) { var v = ritualResultOf(res, data); ritualEnd(v.ok, v.message); } return res; },
            function () { if (ritual === mine) ritualEnd(res.ok, ''); return res; });
  }, function (err) {
    if (ritual === mine) {
      if (opts.follow) ritualNote(tr('ritualReconnecting'));
      else ritualEnd(false, tr('ritualRequestFailed'));
    }
    throw err;
  });
}
// The landing job is the determinate ritual: its poller hands every state
// here and the scrim paints the gate's real steps, closing on finished.
function ritualFollowLandingJob(pid, job) {
  if (!ritual || ritual.done || ritual.kind !== 'landing' || !job) return;
  if (ritual.subject && ritual.subject !== pid) return;
  var steps = (job.steps || []).map(function (s) { return { label: s.label, state: s.state, durationMs: s.durationMs }; });
  ritual.steps = steps;
  ritual.stepIndex = job.stepIndex || steps.length;
  ritual.stepTotal = job.stepTotal || 0;
  ritual.note = job.note || '';
  if (job.phase === 'finished') {
    var result = job.result;
    ritualEnd(!!(result && result.ok), result ? (result.details || result.reason || '') : '');
    return;
  }
  ritualPaint();
}
// Writes wait: a press on any other write button while a ritual runs is
// refused here, in the capture phase, before the panel's own handler sees it.
document.addEventListener('click', function (e) {
  if (!ritual || ritual.done || ritualStale()) return;
  var b = e.target && e.target.closest && e.target.closest(RITUAL_WRITE_SELECTOR);
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  ritualToast(tr('ritualWaitToast', { title: ritualTitleText(ritual) }));
}, true);
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || !ritual || ritual.closed || ritualStale()) return;
  var d = ritualNodes();
  if (d.scrim.hidden) return;
  e.preventDefault();
  if (ritual.done) ritualClose();
  else ritualMinimize();
});
`.trim();
}
