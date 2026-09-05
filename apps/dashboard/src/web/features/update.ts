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
  function pollUntilBack() {
    // The server is restarting onto the new build — wait for the API to
    // answer again, then reload so this page runs the new bundle.
    var timer = setInterval(function () {
      fetch('/api/update-check', { headers: { accept: 'application/json' } })
        .then(function (r) { if (r.ok) { clearInterval(timer); location.reload(); } })
        .catch(function () {});
    }, 3000);
  }
  function runUpdate(check, strategy) {
    showProgress();
    var payload = strategy ? { strategy: strategy } : {};
    fetch('/api/update/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        var d = res.data || {};
        if (res.status === 200 && d.restarting) { pollUntilBack(); return; }
        if (res.status === 200) { banner.hidden = true; return; }
        if (d.reason === 'dirty' && !strategy) {
          // Local progress exists — the server refused by design. Only an
          // explicit operator confirm sends the stash strategy.
          if (window.confirm(tr('updateDirtyPrompt'))) { runUpdate(check, 'stash'); return; }
          paintBanner(check);
          return;
        }
        showRefused(d.details || d.error || ('HTTP ' + res.status));
      })
      .catch(function () { showRefused('network'); });
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
`.trim();
}
