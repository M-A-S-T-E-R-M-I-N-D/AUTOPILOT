// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * cockpit-metrics — COCKPIT PHASE 0 MEASURE (docs/epics/0015-cockpit-supervisory-control.md,
 * board web-mtbpiiur-43tmr3): "proven by scripts/cockpit-metrics.mjs and the gate, not by
 * assertion". This slice covers TWELVE rows of the phase-0 table — DOM growth per lane/task/
 * row, axe violations by impact, tab stops, attribute payload, duplicate renders, and unique
 * declaration values — against the REAL served surfaces (`renderShell` + `clientJs` from
 * `apps/dashboard/src/web/shell.ts`, and the `/tokens.css` stylesheet exactly as
 * `server/routes.ts` composes it), not synthetic/hand-built markup — plus a SEVENTH row,
 * selector specificity, over that same served stylesheet, an EIGHTH, the WCAG contrast
 * matrix over the theme token maps (`THEMES`, the exact values `colorVars()` serves as
 * `--color-*` custom properties), a NINTH and TENTH, alarm rate and severity shape —
 * the share of each painted render carrying attention-demanding ink, and that ink's
 * distribution across the severity tokens, with the alarm-selector set DERIVED from the
 * served stylesheet (every resting-state selector whose declarations reference an attention
 * token) rather than hand-listed — and an ELEVENTH, i18n tagging coverage: the same three
 * fixtures' painted DOM checked against `web/features/locale.ts`'s OWN sweep targets
 * (`translateDom()`'s `[data-i18n]`/`[data-i18n-template]`/`[data-i18n-aria]`/
 * `[data-i18n-placeholder]`) rather than a hand-picked selector list, so a new sweep
 * attribute added there is picked up here for free — a TWELFTH, token coverage via
 * computed-style census
 * (covered/drifted/uncovered, the epic's own Phase 1 vocabulary), classifying every
 * color-relevant declaration in that same served stylesheet by whether it references a design
 * token (`var(--color-*)`), hardcodes a literal that happens to duplicate one anyway, or paints
 * genuinely untracked ink — and a THIRTEENTH, longest task, the one row jsdom cannot answer
 * (the Long Tasks API has no jsdom implementation), so it runs in a real Chromium
 * (`@playwright/test`) against the real `createServer` HTTP server instead. The last row in
 * the brief's §5 table (INP p75) stays open for a follow-on slice —
 * SLICE_BUDGET = 1 slice per firing (epic constraint).
 *
 * Each axis renders the SAME page twice — once at a small fixture size, once at "the largest
 * launchable" (epic constraint: "the metrics script runs at ≥2 fleet sizes ... a single size
 * hides it") — inside a fresh jsdom window per render (no cross-render listener bleed, unlike
 * `test/web/a11y.test.ts`'s single shared `document`, which needs its own listener-stripping
 * workaround because it reuses one document across many cases; the longest-task axis is the
 * one exception — it renders inside a fresh Chromium *page* per render instead, sharing one
 * *browser* across all six). The `LARGE_*_COUNT` constants below are a synthetic stand-in for
 * "largest launchable": no coded ceiling exists anywhere in `flight/`/`control/` (verified by
 * grep), and the epic doc itself only cites "8 concurrent lanes" as an observed real example,
 * not a limit — this script picks a fixture size at least that large.
 *
 * Usage: `pnpm run cockpit-metrics` (or `pnpm run build && node scripts/cockpit-metrics.mjs`
 * directly) — writes `docs/EVALUATION-<today>-cockpit-baseline.md`. Unlike this repo's `ci:*`
 * regen scripts (`data-model`, `citation`, `architecture`, ...), which refresh ONE living,
 * git-checked doc in place, every `EVALUATION-*.md` in this repo is a dated point-in-time
 * snapshot that is never rewritten under an old date — so this script always writes today's
 * file fresh rather than diff-checking a prior day's numbers against a `--check` flag.
 */
import { builtinEnvironments } from 'vitest/runtime';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import axe from 'axe-core';
import { chromium } from '@playwright/test';
import { summarizeInteractionTiming } from './cockpit-metrics-interaction.mjs';
import { renderShell, clientJs } from '../apps/dashboard/dist/web/shell.js';
import { layoutCss } from '../apps/dashboard/dist/web/layout-css.js';
import { fontFaceCss } from '../apps/dashboard/dist/assets/fonts.js';
import { createServer, LOOPBACK_HOST } from '../apps/dashboard/dist/server/server.js';
import {
  stylesheet,
  THEMES,
  THEME_NAMES,
  COLOR_TOKENS,
  contrastRatio,
} from '../packages/tokens/dist/index.js';

