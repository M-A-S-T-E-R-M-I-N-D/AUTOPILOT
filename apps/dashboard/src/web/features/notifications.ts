// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Notifications channel client (backlog H, board web-msnsndlk-exw3t9):
 * an opt-in browser Notification for a project that goes needs-you, hits a
 * death-cluster anomaly, or lands (a green gate-then-merge, manual or
 * automatic), with a quiet-hours window that suppresses the popup without
 * losing the underlying dashboard chip. Follows
 * the exact `flights.ts`/`fly.ts` split: `parseNotifySettings`/`isQuietHour`/
 * `activeNotifyKeys`/`newNotifyEvents` are generated FROM `web/notifications.ts`
 * below — their real compiled source via `.toString()`, not a hand-retyped
 * copy. `discoverFeatureModules('web/features')` finds this file's
 * `notificationsJs` export the same way it finds every other feature
 * module's.
 *
 * `maybeNotifyFleet` is a hoisted top-level `function` (not a `const`) so
 * `web/shell.ts`'s `renderFleet()` can call it even though this module's
 * text is concatenated AFTER `fleetJs()`'s in `clientJs()` — the same
 * hoisting contract `translateDom`/`syncSearchProjects` already rely on,
 * since every feature module and `fleetJs()` share one global scope once the
 * browser runs the concatenated bundle.
 *
 * Out of scope (needs a Service Worker + Push API this repo has none of yet
 * — a materially larger addition, not a small one): true closed-tab
 * delivery. The tab must still be open for `maybeNotifyFleet` to run at all.
 */
import {
  parseNotifySettings,
  minutesOf,
  isQuietHour,
  latestLanded,
  activeNotifyKeys,
  newNotifyEvents,
} from '../notifications.js';

/** The Notifications channel client — vanilla, external (keeps CSP script-src 'self'). */
export function notificationsJs(): string {
  return `
${parseNotifySettings.toString()}
${minutesOf.toString()}
${isQuietHour.toString()}
${latestLanded.toString()}
${activeNotifyKeys.toString()}
${newNotifyEvents.toString()}
var NOTIFY_SETTINGS_KEY = 'ap-notify-settings';
function loadNotifySettings() {
  try { return parseNotifySettings(localStorage.getItem(NOTIFY_SETTINGS_KEY)); } catch { return parseNotifySettings(null); }
}
function saveNotifySettings(settings) {
  try { localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}
function notifyPermissionHint() {
  return 'Blocked by your browser — check this site’s notification permission.';
}
function setNotifyHint(text) {
  var hint = document.getElementById('notify-hint');
  if (hint) hint.textContent = text || '';
}
function notifyInit() {
  var enableEl = document.getElementById('notify-enable');
  var startEl = document.getElementById('notify-quiet-start');
  var endEl = document.getElementById('notify-quiet-end');
  if (!enableEl || !startEl || !endEl) return;
  // App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the toggle fires
  // the browser's permission prompt the moment it is checked, and the
  // quiet-hours window silently suppresses popups while the dashboard chip
  // keeps updating — real, non-obvious consequences worth stating on
  // hover/focus BEFORE the click, like the CONNECT popover buttons do.
  enableEl.setAttribute('data-tip', 'Asks the browser for permission, then notifies when a project needs you, hits an anomaly, or lands.');
  startEl.setAttribute('data-tip', 'Start of the daily quiet window — popups are suppressed, the dashboard chip still updates.');
  endEl.setAttribute('data-tip', 'End of the daily quiet window — popups resume after this time.');
  var settings = loadNotifySettings();
  startEl.value = settings.quietStart;
  endEl.value = settings.quietEnd;
  if (typeof Notification === 'undefined') {
    enableEl.disabled = true;
    setNotifyHint('Notifications are not supported in this browser.');
    return;
  }
  enableEl.checked = settings.enabled && Notification.permission === 'granted';
  if (settings.enabled && Notification.permission === 'denied') setNotifyHint(notifyPermissionHint());
  enableEl.addEventListener('change', function () {
    if (!enableEl.checked) {
      saveNotifySettings({ enabled: false, quietStart: startEl.value, quietEnd: endEl.value });
      setNotifyHint('');
      return;
    }
    Notification.requestPermission().then(function (perm) {
      var granted = perm === 'granted';
      enableEl.checked = granted;
      saveNotifySettings({ enabled: granted, quietStart: startEl.value, quietEnd: endEl.value });
      setNotifyHint(granted ? '' : notifyPermissionHint());
    });
  });
  function saveQuietHours() {
    var current = loadNotifySettings();
    saveNotifySettings({ enabled: current.enabled, quietStart: startEl.value, quietEnd: endEl.value });
  }
  startEl.addEventListener('change', saveQuietHours);
  endEl.addEventListener('change', saveQuietHours);
}
notifyInit();
// Every dedupe key active as of the LAST tick this actually evaluated —
// updated every call (even while disabled/quiet) so re-enabling or a quiet
// window ending never dumps a backlog of stale "catch up" notifications for
// conditions that started while notifications were off.
var notifySeenKeys = new Set();
function maybeNotifyFleet(projects) {
  if (typeof Notification === 'undefined') return;
  var list = projects || [];
  var settings = loadNotifySettings();
  if (!settings.enabled || Notification.permission !== 'granted') {
    notifySeenKeys = activeNotifyKeys(list);
    return;
  }
  var now = new Date();
  if (isQuietHour(now.getHours() * 60 + now.getMinutes(), settings)) {
    notifySeenKeys = activeNotifyKeys(list);
    return;
  }
  var events = newNotifyEvents(list, notifySeenKeys);
  for (var i = 0; i < events.length; i++) {
    try { new Notification(events[i].title, { body: events[i].body, tag: events[i].key }); } catch (err) {}
  }
  notifySeenKeys = activeNotifyKeys(list);
}
`.trim();
}
