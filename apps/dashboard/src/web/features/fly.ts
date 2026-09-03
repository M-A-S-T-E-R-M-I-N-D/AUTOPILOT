// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Fly bar's client — the third of `web/shell.ts`'s bundle-composing
 * assembler functions extracted into its own file under `web/features/`
 * (epic 0002 "shell decomposition", PARALLEL UNLOCK B's real extraction —
 * see docs/epics/0002-shell-decomposition.md, and `web/features/switcher.ts`/
 * `web/features/connect.ts` for the first two). `web/shell.ts`'s `clientJs()`
 * imports and calls it directly, so its return value — not its compiled
 * source — is what lands in the served `/app.js` text; moving the function
 * itself (not splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `flyJs` export
 * the same way it already finds `switcher.ts`'s and `connect.ts`'s. Like
 * `connectJs()`, this one still carries real relative-import splices of its
 * own — `flyHintText`; `activeFlights`/`flightsSig`/`typedFolderFlightStatus`;
 * and `flightProgressOf`/
 * `sessionFlightDataFor` — now resolved relative to this file instead of
 * `shell.ts`; a function's `.toString()` output is unaffected by which local
 * name imports it under, so this remains byte-for-byte the same generated
 * text. `operatorActionLog`/`recordOperatorAction`/`OPERATOR_ACTION_LOG_CAP`
 * (web-msnrw1ok-0gsdff, third slice) are not imported here either — they
 * come from `fleetJs()`'s own output the same way `el` does, and the launch/
 * stop/pause handlers below reassign the hoisted `operatorActionLog` var
 * directly so `search.ts`'s Ask handler sees the latest log on the next ask.
 */
import { flyHintText } from '../fly-hint.js';
import {
  activeFlights,
  flightsSig,
  typedFolderFlightStatus,
  folderOptionsSig,
  parseFlySettingsStore,
  flySettingsFor,
  withFlySettings,
} from '../flights.js';
import { flightProgressOf, sessionFlightDataFor } from '../flight-progress.js';
import { rememberedHistory } from '../search-history.js';

/** The Fly bar client — vanilla, external (keeps CSP script-src 'self'). */
export function flyJs(): string {
  return `
// FLY-BAR folder UX (board web-msrhr2d9-xxwa3a), first slice: a native
// <datalist> of registered-project root paths + recently-typed folders —
// keyboard-operable and axe-clean by construction (a datalist needs no
// extra ARIA wiring). Top-level (not nested in flyInit) so renderFleet can
// push the live project list here every fleet tick, the same hoisted-
// function contract syncSearchProjects already uses. The server-backed
// "browse a brand-new folder" modal (browsers cannot reveal an absolute
// filesystem path from a plain file input) is the second slice, wired
// inside flyInit below (openBrowseModal) since it only reacts to the
// Browse… button click, not to every fleet tick.
// folderOptionsSig is generated FROM web/flights.ts below — its real
// compiled source via .toString(), not a hand-retyped copy.
${folderOptionsSig.toString()}
// rememberedHistory is generated FROM web/search-history.ts below (already
// reused by the search bar's own remembered-queries list) — its real
// compiled source via .toString(), not a hand-retyped copy.
${rememberedHistory.toString()}
var FLY_FOLDER_HISTORY_KEY = 'ap-fly-folder-history';
var FLY_FOLDER_HISTORY_MAX = 10;
function loadFlyFolderHistory() {
  try {
    var raw = localStorage.getItem(FLY_FOLDER_HISTORY_KEY);
    var list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
var lastFolderProjects = [];
function renderFlyFolderOptions() {
  var dl = document.getElementById('fly-folder-options');
  if (!dl) return;
  while (dl.firstChild) dl.removeChild(dl.firstChild);
  var seen = {};
  var history = loadFlyFolderHistory();
  for (var i = 0; i < history.length; i++) {
    if (seen[history[i]]) continue;
    seen[history[i]] = true;
    var opt = document.createElement('option');
    opt.value = history[i];
    dl.appendChild(opt);
  }
  for (var j = 0; j < lastFolderProjects.length; j++) {
    var p = lastFolderProjects[j];
    if (!p.rootPath || seen[p.rootPath]) continue;
    seen[p.rootPath] = true;
    var popt = document.createElement('option');
    popt.value = p.rootPath;
    if (p.name || p.slug) popt.label = p.name || p.slug;
    dl.appendChild(popt);
  }
}
var lastFolderOptionsSig = null;
function syncFlyFolderOptions(projects) {
  lastFolderProjects = projects || [];
  var sig = folderOptionsSig(lastFolderProjects);
  if (sig === lastFolderOptionsSig) return;
  lastFolderOptionsSig = sig;
  renderFlyFolderOptions();
}
function rememberFlyFolder(folder) {
  if (!folder) return;
  var list = rememberedHistory(loadFlyFolderHistory(), folder, FLY_FOLDER_HISTORY_MAX);
  try { localStorage.setItem(FLY_FOLDER_HISTORY_KEY, JSON.stringify(list)); } catch {}
  renderFlyFolderOptions();
}
renderFlyFolderOptions();
// FLY-BAR STATE PERSISTENCE (board web-mss4ie59-mwlogo): per-folder
// mode/firings/total/budget, remembered the same way the folder history
// above is — client-only localStorage, so it survives a dashboard server
// restart for free (nothing server-side to lose). parseFlySettingsStore/
// flySettingsFor/withFlySettings are generated FROM web/flights.ts below —
// their real compiled source via .toString(), not a hand-retyped copy.
${parseFlySettingsStore.toString()}
${flySettingsFor.toString()}
${withFlySettings.toString()}
var FLY_SETTINGS_KEY = 'ap-fly-settings';
function loadFlySettingsStore() {
  try { return parseFlySettingsStore(localStorage.getItem(FLY_SETTINGS_KEY)); } catch { return {}; }
}
function saveFlySettingsFor(folder, settings) {
  if (!folder) return;
  var next = withFlySettings(loadFlySettingsStore(), folder, settings);
  try { localStorage.setItem(FLY_SETTINGS_KEY, JSON.stringify(next)); } catch {}
}
function flyInit() {
  var bar = document.getElementById('flightbar');
  if (!bar) return;
  var form = document.getElementById('fly-form');
  var folderEl = document.getElementById('fly-folder');
  var firingsEl = document.getElementById('fly-firings');
  var budgetEl = document.getElementById('fly-budget');
  var modeEl = document.getElementById('fly-mode');
  var totalEl = document.getElementById('fly-total');
  var lanesEl = document.getElementById('fly-lanes');
  var firingsLabel = document.getElementById('fly-firings-label');
  var totalLabel = document.getElementById('fly-total-label');
  // The budget TOGGLE (operator's ask): choose N-firings mode or a total-$
  // target where the flight keeps firing until the budget can't fund another.
  // A live HINT sentence spells the plan out — the operator found two bare $
  // fields and a silent turn cap unreadable ("the mechanism is confusing").
  var flyHintEl = document.getElementById('fly-hint');
  var flyMaxTurns = null; // learned from /api/fly (server-owned cap, never hardcoded here)
  // flyHintText is generated FROM web/fly-hint.ts below (epic 0002 "shell
  // decomposition", slice 2, twenty-fourth cut) — its real compiled source
  // via .toString(), not a hand-retyped copy. It can no longer drift apart.
${flyHintText.toString()}
  function updateFlyHint() {
    if (!flyHintEl) return;
    var perFiring = budgetEl ? (Number(budgetEl.value) || 0) : 0;
    var isTotalMode = !!(modeEl && modeEl.value === 'total');
    var totalUsd = totalEl ? (Number(totalEl.value) || 0) : 0;
    var count = firingsEl ? (Number(firingsEl.value) || 1) : 1;
    flyHintEl.textContent = flyHintText(isTotalMode, perFiring, totalUsd, count, flyMaxTurns);
  }
  function applyMode() {
    var total = modeEl && modeEl.value === 'total';
    if (firingsEl) firingsEl.hidden = total;
    if (firingsLabel) firingsLabel.hidden = total;
    if (totalEl) totalEl.hidden = !total;
    if (totalLabel) totalLabel.hidden = !total;
    updateFlyHint();
  }
  if (modeEl) modeEl.addEventListener('change', applyMode);
  if (firingsEl) firingsEl.addEventListener('input', updateFlyHint);
  if (budgetEl) budgetEl.addEventListener('input', updateFlyHint);
  if (totalEl) totalEl.addEventListener('input', updateFlyHint);
  applyMode();
  // FLY-BAR STATE PERSISTENCE: switching to a folder the operator has flown
  // before restores its last-used mode/firings/total/budget — the settings
  // fields, unlike the folder history datalist, carry no meaning of their
  // own until there is a remembered match, so a never-flown folder leaves
  // them exactly as the operator last left them (no surprise resets).
  function restoreFlySettingsFor(folder) {
    var settings = folder ? flySettingsFor(loadFlySettingsStore(), folder) : undefined;
    if (!settings) return;
    if (settings.mode && modeEl) modeEl.value = settings.mode;
    if (typeof settings.firings === 'number' && firingsEl) firingsEl.value = String(settings.firings);
    if (typeof settings.total === 'number' && totalEl) totalEl.value = String(settings.total);
    if (typeof settings.budget === 'number' && budgetEl) budgetEl.value = String(settings.budget);
    if (typeof settings.lanes === 'number' && lanesEl) lanesEl.value = String(settings.lanes);
    applyMode();
  }
  if (folderEl) folderEl.addEventListener('change', function () { restoreFlySettingsFor(folderEl.value.trim()); });
  // FLY-BAR folder UX, second slice (board web-msrhr2d9-xxwa3a): the
  // server-backed "browse a brand-new folder" modal the datalist slice's own
  // comment called out as a follow-up — a plain file input cannot reveal an
  // absolute filesystem path, so GET /api/browse-folder (browse-folder.ts)
  // does the listing. Mirrors the Tour dialog's accessibility contract
  // (role=dialog, aria-modal, Escape closes, Tab wraps inside) rather than
  // inventing a second one.
  var browseBtn = document.getElementById('fly-browse-btn');
  var browseEl = null;
  var browseLastFocus = null;
  function browseFocusable() {
    return browseEl ? Array.prototype.slice.call(browseEl.querySelectorAll('button')) : [];
  }
  function closeBrowseModal() {
    if (!browseEl) return;
    browseEl.hidden = true;
    browseEl.textContent = '';
    if (browseLastFocus && typeof browseLastFocus.focus === 'function') browseLastFocus.focus();
    browseLastFocus = null;
  }
  function onBrowseKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeBrowseModal(); return; }
    if (e.key !== 'Tab') return;
    var items = browseFocusable();
    if (items.length === 0) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function loadBrowsePath(path) {
    fetch('/api/browse-folder?path=' + encodeURIComponent(path || ''), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data) paintBrowse(data); else paintBrowseError(); })
      .catch(function () { paintBrowseError(); });
  }
  // A failed/non-ok fetch used to leave browseEl empty: a full-screen
  // darkened overlay with no dialog inside it, so nothing was focused into
  // it and Escape/Tab (bound to browseEl, reached only by bubbling from
  // whatever has focus) never fired — an unclosable dead end. Painting a
  // real dialog here, same as the success path, keeps the modal escapable.
  function paintBrowseError() {
    browseEl.textContent = '';
    var dialog = el('div', 'browse-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'browse-title');
    var h = el('h2', '', tr('browseFolderTitle'));
    h.id = 'browse-title';
    dialog.appendChild(h);
    dialog.appendChild(el('p', 'browse-path', tr('browseError')));
    var actions = el('div', 'browse-actions');
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = tr('close');
    close.setAttribute('data-tip', tr('browseCloseTip'));
    close.addEventListener('click', closeBrowseModal);
    actions.appendChild(close);
    dialog.appendChild(actions);
    browseEl.appendChild(dialog);
    close.focus();
  }
  function paintBrowse(data) {
    browseEl.textContent = '';
    var dialog = el('div', 'browse-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'browse-title');
    var h = el('h2', '', tr('browseFolderTitle'));
    h.id = 'browse-title';
    dialog.appendChild(h);
    dialog.appendChild(el('p', 'browse-path', data.path));
    if ((data.drives || []).length > 1) {
      var drivesRow = el('div', 'browse-drives', null);
      drivesRow.setAttribute('role', 'group');
      drivesRow.setAttribute('aria-label', tr('browseDrives'));
      for (var d = 0; d < data.drives.length; d++) {
        var driveBtn = document.createElement('button');
        driveBtn.type = 'button';
        driveBtn.className = 'browse-drive';
        driveBtn.textContent = data.drives[d];
        driveBtn.setAttribute('data-tip', tr('browseDriveTip', { drive: data.drives[d] }));
        driveBtn.addEventListener('click', function (p) { return function () { loadBrowsePath(p); }; }(data.drives[d]));
        drivesRow.appendChild(driveBtn);
      }
      dialog.appendChild(drivesRow);
    }
    var list = el('div', 'browse-list', null);
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', tr('browseSubfoldersOf', { path: data.path }));
    if (data.parent) {
      var up = document.createElement('button');
      up.type = 'button';
      up.className = 'browse-entry browse-up';
      up.textContent = '.. (up)';
      up.setAttribute('aria-label', tr('browseUpParent'));
      up.setAttribute('data-tip', tr('browseUpTip'));
      up.addEventListener('click', function () { loadBrowsePath(data.parent); });
      list.appendChild(up);
    }
    for (var i = 0; i < (data.entries || []).length; i++) {
      var entry = data.entries[i];
      var entryBtn = document.createElement('button');
      entryBtn.type = 'button';
      entryBtn.className = 'browse-entry';
      entryBtn.textContent = entry.name;
      entryBtn.setAttribute('data-tip', tr('browseEntryTip', { name: entry.name }));
      entryBtn.addEventListener('click', function (p) { return function () { loadBrowsePath(p); }; }(entry.path));
      list.appendChild(entryBtn);
    }
    if ((data.entries || []).length === 0 && !data.parent) {
      list.appendChild(el('p', 'muted browse-empty', tr('noSubfolders')));
    }
    dialog.appendChild(list);
    var actions = el('div', 'browse-actions');
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = tr('cancel');
    cancel.setAttribute('data-tip', tr('browseCloseTip'));
    cancel.addEventListener('click', closeBrowseModal);
    actions.appendChild(cancel);
    var use = document.createElement('button');
    use.type = 'button';
    use.className = 'browse-use';
    use.textContent = tr('useThisFolder');
    use.setAttribute('data-tip', tr('browseUseTip', { path: data.path }));
    use.addEventListener('click', function () {
      if (folderEl) {
        folderEl.value = data.path;
        restoreFlySettingsFor(data.path);
      }
      closeBrowseModal();
      if (folderEl) folderEl.focus();
    });
    actions.appendChild(use);
    dialog.appendChild(actions);
    browseEl.appendChild(dialog);
    use.focus();
  }
  function openBrowseModal() {
    if (!browseEl) {
      browseEl = el('div', 'browse-overlay');
      browseEl.addEventListener('keydown', onBrowseKeydown);
      document.body.appendChild(browseEl);
    }
    browseLastFocus = document.activeElement;
    browseEl.hidden = false;
    loadBrowsePath(folderEl ? folderEl.value.trim() : '');
  }
  if (browseBtn) browseBtn.addEventListener('click', openBrowseModal);
  var goEl = document.getElementById('fly-go');
  var stopEl = document.getElementById('fly-stop');
  var pauseEl = document.getElementById('fly-pause');
  var statusEl = document.getElementById('fly-status');
  var progressLabelEl = document.getElementById('fly-progress-label');
  var progressBarEl = document.getElementById('fly-progress-bar');
  var progressFillEl = document.getElementById('fly-progress-fill');
  var flightsEl = document.getElementById('fly-flights');
  // App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the fly bar's own
  // three controls explain their real consequences before the click — the
  // same runtime-setAttribute pattern connect.ts uses for the CONNECT
  // popover, since their markup lives in shell.ts but their behavior here.
  // i18n (board web-msnsndki-dz3vn1): each tip is a STRINGS key — setTip
  // writes tr(key) now AND tags data-i18n-tip so translateDom()'s sweep
  // retranslates these persistent controls on a locale switch, the same
  // two-part contract setGoLabel below uses for #fly-go's label.
  // The catch covers exactly one case: this module's text is composed BEFORE
  // locale.ts's in the shared bundle scope, so the seven init-time calls
  // below run while tr()'s "const STRINGS" is still in its temporal dead
  // zone. The tag is already set by then, and locale.ts's unconditional
  // first sweep fills the tip the same tick the bundle finishes executing;
  // every later call (flightRow, renderTotalProgress) hits the live tr().
  // Every write is guarded: renderTotalProgress calls this on every poll
  // tick, and rewriting an identical attribute still queues a
  // MutationObserver record — an idempotent tick must mutate nothing
  // (cockpit epic 0015, D2).
  function setTip(target, key) {
    if (!target) return;
    if (target.dataset.i18nTip !== key) target.dataset.i18nTip = key;
    try {
      var text = tr(key);
      if (target.getAttribute('data-tip') !== text) target.setAttribute('data-tip', text);
    } catch {}
  }
  setTip(goEl, 'flyGoTip');
  setTip(pauseEl, 'flyPauseTip');
  setTip(stopEl, 'flyStopTip');
  // Same audit, same pattern: the firings/budget/mode/total inputs only
  // carried a visible <label> (shell.ts) — no hover/focus explanation of
  // what each number actually controls or when it applies.
  setTip(firingsEl, 'flyFiringsTip');
  setTip(budgetEl, 'flyBudgetTip');
  setTip(modeEl, 'flyModeTip');
  setTip(totalEl, 'flyTotalTip');
  // 🍀 "I'M FEELING LUCKY" (GET /api/lucky): probe the machine + board and
  // fill Lanes/Firings/$ with flight/lucky-plan.ts's calibrated launch —
  // born of the 2026-09-03 incident where a blind 8-lane launch pegged the
  // 12-core box at 99% CPU and froze the operator's foreground work. The
  // plan only ever FILLS the form; flying (and its quota spend) stays the
  // operator's click, so the handler ends at goEl.focus(), never
  // goEl.click(). i18n (board web-msnsndki-dz3vn1): the tip rides setTip
  // like the persistent fly-bar controls above, and every status message
  // the handler paints is a tr() key — only the server's own
  // reasoning/refusal line (flight/lucky-plan.ts, English) passes through
  // as {reason}, the same server-message stance fly-status-i18n.test.ts
  // documents for res.message.
  var luckyEl = document.getElementById('fly-lucky');
  setTip(luckyEl, 'flyLuckyTip');
  if (luckyEl) luckyEl.addEventListener('click', function () {
    var folder = folderEl ? folderEl.value.trim() : '';
    luckyEl.disabled = true;
    fetch('/api/lucky' + (folder ? '?folder=' + encodeURIComponent(folder) : ''), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        luckyEl.disabled = false;
        if (!data || !data.plan) { setMsg(tr('luckyNoAnswer'), 'err'); return; }
        if (!data.plan.ok) { setMsg(tr('luckyNotNow', { reason: data.plan.refusal || tr('luckyNoPlan') }), 'err'); return; }
        if (modeEl) modeEl.value = 'firings';
        if (lanesEl) lanesEl.value = String(data.plan.lanes);
        if (firingsEl) firingsEl.value = String(data.plan.firings);
        if (budgetEl) budgetEl.value = String(data.plan.budgetUsd);
        updateFlyHint();
        var rolled = (data.plan.reasoning && data.plan.reasoning.length) ? data.plan.reasoning[data.plan.reasoning.length - 1] : tr('luckyPlanReady');
        setMsg(tr('luckyPressFlyIt', { reason: rolled }), '');
        if (goEl) goEl.focus();
        // lucky: plan painted — flying stays the operator's click.
      })
      .catch(function () { luckyEl.disabled = false; setMsg(tr('luckyDashboardDown'), 'err'); });
  });
  // FLEET LAUNCH FROM THE FLY BAR (board web-mtdcfel4-0bxf4h): more than 1
  // lane launches the SAME hub-aware partitioned multi-lane plan the
  // "dashboard fleet" CLI command already gives (flight/fleet-launch.ts) —
  // the open board is split into disjoint per-lane scopes so no two lanes
  // ever claim the same-area task, instead of every lane pulling from the
  // whole board unpartitioned.
  setTip(lanesEl, 'flyLanesTip');
  var lastMsg = '';
  var lastKind = ''; // '' | 'ok' | 'err' — drives the status colour
  var lastFlightsSig = null; // dedupes renderFlights rebuilds — a stop/pause click mid-poll must survive

  // activeFlights/flightsSig/typedFolderFlightStatus are generated FROM
  // web/flights.ts below (epic 0002 "shell decomposition", slice 2) — their
  // real compiled source via .toString(), not a hand-retyped copy. They can
  // no longer drift apart.
${activeFlights.toString()}
${flightsSig.toString()}
${typedFolderFlightStatus.toString()}

  // flightProgressOf is generated FROM web/flight-progress.ts below (epic
  // 0002 "shell decomposition", slice 2, sixteenth cut) — its real compiled
  // source via .toString(), not a hand-retyped copy. It can no longer drift
  // apart. fmtCost/fmtDuration are injected (mirrors actMeta's fmtTokens
  // param) rather than imported, same reason heatmapDays/verdictOf are.
${flightProgressOf.toString()}
  // sessionFlightDataFor is generated FROM web/flight-progress.ts below
  // (epic 0002 "shell decomposition", slice 2, thirty-first cut) — its real
  // compiled source via .toString(), not a hand-retyped copy. It can no
  // longer drift apart. averageFiringDurationMs is injected, same reason
  // fmtCost/fmtDuration are above.
${sessionFlightDataFor.toString()}
  // The TOTAL flight-level progress bar (the other half of web-msnt5ccp-9bx2ix
  // — per-firing progress lives on the live worker card). At most one flight
  // runs at a time (FlightRunner), so the flying project in the shared fleet
  // snapshot IS the one this status describes — no folder-to-project lookup
  // needed. Firings landed since s.startedAt give real spend/count instead of
  // guessing; the ETA leans on THIS flight's own average firing duration once
  // one has landed, falling back to the project's full history before that.
  // The percent/spend/ETA math itself is flightProgressOf (above); this
  // function stays the DOM-writing half, same split office-map/sparkline/
  // timeline-strip's DOM-building halves use.
  function renderTotalProgress(s, running) {
    if (!progressLabelEl || !progressBarEl || !progressFillEl) return;
    // Every write below is guarded: this runs every poll tick, and rewriting
    // an identical attribute/label still queues MutationObserver records —
    // an idempotent tick must mutate nothing (cockpit epic 0015, D2).
    if (!running || !s || !s.startedAt) {
      hideTotalProgress();
      return;
    }
    var projects = (lastFleetState && lastFleetState.projects) || [];
    var sessionData = sessionFlightDataFor(projects, s.startedAt, averageFiringDurationMs);
    // i18n (board web-msnsndki-dz3vn1): the spend/ETA clauses are composed
    // inside the spliced flightProgressOf, so the bundle's tr() rides in as
    // its sixth param — the same injection route fmtCost/fmtDuration take —
    // and the label around them is a {elapsed}/{progress}/{pct}/{eta}
    // template, so each locale's grammar decides where the clauses land.
    // Re-evaluated every poll tick, so a locale switch retranslates within one.
    var progress = flightProgressOf(s, sessionData.sessionFirings, sessionData.historicalAvgDurationMs, fmtCost, fmtDuration, tr);
    if (!progress) {
      hideTotalProgress();
      return;
    }

    var label = tr('flightProgressLabel', { elapsed: fmtElapsed(s.startedAt), progress: progress.progressBit, pct: progress.pct, eta: progress.etaBit });
    if (progressLabelEl.hidden) progressLabelEl.hidden = false;
    if (progressLabelEl.textContent !== label) progressLabelEl.textContent = label;
    if (progressBarEl.hidden) progressBarEl.hidden = false;
    if (progressBarEl.getAttribute('aria-valuenow') !== String(progress.pct)) progressBarEl.setAttribute('aria-valuenow', String(progress.pct));
    if (progressBarEl.getAttribute('aria-label') !== label) progressBarEl.setAttribute('aria-label', label);
    setTip(progressBarEl, 'flyProgressTip');
    var progressScale = 'scaleX(' + progress.pct / 100 + ')';
    if (progressFillEl.style.transform !== progressScale) progressFillEl.style.transform = progressScale;
  }
  function hideTotalProgress() {
    if (!progressLabelEl.hidden) progressLabelEl.hidden = true;
    if (!progressBarEl.hidden) progressBarEl.hidden = true;
  }

  // A folder-targeted stop/pause POST (epic slice 4/6 — the per-flight card
  // action; the legacy stopEl/pauseEl below send no folder at all).
  function targetedAction(action, folder, btn) {
    if (btn) btn.disabled = true;
    operatorActionLog = recordOperatorAction(operatorActionLog, (action === 'stop' ? 'stopped ' : 'paused ') + folder, OPERATOR_ACTION_LOG_CAP);
    fetch('/api/fly/' + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: folder }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        lastMsg = (res && res.message) ? res.message : tr(action === 'stop' ? 'stoppingName' : 'pausingName', folder);
        lastKind = '';
        poll();
      })
      .catch(function () {
        lastMsg = tr(action === 'stop' ? 'stopFailedName' : 'pauseFailedName', folder);
        lastKind = 'err';
        if (statusEl) { statusEl.textContent = lastMsg; statusEl.className = 'fly-status fly-err'; }
        if (btn) btn.disabled = false;
      });
  }
  // One row for one live (running or paused) folder — its own status line and
  // its own Stop/Pause (or Resume), independent of every other folder's flight.
  // The status sentence and the action tips read tr() at build time (the row
  // is rebuilt on every state change, same as its buttons' own tr() text);
  // web/flights.ts's row-status/action-label helpers stay the tested English
  // source these keys mirror (fly-rows-i18n.test.ts) but are no longer
  // spliced into this bundle.
  function flightRow(f) {
    var row = el('div', 'fly-flight');
    var statusText;
    if (f.running) {
      statusText = f.totalBudgetUsd
        ? tr('flightRowFlyingTotal', { name: f.folder, total: f.totalBudgetUsd })
        : tr('flightRowFlyingFirings', { name: f.folder, count: f.firings || 1 });
      if (f.initiatedBy === 'fleet-watchdog') statusText += tr('flightRowWatchdogSuffix');
    } else if (f.queued) {
      statusText = tr('flightRowQueued', f.folder);
    } else {
      statusText = tr('pausedUntilResumed', f.folder);
    }
    var statusSpan = el('span', 'fly-flight-status', statusText);
    statusSpan.setAttribute('tabindex', '0');
    statusSpan.setAttribute('aria-label', statusText);
    var statusTipKey = f.running ? 'flightRunningTip' : (f.queued ? 'flightQueuedTip' : 'flightPausedTip');
    setTip(statusSpan, statusTipKey);
    row.appendChild(statusSpan);
    var actions = el('div', 'fly-flight-actions');
    if (f.running) {
      var pauseBtn = el('button', 'fly-flight-pause', tr('pause'));
      pauseBtn.type = 'button';
      var pauseTip = tr('pauseFlightOn', f.folder);
      pauseBtn.setAttribute('data-tip', pauseTip);
      pauseBtn.setAttribute('aria-label', pauseTip);
      pauseBtn.addEventListener('click', function () { targetedAction('pause', f.folder, pauseBtn); });
      actions.appendChild(pauseBtn);
      var stopBtn = el('button', 'fly-flight-stop', tr('stop'));
      stopBtn.type = 'button';
      var stopTip = tr('stopFlightOn', f.folder);
      stopBtn.setAttribute('data-tip', stopTip);
      stopBtn.setAttribute('aria-label', stopTip);
      stopBtn.addEventListener('click', function () { targetedAction('stop', f.folder, stopBtn); });
      actions.appendChild(stopBtn);
    } else if (f.queued) {
      // Cancelling a queued (never-started) folder is still "stop" server-side
      // (FlightRunnerRegistry.stop() removes it from the queue instead of
      // killing a child that was never spawned).
      var cancelBtn = el('button', 'fly-flight-stop', tr('cancel'));
      cancelBtn.type = 'button';
      var cancelTip = tr('cancelQueuedFlightOn', f.folder);
      cancelBtn.setAttribute('data-tip', cancelTip);
      cancelBtn.setAttribute('aria-label', cancelTip);
      cancelBtn.addEventListener('click', function () { targetedAction('stop', f.folder, cancelBtn); });
      actions.appendChild(cancelBtn);
    } else {
      var resumeBtn = el('button', 'fly-flight-resume', tr('resume'));
      resumeBtn.type = 'button';
      var resumeTip = tr('resumeFlightOn', f.folder);
      resumeBtn.setAttribute('data-tip', resumeTip);
      resumeBtn.setAttribute('aria-label', resumeTip);
      resumeBtn.addEventListener('click', function () {
        if (folderEl) folderEl.value = f.folder;
        restoreFlySettingsFor(f.folder);
        if (goEl) goEl.click();
      });
      actions.appendChild(resumeBtn);
    }
    row.appendChild(actions);
    return row;
  }
  // Renders every folder the registry has something live to report — skipped
  // (not rebuilt) when nothing actually changed, so a click mid-poll on a
  // Stop/Pause button never gets torn out from under the operator's cursor.
  function renderFlights(list) {
    if (!flightsEl) return;
    var active = activeFlights(list);
    var sig = flightsSig(active);
    if (sig === lastFlightsSig) return;
    lastFlightsSig = sig;
    while (flightsEl.firstChild) flightsEl.removeChild(flightsEl.firstChild);
    for (var j = 0; j < active.length; j++) flightsEl.appendChild(flightRow(active[j]));
  }
  // Paint the bar from a status object (running/idle) + the last message.
  // s.flights (epic slice 3/6, dashboard/src/flight/registry.ts) means this
  // FlightApi is a real multi-flight registry: every live folder gets its own
  // row + its own Stop/Pause (renderFlights), and the launch controls target
  // only the TYPED folder — a flight on some OTHER folder never locks this
  // form, satisfying the epic's "the path field is never globally locked".
  // Without flights (an older single-flight FlightApi), behaviour is
  // unchanged from before this slice.
  function paint(s) {
    // The server owns the per-firing caps — surface them the moment we learn them.
    if (s && s.maxTurnsPerFiring && s.maxTurnsPerFiring !== flyMaxTurns) {
      flyMaxTurns = s.maxTurnsPerFiring;
      updateFlyHint();
    }
    var multi = !!(s && Array.isArray(s.flights));
    // Only touch the flights list when this call actually carries one — setMsg's
    // paint(null) (a launch/stop/pause in flight) must never wipe rows for OTHER
    // folders just because this round-trip's payload has nothing to say about them.
    if (multi) {
      renderFlights(s.flights);
      var typedFolder = folderEl ? folderEl.value.trim() : '';
      var status = typedFolderFlightStatus(s.flights, typedFolder);
      if (goEl) goEl.disabled = status.activeHere || status.queuedHere;
      setGoLabel(status.activeHere ? 'flying' : (status.queuedHere ? 'queued' : null));
      // Superseded by each row's own Stop/Pause — a single global button can't
      // say which of several live folders it would target. Guarded writes:
      // re-setting an identical hidden still queues a mutation record.
      if (stopEl && !stopEl.hidden) stopEl.hidden = true;
      if (pauseEl && !pauseEl.hidden) pauseEl.hidden = true;
      if (folderEl) folderEl.disabled = false;
      if (firingsEl) firingsEl.disabled = false;
      if (modeEl) modeEl.disabled = false;
      if (totalEl) totalEl.disabled = false;
      if (budgetEl) budgetEl.disabled = false;
      if (lanesEl) lanesEl.disabled = false;
      if (statusEl) {
        if (statusEl.textContent !== lastMsg) statusEl.textContent = lastMsg;
        var multiStatusClass = 'fly-status' + (lastKind ? ' fly-' + lastKind : '');
        if (statusEl.className !== multiStatusClass) statusEl.className = multiStatusClass;
      }
      // Exactly one live flight is unambiguous — show its total progress just
      // like the single-flight FlightApi path below. With zero or 2+ running,
      // there's no single flight to describe, so the bar stays hidden and
      // each row's own line carries the detail instead.
      if (status.runningFlights.length === 1) {
        renderTotalProgress(status.runningFlights[0], true);
      } else {
        renderTotalProgress(null, false);
      }
      return;
    }
    var running = !!(s && s.running);
    // Held after its last firing (Pause landed): the same folder, not running —
    // offer Resume (a normal launch against that folder) instead of a bare "Fly it".
    var paused = !running && !!(s && s.paused);
    if (goEl) goEl.disabled = running;
    setGoLabel(running ? 'flying' : (paused ? 'resume' : null));
    // Guarded writes: re-setting an identical hidden still queues a
    // mutation record, and this runs every poll tick.
    if (stopEl) { if (stopEl.hidden !== !running) stopEl.hidden = !running; stopEl.disabled = false; }
    if (pauseEl) { if (pauseEl.hidden !== !running) pauseEl.hidden = !running; pauseEl.disabled = false; }
    if (folderEl) folderEl.disabled = running;
    if (firingsEl) firingsEl.disabled = running;
    if (modeEl) modeEl.disabled = running;
    if (totalEl) totalEl.disabled = running;
    if (budgetEl) budgetEl.disabled = running;
    if (lanesEl) lanesEl.disabled = running;
    // Client-generated status text goes through tr() (board web-msnsndki-dz3vn1)
    // — the folder name is {name}-templated so each locale's grammar decides
    // where it lands, not English word order. Re-evaluated on every 3s poll's
    // paint(), so a mid-flight locale switch retranslates within one poll.
    // Guarded writes: this runs every poll tick, and rewriting an identical
    // text/class still queues a mutation record — an idempotent tick must
    // mutate nothing (cockpit epic 0015, D2 dedup renders).
    var statusName = (s && s.folder) || tr('aFolder');
    if (statusEl) {
      var flyStatusText = running
        ? (s.totalBudgetUsd
            ? tr('flyingUpToTotal', { name: statusName, total: s.totalBudgetUsd })
            : tr('flyingFirings', { name: statusName, count: s.firings || 1 }))
        : (paused ? tr('pausedUntilResumed', statusName) : lastMsg);
      if (statusEl.textContent !== flyStatusText) statusEl.textContent = flyStatusText;
      var flyStatusClass = 'fly-status' + (running ? ' fly-ok' : (paused ? '' : (lastKind ? ' fly-' + lastKind : '')));
      if (statusEl.className !== flyStatusClass) statusEl.className = flyStatusClass;
    }
    renderTotalProgress(s, running);
  }
  // #fly-go's markup carries data-i18n="flyIt" (shell.ts) and translateDom()
  // re-sweeps the whole document after every fleet patch — so every label
  // this bar paints, dynamic ('flying'/'queued'/'resume') or idle ('flyIt'),
  // is written as a STRINGS key: setGoLabel swaps data-i18n to the state's
  // key and paints tr(key), so the very next sweep re-asserts the same text
  // in the active locale instead of clobbering it back to the idle label —
  // and a locale switch mid-flight retranslates the live label immediately
  // (board web-msnsndki-dz3vn1; this replaces the earlier drop-the-attribute
  // fix, whose dynamic texts stayed English literals until their keys
  // existed in STRINGS).
  function setGoLabel(dynamicKey) {
    if (!goEl) return;
    // Guarded writes: this runs every poll tick, and rewriting an identical
    // label/attribute still queues MutationObserver records — an idempotent
    // tick must mutate nothing (cockpit epic 0015, D2 dedup renders).
    var key = dynamicKey || 'flyIt';
    var goText = tr(key);
    if (goEl.dataset.i18n !== key) goEl.dataset.i18n = key;
    if (goEl.textContent !== goText) goEl.textContent = goText;
  }
  function setMsg(text, kind) { lastMsg = text || ''; lastKind = kind || ''; paint(null); }
  function poll() {
    fetch('/api/fly', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { if (s) paint(s); })
      .catch(function () {});
  }
  function load() {
    fetch('/api/fly', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return; // endpoint absent — keep the bar hidden
        bar.hidden = false;
        // Prefill with the dashboard's own folder so "the current folder" is one click.
        if (folderEl && !folderEl.value && s.defaultFolder) folderEl.value = s.defaultFolder;
        // Restore that folder's remembered settings too — covers the very
        // first paint, not just a later folder switch (the 'change' listener
        // above only fires on operator interaction).
        restoreFlySettingsFor(folderEl ? folderEl.value.trim() : '');
        paint(s);
        setInterval(poll, 3000);
      })
      .catch(function () {});
  }
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var folder = folderEl ? folderEl.value.trim() : '';
    var firings = firingsEl ? (Number(firingsEl.value) || 1) : 1;
    var budgetUsd = budgetEl ? (Number(budgetEl.value) || 10) : 10;
    var lanes = lanesEl ? (Number(lanesEl.value) || 1) : 1;
    if (!folder) { setMsg(tr('enterFolderPath'), 'err'); if (folderEl) folderEl.focus(); return; }
    var isTotal = !!(modeEl && modeEl.value === 'total');
    // FLEET LAUNCH FROM THE FLY BAR: multi-lane launches a fixed firing
    // count per lane (exactly what the "dashboard fleet" CLI command takes)
    // — total-spend mode has no per-lane target to partition against, so it
    // is refused here rather than silently ignored.
    if (lanes > 1 && isTotal) {
      setMsg(tr('lanesFixedFiringCount'), 'err');
      return;
    }
    rememberFlyFolder(folder);
    var totalUsd = totalEl ? (Number(totalEl.value) || budgetUsd) : budgetUsd;
    saveFlySettingsFor(folder, {
      mode: isTotal ? 'total' : 'firings',
      firings: firings,
      total: totalUsd,
      budget: budgetUsd,
      lanes: lanes,
    });
    operatorActionLog = recordOperatorAction(
      operatorActionLog,
      'launched ' + folder + (lanes > 1 ? ' (' + lanes + ' lanes)' : ''),
      OPERATOR_ACTION_LOG_CAP
    );
    setMsg(tr('launching'), '');
    if (lanes > 1) {
      fetch('/api/fleet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folder: folder, laneCount: lanes, firings: firings, budgetUsd: budgetUsd }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          lastMsg = (res.j && Array.isArray(res.j.lines)) ? res.j.lines.join(' · ') : (res.ok ? tr('fleetLaunched') : tr('fleetLaunchFailed'));
          lastKind = (res.ok && res.j && res.j.ok !== false) ? 'ok' : 'err';
          poll();
        })
        .catch(function () { setMsg(tr('fleetLaunchDashboardDown'), 'err'); });
      return;
    }
    var payload = { folder: folder, firings: firings, budgetUsd: budgetUsd };
    if (isTotal) {
      payload = { folder: folder, budgetUsd: budgetUsd, totalBudgetUsd: totalUsd };
    }
    fetch('/api/fly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var started = !!(res.j && res.j.started);
        lastMsg = (res.j && res.j.message) ? res.j.message : (started ? tr('launched') : tr('couldNotLaunch'));
        lastKind = started ? 'ok' : 'err';
        // Repaint from a fresh GET rather than this POST's bare per-runner
        // status (no flights) — painting that directly would flash the
        // form back into the legacy globally-locked look for a multi-flight
        // registry until the next 3s poll caught up.
        poll();
      })
      .catch(function () { setMsg(tr('launchFailed'), 'err'); });
  });
  if (stopEl) stopEl.addEventListener('click', function () {
    stopEl.disabled = true;
    operatorActionLog = recordOperatorAction(operatorActionLog, 'stopped the flight', OPERATOR_ACTION_LOG_CAP);
    setMsg(tr('stopping'), '');
    fetch('/api/fly/stop', { method: 'POST', headers: { 'content-type': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (res) { lastMsg = (res && res.message) ? res.message : tr('stopping'); lastKind = ''; poll(); })
      .catch(function () { setMsg(tr('stopFailed'), 'err'); });
  });
  if (pauseEl) pauseEl.addEventListener('click', function () {
    pauseEl.disabled = true;
    operatorActionLog = recordOperatorAction(operatorActionLog, 'paused the flight', OPERATOR_ACTION_LOG_CAP);
    setMsg(tr('pausing'), '');
    fetch('/api/fly/pause', { method: 'POST', headers: { 'content-type': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (res) { lastMsg = (res && res.message) ? res.message : tr('pausing'); lastKind = ''; poll(); })
      .catch(function () { setMsg(tr('pauseFailed'), 'err'); });
  });
  load();
}
flyInit();
`.trim();
}