// Mirrors `apps/dashboard/test/web/a11y.test.ts`'s AXE_OPTIONS: color-contrast stays disabled
// because jsdom has no layout engine to compute it (asserted separately by the token package's
// contrast tests) — this script's axe axis would otherwise report every render as a contrast
// violation regardless of real fixture content.
const AXE_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'color-contrast': { enabled: false } },
};
const AXE_IMPACTS = ['critical', 'serious', 'moderate', 'minor'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SMALL_ROW_COUNT = 1;
const LARGE_ROW_COUNT = 8;
const SMALL_TASK_COUNT = 1;
const LARGE_TASK_COUNT = 20;
const SMALL_LANE_COUNT = 1;
const LARGE_LANE_COUNT = 8; // see file doc comment: no coded ceiling exists to read instead
// How many properties the unique-values census table shows — the drift signal lives at the
// head of the distribution (a property with 2 values needs no ledger entry).
const CENSUS_TOP_COUNT = 12;

/** Populates `globalThis` with a fresh jsdom window using Vitest's OWN `jsdom` environment
 *  setup (`vitest/runtime`, already a root devDependency) instead of a hand-rolled
 *  key-copy — the client bundle references bare `document`/`window`/`CustomEvent`/etc. as
 *  globals, exactly as it does under Vitest's jsdom project (`test/web/a11y.test.ts`), and
 *  reusing the real implementation sidesteps subtle realm bugs a hand-rolled copy hits (e.g.
 *  jsdom's `setTimeout`/`performance` wrap `this`-bound internals that infinite-recurse if
 *  copied as bare functions instead of `bind`-preserved — Vitest's `populateGlobal` already
 *  handles this via `bindFunctions: true`). A brand-new environment per render (see
 *  {@link measure}) means there is never a stale listener from a prior render still attached
 *  when the next one starts, unlike `a11y.test.ts`'s single shared `document`. */
async function installJsdomGlobals() {
  return builtinEnvironments.jsdom.setup(globalThis, { jsdom: { pretendToBeVisual: true } });
}

async function waitFor(predicate, timeoutMs = 5000, intervalMs = 15) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('cockpit-metrics: waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function baseProject(overrides) {
  return {
    id: 'p0',
    slug: 'checkout',
    name: 'checkout-web',
    status: 'registered',
    createdAt: 1,
    primaryLanguage: 'typescript',
    fileCount: 5,
    totalBytes: 2048,
    languages: [{ language: 'typescript', files: 4, bytes: 1800 }],
    topDirs: [{ dir: 'src', files: 4 }],
    gate: 'js · vitest run',
    backedUp: true,
    hotFiles: ['src/index.ts', 'src/cart.ts'],
    firings: 3,
    shipped: 2,
    cost: 0.76,
    tokensIn: 20605,
    tokensOut: 2534,
    shipRate: 0.66,
    openFindings: 3,
    gauge: { critical: 1, high: 1, medium: 0, low: 1 },
    lastActivityAt: Date.now(),
    activity: [],
    flightLog: [],
    tasks: [],
    // Required for the longest-task axis below: `notifications.ts`'s `activeNotifyKeys`/
    // `newNotifyEvents` do `for (const a of p.anomalies)` with NO undefined guard (unlike
    // shell.ts's own `if (c.anomalies)` card-rendering check) — harmless in the jsdom axes
    // above (`typeof Notification === 'undefined'` short-circuits `maybeNotifyFleet` before
    // it ever reaches that loop), but a real Chromium always has `Notification` defined, so
    // omitting this field there throws "anomalies is not iterable" before ANY DOM update,
    // which was reproduced building this script (jsdom's blind spot, not a fixture nicety).
    anomalies: [],
    ...overrides,
  };
}

function fleetTotals(projects) {
  return {
    projects: projects.length,
    flying: projects.filter((p) => p.status === 'flying').length,
    needsYou: 0,
    firings: projects.reduce((sum, p) => sum + p.firings, 0),
    shipped: projects.reduce((sum, p) => sum + p.shipped, 0),
    openFindings: projects.reduce((sum, p) => sum + p.openFindings, 0),
    cost: projects.reduce((sum, p) => sum + p.cost, 0),
  };
}

function fleetState(projects) {
  return {
    generatedAt: Date.now(),
    totals: fleetTotals(projects),
    projects,
    empty: projects.length === 0,
  };
}

/** N fleet rows (projects) — "DOM growth per row". */
function rowsFixture(rowCount) {
  const projects = Array.from({ length: rowCount }, (_, i) =>
    baseProject({ id: 'p' + i, slug: 'proj-' + i, name: 'project-' + i }),
  );
  return { state: fleetState(projects), projectId: undefined, waitSelector: '.card' };
}

/** One project's task board at N tasks — "DOM growth per task". */
function tasksFixture(taskCount) {
  const tasks = Array.from({ length: taskCount }, (_, i) => ({
    id: 't' + i,
    title: 'Task number ' + i,
    status: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'in_progress' : 'open',
    severity: i % 4 === 0 ? 'high' : null,
    dimension: null,
    focus: i === 0,
  }));
  const project = baseProject({ tasks });
  return { state: fleetState([project]), projectId: project.id, waitSelector: '.task' };
}

/** One project running N concurrent worktree lanes — "DOM growth per lane" (board
 *  web-mtbp0t86-rnimyi: the fleet-wide `#live-workers` chip strip already renders one chip per
 *  lane via `liveFirings()`/`liveWorkerItems()`, unlike the per-card `.live-worker` panel,
 *  which still shows only the single newest lane via `liveFiring()` — this axis measures the
 *  strip that already scales, not the still-single-lane card panel). */
function lanesFixture(laneCount) {
  const activity = Array.from({ length: laneCount }, (_, i) => ({
    tool: 'Read',
    target: 'src/file' + i + '.ts',
    kind: 'file',
    phase: 'do',
    at: Date.now() - i,
    firingId: 'p0:firing-' + i,
    model: 'sonnet-5',
  }));
  const project = baseProject({ status: 'flying', activity });
  return { state: fleetState([project]), projectId: undefined, waitSelector: '.live-worker-chip' };
}

/** Renders the real client bundle against a fresh jsdom window and hands the painted
 *  `document` to `probe` once `waitSelector` has matched. Shared by `measure()` (DOM node
 *  count) and `measureAxeImpacts()` (axe violations) so both probe the SAME render technique
 *  instead of two divergent jsdom setups drifting apart. */
async function withRenderedFixture({ state, projectId, waitSelector }, probe) {
  const { teardown } = await installJsdomGlobals();
  // The client bundle falls back to `setInterval(refresh, REFRESH_MS)` when EventSource is
  // unavailable (jsdom has none) — a real, uncleared Node timer would keep firing after this
  // function returns and `teardown()` deletes `document`, crashing the process with a stray
  // `ReferenceError: document is not defined` (reproduced while building this script). Track
  // every timer this render sets so they can be cleared before teardown.
  const pending = [];
  // Every interval CALLBACK the bundle registers is also kept (not just its clear handle) so
  // a probe can simulate one poll tick deterministically instead of waiting REFRESH_MS/
  // POLL_MS of wall clock — see measureDuplicateRenders().
  const intervalCallbacks = [];
  const realSetInterval = globalThis.setInterval;
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setInterval = (...args) => {
    const handle = realSetInterval(...args);
    intervalCallbacks.push(args[0]);
    pending.push(() => clearInterval(handle));
    return handle;
  };
  globalThis.setTimeout = (...args) => {
    const handle = realSetTimeout(...args);
    pending.push(() => clearTimeout(handle));
    return handle;
  };
  try {
    // `document` is injected onto `globalThis` by `installJsdomGlobals()` above, not a static
    // import — referenced via `globalThis.document` (not the bare identifier) so this Node
    // script's own ESLint config (`globals.node`, no browser globals) doesn't flag it.
    const doc = globalThis.document;
    doc.open();
    doc.write(renderShell(projectId));
    doc.close();
    globalThis.fetch = async () => ({ ok: true, json: async () => state });
    // The bundle's initial synchronous execution is the page's first (and biggest
    // candidate) main-thread task — timed here, where it runs, and handed to probes so
    // the longest-task axis can weigh it without re-running the bundle. Compilation
    // (`new Function`) is split out so only execution is on the clock.
    const clientFn = new Function(clientJs());
    const evalStart = globalThis.performance.now();
    clientFn();
    const evalMs = globalThis.performance.now() - evalStart;
    await waitFor(() => doc.querySelector(waitSelector) !== null);
    return await probe(doc, { intervalCallbacks, evalMs });
  } finally {
    pending.forEach((clear) => clear());
    globalThis.setInterval = realSetInterval;
    globalThis.setTimeout = realSetTimeout;
    await teardown(globalThis);
  }
}

/** Total DOM node count once `waitSelector` has painted. */
async function measure(fixture) {
  return withRenderedFixture(fixture, (doc) => doc.querySelectorAll('*').length);
}

/** Axe-core violation count by impact (critical/serious/moderate/minor), counted per AFFECTED
 *  NODE (not per rule) so the count scales with fixture size the same way the DOM-growth axis
 *  does — one rule failing across 8 rows counts as 8, not 1. */
async function measureAxeImpacts(fixture) {
  return withRenderedFixture(fixture, async (doc) => {
    // axe-core's UMD wrapper captures `window`/`document` ONCE, at ITS OWN module-load time —
    // which happens before this script's per-render `installJsdomGlobals()` ever runs, so that
    // captured reference is permanently stale (a plain `{}`, not a real jsdom window). Passing
    // an Element (not the Document itself, whose `ownerDocument` is spec'd `null`) makes
    // `axe.run()`'s internal `setupGlobals()` derive window/document fresh from
    // `context.ownerDocument`/`.defaultView` on every call instead of trusting its stale
    // closure — the supported way to run axe against a runtime-created window.
    const results = await axe.run(doc.documentElement, AXE_OPTIONS);
    const counts = Object.fromEntries(AXE_IMPACTS.map((impact) => [impact, 0]));
    for (const violation of results.violations) {
      const impact = violation.impact ?? 'minor';
      counts[impact] = (counts[impact] ?? 0) + violation.nodes.length;
    }
    return counts;
  });
}

// jsdom's `tabIndex` getter does not subtract disabled form controls from the tab order the
// way real browsers do (verified empirically: a `<button disabled>` still reports `tabIndex
// === 0` in jsdom) — checked here explicitly so a disabled control never inflates the count.
function isTabStop(el) {
  if (el.tabIndex < 0) return false;
  if ('disabled' in el && el.disabled) return false;
  return true;
}

/** Count of elements reachable via sequential Tab navigation once `waitSelector` has painted —
 *  every native/`tabindex`-bearing focusable element minus disabled controls. This axis exists
 *  to catch the same anti-pattern DOM growth catches: a list that adds one tab stop per row/
 *  task/lane instead of virtualizing or using a roving-tabindex container becomes a keyboard
 *  trap in practice long before it becomes a visual problem. */
async function measureTabStops(fixture) {
  return withRenderedFixture(
    fixture,
    (doc) => Array.from(doc.querySelectorAll('*')).filter(isTabStop).length,
  );
}

async function measureTabAxis(label, smallN, largeN, fixtureOf) {
  const smallStops = await measureTabStops(fixtureOf(smallN));
  const largeStops = await measureTabStops(fixtureOf(largeN));
  const perUnit = (largeStops - smallStops) / (largeN - smallN);
  return { label, smallN, smallStops, largeN, largeStops, perUnit };
}

/** Total attribute payload once `waitSelector` has painted — sum of every element's attribute
 *  name + value string lengths (characters, a proxy for the bytes the client actually parses).
 *  Counted separately from the DOM-growth node count above because a node count can stay flat
 *  while per-node attribute weight balloons (e.g. a growing `data-tip`/`aria-label` string, or
 *  more classes/data-* attributes stacked onto the same element) — the two axes catch different
 *  regressions even though they share the exact same three fixtures and render harness. */
function attributePayload(doc) {
  let total = 0;
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      total += attr.name.length + attr.value.length;
    }
  }
  return total;
}

async function measureAttributePayload(fixture) {
  return withRenderedFixture(fixture, (doc) => attributePayload(doc));
}

async function measureAttributeAxis(label, smallN, largeN, fixtureOf) {
  const smallBytes = await measureAttributePayload(fixtureOf(smallN));
  const largeBytes = await measureAttributePayload(fixtureOf(largeN));
  const perUnit = (largeBytes - smallBytes) / (largeN - smallN);
  return { label, smallN, smallBytes, largeN, largeBytes, perUnit };
}

/** DOM mutations applied by ONE simulated poll cycle delivering the SAME data that is already
 *  painted — every interval callback the bundle registered (the `startFleetStream` fetch poll
 *  plus the pool-client/pr-review panel polls, all of which already ran once against this same
 *  stubbed fetch during setup) fires exactly once while a MutationObserver watches the whole
 *  document. An idempotent client mutates NOTHING when its data has not changed; every counted
 *  mutation here is duplicate-render churn (or a per-tick timestamp rewrite, which is the same
 *  class of churn) — the baseline the epic's D2 "dedup renders" work is judged against.
 *  Counted per mutated NODE (childList records contribute addedNodes + removedNodes;
 *  attribute/characterData records contribute 1 each) so the count scales with fixture size
 *  the same way the DOM-growth axis does. */
async function measureDuplicateRenders(fixture) {
  return withRenderedFixture(fixture, async (doc, { intervalCallbacks }) => {
    const records = [];
    // `MutationObserver` comes off `globalThis` for the same ESLint reason `document` does
    // above: it exists only after installJsdomGlobals(), not as a Node global.
    const observer = new globalThis.MutationObserver((batch) => records.push(...batch));
    observer.observe(doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    for (const tick of intervalCallbacks) tick();
    // The stubbed fetch and the bundle's render promise chains are microtask-only — one
    // macrotask turn flushes them all; a second guards a chained macrotask (none observed,
    // cheap insurance against one appearing).
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    records.push(...observer.takeRecords());
    observer.disconnect();
    if (process.env.DUP_DEBUG) {
      for (const record of records) {
        const t = record.target;
        const desc =
          t.nodeType === 3
            ? `#text "${(t.textContent || '').slice(0, 60)}" in <${t.parentElement?.tagName?.toLowerCase()} class="${t.parentElement?.className}">`
            : `<${t.tagName?.toLowerCase()} id="${t.id}" class="${t.className}"> attr=${record.attributeName || ''}`;
        console.error('DUP:', record.type, desc);
      }
    }
    let total = 0;
    for (const record of records) {
      total +=
        record.type === 'childList' ? record.addedNodes.length + record.removedNodes.length : 1;
    }
    return total;
  });
}

async function measureDupAxis(label, smallN, largeN, fixtureOf) {
  const smallMutations = await measureDuplicateRenders(fixtureOf(smallN));
  const largeMutations = await measureDuplicateRenders(fixtureOf(largeN));
  const perUnit = (largeMutations - smallMutations) / (largeN - smallN);
  return { label, smallN, smallMutations, largeN, largeMutations, perUnit };
}

/** Whether `el` carries directly-OWNED, non-whitespace text — a Text node child, not text
 *  inherited from a descendant element. Matches the granularity `translateDom()`'s
 *  `[data-i18n]` sweep expects: text split across sibling elements inside a wrapper is each
 *  child's own tagging concern, not the wrapper's (a plain `<div>` wrapping a tagged
 *  `<span>` has no own text and is correctly skipped, not counted untagged). */
function hasOwnText(el) {
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.textContent.trim().length > 0) return true;
  }
  return false;
}

