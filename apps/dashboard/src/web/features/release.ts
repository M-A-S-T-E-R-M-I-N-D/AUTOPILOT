// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's RELEASE panel cluster — the preview/body renderer
 * (`renderReleaseBody`/`releaseSection`) and the panel's own confirm-guarded
 * `data-release-execute` click handler, a whole bundle-composing assembler
 * function extracted out of `shell.ts`'s `fleetJs()` into its own file under
 * `web/features/` (epic 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/landing.ts` for
 * the prior cluster extraction of this shape). `landing.ts`/`release.ts` were
 * flagged as the two remaining whole-region candidates precisely because each
 * carries its own EXECUTE click handler (see the metrics cut's own epic
 * note); the landing cut took `landing.ts` first, leaving `release.ts` as
 * this follow-on — closing that two-item list.
 * `web/shell.ts`'s `clientJs()` calls this module indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `releaseJs`
 * export the same way it already finds `landing.ts`'s. This file still
 * carries real relative-import splices of its own —
 * `releaseVersionItems`/`releaseExecuteTip`/`releaseExecuteResult`/
 * `releaseConfirmMessage` (from `web/release-panel.ts`) — now resolved
 * relative to this file instead of `shell.ts`; a function's `.toString()`
 * output is unaffected by which local name imports it under, so this remains
 * byte-for-byte the same generated text. Unlike `landing.ts`, this cluster
 * keeps no module-level state of its own, and its click handler reads no
 * fleet-wide mutable state — it only calls `refresh()` as a bare hoisted
 * identifier on success, the same cross-module hoisted-call shape every
 * whole-region move in this epic already relies on for `el`/`tipChip`.
 * `el`/`tipChip` stay inline in `fleetJs()` — broadly shared across many
 * panels beyond this cluster, already relied on the same way by
 * `web/features/landing.ts` and `web/features/metrics.ts` — called by name
 * inside these functions, they hoist the same way.
 *
 * `releaseSection(pid)` (declared below) is called from `fleetJs()`'s
 * `renderProjectPage()` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text, the same reason
 * every whole-region move's own call site already relies on.
 */
import {
  releaseExecuteResult,
  releaseVersionItems,
  releaseConfirmMessage,
  releaseExecuteTip,
} from '../release-panel.js';
import { releaseMaturityOf } from '../../release/maturity.js';

/** The RELEASE panel cluster client — vanilla, external (keeps CSP script-src 'self'). */
export function releaseJs(): string {
  return `
// RELEASE preview + EXECUTE (web-msnshavs-z0obmh): what the next release
// would cut — SemVer bump computed from Conventional Commits since the
// project's last release tag (packages/engine/src/release.ts's planRelease)
// — and, when one is planned, a button to actually cut it: bump
// package.json, cut the CHANGELOG, commit, and tag
// (packages/engine/src/release.ts's executeRelease), attaching a git notes
// attestation automatically. The milestone tag field is optional — docs/
// RELEASING.md's m<N> only applies when this release actually completes a
// milestone's DoD, a call only the operator can make; left blank, only the
// v<semver> tag is cut. Same explicit-confirm pattern as Landing EXECUTE
// above.
// releaseVersionItems is generated FROM web/release-panel.ts below (epic
// 0002 "shell decomposition", slice 2, sixty-fourth cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${releaseVersionItems.toString()}
// releaseExecuteTip is generated FROM web/release-panel.ts below (app-wide
// interactivity audit v2, web-msm66jlc-gm4oom) — its real compiled source
// via .toString(), not a hand-retyped copy. It can no longer drift apart.
${releaseExecuteTip.toString()}
// releaseMaturityOf is generated FROM release/maturity.ts below (operator
// ask, 2026-09-04: the ritual should KNOW an 0.x is an alpha) — its real
// compiled source via .toString(), not a hand-retyped copy. It can no
// longer drift apart from the server's own --prerelease decision.
${releaseMaturityOf.toString()}
function renderReleaseBody(body, release, pid) {
  body.replaceChildren();
  if (!release || !release.currentVersion) {
    body.appendChild(el('p', 'muted', 'Release preview unavailable.'));
    return;
  }
  if (!release.tagName) {
    body.appendChild(el('p', 'muted', 'No release tags yet — nothing to diff the next release against.'));
    return;
  }
  if (!release.plan || !release.plan.ok) {
    body.appendChild(el('p', 'muted', 'No release-worthy commits since ' + release.tagName + '.'));
    return;
  }
  var line = el('p', 'release-line');
  var versionItems = releaseVersionItems(release.currentVersion, release.plan);
  for (var vi = 0; vi < versionItems.length; vi++) {
    line.appendChild(tipChip(versionItems[vi][0], versionItems[vi][1], versionItems[vi][2], versionItems[vi][3]));
  }
  body.appendChild(line);

  var milestoneRow = el('div', 'release-milestone');
  var milestoneLabelId = 'release-milestone-' + pid;
  var milestoneLabel = el('label', null, 'Milestone tag (optional)');
  milestoneLabel.setAttribute('for', milestoneLabelId);
  var milestoneInput = document.createElement('input');
  milestoneInput.type = 'text';
  milestoneInput.id = milestoneLabelId;
  milestoneInput.className = 'release-milestone-input';
  milestoneInput.placeholder = 'm4';
  milestoneInput.setAttribute('pattern', '^m\\d+$');
  milestoneInput.autocomplete = 'off';
  var milestoneTip = 'Only when this release completes a milestone’s DoD — tags m<N> at the same commit as v' + release.plan.version;
  milestoneInput.setAttribute('data-tip', milestoneTip);
  milestoneInput.setAttribute('aria-label', 'Milestone tag, optional — ' + milestoneTip);
  milestoneRow.appendChild(milestoneLabel);
  milestoneRow.appendChild(milestoneInput);
  body.appendChild(milestoneRow);

  // GitHub Release publish leg (epic 0006 slice 3, board web-mss4lpwl-z0w495):
  // explicit opt-in checkbox, off by default — same confirm-guarded-second-
  // choice pattern as the project page's "Make public instead" checkbox for
  // GitHub sync. Only meaningful once this project already has a GitHub
  // remote (the "Sync to GitHub" section); a project without one gets a
  // non-fatal refusal note instead of a silent no-op.
  var ghReleaseLabel = document.createElement('label');
  ghReleaseLabel.className = 'release-ghrelease';
  var ghReleaseCheckbox = document.createElement('input');
  ghReleaseCheckbox.type = 'checkbox';
  ghReleaseCheckbox.className = 'release-ghrelease-checkbox';
  var ghReleaseTip = 'Pushes the new v' + release.plan.version + ' tag and runs gh release create — requires this project to already have a GitHub remote configured, and gh installed + authenticated.';
  ghReleaseCheckbox.setAttribute('data-tip', ghReleaseTip);
  ghReleaseCheckbox.setAttribute('aria-label', 'Also publish as a GitHub Release — ' + ghReleaseTip);
  ghReleaseLabel.appendChild(ghReleaseCheckbox);
  ghReleaseLabel.appendChild(document.createTextNode(' Also publish as a GitHub Release'));
  body.appendChild(ghReleaseLabel);

  // RELEASE PHASE (release/maturity.ts, spliced above): the ritual detects
  // the phase from the version itself — 0.x is an alpha per SemVer §4, a
  // -beta/-rc suffix names its own phase — and publishes pre-releases with
  // GitHub's --prerelease badge so an alpha is never crowned "Latest". The
  // select lets the operator override; Auto stays the default and the hint
  // spells out the detection so it is never a silent guess. The label and
  // the five option texts are tr()'d (board github-4) — the raw phase id
  // ('alpha'/'beta'/…) never leaks into a translated sentence, so Auto's
  // "detected: {phase}" substitutes the translated label, not the id.
  var detected = releaseMaturityOf(release.plan.version);
  var maturityRow = el('div', 'release-maturity');
  var maturityId = 'release-maturity-' + pid;
  var maturityLabel = el('label', null, tr('releaseMaturityLabel'));
  maturityLabel.setAttribute('for', maturityId);
  var maturitySelect = document.createElement('select');
  maturitySelect.id = maturityId;
  maturitySelect.className = 'release-maturity-select';
  var maturityPhaseLabels = {
    alpha: tr('releaseMaturityAlpha'),
    beta: tr('releaseMaturityBeta'),
    rc: tr('releaseMaturityRc'),
    stable: tr('releaseMaturityStable'),
  };
  var maturityChoices = [
    ['auto', tr('releaseMaturityAutoTemplate', { phase: maturityPhaseLabels[detected.phase] })],
    ['alpha', maturityPhaseLabels.alpha],
    ['beta', maturityPhaseLabels.beta],
    ['rc', maturityPhaseLabels.rc],
    ['stable', maturityPhaseLabels.stable],
  ];
  for (var mc = 0; mc < maturityChoices.length; mc++) {
    var maturityOpt = document.createElement('option');
    maturityOpt.value = maturityChoices[mc][0];
    maturityOpt.textContent = maturityChoices[mc][1];
    maturitySelect.appendChild(maturityOpt);
  }
  var maturityTip = 'A pre-release phase publishes with GitHub’s Pre-release badge and is never marked Latest. Auto: ' + detected.reasoning;
  maturitySelect.setAttribute('data-tip', maturityTip);
  maturitySelect.setAttribute('aria-label', tr('releaseMaturityLabel') + ' — ' + maturityTip);
  maturityRow.appendChild(maturityLabel);
  maturityRow.appendChild(maturitySelect);
  body.appendChild(maturityRow);
  body.appendChild(el('p', 'release-maturity-hint', maturityPhaseLabels[detected.phase] + ' — ' + detected.reasoning));

  var actions = el('div', 'release-actions');
  var execBtn = document.createElement('button');
  execBtn.type = 'button';
  execBtn.className = 'release-execute';
  execBtn.textContent = '🚀 Cut release v' + release.plan.version;
  execBtn.setAttribute('data-release-execute', pid);
  var execTip = releaseExecuteTip(release.plan.version);
  execBtn.setAttribute('data-tip', execTip);
  execBtn.setAttribute('aria-label', execTip);
  actions.appendChild(execBtn);
  body.appendChild(actions);
  body.appendChild(el('div', 'release-result'));
}
function releaseSection(pid) {
  var wrap = el('section', 'release-panel');
  var title = el('h3', 'release-title', '🚀 Next release');
  title.setAttribute('data-i18n', 'releaseTitle');
  wrap.appendChild(title);
  var body = el('div', 'release-body');
  body.appendChild(el('p', 'muted', 'Checking for release-worthy commits…'));
  wrap.appendChild(body);
  fetch('/api/release?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { release: null }; })
    .then(function (data) {
      if (!body.isConnected) return;
      renderReleaseBody(body, data && data.release, pid);
    })
    .catch(function () {
      if (!body.isConnected) return;
      body.replaceChildren(el('p', 'muted', 'Release preview unavailable.'));
    });
  return wrap;
}
// EXECUTE the release (event-delegated so it survives card re-renders).
// Confirms first — this bumps package.json, cuts the CHANGELOG, and creates
// a real git commit + tag. Same result-in-place pattern as landing execute
// above (no alert()); a success re-fetches the RELEASE panel via refresh()
// so it reflects the new "no release-worthy commits since v<new>" state.
// releaseExecuteResult is generated FROM web/release-panel.ts below (epic
// 0002 "shell decomposition", slice 2, forty-first cut) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${releaseExecuteResult.toString()}
// releaseConfirmMessage is generated FROM web/release-panel.ts below (epic
// 0002 "shell decomposition", slice 2, eighty-second cut) — its real
// compiled source via .toString(), not a hand-retyped copy. It can no
// longer drift apart.
${releaseConfirmMessage.toString()}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-release-execute]');
  if (!b) return;
  var pid = b.getAttribute('data-release-execute');
  var panel = b.closest('.release-panel');
  var milestoneInput = panel && panel.querySelector('.release-milestone-input');
  var milestoneTag = milestoneInput ? milestoneInput.value.trim() : '';
  var ghReleaseInput = panel && panel.querySelector('.release-ghrelease-checkbox');
  var ghRelease = !!(ghReleaseInput && ghReleaseInput.checked);
  var maturitySelectEl = panel && panel.querySelector('.release-maturity-select');
  var maturity = maturitySelectEl ? maturitySelectEl.value : 'auto';
  var resultEl = b.parentElement && b.parentElement.nextElementSibling;
  if (!window.confirm(releaseConfirmMessage(milestoneTag, ghRelease))) return;
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = 'Releasing…';
  var payload = { project: pid };
  if (milestoneTag) payload.milestoneTag = milestoneTag;
  if (ghRelease) payload.ghRelease = true;
  if (maturity && maturity !== 'auto') payload.maturity = maturity;
  fetch('/api/release/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      b.disabled = false;
      b.textContent = originalText;
      if (!resultEl) return;
      var result = releaseExecuteResult(r.data);
      resultEl.className = result.className;
      resultEl.textContent = result.text;
      if (r.data && r.data.ok) refresh();
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'release-result release-result-fail';
        resultEl.textContent = '✗ Request failed — try again shortly.';
      }
    });
});
`.trim();
}
