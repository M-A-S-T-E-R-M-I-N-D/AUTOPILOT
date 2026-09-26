// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE BENCHMARK PAGE (operator, 2026-09-26): `/benchmark` — every model the
 * fleet has flown, compared on its own firings, for the community before
 * 1.0 and for every provider that flies later.
 *
 * A subject of the dashboard itself (operator, 2026-09-26: "part of the
 * software, not a link to another page"): the fleet page's rail has a
 * Benchmark place, `#benchmark-panel`, and this chunk draws into it. The
 * same chunk still serves `/benchmark` on its own, as a permalink. Its
 * script, `/benchmark.js`, ships nothing into the core or panels chunks —
 * both sit at their byte budgets — and carries its own English and Hebrew.
 * Inside the dashboard it reads nothing until the screen is on screen, and
 * it follows the dashboard's live language instead of its own.
 * Its styles ride `/tokens.css`: the dashboard's CSP blocks inline styles,
 * so chart colours are classes, never `style` or `fill="var(...)"`.
 *
 * What it draws, from `GET /api/benchmark` (read/benchmark.ts):
 *   - the scoreboard per tier: exploring or led, each arm's progress to the
 *     firings the rule needs, the leader and the rule itself;
 *   - a bubble chart: each model at its cost per shipped commit (across)
 *     and ship rate (up), sized by firings, coloured by provider;
 *   - every firing: minutes against cost, coloured by model, marked by how
 *     it ended;
 *   - the leaderboard table.
 * It refreshes itself every minute.
 */

import { PRODUCT_VERSION } from '../info.js';
import { PRELOAD_FONT_PATHS } from '../assets/fonts.js';
import { DEFAULT_THEME } from '@autopilot/tokens';

export const BENCHMARK_STRINGS = {
  en: {
    title: 'Benchmark',
    subtitle:
      'Every model AUTOPILOT has flown, measured on its own firings over the last {days} days.',
    back: 'Back to the fleet',
    loading: 'Loading…',
    failed: 'Could not load the benchmark.',
    empty: 'No firings recorded yet — fly something and it appears here.',
    scoreboard: 'Who flies which work',
    scoreboardNote:
      'Each tier explores until every model has {min} firings in it; then the cheapest per shipped commit, among models within {tol} points of the best ship rate, leads — and one task in {watch} keeps watching the others.',
    tier_escalated: 'Hard tasks',
    tier_default: 'Ordinary work',
    tier_mechanical: 'Mechanical chores',
    exploring: 'exploring',
    leads: 'leads',
    notServed: 'not flown yet',
    efficiency: 'Cost against quality',
    efficiencyNote:
      'Up is more commits shipped; left is cheaper per shipped commit. Bubble size is firings.',
    axisCost: 'cost per shipped commit ($)',
    axisShip: 'ship rate (%)',
    firingsChart: 'Every firing',
    firingsNote: 'Minutes against cost. Filled: shipped. Ring: no commit. Cross: died.',
    axisMinutes: 'minutes',
    axisDollars: 'cost ($)',
    table: 'Leaderboard',
    colModel: 'Model',
    colProvider: 'Provider',
    colFirings: 'Firings',
    colShip: 'Shipped',
    colCost: 'Cost per ship',
    colMinutes: 'Median minutes',
    colTurns: 'Median turns',
    colDied: 'Died',
    colTotal: 'Spent',
    updated: 'updated {time}',
  },
  he: {
    title: 'בנצ׳מרק',
    subtitle: 'כל מודל ש-AUTOPILOT הטיס, נמדד על ההפעלות שלו ב-{days} הימים האחרונים.',
    back: 'חזרה לצי',
    loading: 'טוען…',
    failed: 'לא הצלחנו לטעון את הבנצ׳מרק.',
    empty: 'עוד אין הפעלות רשומות — הטיסו משהו והוא יופיע כאן.',
    scoreboard: 'מי מטיס איזו עבודה',
    scoreboardNote:
      'כל רמה חוקרת עד שלכל מודל יש בה {min} הפעלות; אז מוביל הזול ביותר לקומיט שנשלח, מבין המודלים שבטווח {tol} נקודות משיעור השליחה הטוב ביותר — ומשימה אחת מכל {watch} ממשיכה לבדוק את האחרים.',
    tier_escalated: 'משימות קשות',
    tier_default: 'עבודה רגילה',
    tier_mechanical: 'מטלות מכניות',
    exploring: 'חוקר',
    leads: 'מוביל',
    notServed: 'עוד לא הוטס',
    efficiency: 'עלות מול איכות',
    efficiencyNote: 'למעלה: יותר קומיטים נשלחו; שמאלה: זול יותר לקומיט. גודל הבועה: מספר ההפעלות.',
    axisCost: 'עלות לקומיט שנשלח ($)',
    axisShip: 'שיעור שליחה (%)',
    firingsChart: 'כל ההפעלות',
    firingsNote: 'דקות מול עלות. מלא: נשלח. טבעת: ללא קומיט. איקס: מת.',
    axisMinutes: 'דקות',
    axisDollars: 'עלות ($)',
    table: 'טבלת מובילים',
    colModel: 'מודל',
    colProvider: 'ספק',
    colFirings: 'הפעלות',
    colShip: 'נשלחו',
    colCost: 'עלות לשליחה',
    colMinutes: 'דקות (חציון)',
    colTurns: 'תורות (חציון)',
    colDied: 'מתו',
    colTotal: 'הוצאה',
    updated: 'עודכן {time}',
  },
} as const;

/** Eight chart colours, as classes — the CSP forbids inline style. */
const SERIES = 8;

const BENCHMARK_CSS = `
main.bm-page { max-width: 1200px; margin: 0 auto; padding: var(--space-5) var(--space-4) var(--space-6); display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: none; gap: var(--space-5); color: var(--color-text); }
.bm-page > * { grid-column: 1 / -1; grid-row: auto; min-width: 0; }
.bm-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.bm-title { margin: 0; font-size: clamp(1.6rem, 1.2rem + 1.4vw, 2.4rem); letter-spacing: -0.02em; }
.bm-sub, .bm-note, .bm-updated { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--text-sm); }
.bm-back { color: var(--color-accent); font-size: var(--text-sm); }
.bm-card { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--shape-medium); padding: var(--space-4); }
.bm-card-title { margin: 0; font-size: var(--text-lg, 1.1rem); }
.bm-tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
.bm-tier { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--shape-small); padding: var(--space-3); display: grid; gap: var(--space-2); }
.bm-tier-title { margin: 0; font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); display: flex; justify-content: space-between; gap: var(--space-2); }
.bm-phase { font-weight: 700; letter-spacing: 0; text-transform: none; }
.bm-phase.is-led { color: var(--color-success); }
.bm-arm { display: grid; grid-template-columns: 5.5rem 1fr auto; gap: var(--space-2); align-items: center; font-size: var(--text-sm); }
.bm-arm.is-leader b { color: var(--color-success); }
.bm-meter { height: 8px; border-radius: 4px; background: var(--color-surface-sunken); overflow: hidden; }
.bm-meter span { display: block; height: 100%; background: var(--color-accent); }
.bm-arm small { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.bm-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: var(--space-4); }
.bm-chart svg { width: 100%; height: auto; display: block; margin-top: var(--space-2); overflow: visible; }
.bm-grid { stroke: var(--color-border); stroke-width: 1; }
.bm-axis { fill: var(--color-text-muted); font-size: 11px; }
.bm-label { fill: var(--color-text); font-size: 11px; font-weight: 600; }
.bm-dot { stroke: var(--color-surface-raised); stroke-width: 1.5; opacity: 0.85; }
.bm-ring { fill: none !important; stroke-width: 2; }
.bm-cross { stroke-width: 2.5; }
.bm-c0 { fill: var(--color-accent); stroke: var(--color-accent); }
.bm-c1 { fill: var(--color-success); stroke: var(--color-success); }
.bm-c2 { fill: var(--color-sev-high); stroke: var(--color-sev-high); }
.bm-c3 { fill: var(--color-sev-medium); stroke: var(--color-sev-medium); }
.bm-c4 { fill: var(--color-info); stroke: var(--color-info); }
.bm-c5 { fill: var(--color-needs-you); stroke: var(--color-needs-you); }
.bm-c6 { fill: var(--color-sev-low); stroke: var(--color-sev-low); }
.bm-c7 { fill: var(--color-text-muted); stroke: var(--color-text-muted); }
.bm-legend { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-2); font-size: var(--text-sm); color: var(--color-text-muted); }
.bm-legend svg { width: 10px; height: 10px; display: inline-block; margin-inline-end: var(--space-1); vertical-align: middle; }
.bm-table-wrap { overflow-x: auto; margin-top: var(--space-3); }
.bm-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.bm-table th, .bm-table td { padding: var(--space-2); border-bottom: 1px solid var(--color-border); text-align: start; white-space: nowrap; }
.bm-table th { color: var(--color-text-muted); font-weight: 600; }
.bm-bar { display: inline-block; width: 64px; height: 6px; border-radius: 3px; background: var(--color-surface-sunken); vertical-align: middle; margin-inline-end: var(--space-2); overflow: hidden; }
.bm-bar span { display: block; height: 100%; background: var(--color-success); }
`;

export function benchmarkCss(): string {
  return BENCHMARK_CSS;
}

/** The page's HTML: the shell's head, one mount point. Built by joining
 *  lines, not a template, so the splice discovery does not take it for a
 *  client-visible splice (the only value it interpolates is the asset hash). */
export function renderBenchmarkPage(assetVersion: string): string {
  const v = assetVersion;
  const preloads = PRELOAD_FONT_PATHS.map(
    (p) =>
      '  <link rel="preload" href="' +
      p +
      '" as="font" type="font/woff2" crossorigin="anonymous" />',
  );
  return [
    '<!doctype html>',
    '<html lang="en" data-theme="' + DEFAULT_THEME + '">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>AUTOPILOT — benchmark</title>',
    '  <link rel="icon" href="/favicon.ico" sizes="any" />',
    '  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    '  <link rel="manifest" href="/manifest.webmanifest" />',
    '  <meta name="theme-color" content="#0a0d12" />',
    ...preloads,
    '  <link rel="stylesheet" href="/tokens.css?v=' + v + '" />',
    '</head>',
    '<body data-page="benchmark">',
    '  <main id="benchmark" class="bm-page" data-version="' + PRODUCT_VERSION + '">',
    '    <p class="bm-sub">Loading…</p>',
    '  </main>',
    '  <script src="/benchmark.js?v=' + v + '" defer></script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

const CHUNK_BODY = `
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
var EMBED = document.getElementById('benchmark-panel');
var HL = EMBED ? 1 : 0;
function hn(level) { return 'h' + (level + HL); }
if (!EMBED) {
  var theme = lsGet('ap-theme');
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  var saved = lsGet('ap-locale') === 'he' ? 'he' : 'en';
  document.documentElement.lang = saved;
  document.documentElement.dir = saved === 'he' ? 'rtl' : 'ltr';
}
var locale = 'en';
function syncLocale() { locale = document.documentElement.lang === 'he' ? 'he' : 'en'; }
syncLocale();
var SVGNS = 'http://www.w3.org/2000/svg';
function t(key, subs) {
  var s = BM[locale][key] || BM.en[key] || key;
  if (subs) for (var name in subs) s = s.split('{' + name + '}').join(String(subs[name]));
  return s;
}
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}
function sv(tag, attrs, cls) {
  var n = document.createElementNS(SVGNS, tag);
  for (var k in attrs) n.setAttribute(k, String(attrs[k]));
  if (cls) n.setAttribute('class', cls);
  return n;
}
function pct(x) { return x === null || x === undefined ? '-' : Math.round(x * 100) + '%'; }
function usd(x) { return x === null || x === undefined ? '-' : '$' + Number(x).toFixed(2); }
function num(x) { return Number(x).toLocaleString(locale); }
var colorOf = {};
function colorClass(modelId) {
  if (colorOf[modelId] === undefined) colorOf[modelId] = Object.keys(colorOf).length % SERIES;
  return 'bm-c' + colorOf[modelId];
}
function niceMax(v) {
  if (!(v > 0)) return 1;
  var p = Math.pow(10, Math.floor(Math.log10(v)));
  var steps = [1, 2, 2.5, 5, 10];
  for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
  return 10 * p;
}
function axes(svg, w, h, pad, xMax, yMax, xLabel, yLabel, xFmt, yFmt) {
  for (var i = 0; i <= 4; i++) {
    var y = pad.t + (h - pad.t - pad.b) * (1 - i / 4);
    svg.appendChild(sv('line', { x1: pad.l, x2: w - pad.r, y1: y, y2: y }, 'bm-grid'));
    var ty = sv('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end' }, 'bm-axis');
    ty.textContent = yFmt(yMax * i / 4);
    svg.appendChild(ty);
    var x = pad.l + (w - pad.l - pad.r) * (i / 4);
    var tx = sv('text', { x: x, y: h - pad.b + 16, 'text-anchor': 'middle' }, 'bm-axis');
    tx.textContent = xFmt(xMax * i / 4);
    svg.appendChild(tx);
  }
  var xl = sv('text', { x: (pad.l + w - pad.r) / 2, y: h - 4, 'text-anchor': 'middle' }, 'bm-axis');
  xl.textContent = xLabel;
  svg.appendChild(xl);
  var yl = sv('text', { x: 12, y: (pad.t + h - pad.b) / 2, 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (pad.t + h - pad.b) / 2 + ')' }, 'bm-axis');
  yl.textContent = yLabel;
  svg.appendChild(yl);
}
function card(titleKey, noteText) {
  var c = el('section', 'bm-card');
  c.appendChild(el(hn(2), 'bm-card-title', t(titleKey)));
  if (noteText) c.appendChild(el('p', 'bm-note', noteText));
  return c;
}
function tiersCard(data) {
  var c = card('scoreboard', t('scoreboardNote', { min: data.rule.minFirings, tol: Math.round(data.rule.shipRateTolerance * 100), watch: data.rule.watchOneIn }));
  var grid = el('div', 'bm-tiers');
  for (var i = 0; i < data.tiers.length; i++) {
    var tier = data.tiers[i];
    var box = el('div', 'bm-tier');
    var h = el(hn(3), 'bm-tier-title', t('tier_' + tier.tier));
    var phase = el('span', 'bm-phase' + (tier.leader ? ' is-led' : ''), tier.leader ? tier.leader + ' ' + t('leads') : t('exploring'));
    h.appendChild(phase);
    box.appendChild(h);
    for (var j = 0; j < tier.arms.length; j++) {
      var a = tier.arms[j];
      var row = el('div', 'bm-arm' + (tier.leader === a.alias ? ' is-leader' : ''));
      var name = el('b', null, a.alias);
      name.setAttribute('title', a.modelId || t('notServed'));
      row.appendChild(name);
      var meter = el('div', 'bm-meter');
      meter.setAttribute('role', 'img');
      meter.setAttribute('aria-label', a.alias + ' ' + a.firings + '/' + data.rule.minFirings);
      var fill = el('span');
      fill.style.width = Math.min(100, (a.firings / data.rule.minFirings) * 100) + '%';
      meter.appendChild(fill);
      row.appendChild(meter);
      row.appendChild(el('small', null, a.firings + '/' + data.rule.minFirings + ' · ' + pct(a.shipRate) + ' · ' + usd(a.costPerShipUsd)));
      box.appendChild(row);
    }
    grid.appendChild(box);
  }
  c.appendChild(grid);
  return c;
}
function legend(models) {
  var lg = el('div', 'bm-legend');
  for (var i = 0; i < models.length; i++) {
    var item = el('span');
    var sw = sv('svg', { viewBox: '0 0 10 10', 'aria-hidden': 'true' });
    sw.appendChild(sv('circle', { cx: 5, cy: 5, r: 5 }, colorClass(models[i].modelId)));
    item.appendChild(sw);
    item.appendChild(document.createTextNode(models[i].label + ' · ' + models[i].vendor));
    lg.appendChild(item);
  }
  return lg;
}
function bubbleCard(data) {
  var c = card('efficiency', t('efficiencyNote'));
  c.classList.add('bm-chart');
  var w = 560, h = 340, pad = { l: 48, r: 24, t: 16, b: 40 };
  var withShips = data.models.filter(function (m) { return m.costPerShipUsd !== null; });
  var xMax = niceMax(Math.max.apply(null, withShips.map(function (m) { return m.costPerShipUsd; }).concat([1])) * 1.1);
  var svg = sv('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': t('efficiency') });
  axes(svg, w, h, pad, xMax, 100, t('axisCost'), t('axisShip'), function (v) { return '$' + v.toFixed(v < 10 ? 1 : 0); }, function (v) { return Math.round(v) + '%'; });
  var maxF = Math.max.apply(null, data.models.map(function (m) { return m.firings; }).concat([1]));
  for (var i = 0; i < withShips.length; i++) {
    var m = withShips[i];
    var x = pad.l + (w - pad.l - pad.r) * (m.costPerShipUsd / xMax);
    var y = pad.t + (h - pad.t - pad.b) * (1 - m.shipRate);
    var r = 6 + 22 * Math.sqrt(m.firings / maxF);
    var dot = sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(1) }, 'bm-dot ' + colorClass(m.modelId));
    var tip = sv('title', {});
    tip.textContent = m.label + ': ' + pct(m.shipRate) + ', ' + usd(m.costPerShipUsd) + ', ' + m.firings;
    dot.appendChild(tip);
    svg.appendChild(dot);
    var lab = sv('text', { x: (x + r + 4).toFixed(1), y: (y + 4).toFixed(1) }, 'bm-label');
    lab.textContent = m.label;
    svg.appendChild(lab);
  }
  c.appendChild(svg);
  c.appendChild(legend(data.models));
  return c;
}
function firingsCard(data) {
  var c = card('firingsChart', t('firingsNote'));
  c.classList.add('bm-chart');
  var w = 560, h = 340, pad = { l: 48, r: 24, t: 16, b: 40 };
  var pts = data.points;
  var xMax = niceMax(Math.max.apply(null, pts.map(function (p) { return p.minutes; }).concat([1])));
  var yMax = niceMax(Math.max.apply(null, pts.map(function (p) { return p.costUsd; }).concat([1])));
  var svg = sv('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': t('firingsChart') });
  axes(svg, w, h, pad, xMax, yMax, t('axisMinutes'), t('axisDollars'), function (v) { return String(Math.round(v)); }, function (v) { return '$' + v.toFixed(v < 10 ? 1 : 0); });
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    var x = pad.l + (w - pad.l - pad.r) * Math.min(1, p.minutes / xMax);
    var y = pad.t + (h - pad.t - pad.b) * (1 - Math.min(1, p.costUsd / yMax));
    var cls = colorClass(p.modelId);
    if (p.outcome === 'died') {
      svg.appendChild(sv('path', { d: 'M' + (x - 4) + ' ' + (y - 4) + 'L' + (x + 4) + ' ' + (y + 4) + 'M' + (x + 4) + ' ' + (y - 4) + 'L' + (x - 4) + ' ' + (y + 4) }, 'bm-cross ' + cls));
    } else {
      svg.appendChild(sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.5 }, (p.outcome === 'shipped' ? 'bm-dot ' : 'bm-dot bm-ring ') + cls));
    }
  }
  c.appendChild(svg);
  c.appendChild(legend(data.models));
  return c;
}
function tableCard(data) {
  var c = card('table');
  var wrap = el('div', 'bm-table-wrap');
  var table = el('table', 'bm-table');
  var head = el('tr');
  var cols = ['colModel', 'colProvider', 'colFirings', 'colShip', 'colCost', 'colMinutes', 'colTurns', 'colDied', 'colTotal'];
  for (var i = 0; i < cols.length; i++) { var th = el('th', null, t(cols[i])); th.setAttribute('scope', 'col'); head.appendChild(th); }
  var thead = el('thead');
  thead.appendChild(head);
  table.appendChild(thead);
  var body = el('tbody');
  for (var j = 0; j < data.models.length; j++) {
    var m = data.models[j];
    var tr = el('tr');
    var name = el('th');
    name.setAttribute('scope', 'row');
    var sw = sv('svg', { viewBox: '0 0 10 10', width: 10, height: 10, 'aria-hidden': 'true' });
    sw.appendChild(sv('circle', { cx: 5, cy: 5, r: 5 }, colorClass(m.modelId)));
    name.appendChild(sw);
    name.appendChild(document.createTextNode(' ' + m.label));
    name.setAttribute('title', m.modelId);
    tr.appendChild(name);
    tr.appendChild(el('td', null, m.vendor));
    tr.appendChild(el('td', null, num(m.firings)));
    var ship = el('td');
    var bar = el('span', 'bm-bar');
    var fill = el('span');
    fill.style.width = Math.round(m.shipRate * 100) + '%';
    bar.appendChild(fill);
    ship.appendChild(bar);
    ship.appendChild(document.createTextNode(pct(m.shipRate)));
    tr.appendChild(ship);
    tr.appendChild(el('td', null, usd(m.costPerShipUsd)));
    tr.appendChild(el('td', null, m.medianMinutes.toFixed(1)));
    tr.appendChild(el('td', null, Math.round(m.medianTurns)));
    tr.appendChild(el('td', null, num(m.died)));
    tr.appendChild(el('td', null, usd(m.costUsd)));
    body.appendChild(tr);
  }
  table.appendChild(body);
  wrap.appendChild(table);
  c.appendChild(wrap);
  return c;
}
function header(data) {
  var h = el('header', 'bm-head');
  var left = el('div');
  var h1 = el(hn(1), 'bm-title', t('title'));
  left.appendChild(h1);
  left.appendChild(el('p', 'bm-sub', t('subtitle', { days: data ? data.windowDays : 90 })));
  if (data) left.appendChild(el('p', 'bm-updated', t('updated', { time: new Date(data.generatedAt).toLocaleTimeString(locale) })));
  h.appendChild(left);
  if (!EMBED) {
    var back = el('a', 'bm-back', t('back'));
    back.href = '/';
    h.appendChild(back);
  }
  return h;
}
function paint(data) {
  var root = document.getElementById('benchmark');
  if (!root) return;
  root.replaceChildren();
  root.appendChild(header(data));
  if (!data) { root.appendChild(el('p', 'bm-note', t('failed'))); return; }
  root.appendChild(tiersCard(data));
  if (data.models.length === 0) { root.appendChild(el('p', 'bm-note', t('empty'))); return; }
  var charts = el('div', 'bm-charts');
  charts.appendChild(bubbleCard(data));
  charts.appendChild(firingsCard(data));
  root.appendChild(charts);
  root.appendChild(tableCard(data));
}
var lastData = null;
var requested = false;
function load() {
  requested = true;
  return fetch('/api/benchmark', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (d) { lastData = d; paint(d); });
}
// Inside the dashboard the screen reads nothing until it is on screen: a
// subject the operator never opens costs no request.
function onScreen() {
  if (!EMBED) return true;
  if (document.hidden) return false;
  var r = EMBED.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < (window.innerHeight || 0);
}
window.__apBenchmarkLoad = load;
if (EMBED) {
  EMBED.hidden = false;
  new MutationObserver(function () {
    var was = locale;
    syncLocale();
    if (was !== locale && requested) paint(lastData);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting && !requested) load();
    }).observe(EMBED);
  } else {
    load();
  }
} else {
  document.title = 'AUTOPILOT — ' + t('title');
  load();
}
setInterval(function () { if (requested && onScreen()) load(); }, 60000);
`;

/** The `/benchmark.js` chunk. Built by concatenation, not a template, so the
 *  splice discovery does not take it for a client-visible splice. */
export function benchmarkClientJs(): string {
  return (
    '(function () { var BM = ' +
    JSON.stringify(BENCHMARK_STRINGS) +
    '; var SERIES = ' +
    String(SERIES) +
    ';' +
    CHUNK_BODY +
    '})();'
  );
}