/** i18n tagging coverage of one painted render, scoped to `doc.body` (the `<head>`'s
 *  untagged `<title>` sits outside every fixture's scaling and outside anything a locale
 *  switch repaints, so it is not a candidate). Checked against `web/features/locale.ts`'s
 *  OWN `translateDom()` sweep attributes rather than a hand-picked selector list, so a new
 *  sweep attribute added there is picked up here automatically — three independent
 *  candidate pools, matching `translateDom()`'s three independent `querySelectorAll`
 *  passes: direct-text elements (tagged by `[data-i18n]` OR `[data-i18n-template]`,
 *  `translateDom()`'s two text-replacing sweeps), `aria-label`-bearing elements (tagged by
 *  `[data-i18n-aria]`), and `placeholder`-bearing elements (tagged by
 *  `[data-i18n-placeholder]`). An element that lands in more than one pool (e.g. its own
 *  text AND an aria-label) counts once per pool, mirroring the three independent sweeps.
 *  `data-tip` hover text (`strings.ts`: "stays English-only for now") is correctly absent
 *  from every pool — it is a separate, un-swept attribute, neither text content, an
 *  aria-label, nor a placeholder. */
function i18nCoverage(doc) {
  const pools = {
    text: { tagged: 0, untagged: 0 },
    aria: { tagged: 0, untagged: 0 },
    placeholder: { tagged: 0, untagged: 0 },
  };
  for (const el of doc.body.querySelectorAll('*')) {
    if (hasOwnText(el)) {
      const key = el.hasAttribute('data-i18n') || el.hasAttribute('data-i18n-template');
      pools.text[key ? 'tagged' : 'untagged'] += 1;
    }
    if (el.hasAttribute('aria-label')) {
      pools.aria[el.hasAttribute('data-i18n-aria') ? 'tagged' : 'untagged'] += 1;
    }
    if (el.hasAttribute('placeholder')) {
      pools.placeholder[el.hasAttribute('data-i18n-placeholder') ? 'tagged' : 'untagged'] += 1;
    }
  }
  return pools;
}

async function measureI18nCoverage(fixture) {
  return withRenderedFixture(fixture, (doc) => i18nCoverage(doc));
}

async function measureI18nAxis(label, smallN, largeN, fixtureOf) {
  const small = await measureI18nCoverage(fixtureOf(smallN));
  const large = await measureI18nCoverage(fixtureOf(largeN));
  return { label, smallN, small, largeN, large };
}

/** Launches a REAL Chromium (`@playwright/test`, already a devDependency for
 *  `apps/dashboard/e2e/`) for the longest-task axis below and hands it to `run` — the Long
 *  Tasks API (`PerformanceObserver({entryTypes:['longtask']})`) has no jsdom implementation,
 *  so this is the one render axis `withRenderedFixture` above cannot answer. Launched ONCE
 *  and shared across all six renders (row/task/lane × small/large), not per render. */
