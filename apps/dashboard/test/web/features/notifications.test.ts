// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Notifications channel client
 * (`web/features/notifications.ts`, board web-msnsndlk-exw3t9), following
 * the exact `locale.test.ts`/`connect.test.ts` pattern.
 */

import { describe, it, expect } from 'vitest';
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
    expect(out).toContain("setNotifyHint('Notifications are not supported in this browser.');");
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
