// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The OVER-THE-AIR UPDATE banner client (operator ask, 2026-09-05) — a
 * sticky strip above the masthead that appears only when `GET
 * /api/update-check` reports a newer released version than the running one,
 * with a one-click, progress-preserving update:
 *
 * - "Update now" POSTs `/api/update/execute`; a `dirty` refusal (local
 *   progress!) turns into an explicit confirm for the stash strategy — the
 *   server never touches uncommitted work without this exact opt-in, and
 *   `git stash pop` brings it back afterwards (the server's reply says so).
 * - On success the server restarts onto the new build; the client polls
 *   until the API answers again, then reloads the page.
 * - "Later" dismisses for the session (per offered version, so the banner
 *   returns when the NEXT release lands).
 *
 * Same self-init, CSP-clean, `tr()`-localized shape as every other
 * `web/features/` module; `discoverFeatureModules` finds `updateJs` the
 * same way it finds `publicity.ts`'s export.
 */

/** The update banner client — vanilla, external (keeps CSP script-src 'self'). */
export function updateJs(): string {
  return `
// Shared by the banner and the version menu (both call these as hoisted
// declarations of the same served script): the restart poller and the one
// update runner, each surface handing in its own painters.
function pollUntilBack() {
  // The server is restarting onto the new build — wait for the API to
  // answer again, then reload so this page runs the new bundle.
  var timer = setInterval(function () {
    fetch('/api/update-check', { headers: { accept: 'application/json' } })
      .then(function (r) { if (r.ok) { clearInterval(timer); location.reload(); } })
      .catch(function () {});
  }, 3000);
}
// One update runner for both surfaces — the banner and the version menu
// — each handing in its own painters (progress / refused / idle).
function runUpdateWith(check, strategy, ui) {
  ui.progress();
  var payload = strategy ? { strategy: strategy } : {};
  ritualFetch('update', '/api/update/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
    .then(function (res) {
      var d = res.data || {};
      if (res.status === 200 && d.restarting) { pollUntilBack(); return; }
      if (res.status === 200) { ui.idle(check, d); return; }
      if (d.reason === 'dirty' && strategy !== 'stash' && strategy !== 'stash+rebuild') {
        // Local progress exists — the server refused by design. Only an
        // explicit operator confirm sends the stash strategy.
        if (window.confirm(tr('updateDirtyPrompt'))) {
          runUpdateWith(check, strategy === 'rebuild' ? 'stash+rebuild' : 'stash', ui);
          return;
        }
        ui.idle(check, d);
        return;
      }
      ui.refused(d.details || d.error || ('HTTP ' + res.status));
    })
    .catch(function () { ui.refused('network'); });
}
function updateInit() {
  var banner = document.getElementById('update-banner');
  if (!banner) return;
  var UPDATE_DISMISS_KEY = 'ap-update-dismissed';
  function paintBanner(check) {
    banner.replaceChildren();
    var text = el('span', 'update-banner-text', tr('updateBannerText', { from: check.current, to: check.latest }));
    var goBtn = el('button', 'update-banner-go', tr('updateNow'));
    goBtn.type = 'button';
    var laterBtn = el('button', 'update-banner-later', tr('updateLater'));
    laterBtn.type = 'button';
    banner.appendChild(text);
    banner.appendChild(goBtn);
    banner.appendChild(laterBtn);
    banner.hidden = false;
    laterBtn.addEventListener('click', function () {
      try { sessionStorage.setItem(UPDATE_DISMISS_KEY, check.latest); } catch {}
      banner.hidden = true;
    });
    goBtn.addEventListener('click', function () { runUpdate(check, null); });
  }
  function showProgress() {
    banner.replaceChildren();
    banner.appendChild(el('span', 'update-banner-text', tr('updateInProgress')));
    banner.hidden = false;
  }
  function showRefused(details) {
    banner.replaceChildren();
    banner.appendChild(el('span', 'update-banner-text', tr('updateRefused') + details));
    var retry = el('button', 'update-banner-go', tr('updateNow'));
    retry.type = 'button';
    retry.addEventListener('click', function () { updateInit(); });
    banner.appendChild(retry);
    banner.hidden = false;
  }
  function runUpdate(check, strategy) {
    runUpdateWith(check, strategy, {
      progress: showProgress,
      refused: showRefused,
      idle: function () { banner.hidden = true; },
    });
  }
  fetch('/api/update-check', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (check) {
      if (!check || !check.updateAvailable) return;
      var dismissed = null;
      try { dismissed = sessionStorage.getItem(UPDATE_DISMISS_KEY); } catch {}
      if (dismissed === check.latest) return;
      paintBanner(check);
    })
    .catch(function () {});
}
updateInit();
// THE VERSION MENU (operator, 2026-09-13: "make sure my dashboard shows the
// latest version, and that I have a button to reset and always run the
// latest"): the masthead chip reads v<current> from the build itself; the
// popover reports the newest release from the check, and "Run the latest"
// pulls, reinstalls, rebuilds and restarts — with the rebuild strategy when
// the checkout is already current, so the button is also a clean reset.
function versionInit() {
  var menu = document.getElementById('version-menu');
  var status = document.getElementById('version-status');
  var runBtn = document.getElementById('version-run');
  var checkBtn = document.getElementById('version-check');
  if (!menu || !status || !runBtn || !checkBtn) return;
  var lastCheck = null;
  function fmtClock(ms) {
    var d = new Date(ms);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function paintCheck(check) {
    lastCheck = check;
    var available = !!(check && check.updateAvailable);
    var dotState = available ? 'available' : (check ? 'current' : 'unknown');
    if (menu.getAttribute('data-update') !== dotState) menu.setAttribute('data-update', dotState);
    var text = !check
      ? tr('versionUnknown')
      : available
        ? tr('versionAvailable', { from: check.current, to: check.latest })
        : tr('versionLatest', { version: check.current, time: fmtClock(check.checkedAt) });
    if (status.textContent !== text) status.textContent = text;
    var label = available ? tr('versionRunUpdate', { to: check.latest }) : tr('versionRunLatest');
    if (runBtn.textContent !== label) runBtn.textContent = label;
  }
  function load(force) {
    checkBtn.disabled = true;
    fetch('/api/update-check' + (force ? '?force=1' : ''), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (check) { paintCheck(check); })
      .catch(function () { paintCheck(null); })
      .then(function () { checkBtn.disabled = false; });
  }
  var ui = {
    progress: function () {
      runBtn.disabled = true;
      status.textContent = tr('updateInProgress');
    },
    refused: function (details) {
      runBtn.disabled = false;
      status.textContent = tr('updateRefused') + details;
    },
    idle: function (check, d) {
      runBtn.disabled = false;
      status.textContent = (d && d.details) || tr('versionUpToDate');
    },
  };
  runBtn.addEventListener('click', function () {
    var available = !!(lastCheck && lastCheck.updateAvailable);
    runUpdateWith(lastCheck || { current: '', latest: '' }, available ? null : 'rebuild', ui);
  });
  checkBtn.addEventListener('click', function () { load(true); });
  menu.addEventListener('toggle', function () { if (menu.open && !lastCheck) load(false); });
  load(false);
}
versionInit();
`.trim();
}