async function withRealBrowser(run) {
  const browser = await chromium.launch();
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

/** Serves `fixture.state` off a REAL loopback HTTP server — `createServer`, the exact function
 *  `apps/dashboard/src/index.ts` boots in production, not a hand-rolled stub — on an ephemeral
 *  port, and resolves `run` with the URL `fixture.waitSelector` paints at: `/` for the fleet
 *  grid (row/lane fixtures), `/p/<id>` for a single project's task board (the task fixture),
 *  exactly as `server/routes.ts`'s pure router dispatches them. */
async function withHttpFixture({ state, projectId }, run) {
  const server = createServer({ readState: () => state });
  await new Promise((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
  const { port } = server.address();
  try {
    return await run(`http://${LOOPBACK_HOST}:${port}${projectId ? `/p/${projectId}` : '/'}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** Longest single main-thread task (ms) from navigation through first paint of
 *  `fixture.waitSelector` plus a short settle window, in the real Chromium `browser` — unlike
 *  every axis above, this one hits the REAL `/api/state` over the network (no stubbed
 *  `fetch`), because a real server is what `withHttpFixture` is serving. The observer is
 *  installed via `page.addInitScript` so it is live from the FIRST script the served page
 *  runs, not attached after the fact and missing early hydration work. */
async function measureLongestTaskMs(browser, fixture) {
  return withHttpFixture(fixture, async (url) => {
    const page = await browser.newPage();
    if (process.env.LONGTASK_DEBUG) {
      page.on('crash', () => console.error('LONGTASK: page crashed at', url));
      page.on('pageerror', (e) => console.error('LONGTASK pageerror:', e.message?.slice(0, 300)));
      page.on('console', (m) => {
        if (m.type() === 'error') console.error('LONGTASK console.error:', m.text().slice(0, 300));
      });
    }
    try {
      // `window`/`PerformanceObserver` below run inside the BROWSER's own execution context
      // (Playwright serializes this closure into the page), not this Node script's — this
      // script's ESLint config (`globals.node`, no browser globals) has no visibility into
      // that context, hence the disable.
      /* eslint-disable no-undef */
      await page.addInitScript(() => {
        window.__cockpitLongTasks = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__cockpitLongTasks.push(entry.duration);
        }).observe({ entryTypes: ['longtask'] });
      });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector(fixture.waitSelector);
      // Trailing hydration work (the SSE connect, the pool-client/pr-review panel polls
      // `withRenderedFixture` above stubs out entirely) settles within a couple of frames —
      // this buffer catches it without waiting for REFRESH_MS of real wall clock.
      await page.waitForTimeout(250);
      // AWAITED, not returned raw: `return page.evaluate(...)` inside a
      // try whose finally closes the page runs the CLOSE before the
      // evaluate's CDP round-trip resolves — the close destroys the target
      // mid-evaluate, the orphaned rejection ("Target page ... has been
      // closed") crosses a macrotask boundary while `await page.close()`
      // is still in flight, and Node kills the whole report as an
      // unhandled rejection (observed at a run-varying fixture; the race's
      // winner depends on CDP timing).
      return await page.evaluate(() => Math.max(0, ...window.__cockpitLongTasks));
      /* eslint-enable no-undef */
    } finally {
      await page.close();
    }
  });
}

async function measureLongestTaskAxis(browser, label, smallN, largeN, fixtureOf) {
  const smallMs = await measureLongestTaskMs(browser, fixtureOf(smallN));
  const largeMs = await measureLongestTaskMs(browser, fixtureOf(largeN));
  return { label, smallN, smallMs, largeN, largeMs };
}

/** Splits CSSOM-serialized text on a separator at paren depth 0 only — a `;` inside
 *  `url(data:...;base64,...)`/`var(...)` and a `,` inside `:not(...)` arguments are exactly
 *  the characters a naive `.split()` corrupts. Shared by the declaration census (`;`), the
 *  selector-list split (`,`), and `:not()`-argument recursion (`,`). */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === separator && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Parses the SAME stylesheet `server/routes.ts` serves at `GET /tokens.css`
 *  (`fontFaceCss() + stylesheet() + layoutCss()`, composed here in that exact order) through
 *  a fresh jsdom CSSOM and hands the parsed rule list to `probe` — shared by the value census
 *  and the specificity census so both read one composition instead of two copies drifting. */
async function withServedStylesheet(probe) {
  const { teardown } = await installJsdomGlobals();
  try {
    const doc = globalThis.document;
    const style = doc.createElement('style');
    style.textContent = `${fontFaceCss()}\n${stylesheet()}\n${layoutCss()}\n`;
    doc.head.appendChild(style);
    return probe(style.sheet.cssRules);
  } finally {
    await teardown(globalThis);
  }
}

/** Unique declaration values per property across the SAME stylesheet `server/routes.ts`
 *  serves at `GET /tokens.css` (`fontFaceCss() + stylesheet() + layoutCss()`, composed here
 *  in that exact order), parsed through jsdom's CSSOM rather than a hand-rolled CSS parser.
 *  Fidelity was probed before trusting it: jsdom parses every rule of the served stylesheet
 *  (rule count exactly matches the source's block count — nothing silently dropped, unlike
 *  older cssom-based jsdom), `rule.style.cssText` serializes the MINIMAL authored form (no
 *  shorthand→longhand double-count; `var()` and custom properties preserved verbatim). One
 *  known omission: jsdom's CSSFontFaceRule leaves `src` out of its serialization, so the
 *  font-face `src` data-URIs — by-design-unique values with no drift signal — are absent.
 *
 *  Custom-property DEFINITIONS (`--*`, the token sheet itself) are bucketed separately from
 *  standard declarations: token definitions are unique by design, while many distinct values
 *  piled onto one standard property is exactly the drift the phase-1 ledger will chase.
 *  Unlike every render axis above, this one is measured ONCE, not at two fleet sizes —
 *  `/tokens.css` is static text, byte-identical at 1 lane and 8 (the ≥2-sizes constraint
 *  exists for metrics that scale with state, and no state reaches this stylesheet). */
async function measureCssValueCensus() {
  return withServedStylesheet((cssRules) => {
    const standard = new Map();
    const customValues = new Set();
    let customDeclarations = 0;
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) walk(rule.cssRules);
        if (!rule.style) continue;
        for (const declaration of splitTopLevel(rule.style.cssText, ';')) {
          const colon = declaration.indexOf(':');
          if (colon === -1) continue;
          const property = declaration.slice(0, colon).trim();
          const value = declaration.slice(colon + 1).trim();
          if (property.startsWith('--')) {
            customDeclarations += 1;
            customValues.add(value);
            continue;
          }
          const entry = standard.get(property) ?? { declarations: 0, values: new Set() };
          entry.declarations += 1;
          entry.values.add(value);
          standard.set(property, entry);
        }
      }
    };
    walk(cssRules);
    const perProperty = [...standard]
      .map(([property, entry]) => ({
        property,
        declarations: entry.declarations,
        unique: entry.values.size,
      }))
      .sort((a, b) => b.unique - a.unique || b.declarations - a.declarations);
    return {
      properties: standard.size,
      declarations: perProperty.reduce((sum, p) => sum + p.declarations, 0),
      uniqueValues: perProperty.reduce((sum, p) => sum + p.unique, 0),
      custom: { declarations: customDeclarations, unique: customValues.size },
      top: perProperty.slice(0, CENSUS_TOP_COUNT),
    };
  });
}

// Single-colon spellings that are pseudo-ELEMENTS for legacy reasons (CSS Selectors 4 §17)
// and therefore score as type-level, not class-level.
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

function compareSpecificity(x, y) {
  return x.a - y.a || x.b - y.b || x.c - y.c;
}

/** Specificity (a=IDs, b=classes/attributes/pseudo-classes, c=types/pseudo-elements) of ONE
 *  complex selector, per CSS Selectors 4: `:where()` scores zero, `:not()`/`:is()`/`:has()`
 *  score as their most specific argument, `*` and combinators score nothing. Hand-rolled to
 *  that spec rather than pulling a selector-parser dependency into the lockfile for one
 *  script — the served stylesheet was probed first and contains only `:not()`, `::` pseudo-
 *  elements, `[attr]`, and plain compounds (no `:is`/`:where`/`:has`/`:nth-*`), but the
 *  absent constructs are still scored correctly above in case one appears later. */
function selectorSpecificity(selector) {
  let a = 0;
  let b = 0;
  let c = 0;
  let i = 0;
  const readName = () => {
    while (i < selector.length && /[\w\\-]/.test(selector[i])) i += 1;
  };
  const readBalancedParens = () => {
    let depth = 1;
    const start = i;
    while (i < selector.length && depth > 0) {
      if (selector[i] === '(') depth += 1;
      else if (selector[i] === ')') depth -= 1;
      i += 1;
    }
    return selector.slice(start, i - 1);
  };
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === '#') {
      i += 1;
      readName();
      a += 1;
    } else if (ch === '.') {
      i += 1;
      readName();
      b += 1;
    } else if (ch === '[') {
      // Scan to the matching `]`, quote-aware — a quoted attribute value may contain `]`.
      i += 1;
      let quote = null;
      while (i < selector.length && (quote !== null || selector[i] !== ']')) {
        if (quote === null && (selector[i] === '"' || selector[i] === "'")) quote = selector[i];
        else if (selector[i] === quote) quote = null;
        i += 1;
      }
      i += 1;
      b += 1;
    } else if (ch === ':') {
      i += 1;
      const isDoubleColon = selector[i] === ':';
      if (isDoubleColon) i += 1;
      const nameStart = i;
      readName();
      const name = selector.slice(nameStart, i).toLowerCase();
      const args = selector[i] === '(' ? ((i += 1), readBalancedParens()) : null;
      if (isDoubleColon || LEGACY_PSEUDO_ELEMENTS.has(name)) {
        c += 1;
      } else if (name === 'where') {
        // zero by definition
      } else if (args !== null && (name === 'not' || name === 'is' || name === 'has')) {
        let best = { a: 0, b: 0, c: 0 };
        for (const arg of splitTopLevel(args, ',')) {
          const spec = selectorSpecificity(arg);
          if (compareSpecificity(spec, best) > 0) best = spec;
        }
        a += best.a;
        b += best.b;
        c += best.c;
      } else {
        b += 1;
      }
    } else if (/[a-zA-Z\\]/.test(ch)) {
      readName();
      c += 1;
    } else {
      i += 1; // combinators, whitespace, `*`, and anything else specificity-neutral
    }
  }
  return { a, b, c };
}

/** Specificity census over every selector in the served stylesheet — the SAME composed text
 *  the unique-values census above parses, via the same jsdom CSSOM. Rules without a
 *  `selectorText` (`@font-face`, `@keyframes` frames, whose `0%`/`to` keys are not
 *  selectors) are skipped; `@media` bodies are recursed into. Measured ONCE, not at two
 *  fleet sizes, for the same reason as the value census: `/tokens.css` is static text. */
async function measureSelectorSpecificity() {
  return withServedStylesheet((cssRules) => {
    const selectors = [];
    let styleRules = 0;
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) walk(rule.cssRules);
        if (typeof rule.selectorText !== 'string') continue;
        styleRules += 1;
        for (const selector of splitTopLevel(rule.selectorText, ',')) {
          selectors.push({ selector, spec: selectorSpecificity(selector) });
        }
      }
    };
    walk(cssRules);
    const buckets = new Map();
    for (const { selector, spec } of selectors) {
      const key = `${spec.a},${spec.b},${spec.c}`;
      const bucket = buckets.get(key) ?? { spec, count: 0, example: selector };
      bucket.count += 1;
      buckets.set(key, bucket);
    }
    const sorted = [...buckets.values()].sort((x, y) => compareSpecificity(y.spec, x.spec));
    return {
      styleRules,
      selectors: selectors.length,
      idSelectors: selectors.filter((s) => s.spec.a > 0).length,
      max: sorted[0].spec,
      buckets: sorted,
    };
  });
}

// Standard CSS properties this census inspects for token coverage — every property the served
// stylesheet uses to paint color. `box-shadow`'s embedded shadow colors are a known gap: every
// box-shadow declaration in the served stylesheet is already `var(--elevation-level-*)` or
// `none` (verified by grep), so nothing is missed today, but a literal shadow color would slip
// past this census.
const COLOR_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'fill',
  'stroke',
];
// Keyword values that resolve to no fixed color at all (inherited, absent, or the current text
// color) — not "uncovered" ink, because there is no ink to cover.
const COLOR_KEYWORDS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'none',
]);

/** Canonicalizes one color-ish CSS value through jsdom's OWN `CSSStyleDeclaration` parser on a
 *  throwaway element — round-tripping `setProperty`/`getPropertyValue` normalizes syntactically
 *  different spellings of the identical color (`#fff` vs `rgb(255, 255, 255)`) to the same
 *  string, so the drift comparison below is not fooled by spelling. A FRESH element per call is
 *  required: jsdom's `fill`/`stroke` implementation silently no-ops on an unparseable value
 *  instead of clearing the property (reproduced empirically while building this census), so a
 *  reused element would leak a stale normalized value from a prior call into this one.
 *  `background`'s shorthand is special-cased to read back `background-color` so a composite
 *  `background: <image>, <color>` value (none appear in the served stylesheet today) is judged
 *  on its color component, not rejected as unparseable. Returns `''` when jsdom cannot parse
 *  the value as this property's type at all. */
function normalizeColorValue(property, value) {
  const el = globalThis.document.createElement('div');
  el.style.setProperty(property, value);
  const readProperty = property === 'background' ? 'background-color' : property;
  return el.style.getPropertyValue(readProperty);
}

/** Every theme color token, normalized through {@link normalizeColorValue} the same way a
 *  declaration's raw literal is below, indexed by normalized value so a hardcoded literal that
 *  happens to equal a token can be found in O(1) instead of re-parsing every token per
 *  declaration. Multiple theme:token pairs can share one normalized value (kept as a list, not
 *  overwritten) — that collision is itself signal for the phase-1 drift ledger. */
function buildTokenColorIndex() {
  const index = new Map();
  for (const themeName of THEME_NAMES) {
    for (const token of COLOR_TOKENS) {
      const normalized = normalizeColorValue('color', THEMES[themeName][token]);
      if (!normalized) continue;
      const label = `${themeName}:${token}`;
      const existing = index.get(normalized);
      if (existing) existing.push(label);
      else index.set(normalized, [label]);
    }
  }
  return index;
}

/** Token coverage of every color-relevant declaration in the served stylesheet — the SAME
 *  composed text and CSSOM the unique-values/specificity censuses above parse — classified per
 *  the epic's Phase 1 vocabulary (`docs/epics/0015-cockpit-supervisory-control.md`,
 *  "computed-style census (covered/drifted/uncovered)"):
 *    - COVERED: the value references a custom property (`var(--...)`) — token-driven.
 *    - DRIFTED: a raw literal that normalizes to the SAME value as one of the token package's
 *      own theme colors — should be `var(--color-*)` but was hardcoded to a value that already
 *      duplicates a token instead.
 *    - UNCOVERED: a raw literal matching no known token color — genuinely untracked ink.
 *  Values that are non-literal keywords (`transparent`/`currentColor`/`inherit`/`none`/...)
 *  carry no fixed color and are tallied separately, in neither bucket — there is no ink to
 *  cover. A value jsdom cannot parse as a color at all is also tallied separately rather than
 *  guessed at.
 *
 *  This inspects the STYLESHEET's authored declarations rather than a rendered element's
 *  resolved computed style, for two reasons verified empirically while building this census:
 *  every color-relevant declaration in this codebase lives in the served stylesheet — no
 *  inline `style="color:..."` attribute exists anywhere in `apps/dashboard/src/web/` (grep) —
 *  so the declared value and the eventual computed value are identical here; and jsdom's
 *  `getComputedStyle` does not resolve `var()` at all (it returns the literal string
 *  `var(--x)` unresolved), so a genuinely rendered computed-style pass could not distinguish
 *  COVERED from anything else without re-deriving the same stylesheet walk this performs
 *  directly and more cheaply (one static pass instead of one render per declaration). */
async function measureTokenColorCensus() {
  return withServedStylesheet((cssRules) => {
    // Built INSIDE the probe, not before `withServedStylesheet` installs jsdom globals —
    // `normalizeColorValue` needs `globalThis.document`, which does not exist yet at call time
    // otherwise (reproduced empirically while building this census).
    const tokenIndex = buildTokenColorIndex();
    const buckets = { covered: 0, drifted: [], uncovered: [], keyword: 0, unparsed: 0 };
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) walk(rule.cssRules);
        if (typeof rule.selectorText !== 'string' || !rule.style) continue;
        for (const declaration of splitTopLevel(rule.style.cssText, ';')) {
          const colon = declaration.indexOf(':');
          if (colon === -1) continue;
          const property = declaration.slice(0, colon).trim();
          const value = declaration.slice(colon + 1).trim();
          if (!COLOR_PROPERTIES.includes(property)) continue;
          if (value.includes('var(')) {
            buckets.covered += 1;
            continue;
          }
          if (COLOR_KEYWORDS.has(value.toLowerCase())) {
            buckets.keyword += 1;
            continue;
          }
          const normalized = normalizeColorValue(property, value);
          if (!normalized) {
            buckets.unparsed += 1;
            continue;
          }
          const matches = tokenIndex.get(normalized);
          const entry = { selector: rule.selectorText, property, value };
          if (matches) buckets.drifted.push({ ...entry, matches });
          else buckets.uncovered.push(entry);
        }
      }
    };
    walk(cssRules);
    return buckets;
  });
}

// The five attention tokens the stylesheet paints alarm/severity ink with, keyed by the
// bucket each one signals. The selector set per bucket is DERIVED from the served
// stylesheet in buildAlarmSelectorIndex() — any resting-state selector whose declarations
// reference the token — rather than hand-listed, so the census tracks the stylesheet
// automatically as rules move instead of silently drifting out of date.
const ALARM_TOKEN_VARS = {
  critical: '--color-sev-critical',
  high: '--color-sev-high',
  needsYou: '--color-needs-you',
  medium: '--color-sev-medium',
  low: '--color-sev-low',
};
// The buckets that count toward the alarm RATE: ink that demands an operator response
// (ISA-18.2's definition of an alarm — needs-you literally names a required decision).
// medium/low are caution/info ink: measured in the SHAPE, excluded from the rate.
const ALARM_RATE_LEVELS = ['critical', 'high', 'needsYou'];
// A selector that only paints alarm ink under interaction state is not resting alarm
// surface — a delete button that turns sev-critical on :hover alarms nobody at a glance.
const STATE_PSEUDO_CLASS = /:(hover|active|focus(-visible|-within)?)\b/;

/** `selector` reduced to its resting, queryable form — `null` when it only matches under
 *  interaction state; pseudo-elements stripped (their alarm ink paints ON the host
 *  element, and `querySelectorAll` rejects pseudo-elements outright). */
function restingSelector(selector) {
  if (STATE_PSEUDO_CLASS.test(selector)) return null;
  const cleaned = selector
    .replace(/::[\w-]+(\([^)]*\))?/g, '')
    .replace(/:(before|after|first-line|first-letter)\b/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Resting-state selector list per alarm bucket, derived from the SAME served stylesheet
 *  the censuses above parse (`fontFaceCss() + stylesheet() + layoutCss()` via jsdom's
 *  CSSOM, `@media` bodies recursed into — a selector that alarms only inside a media
 *  condition is still alarm surface in some environment). */
async function buildAlarmSelectorIndex() {
  return withServedStylesheet((cssRules) => {
    const index = Object.fromEntries(Object.keys(ALARM_TOKEN_VARS).map((level) => [level, []]));
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) walk(rule.cssRules);
        if (typeof rule.selectorText !== 'string' || !rule.style) continue;
        const css = rule.style.cssText;
        for (const [level, tokenVar] of Object.entries(ALARM_TOKEN_VARS)) {
          if (!css.includes(`var(${tokenVar})`)) continue;
          for (const selector of splitTopLevel(rule.selectorText, ',')) {
            const resting = restingSelector(selector);
            if (resting) index[level].push(resting);
          }
        }
      }
    };
    walk(cssRules);
    return index;
  });
}

