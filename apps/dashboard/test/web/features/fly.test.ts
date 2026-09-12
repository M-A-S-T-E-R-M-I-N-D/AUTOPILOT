// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Fly bar client (`web/features/fly.ts`) — the
 * third assembler function extracted out of `shell.ts` into its own file
 * under `web/features/` (epic 0002 "shell decomposition", PARALLEL UNLOCK
 * B's real extraction; `web/features/switcher.ts`/`web/features/connect.ts`
 * were the first two).
 */

import { describe, it, expect } from 'vitest';
import { flyHintText } from '../../../src/web/fly-hint.js';
import {
  activeFlights,
  flightsSig,
  typedFolderFlightStatus,
  parseFlySettingsStore,
  flySettingsFor,
  withFlySettings,
} from '../../../src/web/flights.js';
import { flightProgressOf, sessionFlightDataFor } from '../../../src/web/flight-progress.js';
import { flyJs } from '../../../src/web/features/fly.js';

describe('flyJs', () => {
  it('embeds flyHintText/activeFlights/flightsSig/typedFolderFlightStatus real compiled source via .toString()', () => {
    const out = flyJs();
    expect(out).toContain(flyHintText.toString());
    expect(out).toContain(activeFlights.toString());
    expect(out).toContain(flightsSig.toString());
    expect(out).toContain(typedFolderFlightStatus.toString());
  });

  it('embeds flightProgressOf/sessionFlightDataFor real compiled source via .toString()', () => {
    // flightRowStatusText/flightActionAriaLabel are no longer spliced — the
    // rows read their STRINGS keys via tr() instead (fly-rows-i18n.test.ts).
    const out = flyJs();
    expect(out).toContain(flightProgressOf.toString());
    expect(out).toContain(sessionFlightDataFor.toString());
  });

  it('embeds parseFlySettingsStore/flySettingsFor/withFlySettings real compiled source via .toString()', () => {
    const out = flyJs();
    expect(out).toContain(parseFlySettingsStore.toString());
    expect(out).toContain(flySettingsFor.toString());
    expect(out).toContain(withFlySettings.toString());
  });

  it('restores a folder’s remembered settings on the fly-folder change event, never resetting fields for an unknown folder', () => {
    const out = flyJs();
    expect(out).toContain(
      "if (folderEl) folderEl.addEventListener('change', function () { restoreFlySettingsFor(folderEl.value.trim()); });",
    );
    expect(out).toContain(
      'function restoreFlySettingsFor(folder) {\n    var settings = folder ? flySettingsFor(loadFlySettingsStore(), folder) : undefined;\n    if (!settings) return;',
    );
  });

  it('restores the target folder’s remembered settings when Resume launches a paused flight', () => {
    const out = flyJs();
    expect(out).toContain(
      "resumeBtn.addEventListener('click', function () {\n        if (folderEl) folderEl.value = f.folder;\n        restoreFlySettingsFor(f.folder);\n        if (goEl) goEl.click();\n      });",
    );
  });

  it('gives every Pause/Stop/Cancel/Resume button a data-tip, and a CONCISE aria-label — not a duplicate of the full tip sentence (D1 ATTRIBUTE PAYLOAD, board web-mtd1wmqc-v7h6cq)', () => {
    const out = flyJs();
    expect(out).toContain(
      "var pauseTip = tr('pauseFlightOn', f.folder);\n      pauseBtn.setAttribute('data-tip', pauseTip);\n      pauseBtn.setAttribute('aria-label', tr('pause') + ': ' + f.folder);",
    );
    expect(out).toContain(
      "var stopTip = tr('stopFlightOn', f.folder);\n      stopBtn.setAttribute('data-tip', stopTip);\n      stopBtn.setAttribute('aria-label', tr('stop') + ': ' + f.folder);",
    );
    expect(out).toContain(
      "var cancelTip = tr('cancelQueuedFlightOn', f.folder);\n      cancelBtn.setAttribute('data-tip', cancelTip);\n      cancelBtn.setAttribute('aria-label', tr('cancel') + ': ' + f.folder);",
    );
    expect(out).toContain(
      "var resumeTip = tr('resumeFlightOn', f.folder);\n      resumeBtn.setAttribute('data-tip', resumeTip);\n      resumeBtn.setAttribute('aria-label', tr('resume') + ': ' + f.folder);",
    );
    // The full explanatory sentence must never also land in aria-label — that
    // is the exact attribute-payload duplication this fix removes.
    expect(out).not.toContain("pauseBtn.setAttribute('aria-label', pauseTip)");
    expect(out).not.toContain("stopBtn.setAttribute('aria-label', stopTip)");
    expect(out).not.toContain("cancelBtn.setAttribute('aria-label', cancelTip)");
    expect(out).not.toContain("resumeBtn.setAttribute('aria-label', resumeTip)");
  });

  it('restores a folder’s remembered lanes setting alongside mode/firings/total/budget', () => {
    const out = flyJs();
    expect(out).toContain(
      "if (typeof settings.lanes === 'number' && lanesEl) lanesEl.value = String(settings.lanes);",
    );
  });

  it('saves the launched folder’s mode/firings/total/budget before POSTing /api/fly', () => {
    const out = flyJs();
    const saveIdx = out.indexOf('saveFlySettingsFor(folder,');
    const fetchIdx = out.indexOf("fetch('/api/fly', { method: 'POST'");
    expect(saveIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(saveIdx);
  });

  it('defines and immediately calls flyInit()', () => {
    const out = flyJs();
    expect(out).toContain('function flyInit() {');
    expect(out.trimEnd().endsWith('flyInit();')).toBe(true);
  });

  it('bails out early when the #flightbar element is not on the page', () => {
    expect(flyJs()).toContain(
      "var bar = document.getElementById('flightbar');\n  if (!bar) return;",
    );
  });

  it('POSTs a launch as application/json, not a cross-site-forgeable form submit', () => {
    expect(flyJs()).toContain(
      "fetch('/api/fly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })",
    );
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = flyJs();
    expect(out).toBe(out.trim());
  });

  it('opens the browse-folder modal by fetching /api/browse-folder for the typed folder', () => {
    expect(flyJs()).toContain(
      "fetch('/api/browse-folder?path=' + encodeURIComponent(path || ''), { headers: { accept: 'application/json' } })",
    );
    expect(flyJs()).toContain(
      "if (browseBtn) browseBtn.addEventListener('click', openBrowseModal);",
    );
  });

  it('the browse modal is a labelled, focus-trapped dialog that closes on Escape', () => {
    const out = flyJs();
    expect(out).toContain("dialog.setAttribute('role', 'dialog');");
    expect(out).toContain("dialog.setAttribute('aria-modal', 'true');");
    expect(out).toContain(
      "if (e.key === 'Escape') { e.preventDefault(); closeBrowseModal(); return; }",
    );
  });

  it('selecting a folder writes it into #fly-folder and restores its remembered settings', () => {
    expect(flyJs()).toContain(
      'folderEl.value = data.path;\n        restoreFlySettingsFor(data.path);',
    );
  });

  it('offers a drive switcher when the server reports more than one mounted drive', () => {
    const out = flyJs();
    expect(out).toContain('if ((data.drives || []).length > 1) {');
    expect(out).toContain("drivesRow.setAttribute('aria-label', tr('browseDrives'));");
    expect(out).toContain("driveBtn.className = 'browse-drive';");
  });

  it('keeps the #fly-go label locale-aware in EVERY state: each paint swaps the data-i18n key and reads tr(), so a translateDom() sweep re-asserts instead of clobbering (web-msnsndki-dz3vn1)', () => {
    const out = flyJs();
    // One writer for every state: the state's key lands in data-i18n AND the
    // text, and both writes are guarded so an identical-state poll tick
    // mutates nothing (cockpit epic 0015, D2 dedup renders).
    expect(out).toContain("var key = dynamicKey || 'flyIt';");
    expect(out).toContain('if (goEl.dataset.i18n !== key) goEl.dataset.i18n = key;');
    expect(out).toContain('if (goEl.textContent !== goText) goEl.textContent = goText;');
    // Both paint paths pass STRINGS keys, not English literals.
    expect(out).toContain(
      "setGoLabel(status.activeHere ? 'flying' : (status.queuedHere ? 'queued' : null));",
    );
    expect(out).toContain("setGoLabel(running ? 'flying' : (paused ? 'resume' : null));");
    // The raw English literals are gone from the bundle.
    expect(out).not.toContain("'Fly it'");
    expect(out).not.toContain("'Flying…'");
    expect(out).not.toContain("'Queued…'");
  });

  it("builds each flight row's Pause/Stop/Cancel/Resume button text from the STRINGS table, not an English literal", () => {
    const out = flyJs();
    expect(out).toContain("el('button', 'fly-flight-pause', tr('pause'))");
    expect(out).toContain("el('button', 'fly-flight-stop', tr('stop'))");
    expect(out).toContain("el('button', 'fly-flight-stop', tr('cancel'))");
    expect(out).toContain("el('button', 'fly-flight-resume', tr('resume'))");
  });

  it("wires the 🍀 I'm-feeling-lucky button: rolls GET /api/lucky and fills Lanes/Firings/$ from the calibrated plan", () => {
    const out = flyJs();
    expect(out).toContain("var luckyEl = document.getElementById('fly-lucky');");
    // The roll carries the page's locale and the stated attention (issue #44).
    expect(out).toContain(
      "fetch('/api/lucky' + luckyQuery(folder), { headers: { accept: 'application/json' } })",
    );
    expect(out).toContain(
      "var q = '?locale=' + encodeURIComponent(document.documentElement.lang || 'en') + '&attention=' + flyAttention();",
    );
    expect(out).toContain("return q + (folder ? '&folder=' + encodeURIComponent(folder) : '');");
    // A real plan fills the form fields — all three knobs, count mode.
    expect(out).toContain('lanesEl.value = String(data.plan.lanes);');
    expect(out).toContain('firingsEl.value = String(data.plan.firings);');
    expect(out).toContain('budgetEl.value = String(data.plan.budgetUsd);');
    // A refusal paints the why instead of filling anything.
    expect(out).toContain('data.plan.refusal');
  });

  it('surfaces the machine-load reading, not just the final lane count (board web-mtsvcibf-bh6asp)', () => {
    const out = flyJs();
    // reasoning[0] is always the CPU-bound line (flight/lucky-plan.ts) —
    // prepend it to the rolled summary so the operator sees WHY the plan is
    // sized the way it is, not just the final lane/firing numbers.
    expect(out).toContain(
      "var loadHint = (data.plan.reasoning && data.plan.reasoning.length) ? data.plan.reasoning[0] : '';",
    );
    expect(out).toContain(
      "if (loadHint && loadHint !== rolled) rolled = loadHint + ' — ' + rolled;",
    );
    // Still rides the single {reason} slot — no new STRINGS key needed.
    expect(out).toContain("setMsg(tr('luckyPressFlyIt', { reason: rolled }), '')");
  });

  it('paints the fit shortlist under the bar — on a refusal too — and the attention toggle re-rolls (issue #44)', () => {
    const out = flyJs();
    // The shortlist paints BEFORE the refusal early-return: "nothing queued"
    // is exactly when the claimable work one panel over matters.
    const paintAt = out.indexOf('paintLuckyFit(data.fit);');
    const refuseAt = out.indexOf("if (!data.plan.ok) { setMsg(tr('luckyNotNow'");
    expect(paintAt).toBeGreaterThan(-1);
    expect(refuseAt).toBeGreaterThan(paintAt);
    // One line per issue: the link, the score, the source, the why.
    expect(out).toContain("a.textContent = '#' + lines[i].number + ' ' + lines[i].title;");
    expect(out).toContain(
      "score.textContent = tr('luckyFitScore', { score: Number(lines[i].fit).toFixed(2) });",
    );
    expect(out).toContain(
      "tr(lines[i].source === 'pool' ? 'luckyFitSourcePool' : 'luckyFitSourcePeople')",
    );
    expect(out).toContain('why.textContent = lines[i].reasoning;');
    expect(out).toContain('fitEl.hidden = lines.length === 0;');
    // The attention toggle persists client-side and rolls again.
    expect(out).toContain("var FLY_ATTENTION_KEY = 'ap-fly-attention';");
    expect(out).toContain(
      "try { localStorage.setItem(FLY_ATTENTION_KEY, btn.getAttribute('data-fly-attention')); } catch {}\n    rollLucky();",
    );
    expect(out).toContain("return FLY_ATTENTIONS.indexOf(v) >= 0 ? v : 'evening';");
  });

  it('the 🍀 button never launches by itself — it hands focus to Fly it and stops there (quota stays the operator’s click)', () => {
    const out = flyJs();
    const start = out.indexOf("luckyEl.addEventListener('click'");
    const end = out.indexOf('// lucky: plan painted — flying stays the operator');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const handlerBody = out.slice(start, end);
    expect(handlerBody).not.toContain('goEl.click()');
    expect(handlerBody).toContain('goEl.focus();');
  });

  it('never leaves an unclosable blank overlay when /api/browse-folder fails — paints a focusable, escapable error dialog instead', () => {
    const out = flyJs();
    // A failed/non-ok fetch must not fall through to a no-op: both the
    // resolved-but-falsy branch and the rejected-promise branch have to
    // reach a painter that puts a focusable button inside browseEl, or
    // Escape/Tab never reach onBrowseKeydown (it's bound to browseEl, and
    // keydown only bubbles up from whatever currently has focus).
    expect(out).toContain(
      "fetch('/api/browse-folder?path=' + encodeURIComponent(path || ''), { headers: { accept: 'application/json' } })\n" +
        '      .then(function (r) { return r.ok ? r.json() : null; })\n' +
        '      .then(function (data) { if (data) paintBrowse(data); else paintBrowseError(); })\n' +
        '      .catch(function () { paintBrowseError(); });',
    );
    expect(out).toContain('function paintBrowseError() {');
    expect(out).toContain(
      "dialog.setAttribute('role', 'dialog');\n    dialog.setAttribute('aria-modal', 'true');",
    );
    expect(out).toContain("close.addEventListener('click', closeBrowseModal);");
    expect(out).toContain('close.focus();');
  });
});
