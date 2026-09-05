// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * REPORT UNIFICATION 1/2+2/2 (epic 0015, "operator course correction —
 * 2026-09-02"): the operator rejected the eight always-open
 * `reportFromHereSection` panels (formerly `web/features/report.ts`) as
 * clutter and asked for exactly one thing instead — right-click anywhere, a
 * small custom menu offers "📮 Report from here", and choosing it opens ONE
 * hidden dialog with the capture already visible (element, owning region +
 * module sources, DOM/CSS snapshot, recent console errors) so the operator
 * only types a description and picks an action. Slice 1/2 shipped this
 * dialog + menu as a new, additive module (ADDITIVE BEFORE SUBTRACTIVE,
 * epic 0015's own constraint) alongside the eight old panels, left standing
 * for that slice. Slice 2/2 removed them: the `renderProjectPage()` call
 * sites, the per-panel "use last capture" button, `report.ts` itself, and
 * `report-capture-client.ts`'s sibling-tagging machinery are all gone —
 * `shell.ts`'s `renderProjectPage()` now tags each of its eight regions with
 * a direct `data-report-region` attribute at render instead of the
 * sibling-tag relay.
 *
 * Deliberately does NOT duplicate `report-capture-client.ts`'s DOM/CSS/
 * console-error capture: `preventDefault()` on a `contextmenu` event never
 * stops OTHER listeners on the same event from running (it only suppresses
 * the browser's own default action), so that module's existing, unmodified
 * listener still fires on every right-click and populates
 * `window.__autopilotReportCapture` exactly as before — this module only
 * reads it, at the moment the operator picks the menu item, well after the
 * contextmenu event that captured it already ran. `resolveOwningModule`'s
 * region resolution now reads `window.REPORT_REGIONS` directly — the real
 * global `shell.ts` declares at its script's top level — rather than a
 * registry relayed off a panel's attribute.
 *
 * `discoverFeatureModules('web/features')` finds this file's `reportMenuJs`
 * export the same way it finds every other feature module;
 * `web/features/index.ts` (regenerated via `--emit-index`) carries it into
 * `featureModulesJs()`, and `web/chunks.ts` places it in
 * `DEFERRED_OPERATOR_FEATURES` (served as `/panels.js`, every page, deferred)
 * — the same chunk `report-capture-client` rides, since both are
 * self-initializing wiring meant to be live dashboard-wide, not just on a
 * project page (unlike the eight old panels, which only ever rendered inside
 * `renderProjectPage()`). Reporting a `local-task`/`quick-fix-pr` still needs
 * a project id (`document.body.dataset.project`, blank on the fleet index
 * page) — a blank id there is not a bug, it is `planReportFromHere`'s own
 * honest "a task needs a project" rejection, previewed like any other; the
 * upstream `issue`/`pool-offer` actions need no project at all, so
 * right-click-to-report stays useful fleet-wide.
 *
 * `reportActionLabel`/`reportConfirmMessage`/`reportExecuteResult`/
 * `reportExecuteTip` are generated FROM `web/report-panel.ts` below — their
 * real compiled source via `.toString()`, the same no-drift convention
 * `features/report.ts` already uses for the exact same four functions (both
 * modules share this preview/execute UX, just around a different container).
 * `formatCapturedReportContext` rides the same splice from
 * `web/report-capture.ts` — displayed read-only in the dialog AND folded
 * into the description this module POSTs, so the exact text the operator
 * sees is the exact text that travels with the report; never silently
 * different.
 *
 * A `contextmenu` fired on an editable surface (`input`/`textarea`/`select`/
 * `[contenteditable]`) is deliberately left alone (no `preventDefault()`, no
 * custom menu) — including this module's OWN description `<textarea>` inside
 * the dialog it opens. Without that guard, right-clicking to reach a native
 * "Paste"/"Undo" context menu inside ANY dashboard text field (the Fly bar's
 * folder path, the SOUL editor, this dialog's own description) would instead
 * summon "📮 Report from here", silently taking away editing capability the
 * operator already relies on — Shift+right-click already exists as the
 * documented escape hatch for the browser's native menu; editable surfaces
 * get that same behavior unconditionally, with no modifier required.
 *
 * i18n (board web-msnsndki-dz3vn1): the menu's and dialog's own static text
 * — aria-labels, item, title, field labels, tips, Preview/Execute and the
 * three client-written status lines — reads `STRINGS` through the core
 * chunk's global `tr()` at build time, since both are painted fresh on
 * every open and there is no persistent node for `translateDom()` to
 * revisit (the browse-folder modal's route). `reportConfirmMessage` (the
 * EXECUTE button's `window.confirm()`) now takes that same `tr` as its
 * second argument, the injected-`tr` route `release-panel.ts`'s
 * `releaseConfirmMessage` established; `reportActionLabel`/
 * `reportExecuteResult`/`reportExecuteTip` below still compose English and
 * are the remaining follow-up, same split the CONNECT popover took.
 */
import {
  reportActionLabel as sharedReportActionLabel,
  reportConfirmMessage as sharedReportConfirmMessage,
  reportExecuteResult as sharedReportExecuteResult,
  reportExecuteTip as sharedReportExecuteTip,
} from '../report-panel.js';
import { formatCapturedReportContext as sharedFormatCapturedReportContext } from '../report-capture.js';

/** `contextmenu` targets inside any of these keep the browser's native menu
 *  (Paste/Undo/spellcheck) — see the header comment's editable-surface note. */
const REPORT_MENU_EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

/** The single right-click "📮 Report from here" menu + dialog — vanilla,
 *  external (keeps CSP script-src 'self'). */
export function reportMenuJs(): string {
  return `
var REPORT_MENU_EDITABLE_SELECTOR = ${JSON.stringify(REPORT_MENU_EDITABLE_SELECTOR)};
// reportActionLabel/reportConfirmMessage/reportExecuteResult/reportExecuteTip
// are generated FROM web/report-panel.ts (real compiled source via
// .toString(), not a hand-retyped copy) — the same preview/confirm/execute
// UX features/report.ts's eight panels already use.
${sharedReportActionLabel.toString()}
${sharedReportConfirmMessage.toString()}
${sharedReportExecuteResult.toString()}
${sharedReportExecuteTip.toString()}
${sharedFormatCapturedReportContext.toString()}
function reportMenuDescription(typed, capture) {
  var captured = formatCapturedReportContext(capture);
  return typed.trim() ? typed + '\\n\\n' + captured : captured;
}
function reportMenuCaptureBody(pid, capture, typed, action) {
  var owning = capture && capture.owningModule;
  return JSON.stringify({
    regionId: owning ? owning.regionId : 'element',
    regionLabel: owning ? owning.regionLabel : 'a dashboard element',
    description: reportMenuDescription(typed, capture),
    moduleSources: owning ? owning.moduleSources : [],
    hasScreenshot: false,
    action: action,
    projectId: pid,
  });
}
var reportMenuEl = null;
var reportMenuTriggerFocus = null;
var reportMenuTargetEl = null;
// ── COPY TOOLKIT (operator course correction 2026-09-03): the right-click
// menu is the dashboard's copy multi-tool, not report-only — copy the
// element's text, markup, a rooted CSS selector, its computed styles, or a
// smart JSON context bundle (selector + rect + dataset + the OWNING SOURCE
// MODULES from the same region capture the report rides). Clipboard writes
// go through navigator.clipboard; a successful copy flashes a check on the
// item and closes the menu.
function reportMenuSelectorOf(target) {
  if (!target || target.nodeType !== 1) return '';
  if (target.id) return '#' + target.id;
  var parts = [];
  var node = target;
  while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
    if (node.id) { parts.unshift('#' + node.id); break; }
    var part = node.tagName.toLowerCase();
    var cls = typeof node.className === 'string' ? node.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2) : [];
    for (var i = 0; i < cls.length; i++) part += '.' + cls[i];
    var parent = node.parentElement;
    if (parent) {
      var siblings = parent.querySelectorAll(':scope > ' + node.tagName.toLowerCase());
      if (siblings.length > 1) part += ':nth-child(' + (Array.prototype.indexOf.call(parent.children, node) + 1) + ')';
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(' > ');
}
var REPORT_MENU_STYLE_PROPS = ['display', 'position', 'width', 'height', 'margin', 'padding', 'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'border', 'border-radius', 'box-shadow', 'gap', 'flex-direction', 'align-items', 'justify-content', 'opacity', 'transform'];
function reportMenuStylesOf(target, selector) {
  var cs = window.getComputedStyle(target);
  var lines = [selector + ' {'];
  for (var i = 0; i < REPORT_MENU_STYLE_PROPS.length; i++) {
    var v = cs.getPropertyValue(REPORT_MENU_STYLE_PROPS[i]);
    if (v && v !== 'none' && v !== 'normal' && v !== 'auto') lines.push('  ' + REPORT_MENU_STYLE_PROPS[i] + ': ' + v + ';');
  }
  lines.push('}');
  return lines.join('\\n');
}
function reportMenuContextOf(target, capture) {
  var rect = target.getBoundingClientRect();
  var owning = capture && capture.owningModule;
  var ds = {};
  if (target.dataset) for (var k in target.dataset) ds[k] = target.dataset[k];
  return JSON.stringify({
    selector: reportMenuSelectorOf(target),
    tag: target.tagName.toLowerCase(),
    id: target.id || null,
    classes: typeof target.className === 'string' && target.className ? target.className.trim().split(/\\s+/) : [],
    text: (target.innerText || target.textContent || '').slice(0, 200),
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    dataset: ds,
    region: owning ? { regionId: owning.regionId, regionLabel: owning.regionLabel, moduleSources: owning.moduleSources } : null,
    url: location.pathname,
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
  }, null, 2);
}
function reportMenuCopy(text, itemEl) {
  function done(ok) {
    itemEl.textContent = ok ? '\\u2713 Copied' : '\\u2717 Copy failed';
    setTimeout(closeReportMenu, 450);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
  } else {
    done(false);
  }
}
function reportMenuOnKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeReportMenu(); return; }
  if (!reportMenuEl) return;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
  var items = Array.prototype.slice.call(reportMenuEl.querySelectorAll('.report-ctx-menu-item'));
  if (items.length === 0) return;
  e.preventDefault();
  var idx = items.indexOf(document.activeElement);
  var next = e.key === 'Home' ? 0
    : e.key === 'End' ? items.length - 1
    : e.key === 'ArrowDown' ? (idx + 1) % items.length
    : (idx - 1 + items.length) % items.length;
  items[next].focus();
}
function reportMenuOnOutside(e) {
  if (reportMenuEl && !reportMenuEl.contains(e.target)) closeReportMenu();
}
function closeReportMenu() {
  if (!reportMenuEl) return;
  reportMenuEl.remove();
  reportMenuEl = null;
  document.removeEventListener('keydown', reportMenuOnKeydown, true);
  document.removeEventListener('mousedown', reportMenuOnOutside, true);
}
function reportMenuAddItem(label, tip, onChoose) {
  var item = document.createElement('button');
  item.type = 'button';
  item.className = 'report-ctx-menu-item';
  item.setAttribute('role', 'menuitem');
  item.textContent = label;
  if (tip) item.setAttribute('data-tip', tip);
  item.addEventListener('click', function () { onChoose(item); });
  reportMenuEl.appendChild(item);
  return item;
}
function openReportMenu(x, y) {
  closeReportMenu();
  reportMenuTriggerFocus = document.activeElement;
  reportMenuEl = document.createElement('div');
  reportMenuEl.className = 'report-ctx-menu';
  reportMenuEl.setAttribute('role', 'menu');
  reportMenuEl.setAttribute('aria-label', tr('reportFromHere'));
  reportMenuEl.style.left = x + 'px';
  reportMenuEl.style.top = y + 'px';
  var target = reportMenuTargetEl;
  // Breadcrumb header: WHAT was right-clicked, so the copy tools below have
  // an unambiguous subject. aria-hidden — the menu's aria-label + each
  // item's own name carry the accessible story; this is a visual anchor.
  var head = document.createElement('div');
  head.className = 'report-ctx-menu-head';
  head.setAttribute('aria-hidden', 'true');
  head.textContent = reportMenuSelectorOf(target).slice(0, 60) || 'element';
  reportMenuEl.appendChild(head);
  var item = reportMenuAddItem(tr('reportFromHereTitle'), tr('reportFromHere'), function () {
    closeReportMenu();
    openReportDialog();
  });
  var sep = document.createElement('div');
  sep.className = 'report-ctx-menu-sep';
  sep.setAttribute('role', 'separator');
  reportMenuEl.appendChild(sep);
  // English literals for the copy labels until their STRINGS keys exist —
  // the same stance setGoLabel's dynamic texts took (fly.ts), and the i18n
  // lane's sweep is the ritual that upgrades them.
  reportMenuAddItem('\\uD83D\\uDCCB Copy text', 'Copies the current selection, or this element\\u2019s full text.', function (it) {
    var sel = window.getSelection ? String(window.getSelection()) : '';
    reportMenuCopy(sel && sel.trim() ? sel : (target && (target.innerText || target.textContent) || '').trim(), it);
  });
  reportMenuAddItem('\\uD83E\\uDDE9 Copy element HTML', 'Copies this element\\u2019s outerHTML markup.', function (it) {
    reportMenuCopy(target ? target.outerHTML : '', it);
  });
  reportMenuAddItem('\\uD83C\\uDFAF Copy CSS selector', 'Copies a rooted selector path to this element.', function (it) {
    reportMenuCopy(reportMenuSelectorOf(target), it);
  });
  reportMenuAddItem('\\uD83C\\uDFA8 Copy computed styles', 'Copies this element\\u2019s computed CSS as a ready style block.', function (it) {
    reportMenuCopy(reportMenuStylesOf(target, reportMenuSelectorOf(target) || 'element'), it);
  });
  reportMenuAddItem('\\uD83E\\uDDE0 Copy smart context (JSON)', 'Copies selector, geometry, data attributes, and the source modules that own this region \\u2014 everything a bug report or an AI needs.', function (it) {
    reportMenuCopy(reportMenuContextOf(target, window.__autopilotReportCapture), it);
  });
  document.body.appendChild(reportMenuEl);
  var vw = window.innerWidth, vh = window.innerHeight;
  var rect = reportMenuEl.getBoundingClientRect();
  if (rect.right > vw) reportMenuEl.style.left = Math.max(0, vw - rect.width) + 'px';
  if (rect.bottom > vh) reportMenuEl.style.top = Math.max(0, vh - rect.height) + 'px';
  item.focus();
  document.addEventListener('keydown', reportMenuOnKeydown, true);
  document.addEventListener('mousedown', reportMenuOnOutside, true);
}
var reportDialogEl = null;
var reportDialogLastFocus = null;
function reportDialogFocusable() {
  return reportDialogEl ? Array.prototype.slice.call(reportDialogEl.querySelectorAll('button, textarea, select')) : [];
}
function closeReportDialog() {
  if (!reportDialogEl) return;
  reportDialogEl.hidden = true;
  reportDialogEl.textContent = '';
  if (reportDialogLastFocus && typeof reportDialogLastFocus.focus === 'function') reportDialogLastFocus.focus();
  reportDialogLastFocus = null;
}
function onReportDialogKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeReportDialog(); return; }
  if (e.key !== 'Tab') return;
  var items = reportDialogFocusable();
  if (items.length === 0) return;
  var first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function paintReportDialog(pid, capture) {
  reportDialogEl.textContent = '';
  var dialog = el('div', 'report-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'report-dialog-title');
  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'report-dialog-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', tr('close'));
  closeBtn.setAttribute('data-tip', tr('reportDialogCloseTip'));
  closeBtn.addEventListener('click', closeReportDialog);
  dialog.appendChild(closeBtn);
  var h = el('h2', 'report-dialog-title', tr('reportFromHereTitle'));
  h.id = 'report-dialog-title';
  dialog.appendChild(h);
  var capturedEl = document.createElement('pre');
  capturedEl.className = 'report-dialog-capture';
  capturedEl.textContent = formatCapturedReportContext(capture);
  dialog.appendChild(capturedEl);
  var descId = 'report-dialog-desc';
  var descLabel = document.createElement('label');
  descLabel.setAttribute('for', descId);
  descLabel.textContent = tr('reportDescLabel');
  dialog.appendChild(descLabel);
  var desc = document.createElement('textarea');
  desc.id = descId;
  desc.className = 'report-desc';
  desc.rows = 3;
  desc.setAttribute('data-tip', tr('reportDescTip'));
  dialog.appendChild(desc);
  var actionId = 'report-dialog-action';
  var actionLabel = document.createElement('label');
  actionLabel.setAttribute('for', actionId);
  actionLabel.textContent = tr('reportActionPrompt');
  dialog.appendChild(actionLabel);
  var actionSel = document.createElement('select');
  actionSel.id = actionId;
  actionSel.className = 'report-action';
  var actionValues = ['issue', 'quick-fix-pr', 'local-task', 'pool-offer'];
  for (var i = 0; i < actionValues.length; i++) {
    var opt = document.createElement('option');
    opt.value = actionValues[i];
    opt.textContent = reportActionLabel(actionValues[i]);
    actionSel.appendChild(opt);
  }
  dialog.appendChild(actionSel);
  var previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'report-preview';
  previewBtn.textContent = tr('reportPreview');
  previewBtn.setAttribute('data-tip', tr('reportPreviewTip'));
  dialog.appendChild(previewBtn);
  var planEl = el('div', 'report-plan');
  planEl.setAttribute('role', 'status');
  planEl.setAttribute('aria-live', 'polite');
  dialog.appendChild(planEl);
  var resultEl = el('div', 'report-result');
  resultEl.setAttribute('role', 'status');
  resultEl.setAttribute('aria-live', 'polite');
  dialog.appendChild(resultEl);
  var previewedPlan = null;
  function renderPlan(plan) {
    previewedPlan = null;
    planEl.replaceChildren();
    if (!plan) {
      planEl.appendChild(el('p', 'muted', tr('reportPreviewUnavailable')));
      return;
    }
    if (!plan.ok) {
      planEl.appendChild(el('p', 'muted', tr('reportNothingToFile', { reasoning: plan.reasoning })));
      return;
    }
    previewedPlan = plan;
    planEl.appendChild(el('p', 'report-summary', reportActionLabel(plan.action) + ' — ' + plan.summary));
    var execBtn = document.createElement('button');
    execBtn.type = 'button';
    execBtn.className = 'report-execute';
    execBtn.textContent = tr('reportExecute');
    var execTip = reportExecuteTip(plan);
    execBtn.setAttribute('data-tip', execTip);
    execBtn.setAttribute('aria-label', execTip);
    execBtn.addEventListener('click', function () {
      if (!previewedPlan) return;
      if (!window.confirm(reportConfirmMessage(previewedPlan, tr))) return;
      execBtn.disabled = true;
      execBtn.textContent = tr('reportExecuting');
      fetch('/api/report-from-here/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: reportMenuCaptureBody(pid, capture, desc.value, actionSel.value),
      })
        .then(function (res) { return res.json().then(function (data) { return data; }); })
        .then(function (data) {
          var result = reportExecuteResult(data);
          resultEl.className = result.className;
          resultEl.textContent = result.text;
          execBtn.disabled = false;
          execBtn.textContent = tr('reportExecute');
        })
        .catch(function () {
          execBtn.disabled = false;
          execBtn.textContent = tr('reportExecute');
          resultEl.className = 'report-result report-result-fail';
          resultEl.textContent = tr('reportRequestFailed');
        });
    });
    planEl.appendChild(execBtn);
  }
  previewBtn.addEventListener('click', function () {
    previewBtn.disabled = true;
    fetch('/api/report-from-here', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: reportMenuCaptureBody(pid, capture, desc.value, actionSel.value),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        previewBtn.disabled = false;
        renderPlan(data && data.plan);
      })
      .catch(function () {
        previewBtn.disabled = false;
        renderPlan(null);
      });
  });
  reportDialogEl.appendChild(dialog);
  desc.focus();
}
function openReportDialog() {
  var capture = window.__autopilotReportCapture;
  if (!capture) return;
  var pid = document.body.dataset.project || '';
  if (!reportDialogEl) {
    reportDialogEl = document.createElement('div');
    reportDialogEl.className = 'report-dialog-overlay';
    reportDialogEl.hidden = true;
    reportDialogEl.addEventListener('keydown', onReportDialogKeydown);
    document.body.appendChild(reportDialogEl);
  }
  reportDialogLastFocus = reportMenuTriggerFocus || document.activeElement;
  reportMenuTriggerFocus = null;
  reportDialogEl.hidden = false;
  paintReportDialog(pid, capture);
}
document.addEventListener('contextmenu', function (e) {
  if (e.shiftKey) return;
  if (!e.target || !e.target.closest) return;
  if (e.target.closest(REPORT_MENU_EDITABLE_SELECTOR)) return;
  e.preventDefault();
  reportMenuTargetEl = e.target;
  openReportMenu(e.clientX, e.clientY);
});
`.trim();
}
