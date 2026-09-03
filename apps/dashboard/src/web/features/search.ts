// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The code-search + Ask client — the fourth of `web/shell.ts`'s bundle-
 * composing assembler functions extracted into its own file under
 * `web/features/` (epic 0002 "shell decomposition", PARALLEL UNLOCK B's real
 * extraction — see docs/epics/0002-shell-decomposition.md, and
 * `web/features/switcher.ts`/`web/features/connect.ts`/`web/features/fly.ts`
 * for the first three). `web/shell.ts`'s `clientJs()` imports and calls it
 * directly, so its return value — not its compiled source — is what lands in
 * the served `/app.js` text; moving the function itself (not splicing it) is
 * therefore zero behavior change. `discoverFeatureModules('web/features')`
 * finds this file's `searchJs` export the same way it already finds the
 * other three. Like `connectJs()`/`flyJs()`, this one still carries real
 * relative-import splices of its own — `searchProjectsSig`/`searchHitMeta`
 * (search-history.js; `rememberedHistory` is spliced once, by fly.ts);
 * `splitTableRow`/`isFence`/`isHeading`/`isListItem`/`isSvgStart`/
 * `isTableStart`/`isBlockStart` (markdown.js); `splitSseFrames`/
 * `applyAskStreamFrame` (ask-stream.js) — now resolved relative to this file
 * instead of `shell.ts`; a function's `.toString()` output is unaffected by
 * which local name imports it under, so this remains byte-for-byte the same
 * generated text. `el` (used by the search-hit rendering) is not imported
 * here — it comes from `fleetJs()`'s own output, hoisted into the same flat
 * concatenated `/app.js` text `clientJs()` assembles, the same cross-module
 * function-hoisting `fly.ts`'s `el()` calls already rely on. `operatorActionLog`/
 * `operatorActionsViewText`/`recordOperatorAction`/`OPERATOR_ACTION_LOG_CAP`
 * (Omniscient chat context, web-msnrw1ok-0gsdff, third slice; ARCHITECT chat
 * v2 slice 3's action card, web-msnqmgge-oijj8x) are the same kind of hoisted
 * reference — the Ask handler both reads what `fly.ts`'s launch/stop/pause
 * handlers most recently wrote AND appends its own entry once a proposed
 * control-tool action executes.
 */
import { searchProjectsSig, searchHitMeta } from '../search-history.js';
import {
  splitTableRow,
  isFence,
  isHeading,
  isListItem,
  isSvgStart,
  isTableStart,
  isBlockStart,
} from '../markdown.js';
import { splitSseFrames, applyAskStreamFrame } from '../ask-stream.js';

/**
 * The code-search client — query one project's full-text index and show ranked
 * hits (path + match snippet). The project picker is kept in sync with the live
 * fleet by renderFleet (so it survives SSE re-renders); results render via the
 * DOM API only (snippets are store-sourced text, never HTML). No template
 * literals (embedded in one). `el` comes from the fleet module (same bundle).
 */
export function searchJs(): string {
  return `
// searchProjectsSig is generated FROM web/search-history.ts below (epic 0002
// "shell decomposition", slice 2, thirty-second cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${searchProjectsSig.toString()}
function syncSearchProjects(projects) {
  var sel = document.getElementById('search-project');
  var bar = document.getElementById('searchbar');
  if (!sel || !bar) return;
  if (!projects.length) { bar.hidden = true; return; }
  bar.hidden = false;
  // Rebuild options only when the project set changes — never clobber a typed selection mid-search.
  var sig = searchProjectsSig(projects);
  if (sel.dataset.sig === sig) return;
  var current = sel.value;
  sel.dataset.sig = sig;
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  for (var i = 0; i < projects.length; i++) {
    var o = document.createElement('option');
    o.value = projects[i].id;
    o.textContent = projects[i].name || projects[i].slug || projects[i].id;
    sel.appendChild(o);
  }
  if (current) sel.value = current;
}
var SEARCH_HISTORY_KEY = 'ap-search-history';
var SEARCH_HISTORY_MAX = 10;
function loadSearchHistory() {
  try {
    var raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    var list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function renderSearchHistory(list) {
  var dl = document.getElementById('search-history');
  if (!dl) return;
  while (dl.firstChild) dl.removeChild(dl.firstChild);
  for (var i = 0; i < list.length; i++) {
    var o = document.createElement('option');
    o.value = list[i];
    dl.appendChild(o);
  }
}
// rememberedHistory is spliced ONCE, by features/fly.ts — both modules ride
// the same core chunk (web/chunks.ts), and function declarations hoist
// across the whole concatenated script, so a second byte-identical copy here
// was pure weight AND a latent last-declaration-wins hazard the 2026-08-27
// audit flagged: had the two copies ever diverged, whichever loaded second
// would silently win. One owner, one copy.
function rememberSearchQuery(q) {
  if (!q) return;
  var list = rememberedHistory(loadSearchHistory(), q, SEARCH_HISTORY_MAX);
  try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list)); } catch {}
  renderSearchHistory(list);
}
// Markdown → DOM (headings, code blocks, tables, lists, bold/italic, links) via
// createElement + textContent only — never innerHTML — so rendered text (a
// model answer, an indexed README) can never inject markup. Hoisted to
// top-level (not nested in searchInit) so both the ask answer and the Docs
// panel can call it. \`[text](url)\` renders as a real, keyboard-reachable
// <a> (target=_blank, rel=noopener noreferrer) — restricted to http(s) URLs
// only so a doc can never smuggle a javascript:/data: href (web-msnsgcyq-
// 36jf4u, PAPER's evidence-log entries gained a clickable "view previous
// version" link that needs somewhere safe to render).
function appendInline(parent, text) {
  var re = /\`([^\`]+)\`|\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)|\\*\\*([^*]+)\\*\\*|__([^_]+)__|\\*([^*]+)\\*|_([^_]+)_/g;
  var last = 0;
  var m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[1] != null) parent.appendChild(el('code', null, m[1]));
    else if (m[2] != null) {
      var link = document.createElement('a');
      link.href = m[3];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = m[2];
      parent.appendChild(link);
    }
    else if (m[4] != null) parent.appendChild(el('strong', null, m[4]));
    else if (m[5] != null) parent.appendChild(el('strong', null, m[5]));
    else if (m[6] != null) parent.appendChild(el('em', null, m[6]));
    else parent.appendChild(el('em', null, m[7]));
    last = re.lastIndex;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}
// splitTableRow/isFence/isHeading/isListItem/isSvgStart/isTableStart/
// isBlockStart are generated FROM web/markdown.ts below (epic 0002 "shell
// decomposition", slice 2) — their real compiled source via .toString(),
// not a hand-retyped copy. They can no longer drift apart.
${splitTableRow.toString()}
${isFence.toString()}
${isHeading.toString()}
${isListItem.toString()}
${isSvgStart.toString()}
${isTableStart.toString()}
${isBlockStart.toString()}
// The self-study PAPER's DATA:CHART blocks embed a raw <svg> per chart
// (scripts/self-study/generate-data.mjs) so the doc reads as a real chart on
// GitHub too — but this dashboard's Docs viewer parses Markdown into DOM
// nodes via createElement/textContent only (never innerHTML, see
// renderMarkdown above), so without this, that markup would land as a wall
// of literal tag text instead of a chart. SVG_TAG_ALLOW/SVG_ATTR_MAP fix the
// exact vocabulary the generator emits (checked against generate-data.mjs) —
// nothing else survives the rebuild, so this stays safe even if a doc's
// content were ever untrusted.
var SVG_TAG_ALLOW = { svg: 1, rect: 1, circle: 1, path: 1, line: 1, text: 1, title: 1, desc: 1 };
var SVG_ATTR_MAP = {
  viewbox: 'viewBox', width: 'width', height: 'height', role: 'role',
  x: 'x', y: 'y', rx: 'rx', fill: 'fill', 'text-anchor': 'text-anchor', 'font-size': 'font-size',
  x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2', stroke: 'stroke', 'stroke-width': 'stroke-width',
  d: 'd', cx: 'cx', cy: 'cy', r: 'r',
};
var SVG_NS = 'http://www.w3.org/2000/svg';
// Rebuilds one sanitized SVG node from the parsed (untrusted) source node.
// A per-shape <title> (a bar's or point's exact value) is pulled off and
// turned into [data-tip] + tabindex instead of being kept as a native SVG
// <title> — every other hoverable element in the dashboard already explains
// itself on hover *and* keyboard focus via the shared data-tip primitive
// (see showTip/hideTip below); a chart bar or point should behave the same
// way, not fall back to the browser's unstyled, mouse-only SVG tooltip. The
// root <svg>'s own <title>/<desc> (the whole chart's accessible name) is
// left as real <title>/<desc> — that pair is the correct static a11y
// pattern for a non-interactive role="img" element.
function sanitizeChartNode(src, isRoot) {
  var tag = src.tagName ? src.tagName.toLowerCase() : '';
  if (!SVG_TAG_ALLOW[tag]) return null;
  var out = document.createElementNS(SVG_NS, tag);
  // The rebuilt root carries .docs-chart so the wireRoving() group below
  // scopes one roving Tab stop PER CHART (class is not in SVG_ATTR_MAP, so
  // no source markup can smuggle one in — this is the only class set here).
  if (isRoot) out.setAttribute('class', 'docs-chart');
  for (var i = 0; i < src.attributes.length; i++) {
    var attr = src.attributes[i];
    var mapped = SVG_ATTR_MAP[attr.name.toLowerCase()];
    if (mapped) out.setAttribute(mapped, attr.value);
  }
  var pointTitle = '';
  for (var c = 0; c < src.childNodes.length; c++) {
    var child = src.childNodes[c];
    if (child.nodeType === 3) {
      out.appendChild(document.createTextNode(child.nodeValue));
    } else if (child.nodeType === 1) {
      if (!isRoot && child.tagName && child.tagName.toLowerCase() === 'title') {
        pointTitle = child.textContent || '';
        continue;
      }
      var sanitizedChild = sanitizeChartNode(child, false);
      if (sanitizedChild) out.appendChild(sanitizedChild);
    }
  }
  if (pointTitle) {
    // '0' here fails safe (a shape is never unreachable); renderChartSvg's
    // seedRoving() collapses the chart to its single roving stop right after.
    out.setAttribute('tabindex', '0');
    out.setAttribute('data-tip', pointTitle);
    out.setAttribute('aria-label', pointTitle);
  }
  return out;
}
function renderChartSvg(raw) {
  var doc;
  try { doc = new DOMParser().parseFromString('<!doctype html><body>' + raw + '</body>', 'text/html'); }
  catch (e) { return null; }
  var root = doc.body && doc.body.querySelector('svg');
  if (!root) return null;
  var chart = sanitizeChartNode(root, true);
  // D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): every titled
  // bar/point above seeded its own Tab stop — the SELF-STUDY PAPER's five
  // DATA:CHART SVGs carried 51 of them between the section heading and the
  // next paragraph, growing by two per day charted. Each chart is ONE roving
  // group instead: only its first titled shape (DOM order) is a real stop,
  // the rest sit at -1, and wireRoving() (registered below) moves the stop
  // with Left/Right/Home/End inside that chart — never into the next one.
  // seedRoving/wireRoving come from fleetJs()'s output, hoisted into the
  // same flat /app.js text like el() (see this file's header comment).
  seedRoving(chart, '[data-tip]');
  return chart;
}
wireRoving('.docs-chart [data-tip]', '.docs-chart');
function renderMarkdown(container, text) {
  var lines = text.split('\\n');
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (isFence(line)) {
      i++;
      var codeLines = [];
      while (i < lines.length && !isFence(lines[i])) { codeLines.push(lines[i]); i++; }
      i++; // skip the closing fence (if any)
      var pre = document.createElement('pre');
      pre.appendChild(el('code', null, codeLines.join('\\n')));
      container.appendChild(pre);
      continue;
    }
    if (isSvgStart(line)) {
      var svgLines = [line];
      i++;
      while (i < lines.length && !/<\\/svg>\\s*$/i.test(svgLines[svgLines.length - 1])) {
        svgLines.push(lines[i]);
        i++;
      }
      var chart = renderChartSvg(svgLines.join('\\n'));
      if (chart) container.appendChild(chart);
      continue;
    }
    var heading = line.match(/^(#{1,6})\\s+(.*)$/);
    if (heading) {
      var h = document.createElement('h' + heading[1].length);
      appendInline(h, heading[2]);
      container.appendChild(h);
      i++;
      continue;
    }
    if (isTableStart(lines, i)) {
      var headCells = splitTableRow(line);
      i += 2; // header row + separator row
      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var htr = document.createElement('tr');
      for (var c = 0; c < headCells.length; c++) {
        var th = document.createElement('th');
        appendInline(th, headCells[c]);
        htr.appendChild(th);
      }
      thead.appendChild(htr);
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim()) {
        var cells = splitTableRow(lines[i]);
        var tr = document.createElement('tr');
        for (var c2 = 0; c2 < cells.length; c2++) {
          var td = document.createElement('td');
          appendInline(td, cells[c2]);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
        i++;
      }
      table.appendChild(tbody);
      container.appendChild(table);
      continue;
    }
    if (isListItem(line)) {
      var ordered = /^\\s*\\d+\\./.test(line);
      var listEl = document.createElement(ordered ? 'ol' : 'ul');
      while (i < lines.length && isListItem(lines[i])) {
        var itemText = lines[i].replace(/^\\s*([-*]|\\d+\\.)\\s+/, '');
        var li = document.createElement('li');
        appendInline(li, itemText);
        listEl.appendChild(li);
        i++;
      }
      container.appendChild(listEl);
      continue;
    }
    var paraLines = [];
    while (i < lines.length && !isBlockStart(lines, i)) { paraLines.push(lines[i]); i++; }
    var p = document.createElement('p');
    appendInline(p, paraLines.join('\\n'));
    container.appendChild(p);
  }
}
// searchHitMeta is generated FROM web/search-history.ts below (epic 0002
// "shell decomposition", slice 2, sixty-second cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${searchHitMeta.toString()}
function searchInit() {
  var form = document.getElementById('search-form');
  var sel = document.getElementById('search-project');
  var qEl = document.getElementById('search-q');
  var out = document.getElementById('search-results');
  renderSearchHistory(loadSearchHistory());
  if (!form || !out) return;
  function render(hits, note) {
    while (out.firstChild) out.removeChild(out.firstChild);
    if (note) { out.appendChild(el('p', 'search-empty', note)); return; }
    if (!hits || !hits.length) { out.appendChild(el('p', 'search-empty', 'No matches.')); return; }
    var ul = el('ul', 'search-hits');
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var li = el('li', 'search-hit');
      var hitMeta = searchHitMeta(h.path, h.language, h.score);
      // D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): only the
      // first hit is a real Tab stop; the keydown/focusin listeners below
      // move it, the same roving-tabindex technique #live-workers uses.
      li.setAttribute('tabindex', i === 0 ? '0' : '-1');
      li.setAttribute('data-tip', hitMeta.tip);
      li.setAttribute('aria-label', hitMeta.ariaLabel);
      li.appendChild(el('span', 'search-path', h.path));
      if (h.snippet) li.appendChild(el('span', 'search-snippet', h.snippet));
      ul.appendChild(li);
    }
    out.appendChild(ul);
  }
  // Roving-tabindex keyboard support for .search-hits above: moves the
  // single Tab stop with Up/Down/Home/End instead of leaving every hit
  // individually tabbable — every search re-renders the list wholesale, so
  // this is delegated on document rather than attached per-hit.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Home' && e.key !== 'End') return;
    var hit = e.target && e.target.closest && e.target.closest('.search-hit');
    if (!hit) return;
    var group = hit.closest('.search-hits');
    if (!group) return;
    var rows = Array.prototype.slice.call(group.querySelectorAll('.search-hit'));
    var i = rows.indexOf(hit);
    if (i < 0) return;
    var next = i;
    if (e.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, i + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    if (next === i) return;
    e.preventDefault();
    hit.setAttribute('tabindex', '-1');
    rows[next].setAttribute('tabindex', '0');
    rows[next].focus();
  });
  // Mouse/programmatic focus also moves the roving tab stop (APG roving-
  // tabindex recommendation), matching the #live-workers strip's pattern.
  document.addEventListener('focusin', function (e) {
    var hit = e.target && e.target.closest && e.target.closest('.search-hit');
    if (!hit) return;
    var group = hit.closest('.search-hits');
    if (!group) return;
    var rows = Array.prototype.slice.call(group.querySelectorAll('.search-hit'));
    var i = rows.indexOf(hit);
    if (i < 0) return;
    for (var j = 0; j < rows.length; j++) rows[j].setAttribute('tabindex', j === i ? '0' : '-1');
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var project = sel ? sel.value : '';
    var q = qEl ? qEl.value.trim() : '';
    if (!project || !q) { render(null, 'Pick a project and type a query.'); return; }
    rememberSearchQuery(q);
    render(null, 'Searching…');
    fetch('/api/search?project=' + encodeURIComponent(project) + '&q=' + encodeURIComponent(q), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { hits: [] }; })
      .then(function (res) { render(res.hits || []); })
      .catch(function () { render(null, 'Search failed.'); });
  });

  // Persona toggle (ARCHITECT chat v2 slice 2, docs/epics/0011-architect-
  // chat-v2.md, board web-msnqmgge-oijj8x): GENIUS (default, read-only,
  // unchanged behavior) or ARCHITECT (control-tool intent routing is a
  // later slice — this toggle only threads the choice to the server).
  // Session-only in-memory state, never localStorage — a fresh page load
  // always starts back at GENIUS, per the epic's "opt-in per session, not
  // persisted as a silent default" acceptance criterion.
  var askPersona = 'genius';
  var personaGroup = document.getElementById('ask-persona');
  if (personaGroup) {
    personaGroup.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-persona-btn]');
      if (!btn) return;
      askPersona = btn.dataset.personaBtn;
      var btns = personaGroup.querySelectorAll('[data-persona-btn]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].setAttribute('aria-pressed', String(btns[i].dataset.personaBtn === askPersona));
      }
    });
  }

  // Ask — one grounded, tool-less model call over the indexed code (spends quota).
  // Answers are rendered as Markdown (headings, code blocks, tables, lists, bold/italic)
  // using DOM APIs only (createElement + textContent) — never innerHTML — so a model
  // answer can never inject markup, no matter what it contains.
  var askBtn = document.getElementById('ask-go');
  var askDeepEl = document.getElementById('ask-deep');
  var answerEl = document.getElementById('ask-answer');
  var activityEl = document.getElementById('ask-activity');
  var proposalEl = document.getElementById('ask-proposal');
  // Epic 0012 slice 3's live tool-activity chips: one per Read/Grep/Glob call
  // the escalation session makes, appended as it happens — REACTIVITY.md §3's
  // "Reading src/x.ts…" idiom, so a Deep answer never looks like a silent
  // multi-second pause. Kept in its own container (not answerEl) so
  // renderAnswer's clear-and-rebuild never wipes the chip trail mid-answer.
  function renderActivity(activity) {
    if (!activityEl || !activity || typeof activity !== 'object') return;
    var tool = typeof activity.tool === 'string' ? activity.tool : 'Tool';
    var target = typeof activity.target === 'string' ? activity.target : '';
    var chip = el('span', 'ask-activity-chip', target ? tool + ': ' + target : tool);
    // D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): the trail is
    // ONE roving group — a Deep answer streams one chip per Read/Grep/Glob
    // call, and each used to be its own Tab stop (thirty files read, thirty
    // stops between the Ask button and the answer). Only the first chip in
    // the trail is a real Tab stop; every later chip lands at -1 as it
    // streams in — also when the user has already walked the stop along the
    // trail, so there is never a second '0'. The shared wireRoving() handlers
    // (registered below) move it with Left/Right/Home/End.
    chip.setAttribute('tabindex', activityEl.querySelector('.ask-activity-chip') ? '-1' : '0');
    chip.setAttribute('data-tip', 'A tool call the model made while researching this answer');
    chip.setAttribute('aria-label', 'Tool call: ' + (target ? tool + ': ' + target : tool));
    activityEl.appendChild(chip);
  }
  // wireRoving comes from fleetJs()'s output, hoisted into the same flat
  // /app.js text like el() above (see this file's header comment).
  wireRoving('.ask-activity-chip', '.ask-activity');
  function renderAnswer(text, sources) {
    if (!answerEl) return;
    while (answerEl.firstChild) answerEl.removeChild(answerEl.firstChild);
    if (!text) return;
    renderMarkdown(answerEl, text);
    if (sources && sources.length) {
      var sourcesEl = el('span', 'ask-sources', 'sources: ' + sources.join(' · '));
      sourcesEl.setAttribute('tabindex', '0');
      sourcesEl.setAttribute('data-tip', 'Indexed files the model consulted to ground this answer');
      sourcesEl.setAttribute('aria-label', 'Sources: ' + sources.join(', '));
      answerEl.appendChild(sourcesEl);
    }
  }
  // ARCHITECT chat v2 slice 3's client half (docs/epics/0011-architect-chat-
  // v2.md, board web-msnqmgge-oijj8x): renders the terminal frame's
  // \`proposal\` (control-execute.ts's ArchitectProposal shape — untrusted
  // model output) as an inspectable action card. \`tasks_list\` (safety
  // 'read') auto-runs once the card is confirmed present, since a read has
  // no side effect; \`write\`/\`destructive\` tools render a real <button> the
  // operator must click — no auto-write, ever, per the epic's acceptance
  // criteria. Every executed call is appended to the same operatorActionLog
  // fly.ts's launch/stop/pause handlers write into (recordOperatorAction is
  // hoisted from operator-actions.js the same way, see fly.ts's header
  // comment), so an ARCHITECT-driven change is visibly attributed.
  function renderProposal(proposal) {
    if (!proposalEl) return;
    while (proposalEl.firstChild) proposalEl.removeChild(proposalEl.firstChild);
    if (!proposal || typeof proposal !== 'object') return;
    var tool = typeof proposal.tool === 'string' ? proposal.tool : '';
    if (!tool) return;
    var safety = typeof proposal.safety === 'string' ? proposal.safety : 'write';
    var args = proposal.args && typeof proposal.args === 'object' ? proposal.args : {};
    var card = el('div', 'control-proposal');
    card.appendChild(el('p', 'control-proposal-summary', 'ARCHITECT proposes: ' + tool));
    card.appendChild(el('pre', 'control-proposal-text', JSON.stringify(args, null, 2)));
    var statusEl = el('p', 'control-proposal-status', '');
    function run() {
      statusEl.textContent = 'Running…';
      fetch('/api/control/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tool: tool, args: args }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          statusEl.textContent = res && res.ok ? 'Done.' : 'Failed: ' + ((res && res.error) || 'unknown error');
          operatorActionLog = recordOperatorAction(operatorActionLog, 'ARCHITECT ran ' + tool, OPERATOR_ACTION_LOG_CAP);
        })
        .catch(function () { statusEl.textContent = 'Failed: request error.'; });
    }
    if (safety === 'read') {
      card.appendChild(statusEl);
      run();
    } else {
      var row = el('div', 'control-proposal-row');
      var tip = safety === 'destructive'
        ? 'This action cannot be undone — confirm to run it'
        : 'Run this proposed action';
      var confirmBtn = el('button', 'control-proposal-confirm', safety === 'destructive' ? 'Confirm (destructive)' : 'Confirm');
      confirmBtn.setAttribute('type', 'button');
      confirmBtn.setAttribute('data-tip', tip);
      confirmBtn.setAttribute('aria-label', tip);
      confirmBtn.addEventListener('click', function () {
        confirmBtn.disabled = true;
        run();
      });
      row.appendChild(confirmBtn);
      card.appendChild(row);
      card.appendChild(statusEl);
    }
    proposalEl.appendChild(card);
  }
  // splitSseFrames/applyAskStreamFrame are generated FROM web/ask-stream.ts
  // below (epic 0002 "shell decomposition", slice 2, thirty-seventh cut) —
  // their real compiled source via .toString(), not a hand-retyped copy.
  // They can no longer drift apart.
${splitSseFrames.toString()}
${applyAskStreamFrame.toString()}
  // Reads the \`/api/ask/stream\` SSE body via fetch().body.getReader() (not
  // EventSource, which cannot carry the guarding JSON POST body) and re-renders
  // the accumulated answer on every \`{delta}\` frame, so the reply builds up
  // live instead of appearing all at once on the terminal \`{done}\` frame.
  function pumpAskStream(reader, decoder) {
    var buf = '';
    var answered = '';
    function handleFrame(frame) {
      var update = applyAskStreamFrame(frame, answered);
      if (!update) return;
      if (update.activity) { renderActivity(update.activity); return; }
      answered = update.answered;
      renderAnswer(answered, update.sources);
      renderProposal(update.proposal);
    }
    function pump() {
      return reader.read().then(function (step) {
        if (step.done) return;
        buf += decoder.decode(step.value, { stream: true });
        var split = splitSseFrames(buf);
        buf = split.rest;
        for (var i = 0; i < split.frames.length; i++) handleFrame(split.frames[i]);
        return pump();
      });
    }
    return pump();
  }
  if (askBtn) askBtn.addEventListener('click', function () {
    var project = sel ? sel.value : '';
    var q = qEl ? qEl.value.trim() : '';
    if (!project || !q) { renderAnswer('Pick a project and type a question first.', null); return; }
    rememberSearchQuery(q);
    askBtn.disabled = true;
    askBtn.textContent = 'Asking…';
    if (activityEl) { while (activityEl.firstChild) activityEl.removeChild(activityEl.firstChild); }
    if (proposalEl) { while (proposalEl.firstChild) proposalEl.removeChild(proposalEl.firstChild); }
    var deep = !!(askDeepEl && askDeepEl.checked);
    renderAnswer(deep ? 'Reading the project to find the answer (Deep)…' : 'Asking the model (grounded in the indexed code)…', null);
    // Omniscient chat context (web-msnrw1ok-0gsdff), first slice: tell the model
    // which dashboard page the operator is currently on — the fleet overview or
    // this specific project's page (body's data-project, same idiom the live
    // re-render already uses to detect the pinned project page).
    var pinned = document.body.dataset.project || '';
    var view = pinned ? ('project page: ' + pinned) : 'fleet page (all projects)';
    // Second slice: the operator's WIP-limit-1 focus lock is the "selected
    // element" the board task calls for — tasksSection() (shell.ts) only
    // renders on the project page (renderProjectPage), so a plain
    // '.task-focused' query naturally scopes to the pinned project with no
    // extra project-id matching needed; on the fleet page it's always null.
    if (pinned) {
      var focusedTitleEl = document.querySelector('.task-focused .task-title');
      if (focusedTitleEl && focusedTitleEl.textContent) view += ', focused task: ' + focusedTitleEl.textContent;
    }
    // Third (final) slice: what the operator actually DID this session —
    // operatorActionLog is hoisted from fleetJs()'s output (see fly.ts's
    // launch/stop/pause handlers), same cross-module reference el() relies on.
    var actionsText = operatorActionsViewText(operatorActionLog);
    if (actionsText) view += ', ' + actionsText;
    fetch('/api/ask/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: project, question: q, view: view, deep: deep, persona: askPersona }) })
      .then(function (r) {
        if (!r.ok || !r.body || !r.body.getReader) throw new Error('stream unavailable');
        return pumpAskStream(r.body.getReader(), new TextDecoder());
      })
      .catch(function () { renderAnswer('Ask failed — is the dashboard still running?', null); })
      .then(function () { askBtn.disabled = false; askBtn.textContent = 'Ask'; });
  });
}
searchInit();
`.trim();
}
