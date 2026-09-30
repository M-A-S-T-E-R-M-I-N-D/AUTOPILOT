// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Notifications channel client
 * (`web/features/notifications.ts`, board web-msnsndlk-exw3t9), following
 * the exact `locale.test.ts`/`connect.test.ts` pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import {
  parseNotifySettings,
  isQuietHour,
  activeNotifyKeys,
  newNotifyEvents,
} from '../../../src/web/notifications.js';
import { notificationsJs } from '../../../src/web/features/notifications.js';

describe('notificationsJs', () => {
  it('embeds parseNotifySettings/isQuietHour/activeNotifyKeys/newNotifyEvents real compiled source via .toString()', () => {
    const out = notificationsJs();
    expect(out).toContain(parseNotifySettings.toString());
    expect(out).toContain(isQuietHour.toString());
    expect(out).toContain(activeNotifyKeys.toString());
    expect(out).toContain(newNotifyEvents.toString());
  });

  it('persists settings under the ap-notify-settings localStorage key', () => {
    const out = notificationsJs();
    expect(out).toContain("var NOTIFY_SETTINGS_KEY = 'ap-notify-settings';");
    expect(out).toContain('localStorage.getItem(NOTIFY_SETTINGS_KEY)');
    expect(out).toContain('localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(settings))');
  });

  it('disables the toggle and hints when the browser has no Notification API', () => {
    const out = notificationsJs();
    expect(out).toContain("if (typeof Notification === 'undefined') {");
    expect(out).toContain('enableEl.disabled = true;');
    expect(out).toContain("setNotifyHint(tr('notifyUnsupportedHint'));");
  });

  it('requests permission only when the checkbox is turned ON, never on load', () => {
    const out = notificationsJs();
    expect(out).toContain('Notification.requestPermission().then(function (perm) {');
    expect(out).toContain("enableEl.addEventListener('change', function () {");
  });

  it('reflects checkbox state off the granted permission, not just the stored intent', () => {
    const out = notificationsJs();
    expect(out).toContain(
      "enableEl.checked = settings.enabled && Notification.permission === 'granted';",
    );
  });

  it('saves quiet-hours changes without disturbing the enabled flag', () => {
    const out = notificationsJs();
    expect(out).toContain('function saveQuietHours() {');
    expect(out).toContain('var current = loadNotifySettings();');
    expect(out).toContain(
      'saveNotifySettings({ enabled: current.enabled, quietStart: startEl.value, quietEnd: endEl.value });',
    );
  });

  it('defines maybeNotifyFleet as a hoisted top-level function, called by name (not stored) by shell.ts', () => {
    const out = notificationsJs();
    expect(out).toContain('function maybeNotifyFleet(projects) {');
  });

  it('never fires when the Notification API is missing', () => {
    const out = notificationsJs();
    expect(out).toContain("if (typeof Notification === 'undefined') return;");
  });

  it('skips firing (but still refreshes the seen set) when disabled or permission is not granted', () => {
    const out = notificationsJs();
    expect(out).toContain("if (!settings.enabled || Notification.permission !== 'granted') {");
    expect(out).toContain('notifySeenKeys = activeNotifyKeys(list);');
  });

  it('skips firing during the configured quiet-hours window', () => {
    const out = notificationsJs();
    expect(out).toContain('if (isQuietHour(now.getHours() * 60 + now.getMinutes(), settings)) {');
  });

  it('tags each Notification with its dedupe key so the OS can coalesce repeats', () => {
    const out = notificationsJs();
    expect(out).toContain(
      'new Notification(events[i].title, { body: events[i].body, tag: events[i].key });',
    );
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = notificationsJs();
    expect(out).toBe(out.trim());
  });
});

// Chrome on Android exposes `Notification` and can report permission
// 'granted', yet its page-context constructor throws "Illegal constructor"
// (only ServiceWorkerRegistration.showNotification works there). The toggle
// then looks on while no popup ever appears — so the failure must reach the
// operator, not vanish into an empty catch.
describe('maybeNotifyFleet when the browser refuses to construct a Notification', () => {
  const needsYou = (id: string) => ({ id, name: id, status: 'needs_you', anomalies: [] });
  let attempts = 0;

  beforeEach(() => {
    attempts = 0;
    document.body.innerHTML = '<p id="notify-hint" role="status" aria-live="polite"></p>';
    localStorage.setItem(
      'ap-notify-settings',
      JSON.stringify({ enabled: true, quietStart: '', quietEnd: '' }),
    );
    vi.stubGlobal('tr', (key: StringKey) => STRINGS.en[key]);
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'granted';
        constructor() {
          attempts++;
          throw new TypeError('Illegal constructor');
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  /** Boots the real generated client text; its function declarations are
   *  locals of the Function body, so `maybeNotifyFleet` is handed out. */
  function boot(): (projects: readonly unknown[]) => void {
    const out: { maybeNotifyFleet?: (projects: readonly unknown[]) => void } = {};
    new Function('out', `${notificationsJs()}\nout.maybeNotifyFleet = maybeNotifyFleet;`)(out);
    if (!out.maybeNotifyFleet) throw new Error('maybeNotifyFleet was not defined');
    return out.maybeNotifyFleet;
  }

  it('says so in the notify hint and logs the cause instead of failing silently', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const maybeNotifyFleet = boot();

    expect(() => maybeNotifyFleet([needsYou('p1')])).not.toThrow();

    expect(document.getElementById('notify-hint')?.textContent).toBe(STRINGS.en.notifyFailedHint);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Notification'),
      expect.any(TypeError),
    );
  });

  it('stops at the first refusal instead of retrying every event in the same tick', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const maybeNotifyFleet = boot();

    maybeNotifyFleet([needsYou('p1'), needsYou('p2'), needsYou('p3')]);

    expect(attempts).toBe(1);
  });

  it('does not re-attempt the failed event on the next tick', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const maybeNotifyFleet = boot();

    maybeNotifyFleet([needsYou('p1')]);
    maybeNotifyFleet([needsYou('p1')]);

    expect(attempts).toBe(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});
