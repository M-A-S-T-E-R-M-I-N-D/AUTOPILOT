// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's raw Flight console panel — a whole bundle-composing
 * assembler function extracted out of `shell.ts`'s `fleetJs()` into its own
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF — see docs/epics/0002-shell-decomposition.md, and
 * `web/features/tour.ts` for the prior extraction of this shape).
 * `web/shell.ts`'s `clientJs()` calls it indirectly through
 * `featureModulesJs()`, so its return value — not its compiled source — is
 * what lands in the served `/app.js` text; moving the function itself (not
 * splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's
 * `flightConsoleJs` export the same way it already finds `tour.ts`'s. Like
 * `tour.ts`, this one still carries a real relative-import splice of its own —
 * `consoleLinesAriaLabel`, embedded via `.toString()` — now resolved relative
 * to this file instead of `shell.ts`.
 *
 * `flightConsoleSection(pid)` (declared below) is called from `fleetJs()`'s
 * `renderProjectPage()` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text. That works because
 * the served bundle is one concatenated non-module script (`clientJs()` =
 * `fleetJs()` + `featureModulesJs()`): `flightConsoleSection` is a hoisted
 * `function` declaration, and by the time `renderProjectPage()` actually
 * calls it (only once a project page is opened, well after the whole script
 * has already run once), every feature module's functions — this one
 * included — are already defined in the same shared top-level scope, the
 * same way `tour.ts`'s `maybeAutoOpenTour` call site already relies on.
 *
 * i18n (board web-msnsndki-dz3vn1): the collapsed placeholder (built once,
 * synchronously, when a project's panel first mounts) and the empty/
 * fetch-failure states (rebuilt inside the async `/api/flightlog` handlers)
 * carry their English default AND a `data-i18n` tag, then are swept by
 * `translateDom()` (a bare hoisted identifier from `web/features/locale.ts`'s
 * splice, same as `fleetJs()`'s call sites) — the collapsed placeholder rides
 * the page-level sweep that follows every `renderProjectPage()` tick, while
 * the two async states call `translateDom()` themselves since they can land
 * well after that tick's sweep already ran, the exact shape
 * `web/features/docs-viewer.ts`'s `refreshDocsList` already follows.
 * (Relanded: first shipped as c9f4d502, then blind-reverted by the 07:47
 * revert burst a false-positive drive-path scanner hit triggered — see
 * 4fecba5f — and never forward-relanded with the burst's other victims.)
 * That first i18n pass tagged every state EXCEPT the panel's own always-on
 * chrome: the `<summary>` toggle's title/tip (`consoleTitle`/
 * `consoleTitleTip`, riding the same page-level sweep as the collapsed
 * placeholder) and the loaded `<pre>`'s line-count `aria-label`/`data-tip`
 * (a `{n}` template — one key rides both attributes, the same key-reuse
 * `web/shell.ts`'s "Exit replay" already established for text+aria-label —
 * chosen between `consoleLinesAriaSingular`/`consoleLinesAriaPlural` by
 * count, the same real-grammar branch `consoleLinesAriaLabel()` itself
 * already takes, rather than a lowest-common-denominator "(s)" suffix) —
 * both stayed English-only until this slice, since the `<pre>` branch never
 * called `translateDom()` itself the way the other two async branches
 * already did.
 */
import { consoleLinesAriaLabel } from '../console-panel.js';

/** The Flight console panel client — vanilla, external (keeps CSP script-src 'self'). */
export function flightConsoleJs(): string {
  return `
// /api/flightlog?project=<id> tails THIS project's captured flight
// stdout+stderr. Originally wired server-side with zero UI consumer, then
// (PARALLEL FLIGHTS 4/6) scoped per-project so two concurrently flying
// folders no longer share one interleaved log with no way to attribute a
// line to either project. A native <details>/<summary> gives keyboard
// operability (Enter/Space toggles, no custom ARIA needed) for free, and the
// fetch is lazy — only on first open.
var consoleLoaded = {};
// consoleLinesAriaLabel is generated FROM web/console-panel.ts below (epic
// 0002 "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${consoleLinesAriaLabel.toString()}
function renderConsoleBody(body, lines) {
  body.replaceChildren();
  lines = lines || [];
  if (!lines.length) {
    var emptyMsg = el('p', 'muted', 'No console output yet.');
    emptyMsg.setAttribute('data-i18n', 'consoleEmpty');
    body.appendChild(emptyMsg);
    translateDom(document.documentElement.lang || 'en');
    return;
  }
  var pre = document.createElement('pre');
  pre.className = 'console-lines';
  pre.setAttribute('tabindex', '0');
  pre.setAttribute('aria-label', consoleLinesAriaLabel(lines.length));
  pre.setAttribute('data-tip', consoleLinesAriaLabel(lines.length));
  // i18n (board web-msnsndki-dz3vn1): the template key itself is chosen by
  // count — singular vs plural, the same real-grammar branch
  // consoleLinesAriaLabel() takes above — and rides both the aria-label and
  // the tip sweep; {n} fills from data-i18n-args.
  var linesAriaKey = lines.length === 1 ? 'consoleLinesAriaSingular' : 'consoleLinesAriaPlural';
  pre.setAttribute('data-i18n-aria-template', linesAriaKey);
  pre.setAttribute('data-i18n-tip-template', linesAriaKey);
  pre.setAttribute('data-i18n-args', JSON.stringify({ n: lines.length }));
  pre.textContent = lines.join('\\n');
  body.appendChild(pre);
  translateDom(document.documentElement.lang || 'en');
}
function flightConsoleSection(pid) {
  var wrap = el('section', 'console-panel');
  var details = document.createElement('details');
  details.className = 'console-details';
  var summary = document.createElement('summary');
  summary.className = 'console-title';
  summary.textContent = '🖥️ Flight console';
  summary.setAttribute('data-i18n', 'consoleTitle');
  summary.setAttribute('data-tip', 'Raw stdout+stderr tail of the flight process for this project');
  summary.setAttribute('data-i18n-tip', 'consoleTitleTip');
  details.appendChild(summary);
  var body = el('div', 'console-body');
  var collapsedMsg = el('p', 'muted', 'Collapsed — expand to load.');
  collapsedMsg.setAttribute('data-i18n', 'consoleCollapsed');
  body.appendChild(collapsedMsg);
  details.appendChild(body);
  details.addEventListener('toggle', function () {
    if (!details.open || consoleLoaded[pid]) return;
    consoleLoaded[pid] = true;
    fetch('/api/flightlog?project=' + encodeURIComponent(pid))
      .then(function (r) { return r.ok ? r.json() : { lines: [] }; })
      .then(function (data) {
        if (!body.isConnected) return;
        renderConsoleBody(body, data && data.lines);
      })
      .catch(function () {
        if (!body.isConnected) return;
        consoleLoaded[pid] = false; // allow a retry on the next expand
        var unavailableMsg = el('p', 'muted', 'Flight console unavailable.');
        unavailableMsg.setAttribute('data-i18n', 'consoleUnavailable');
        body.replaceChildren(unavailableMsg);
        translateDom(document.documentElement.lang || 'en');
      });
  });
  wrap.appendChild(details);
  return wrap;
}
`.trim();
}