/** Alarm surface of one painted render: per-bucket count of elements matched by any of
 *  that bucket's selectors (the severity SHAPE), the union across the response-demanding
 *  buckets (the alarm count), and the total element count the RATE is a share of. An
 *  element painted with two buckets' ink counts in both buckets' shape, once in the rate.
 *  A selector jsdom cannot parse throws — a loud failure beats a silently missing bucket. */
async function measureAlarmSurface(fixture, selectorIndex) {
  return withRenderedFixture(fixture, (doc) => {
    const shape = {};
    const alarmed = new Set();
    for (const [level, selectors] of Object.entries(selectorIndex)) {
      const matched = new Set();
      for (const selector of selectors) {
        for (const el of doc.querySelectorAll(selector)) matched.add(el);
      }
      shape[level] = matched.size;
      if (ALARM_RATE_LEVELS.includes(level)) {
        for (const el of matched) alarmed.add(el);
      }
    }
    return { total: doc.querySelectorAll('*').length, alarmed: alarmed.size, shape };
  });
}

async function measureAlarmAxis(label, smallN, largeN, fixtureOf, selectorIndex) {
  const small = await measureAlarmSurface(fixtureOf(smallN), selectorIndex);
  const large = await measureAlarmSurface(fixtureOf(largeN), selectorIndex);
  return { label, smallN, small, largeN, large };
}

/** Interaction latency (INP p75 proxy) and longest main-thread task of one painted render.
 *  Ticks are timed FIRST — each interval callback fired once and drained to the next
 *  macrotask, so the duration includes the microtask render continuations the tick
 *  schedules (an upper bound: the drain lumps every continuation into one block) — while
 *  the painted state is still exactly what setup rendered. Then one simulated click is
 *  dispatched on EVERY tab-stop element (the same population `measureTabStops` counts, so
 *  the two axes describe one keyboard surface) with the synchronous dispatch duration
 *  timed per element — jsdom runs handlers synchronously, so this is INP's "processing
 *  duration" component; input delay and presentation delay do not exist without a
 *  compositor. A capture-phase `preventDefault` suppresses anchor default actions (jsdom
 *  cannot navigate); handlers themselves still run. Elements a prior click detached are
 *  skipped — their delegated document-level handlers could no longer fire anyway. */
async function measureInteractionTiming(fixture) {
  return withRenderedFixture(fixture, async (doc, { intervalCallbacks, evalMs }) => {
    const now = () => globalThis.performance.now();
    const tickDrains = [];
    for (const tick of intervalCallbacks) {
      const start = now();
      tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
      tickDrains.push(now() - start);
    }
    doc.addEventListener('click', (event) => event.preventDefault(), true);
    const durations = [];
    for (const el of Array.from(doc.querySelectorAll('*')).filter(isTabStop)) {
      if (!el.isConnected) continue;
      const start = now();
      el.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true, cancelable: true }));
      durations.push(now() - start);
    }
    // Clicks kick off fetch→render promise chains (e.g. the browse modal's error paint);
    // drain them BEFORE returning, while `document` still exists — otherwise a chained
    // microtask fires mid-teardown and crashes on the deleted global (reproduced while
    // building this axis). Two macrotask turns, same insurance as measureDuplicateRenders.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return summarizeInteractionTiming({ evalMs, tickDrains, durations });
  });
}

async function measureInteractionAxis(label, smallN, largeN, fixtureOf) {
  const small = await measureInteractionTiming(fixtureOf(smallN));
  const large = await measureInteractionTiming(fixtureOf(largeN));
  return { label, smallN, small, largeN, large };
}

// WCAG 2.x AA floors: 4.5:1 for normal text (1.4.3), 3:1 for large text and for non-text UI
// components/graphics (1.4.11) — the DoD's "contrast matrix committed incl. 3:1 non-text".
const WCAG_TEXT_RATIO = 4.5;
const WCAG_NON_TEXT_RATIO = 3;
// The three canvas tokens every other token renders ON. `accentText` is the one exception:
// its only real role is text ON a filled chip/button (`.chip.sev-*`, the flight-log verdict
// chips), never text on a surface — in dark, `accentText` IS the surface color, so pairing
// it against surfaces would report by-design-identical colors as contrast failures. It is
// paired against the fill tokens instead, mirroring `themes.test.ts`'s verdict-chip pairs.
const SURFACE_TOKENS = ['surface', 'surfaceRaised', 'surfaceSunken'];
const FILL_TOKENS = [
  'accent',
  'success',
  'warning',
  'danger',
  'info',
  'sevCritical',
  'sevHigh',
  'sevMedium',
  'sevLow',
  'needsYou',
];

function themeContrastCells(theme) {
  const cells = [];
  for (const token of COLOR_TOKENS) {
    if (SURFACE_TOKENS.includes(token) || token === 'accentText') continue;
    for (const bg of SURFACE_TOKENS) {
      cells.push({ fg: token, bg, ratio: contrastRatio(theme[token], theme[bg]) });
    }
  }
  for (const fill of FILL_TOKENS) {
    cells.push({ fg: 'accentText', bg: fill, ratio: contrastRatio(theme.accentText, theme[fill]) });
  }
  return cells;
}

/** WCAG contrast ratio of every color token against every canvas it renders on — 14
 *  foreground tokens × 3 surfaces plus `accentText` × 10 fills, per theme — computed with
 *  the token package's OWN `contrastRatio` (the same OKLCH→luminance core `themes.test.ts`
 *  enforces its floors with) over the exact values `colorVars()` serves as `--color-*`
 *  custom properties in `/tokens.css`. The tests assert a handful of KNOWN-used pairs stay
 *  above their floors; this matrix commits the FULL picture, so the phase-1 recon can see
 *  which untested pairs sit below 3:1 (must never be used as-is) or between 3:1 and 4.5:1
 *  (non-text/large-text only) without re-deriving it. Measured ONCE, not at two fleet
 *  sizes, for the same reason as the CSS censuses: theme tokens are static values. */
function measureContrastMatrix() {
  return THEME_NAMES.map((name) => {
    const cells = themeContrastCells(THEMES[name]);
    return {
      name,
      cells,
      min: cells.reduce((lo, cell) => (cell.ratio < lo.ratio ? cell : lo)),
      belowNonText: cells.filter((c) => c.ratio < WCAG_NON_TEXT_RATIO).length,
      nonTextOnly: cells.filter((c) => c.ratio >= WCAG_NON_TEXT_RATIO && c.ratio < WCAG_TEXT_RATIO)
        .length,
      textReady: cells.filter((c) => c.ratio >= WCAG_TEXT_RATIO).length,
    };
  });
}

