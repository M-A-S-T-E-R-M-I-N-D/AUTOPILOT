// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The ROUTING CONSOLE panel (epic 0019 S4, board web-mtrh1hn3-8x9f0z) —
 * the console's user-facing expression: `GET /api/routing-console`'s
 * milestone progress, the priority and status label queues, and who claims
 * what, "what the page says" next to the board. Read-only, like the
 * Collaboration panel — no label, assign or milestone write here — so it
 * self-initializes and polls on its own timer. On a project page
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
 * `routingMilestoneProgressText`/`routingIssueListText` are generated FROM
 * `web/routing-console-panel.ts` below — their real compiled source via
 * `.toString()`, not a hand-retyped copy.
 *
 * i18n: every rendered string carries its English default AND a `data-i18n`
 * tag, the graceful-degradation shape `collaboration.ts` takes; the panel's
 * name and heading have STRINGS entries so far.
 */
import { routingIssueListText, routingMilestoneProgressText } from '../routing-console-panel.js';

/** The ROUTING CONSOLE panel client — vanilla, external (keeps CSP script-src 'self'). */
export function routingConsoleJs(): string {
  return `
// Routing console (epic 0019 S4, board web-mtrh1hn3-8x9f0z): GET
// /api/routing-console's milestone progress, label queues and claims, beside
// the board. Read-only, so it polls on its own timer like collaboration.ts.
// routingMilestoneProgressText/routingIssueListText are generated FROM
// web/routing-console-panel.ts below — their real compiled source via
// .toString(), not a hand-retyped copy.
${routingMilestoneProgressText.toString()}
${routingIssueListText.toString()}
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
function renderRoutingConsolePanel() {
  var section = document.getElementById('routing-console-panel');
  if (!section) return;
  var snap = routingConsoleSnapshot;
  var readable = !!snap && Array.isArray(snap.labelQueues) && Array.isArray(snap.claims);
  if (section.hidden === readable) section.hidden = !readable;
  if (!readable) return;
  section.replaceChildren();
  section.appendChild(panelHeading('h3', 'routing-console-title', 'routingConsoleTitle', 'compass'));
  section.appendChild(routingConsoleText('p', 'panel-audience', 'What the GitHub page says: milestone progress, the priority and status queues, and who holds what.', 'routingConsoleAudience'));
  routingConsoleMilestones(section, Array.isArray(snap.milestones) ? snap.milestones : null);
  section.appendChild(routingConsoleText('h4', 'routing-console-group-title', 'Label queues', 'routingConsoleQueues'));
  routingConsoleRows(section, snap.labelQueues.map(function (queue) { return [queue.label, queue.issues]; })
    .concat([['No priority yet', snap.unprioritized || [], 'routingConsoleUnprioritized']]));
  section.appendChild(routingConsoleText('h4', 'routing-console-group-title', 'Claims', 'routingConsoleClaims'));
  routingConsoleRows(section, snap.claims.map(function (claim) { return ['@' + claim.login, claim.issues]; })
    .concat([['Unclaimed', snap.unclaimed || [], 'routingConsoleUnclaimed']]));
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
