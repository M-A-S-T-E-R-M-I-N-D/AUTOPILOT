// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The ROUTING CONSOLE panel (epic 0019 S4, board web-mtrh1hn3-8x9f0z) —
 * the console's user-facing expression: `GET /api/routing-console`'s
 * milestone progress, the priority and status label queues, and who claims
 * what, "what the page says" next to the board. It self-initializes and
 * polls on its own timer, like the Collaboration panel. Its one write steers
 * from the dashboard's side: each "No priority yet" issue gets a priority
 * picker and a Route button, which asks `window.confirm()` first and then
 * POSTs `/api/routing-console/route`. The server re-reads the issue and gates
 * on the maintainer role, and the panel's status line says what it did or
 * why it did not. A poll keeps the picks made so far and the focused
 * control. On a project page
 * `renderProjectPage` adopts it right after the tasks board; on the home
 * page it sits with the other community panels.
 *
 * Milestones the server could not read arrive as `null` and say so, never
 * as "no milestones" (`flight/routing-console.ts`'s own rule). A project
 * page sends its id, and the server reads that project's own GitHub
 * repository, never the one `gh` acts on. Each
 * milestone's title links to its GitHub page in a new tab when the read
 * carried an https link, and stays plain text when it did not. A failed
 * poll keeps the last render, the same as every other polled panel here.
 * The `routing*` formatters are generated FROM
 * `web/routing-console-panel.ts` below — their real compiled source via
 * `.toString()`, not a hand-retyped copy.
 *
 * i18n: every rendered string carries its English default AND a `data-i18n`
 * tag, the graceful-degradation shape `collaboration.ts` takes; the panel's
 * name and heading have STRINGS entries so far.
 */
import {
  routingIssueListText,
  routingMilestoneProgressText,
  routingPriorityLabels,
  routingRouteConfirmMessage,
  routingRouteResultText,
} from '../routing-console-panel.js';

/** The ROUTING CONSOLE panel client — vanilla, external (keeps CSP script-src 'self'). */
export function routingConsoleJs(): string {
  return `
// Routing console (epic 0019 S4, board web-mtrh1hn3-8x9f0z): GET
// /api/routing-console's milestone progress, label queues and claims, beside
// the board, polled on its own timer like collaboration.ts. Its one write,
// POST /api/routing-console/route, is confirm-guarded below. The routing*
// formatters are generated FROM web/routing-console-panel.ts below — their
// real compiled source via .toString(), not a hand-retyped copy.
${routingMilestoneProgressText.toString()}
${routingIssueListText.toString()}
${routingPriorityLabels.toString()}
${routingRouteConfirmMessage.toString()}
${routingRouteResultText.toString()}
var ROUTING_CONSOLE_POLL_MS = 60000;
var routingConsoleSnapshot = null;
function routingConsoleText(tag, cls, text, key) {
  var node = el(tag, cls, text);
  if (key) node.setAttribute('data-i18n', key);
  return node;
}
function routingConsoleRows(section, rows) {
  var list = el('ul', 'routing-console-list');
  rows.forEach(function (row) {
    var item = el('li', 'routing-console-row');
    item.appendChild(routingConsoleText('span', 'routing-console-name', row[0], row[2]));
    item.appendChild(el('span', 'routing-console-issues', routingIssueListText(row[1])));
    list.appendChild(item);
  });
  section.appendChild(list);
}
function routingConsoleMilestoneName(milestone) {
  if (!milestone.url) return el('span', 'routing-console-name', milestone.title);
  var name = el('span', 'routing-console-name');
  var link = el('a', 'routing-console-link', milestone.title);
  link.setAttribute('href', milestone.url);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
  name.appendChild(link);
  return name;
}
function routingConsoleMilestones(section, milestones) {
  section.appendChild(routingConsoleText('h4', 'routing-console-group-title', 'Milestones', 'routingConsoleMilestones'));
  if (milestones === null) {
    section.appendChild(routingConsoleText('p', 'panel-audience', "Couldn't read the open milestones — is gh signed in?", 'routingConsoleMilestonesUnread'));
    return;
  }
  if (milestones.length === 0) {
    section.appendChild(routingConsoleText('p', 'panel-audience', 'No open milestones.', 'routingConsoleNoMilestones'));
    return;
  }
  var list = el('ul', 'routing-console-list');
  milestones.forEach(function (milestone) {
    var item = el('li', 'routing-console-row');
    item.appendChild(routingConsoleMilestoneName(milestone));
    if (milestone.percentDone !== null) {
      var bar = document.createElement('progress');
      bar.max = 100;
      bar.value = milestone.percentDone;
      bar.setAttribute('aria-label', milestone.title);
      item.appendChild(bar);
    }
    item.appendChild(el('span', 'routing-console-issues', routingMilestoneProgressText(milestone)));
    list.appendChild(item);
  });
  section.appendChild(list);
}
// Steering from the dashboard's side: each "No priority yet" issue (the first
// twelve, as its queue line shows them) gets a priority picker and a Route
// button. The server re-reads the issue and gates on the maintainer role, so
// a refusal comes back as words for the status line, never a silent no-op.
function routingConsoleRouteRows(section, unprioritized, labels) {
  if (unprioritized.length === 0 || labels.length === 0) return;
  var list = el('ul', 'routing-console-list routing-console-route-list');
  unprioritized.slice(0, 12).forEach(function (issue) {
    var item = el('li', 'routing-console-route-row');
    item.appendChild(el('span', 'routing-console-issues', '#' + issue));
    var select = document.createElement('select');
    select.className = 'routing-console-priority';
    select.setAttribute('data-routing-console-pick', String(issue));
    select.setAttribute('aria-label', 'Priority for #' + issue);
    var none = routingConsoleText('option', '', 'Choose a priority', 'routingConsoleChoosePriority');
    none.value = '';
    select.appendChild(none);
    labels.forEach(function (label) {
      var option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      select.appendChild(option);
    });
    item.appendChild(select);
    var button = routingConsoleText('button', 'routing-console-route', 'Route', 'routingConsoleRoute');
    button.type = 'button';
    button.setAttribute('data-routing-console-route', String(issue));
    button.setAttribute('aria-label', 'Route #' + issue);
    button.addEventListener('click', function () { routeRoutingConsoleIssue(issue, select, button); });
    item.appendChild(button);
    list.appendChild(item);
  });
  section.appendChild(list);
}
// The outcome of the last route, kept across re-renders: the route re-reads
// the console at once, and its words must outlive that render.
var routingConsoleRouteNote = null;
function showRoutingConsoleRouteNote(note) {
  routingConsoleRouteNote = note;
  var line = document.querySelector('#routing-console-panel .routing-console-route-result');
  if (!line) return;
  line.className = 'routing-console-route-result' + (note && note.failed ? ' routing-console-route-result-fail' : '');
  line.textContent = note ? note.text : '';
}
function routeRoutingConsoleIssue(issue, select, button) {
  var label = select.value;
  if (!label) {
    showRoutingConsoleRouteNote({ text: 'Choose a priority for #' + issue + ' first.', failed: true });
    select.focus();
    return;
  }
  if (!window.confirm(routingRouteConfirmMessage(issue, label))) return;
  var body = { issue: issue, label: label };
  var pid = document.body.dataset.project || '';
  if (pid) body.project = pid;
  button.disabled = true;
  fetch('/api/routing-console/route', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var result = routingRouteResultText(data);
      showRoutingConsoleRouteNote(result);
      button.disabled = false;
      if (!result.failed) loadRoutingConsolePanel();
    })
    .catch(function () {
      showRoutingConsoleRouteNote(routingRouteResultText(null));
      button.disabled = false;
    });
}
function renderRoutingConsolePanel() {
  var section = document.getElementById('routing-console-panel');
  if (!section) return;
  var snap = routingConsoleSnapshot;
  var readable = !!snap && Array.isArray(snap.labelQueues) && Array.isArray(snap.claims);
  if (section.hidden === readable) section.hidden = !readable;
  if (!readable) return;
  // A poll must not take the operator's place: the picks made so far, and the
  // control that has focus, survive the re-render.
  var picks = {};
  section.querySelectorAll('[data-routing-console-pick]').forEach(function (pick) {
    picks[pick.getAttribute('data-routing-console-pick')] = pick.value;
  });
  var active = document.activeElement;
  var focusKey = active && section.contains(active)
    ? ['data-routing-console-pick', 'data-routing-console-route'].filter(function (name) { return active.hasAttribute(name); })
        .map(function (name) { return '[' + name + '="' + active.getAttribute(name) + '"]'; })[0]
    : '';
  section.replaceChildren();
  section.appendChild(panelHeading('h3', 'routing-console-title', 'routingConsoleTitle', 'compass'));
  section.appendChild(routingConsoleText('p', 'panel-audience', 'What the GitHub page says: milestone progress, the priority and status queues, and who holds what.', 'routingConsoleAudience'));
  routingConsoleMilestones(section, Array.isArray(snap.milestones) ? snap.milestones : null);
  section.appendChild(routingConsoleText('h4', 'routing-console-group-title', 'Label queues', 'routingConsoleQueues'));
  routingConsoleRows(section, snap.labelQueues.map(function (queue) { return [queue.label, queue.issues]; })
    .concat([['No priority yet', snap.unprioritized || [], 'routingConsoleUnprioritized']]));
  routingConsoleRouteRows(section, snap.unprioritized || [], routingPriorityLabels(snap.labelQueues));
  var note = el('p', 'routing-console-route-result');
  note.setAttribute('role', 'status');
  section.appendChild(note);
  section.appendChild(routingConsoleText('h4', 'routing-console-group-title', 'Claims', 'routingConsoleClaims'));
  routingConsoleRows(section, snap.claims.map(function (claim) { return ['@' + claim.login, claim.issues]; })
    .concat([['Unclaimed', snap.unclaimed || [], 'routingConsoleUnclaimed']]));
  Object.keys(picks).forEach(function (issue) {
    var pick = section.querySelector('[data-routing-console-pick="' + issue + '"]');
    if (pick) pick.value = picks[issue];
  });
  showRoutingConsoleRouteNote(routingConsoleRouteNote);
  var refocus = focusKey ? section.querySelector(focusKey) : null;
  if (refocus) refocus.focus();
  translateDom(document.documentElement.lang || 'en');
}
// A project page names itself, so the server can refuse a checkout of another
// repository; the home page asks for the repository gh acts on, as before.
function routingConsoleUrl() {
  var pid = document.body.dataset.project || '';
  return '/api/routing-console' + (pid ? '?project=' + encodeURIComponent(pid) : '');
}
function loadRoutingConsolePanel() {
  fetch(routingConsoleUrl(), { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (data) routingConsoleSnapshot = data;
      renderRoutingConsolePanel();
    })
    .catch(function () {});
}
loadRoutingConsolePanel();
setInterval(loadRoutingConsolePanel, ROUTING_CONSOLE_POLL_MS);
`.trim();
}