async function measureAxis(label, smallN, largeN, fixtureOf) {
  const smallNodes = await measure(fixtureOf(smallN));
  const largeNodes = await measure(fixtureOf(largeN));
  const perUnit = (largeNodes - smallNodes) / (largeN - smallN);
  return { label, smallN, smallNodes, largeN, largeNodes, perUnit };
}

async function measureAxeAxis(label, smallN, largeN, fixtureOf) {
  const small = await measureAxeImpacts(fixtureOf(smallN));
  const large = await measureAxeImpacts(fixtureOf(largeN));
  return { label, smallN, small, largeN, large };
}

function renderContrastTheme(theme) {
  const surfaceRows = [];
  const seen = new Map();
  for (const cell of theme.cells) {
    if (cell.fg === 'accentText') continue;
    const row = seen.get(cell.fg) ?? [];
    row.push(cell.ratio.toFixed(2));
    seen.set(cell.fg, row);
  }
  for (const [fg, ratios] of seen) {
    surfaceRows.push(`| \`${fg}\` | ${ratios.join(' | ')} |`);
  }
  const fillCells = theme.cells.filter((c) => c.fg === 'accentText');
  return `### ${theme.name}

min **${theme.min.ratio.toFixed(2)}** (\`${theme.min.fg}\` on \`${theme.min.bg}\`) —
${theme.belowNonText} of ${theme.cells.length} cells below 3:1, ${theme.nonTextOnly} in
[3, 4.5) (non-text/large-text only), ${theme.textReady} at ≥ 4.5:1 (normal-text ready).

| token | on \`surface\` | on \`surfaceRaised\` | on \`surfaceSunken\` |
| --- | --- | --- | --- |
${surfaceRows.join('\n')}

| \`accentText\` on fill | ratio |
| --- | --- |
${fillCells.map((c) => `| \`${c.bg}\` | ${c.ratio.toFixed(2)} |`).join('\n')}
`;
}

function renderDoc(
  dateStr,
  axes,
  axeAxes,
  tabAxes,
  attrAxes,
  dupAxes,
  longestTaskAxes,
  cssCensus,
  specificity,
  contrast,
  alarmIndex,
  alarmAxes,
  i18nAxes,
  tokenColorCensus,
  interactionAxes,
) {
  const ratePct = (side) => ((side.alarmed / side.total) * 100).toFixed(1) + '%';
  const ms = (value) => value.toFixed(2);
  const interactionRows = interactionAxes
    .map(
      (a) =>
        `| ${a.label} | ${a.smallN} → ${a.largeN} | ${a.small.interactions} → ${a.large.interactions} | ${ms(a.small.inpP75)} → ${ms(a.large.inpP75)} | ${ms(a.small.inpMax)} → ${ms(a.large.inpMax)} | ${ms(a.small.longestTask)} → ${ms(a.large.longestTask)} |`,
    )
    .join('\n');
  const alarmRows = alarmAxes
    .map((a) => {
      const shapeCells = Object.keys(ALARM_TOKEN_VARS)
        .map((level) => `${a.small.shape[level]} → ${a.large.shape[level]}`)
        .join(' | ');
      return `| ${a.label} | ${a.smallN} → ${a.largeN} | ${a.small.alarmed} → ${a.large.alarmed} (${ratePct(a.small)} → ${ratePct(a.large)}) | ${shapeCells} |`;
    })
    .join('\n');
  const alarmSelectorCounts = Object.entries(alarmIndex)
    .map(([level, selectors]) => `${level} ${selectors.length}`)
    .join(', ');
  const rows = axes
    .map(
      (a) =>
        `| ${a.label} | ${a.smallN} → ${a.largeN} | ${a.smallNodes} → ${a.largeNodes} | ${a.perUnit.toFixed(1)} |`,
    )
    .join('\n');
  const axeRows = axeAxes
    .map(
      (a) =>
        `| ${a.label} | ${a.smallN} → ${a.largeN} | ${AXE_IMPACTS.map((impact) => `${a.small[impact]} → ${a.large[impact]}`).join(' | ')} |`,
    )
    .join('\n');
  const tabRows = tabAxes
    .map(
      (a) =>
        `| ${a.label} | ${a.smallN} → ${a.largeN} | ${a.smallStops} → ${a.largeStops} | ${a.perUnit.toFixed(1)} |`,
    )
    .join('\n');
  const attrRows = attrAxes
    .map(
      (a) =>
        `| ${a.label} | ${a.smallN} → ${a.largeN} | ${a.smallBytes} → ${a.largeBytes} | ${a.perUnit.toFixed(1)} |`,
    )
    .join('\n');
  const dupRows = dupAxes
    .map(
      (a) =>
        `| ${a.label} | ${a.smallN} → ${a.largeN} | ${a.smallMutations} → ${a.largeMutations} | ${a.perUnit.toFixed(1)} |`,
    )
    .join('\n');
  const longestTaskRows = longestTaskAxes
    .map(
      (a) =>
        `| ${a.label} | ${a.smallN} → ${a.largeN} | ${a.smallMs.toFixed(1)}ms → ${a.largeMs.toFixed(1)}ms |`,
    )
    .join('\n');
  const censusRows = cssCensus.top
    .map((p) => `| \`${p.property}\` | ${p.declarations} | ${p.unique} |`)
    .join('\n');
  const specificityRows = specificity.buckets
    .map((b) => `| ${b.spec.a},${b.spec.b},${b.spec.c} | ${b.count} | \`${b.example}\` |`)
    .join('\n');
  const i18nCell = (side, pool) => {
    const { tagged, untagged } = side[pool];
    const total = tagged + untagged;
    const pct = total === 0 ? 'n/a' : `${((tagged / total) * 100).toFixed(1)}%`;
    return `${tagged}/${total} (${pct})`;
  };
  const i18nRows = i18nAxes
    .map(
      (a) =>
        `| ${a.label} | ${a.smallN} → ${a.largeN} | ${i18nCell(a.small, 'text')} → ${i18nCell(a.large, 'text')} | ${i18nCell(a.small, 'aria')} → ${i18nCell(a.large, 'aria')} | ${i18nCell(a.small, 'placeholder')} → ${i18nCell(a.large, 'placeholder')} |`,
    )
    .join('\n');
  const driftedRows =
    tokenColorCensus.drifted
      .slice(0, CENSUS_TOP_COUNT)
      .map(
        (d) =>
          `| \`${d.property}\` | \`${d.value}\` | \`${d.selector}\` | ${d.matches.join(', ')} |`,
      )
      .join('\n') || '| — | — | — | — |';
  const uncoveredRows =
    tokenColorCensus.uncovered
      .slice(0, CENSUS_TOP_COUNT)
      .map((u) => `| \`${u.property}\` | \`${u.value}\` | \`${u.selector}\` |`)
      .join('\n') || '| — | — | — |';
  return `<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# EVALUATION — cockpit baseline, DOM growth + axe by impact + tab stops + attribute payload + duplicate renders + longest task + unique values + specificity + contrast matrix + alarm rate + severity shape + token coverage + i18n tagging coverage + interaction latency (${dateStr})

COCKPIT PHASE 0 MEASURE (\`docs/epics/0015-cockpit-supervisory-control.md\`, board
web-mtbpiiur-43tmr3): thirteen rows of the brief's §5 table, twelve measured against the REAL
served surfaces (\`renderShell\`/\`clientJs\`, \`apps/dashboard/src/web/shell.ts\`, plus the
\`/tokens.css\` stylesheet exactly as \`server/routes.ts\` composes it, and the theme token
maps exactly as \`colorVars()\` serves them) in jsdom, and the thirteenth — longest task — in a
real Chromium against the real \`createServer\` HTTP server, since the Long Tasks API has no
jsdom implementation; all via \`scripts/cockpit-metrics.mjs\`, not asserted. The last §5
row (INP p75) stays open for a follow-on slice; regenerate this file with
\`pnpm run cockpit-metrics\`.

## DOM growth per lane / task / row

| axis | fixture size | total DOM nodes | nodes per added unit |
| --- | --- | --- | --- |
${rows}

- **row** — fleet-grid project cards (\`.card\`), ${axes[0].smallN} vs ${axes[0].largeN} projects.
- **task** — one project's task board (\`.task\`), ${axes[1].smallN} vs ${axes[1].largeN} tasks.
- **lane** — the fleet-wide \`#live-workers\` chip strip (\`.live-worker-chip\`, one chip per
  concurrently-flying worktree lane — board web-mtbp0t86-rnimyi's fix), ${axes[2].smallN} vs
  ${axes[2].largeN} lanes on a single project. The per-card \`.live-worker\` panel is a
  separate, still-single-lane surface (\`liveFiring()\`, not \`liveFirings()\`) and is not what
  this axis measures.

No ratchet is set yet — the epic's own rule is "ratchets start at today's measured value,
never the ideal", and this is the first measurement. A follow-on slice should turn the
\`perUnit\` column into a committed ratchet once a second data point exists to judge drift
against.

## axe violations by impact

Same three fixtures (row/task/lane) run through \`axe-core\` (WCAG 2.0/2.1/2.2 A+AA rules,
\`color-contrast\` disabled — jsdom has no layout engine to compute it, asserted separately by
the token package's contrast tests) at each fixture's small and large size. Counted per
AFFECTED NODE, not per rule, so the count scales with fixture size the same way DOM growth
does above.

| axis | fixture size | critical | serious | moderate | minor |
| --- | --- | --- | --- | --- | --- |
${axeRows}

\`test/web/a11y.test.ts\` already asserts zero violations at fixed fixture sizes across the
app's real surfaces — this table adds the same axe pass at the SAME two scales as the DOM-
growth axes above, to see whether violation counts grow with content the way node counts do.

## tab stops

Count of elements reachable via sequential Tab navigation (every native/\`tabindex\`-bearing
focusable element, minus disabled controls) at each fixture's small and large size. A list
that adds one tab stop per added row/task/lane instead of virtualizing or using a roving-
tabindex container becomes a keyboard trap in practice long before it looks like a problem —
this is the measurement D1's "tab stops via roving tabindex" foundation work will be judged
against.

| axis | fixture size | tab stops | stops per added unit |
| --- | --- | --- | --- |
${tabRows}

No ratchet is set yet, same as the DOM-growth axes — this is the first measurement.

## attribute payload

Sum of every element's attribute name + value string length (characters) at each fixture's
small and large size — the same three fixtures and render harness as DOM growth above, but
counting per-node attribute weight instead of node count. A node count can stay flat while
attribute payload balloons (a growing \`data-tip\`/\`aria-label\` string, more classes or
\`data-*\` attributes stacked onto the same element) — this axis catches that class of
regression, which the node-count axis above cannot.

| axis | fixture size | attribute chars | chars per added unit |
| --- | --- | --- | --- |
${attrRows}

No ratchet is set yet, same as the other axes above — this is the first measurement.

## duplicate renders

DOM mutations applied by ONE simulated poll cycle delivering the SAME data already painted —
every interval callback the client registered (the \`startFleetStream\` fetch poll plus the
pool-client/pr-review panel polls) fires once under a whole-document MutationObserver, with
the stubbed fetch returning the identical state both times. An idempotent client mutates
NOTHING here; every counted mutation is duplicate-render churn (or a per-tick timestamp
rewrite — the same class of churn). This is the baseline the epic's D2 "dedup renders" work
and the DoD's "no duplicate renders" clause are judged against. Counted per mutated node
(childList records contribute added + removed nodes; attribute/characterData records count 1
each) so the number scales with fixture size the same way DOM growth does.

| axis | fixture size | mutations per identical-state tick | mutations per added unit |
| --- | --- | --- | --- |
${dupRows}

No ratchet is set yet, same as the other axes above — this is the first measurement.

## longest task

Longest single main-thread task (Long Tasks API, PerformanceEntry.duration, the browser's own
>50ms-blocks-a-frame definition) observed from navigation through first paint of the SAME
three fixtures (row/task/lane) at each fixture's small and large size — the one row of the
brief's §5 table jsdom cannot answer (no Long Tasks implementation), so this axis runs in a
REAL Chromium (\`@playwright/test\`, already a devDependency for \`apps/dashboard/e2e/\`)
against a REAL loopback HTTP server (\`createServer\`, the exact function
\`apps/dashboard/src/index.ts\` boots in production) instead of jsdom's \`document.write\` +
stubbed \`fetch\`. A \`PerformanceObserver\` is installed via \`page.addInitScript\` before
navigation so it is live for the FIRST script the served page runs, then the page is given a
250ms settle window past its \`waitSelector\` paint to catch trailing hydration work (the real
SSE connect, the pool-client/pr-review panel polls) the jsdom axes above stub out entirely.

| axis | fixture size | longest task |
| --- | --- | --- |
${longestTaskRows}

No ratchet is set yet, same as the other axes above — this is the first measurement. A 0ms
result is not a broken probe: at this fixture scale the client's hydration work may simply
never cross the 50ms Long Tasks threshold — the axis exists to catch the fixture size where it
starts to.

## unique declaration values

Unique values per CSS property across the stylesheet \`server/routes.ts\` serves at
\`GET /tokens.css\` (\`fontFaceCss() + stylesheet() + layoutCss()\`, composed in that exact
order), parsed through jsdom's CSSOM. Custom-property DEFINITIONS (\`--*\`, the token sheet
itself) are bucketed separately — token definitions are unique by design, while many distinct
values piled onto one standard property is exactly the drift phase 1's ledger will chase.
Measured ONCE, not at two fleet sizes: \`/tokens.css\` is static text, byte-identical at 1
lane and 8 (the ≥2-sizes constraint exists for metrics that scale with state). Known parser
omission: jsdom's \`CSSFontFaceRule\` serialization drops \`src\`, so the font-face data-URI
values (by-design-unique, no drift signal) are absent from the counts.

**${cssCensus.properties} standard properties, ${cssCensus.declarations} declarations,
${cssCensus.uniqueValues} unique values** (plus ${cssCensus.custom.declarations}
custom-property definitions carrying ${cssCensus.custom.unique} unique values). Top
${cssCensus.top.length} properties by unique-value count:

| property | declarations | unique values |
| --- | --- | --- |
${censusRows}

No ratchet is set yet, same as the other axes above — this is the first measurement. A high
unique-value count on a tokenizable property (colors, spacing, radii, durations) marks where
the phase-1 drift ledger should start.

## selector specificity

Specificity of every selector in the same served stylesheet as the unique-values census
above, scored per CSS Selectors 4 (\`:not()\` counts as its most specific argument;
combinators and \`*\` count nothing) and bucketed by exact (id, class, type) triple.
Measured ONCE, not at two fleet sizes, for the same reason as the value census —
\`/tokens.css\` is static text. High-specificity buckets are where override wars and
\`!important\` escalation start; phase 1's flattening work is judged against this table.

**${specificity.selectors} selectors across ${specificity.styleRules} style rules; max
specificity ${specificity.max.a},${specificity.max.b},${specificity.max.c};
${specificity.idSelectors} selectors carry an ID.**

| specificity (id,class,type) | selectors | example |
| --- | --- | --- |
${specificityRows}

No ratchet is set yet, same as the other axes above — this is the first measurement.

## contrast matrix

WCAG contrast ratio of every color token against every canvas it renders on — 14 foreground
tokens × the 3 surface tokens, plus \`accentText\` × the 10 fill tokens it paints text over
(\`accentText\` never renders on a surface; in dark it IS the surface color, so surface pairs
would report by-design-identical colors as failures) — per theme, computed with the token
package's own \`contrastRatio\` (the OKLCH→luminance core \`themes.test.ts\` enforces its
floors with) over the exact values \`colorVars()\` serves as \`--color-*\` custom properties.
Floors: **4.5:1** normal text (WCAG 1.4.3), **3:1** large text and non-text UI components
(1.4.11 — borders, chip fills, icons). The tests pin a handful of known-used pairs; this
matrix commits the full picture so phase-1 recon can read which untested pairs sit below
3:1 (never usable as-is) or in [3, 4.5) (non-text/large-text only) without re-deriving it.
Measured ONCE, not at two fleet sizes: theme tokens are static values.

${contrast.map((theme) => renderContrastTheme(theme)).join('\n')}
No ratchet is set yet, same as the other axes above — this is the first measurement. A
below-3:1 cell is not automatically a defect: it is a pair no rendered surface may use.
The phase-1 drift ledger should cross-reference this table against the token coverage
census below to prove no such pair is actually painted.

## token coverage via computed-style census

Every color-relevant declaration (\`color\`, \`background\`/\`background-color\`,
\`border*-color\`, \`outline-color\`, \`fill\`, \`stroke\`) in the same served stylesheet as the
unique-values/specificity censuses above, classified per the epic's Phase 1 vocabulary
(covered/drifted/uncovered): **covered** references a design token (\`var(--color-*)\`);
**drifted** hardcodes a literal that normalizes to the SAME value as one of the token
package's own theme colors — should be a \`var(--color-*)\` reference but duplicates one
instead; **uncovered** hardcodes a literal matching no known token — genuinely untracked ink.
Values normalized through jsdom's own \`CSSStyleDeclaration\` parser (\`#fff\` and
\`rgb(255, 255, 255)\` collapse to the same string) so spelling does not fake drift. Keyword
values (\`transparent\`, \`currentColor\`, \`inherit\`, \`none\`, ...) carry no fixed color and are
excluded from all three buckets — there is no ink to cover.

**${tokenColorCensus.covered} covered, ${tokenColorCensus.drifted.length} drifted,
${tokenColorCensus.uncovered.length} uncovered** (plus ${tokenColorCensus.keyword} keyword
values and ${tokenColorCensus.unparsed} declarations jsdom could not parse as a color — both
excluded from the buckets above).

### drifted — hardcoded literal duplicates a token

| property | value | selector | duplicates |
| --- | --- | --- | --- |
${driftedRows}

### uncovered — hardcoded literal matches no token

| property | value | selector |
| --- | --- | --- |
${uncoveredRows}

No ratchet is set yet, same as the other axes above — this is the first measurement. An empty
drifted/uncovered table would not be proof of full token coverage either: this census only
sees the SERVED stylesheet, not the token package's own internal values (already
token-covered by definition) or any future inline style — see the doc comment on
\`measureTokenColorCensus\` for why an inline-style-driven census is unnecessary in this
codebase today.

## alarm rate & severity shape

Alarm-styled elements in the SAME painted renders as the DOM-growth axes above, at each
fixture's small and large size. The alarm-selector set is DERIVED from the served
stylesheet, not hand-listed: every resting-state selector whose declarations reference an
attention token (\`--color-sev-*\`, \`--color-needs-you\`) — interaction-state selectors
(\`:hover\`/\`:focus\`/\`:active\`) excluded, pseudo-elements matched via their host — so the
census tracks the stylesheet automatically as rules move (derived resting selectors:
${alarmSelectorCounts}). **Rate** is the share of ALL rendered elements painted with
response-demanding ink — critical, high, needs-you (ISA-18.2's definition: an alarm requires
an operator response; medium/low are caution/info ink). **Shape** is the per-token element
distribution the epic's "re-rationalize severity to the shape where critical is rare" is
judged against. An element painted with two buckets' ink counts in both buckets' shape,
once in the rate.

| axis | fixture size | alarm-styled (rate) | critical | high | needs-you | medium | low |
| --- | --- | --- | --- | --- | --- | --- | --- |
${alarmRows}

Reading the shape: the \`medium\`/\`low\` buckets include DOUBLE-DUTY ink — e.g. activity
chips painted with \`--color-sev-low\`/\`--color-sev-medium\` as mere category colors
(\`.act-file\`/\`.act-search\`, no severity semantics) — so a count there is not
automatically caution/info signal; that conflation is exactly the double-duty token drift
the epic's phase-1 audit hunts ("one confirmed instance already"). No ratchet is set yet,
same as the other axes above — this is the first measurement.

## i18n tagging coverage

Same three fixtures (row/task/lane) as the axes above, checked at each fixture's small and
large size against \`web/features/locale.ts\`'s OWN \`translateDom()\` sweep targets rather
than a hand-picked selector list, so a new sweep attribute added there is picked up here for
free. Three independent candidate pools, one per sweep: elements carrying their OWN
non-whitespace text (tagged by \`[data-i18n]\` or \`[data-i18n-template]\`), elements with an
\`aria-label\` (tagged by \`[data-i18n-aria]\`), and elements with a \`placeholder\` (tagged by
\`[data-i18n-placeholder]\`). \`data-tip\` hover text is out of scope by design (\`strings.ts\`:
"stays English-only for now") and never enters any pool here.

| axis | fixture size | text tagged/total | aria-label tagged/total | placeholder tagged/total |
| --- | --- | --- | --- | --- |
${i18nRows}

Coverage falls as row/task/lane count grows because the denominator is dominated by
client-rendered FLEET DATA (project names, task titles, activity targets) — content, not
untranslated chrome — while the numerator (tagged static chrome: masthead, searchbar,
flightbar) stays fixed regardless of fleet size. This is expected, not a regression signal;
it marks the boundary between i18n foundation's already-tagged chrome and the still-larger,
per-project/task client-rendered surface \`strings.ts\`'s own doc comment names as its next,
much larger target. No ratchet is set yet, same as the other axes above — this is the first
measurement.
## interaction latency (INP p75 proxy) & longest task

One simulated click dispatched on EVERY tab-stop element — the exact population the
tab-stops axis counts, so the two axes describe one keyboard surface — in the same painted
renders as the DOM-growth axes, with each dispatch's synchronous processing duration timed.
**INP p75** is the nearest-rank 75th percentile of those durations, a PROXY for field INP:
jsdom runs handlers synchronously and never paints, so of INP's three components (input
delay, processing duration, presentation delay) only processing duration exists here.
**longest task** is the longest uninterrupted main-thread block observed anywhere in the
render's lifecycle: the client bundle's initial synchronous eval, a poll tick drained
through its microtask render continuations (an upper bound — the drain lumps every
continuation into one block), or the slowest single interaction dispatch. Anchor default
actions are suppressed via a capture-phase \`preventDefault\` (jsdom cannot navigate);
handlers themselves still run.

| axis | fixture size | interactions | INP p75 (ms) | INP max (ms) | longest task (ms) |
| --- | --- | --- | --- | --- | --- |
${interactionRows}

These are wall-clock timings on the measuring machine — noisy run-to-run and
machine-dependent, unlike every count above. This dated snapshot is the SHAPE baseline
(how latency scales from the small to the large fixture), not a CI ratchet; the epic's
"ratchets start at today's measured value" rule applies once a second data point exists
to judge stability against.
`;
}

async function main() {
  const dateStr = new Date().toISOString().slice(0, 10);

  const axes = [
    await measureAxis('row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture),
    await measureAxis('task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture),
    await measureAxis('lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture),
  ];

  for (const a of axes) {
    console.log(
      `${a.label}: ${a.smallN} -> ${a.largeN} (nodes ${a.smallNodes} -> ${a.largeNodes}, ${a.perUnit.toFixed(1)} nodes/unit)`,
    );
  }

  const axeAxes = [
    await measureAxeAxis('row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture),
    await measureAxeAxis('task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture),
    await measureAxeAxis('lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture),
  ];

  for (const a of axeAxes) {
    console.log(
      `${a.label} axe: ${a.smallN} -> ${a.largeN} (${AXE_IMPACTS.map((impact) => `${impact} ${a.small[impact]}->${a.large[impact]}`).join(', ')})`,
    );
  }

  const tabAxes = [
    await measureTabAxis('row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture),
    await measureTabAxis('task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture),
    await measureTabAxis('lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture),
  ];

  for (const a of tabAxes) {
    console.log(
      `${a.label} tab stops: ${a.smallN} -> ${a.largeN} (${a.smallStops} -> ${a.largeStops}, ${a.perUnit.toFixed(1)} stops/unit)`,
    );
  }

  const attrAxes = [
    await measureAttributeAxis('row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture),
    await measureAttributeAxis('task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture),
    await measureAttributeAxis('lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture),
  ];

  for (const a of attrAxes) {
    console.log(
      `${a.label} attribute payload: ${a.smallN} -> ${a.largeN} (${a.smallBytes} -> ${a.largeBytes} chars, ${a.perUnit.toFixed(1)} chars/unit)`,
    );
  }

  const dupAxes = [
    await measureDupAxis('row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture),
    await measureDupAxis('task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture),
    await measureDupAxis('lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture),
  ];

  for (const a of dupAxes) {
    console.log(
      `${a.label} duplicate renders: ${a.smallN} -> ${a.largeN} (${a.smallMutations} -> ${a.largeMutations} mutations/tick, ${a.perUnit.toFixed(1)} per unit)`,
    );
  }

  const longestTaskAxes = await withRealBrowser(async (browser) => [
    await measureLongestTaskAxis(browser, 'row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture),
    await measureLongestTaskAxis(browser, 'task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture),
    await measureLongestTaskAxis(browser, 'lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture),
  ]);

  for (const a of longestTaskAxes) {
    console.log(
      `${a.label} longest task: ${a.smallN} -> ${a.largeN} (${a.smallMs.toFixed(1)}ms -> ${a.largeMs.toFixed(1)}ms)`,
    );
  }

  const cssCensus = await measureCssValueCensus();
  console.log(
    `css census: ${cssCensus.properties} properties, ${cssCensus.declarations} declarations, ` +
      `${cssCensus.uniqueValues} unique values (custom: ${cssCensus.custom.declarations} defs, ` +
      `${cssCensus.custom.unique} unique)`,
  );

  const specificity = await measureSelectorSpecificity();
  console.log(
    `specificity: ${specificity.selectors} selectors / ${specificity.styleRules} rules, ` +
      `max ${specificity.max.a},${specificity.max.b},${specificity.max.c}, ` +
      `${specificity.idSelectors} with an ID, ${specificity.buckets.length} buckets`,
  );

  const tokenColorCensus = await measureTokenColorCensus();
  console.log(
    `token coverage: ${tokenColorCensus.covered} covered, ${tokenColorCensus.drifted.length} drifted, ` +
      `${tokenColorCensus.uncovered.length} uncovered (${tokenColorCensus.keyword} keyword, ` +
      `${tokenColorCensus.unparsed} unparsed)`,
  );

  const contrast = measureContrastMatrix();
  for (const theme of contrast) {
    console.log(
      `contrast ${theme.name}: min ${theme.min.ratio.toFixed(2)} (${theme.min.fg} on ` +
        `${theme.min.bg}), ${theme.belowNonText}/${theme.cells.length} below 3:1, ` +
        `${theme.nonTextOnly} in [3,4.5), ${theme.textReady} >= 4.5`,
    );
  }

  const alarmIndex = await buildAlarmSelectorIndex();
  console.log(
    `alarm selectors: ${Object.entries(alarmIndex)
      .map(([level, selectors]) => `${level} ${selectors.length}`)
      .join(', ')}`,
  );

  const alarmAxes = [
    await measureAlarmAxis('row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture, alarmIndex),
    await measureAlarmAxis('task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture, alarmIndex),
    await measureAlarmAxis('lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture, alarmIndex),
  ];

  for (const a of alarmAxes) {
    console.log(
      `${a.label} alarm: ${a.smallN} -> ${a.largeN} (alarmed ${a.small.alarmed}/${a.small.total} -> ` +
        `${a.large.alarmed}/${a.large.total}, shape ${Object.keys(ALARM_TOKEN_VARS)
          .map((level) => `${level} ${a.small.shape[level]}->${a.large.shape[level]}`)
          .join(', ')})`,
    );
  }

  const i18nAxes = [
    await measureI18nAxis('row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture),
    await measureI18nAxis('task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture),
    await measureI18nAxis('lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture),
  ];

  for (const a of i18nAxes) {
    const pct = (side, pool) => {
      const { tagged, untagged } = side[pool];
      const total = tagged + untagged;
      return total === 0 ? 'n/a' : `${((tagged / total) * 100).toFixed(1)}%`;
    };
    console.log(
      `${a.label} i18n coverage: ${a.smallN} -> ${a.largeN} (text ${pct(a.small, 'text')} -> ${pct(a.large, 'text')}, ` +
        `aria ${pct(a.small, 'aria')} -> ${pct(a.large, 'aria')}, placeholder ${pct(a.small, 'placeholder')} -> ${pct(a.large, 'placeholder')})`,
    );
  }

  const interactionAxes = [
    await measureInteractionAxis('row', SMALL_ROW_COUNT, LARGE_ROW_COUNT, rowsFixture),
    await measureInteractionAxis('task', SMALL_TASK_COUNT, LARGE_TASK_COUNT, tasksFixture),
    await measureInteractionAxis('lane', SMALL_LANE_COUNT, LARGE_LANE_COUNT, lanesFixture),
  ];

  for (const a of interactionAxes) {
    console.log(
      `${a.label} interaction: ${a.smallN} -> ${a.largeN} (${a.small.interactions} -> ` +
        `${a.large.interactions} clicks, p75 ${a.small.inpP75.toFixed(2)} -> ` +
        `${a.large.inpP75.toFixed(2)} ms, longest task ${a.small.longestTask.toFixed(2)} -> ` +
        `${a.large.longestTask.toFixed(2)} ms)`,
    );
  }

  const doc = renderDoc(
    dateStr,
    axes,
    axeAxes,
    tabAxes,
    attrAxes,
    dupAxes,
    longestTaskAxes,
    cssCensus,
    specificity,
    contrast,
    alarmIndex,
    alarmAxes,
    i18nAxes,
    tokenColorCensus,
    interactionAxes,
  );
  const outPath = join(ROOT, 'docs', `EVALUATION-${dateStr}-cockpit-baseline.md`);
  writeFileSync(outPath, doc);
  console.log(`Wrote ${outPath}`);
}

await main();
