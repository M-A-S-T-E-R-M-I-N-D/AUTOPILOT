// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Notifications channel's client-written strings (board
 * web-msnsndki-dz3vn1): `notifyInit()`'s three control tips — the enable
 * toggle and the two quiet-hours time inputs — were tagged with a hardcoded
 * English `data-tip` and no `data-i18n-tip` twin, so a locale switch never
 * reached them even though `translateDom()`'s `[data-i18n-tip]` sweep (the
 * exact route the fly-bar/live-worker-card tips already use) would happily
 * repaint them. The permission-blocked hint and the "not supported" hint
 * (`setNotifyHint(...)`, `#notify-hint`'s textContent) are written at event
 * time — a permission-change callback, a one-time capability check — not a
 * persistent attribute `translateDom()` visits, so `tr()` at call time is the
 * right fix, the same reasoning the CONNECT popover's status lines followed
 * (`connect-i18n.test.ts`). `client-tr-keys.test.ts` resolves the two `tr()`
 * keys asserted here against `STRINGS.en`; this file pins the `data-i18n-tip`
 * hand-off and checks every key exists in both locales with real (non-English)
 * Hebrew text.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { notificationsJs } from '../../src/web/features/notifications.js';

describe('the Notifications channel reads its control tips and hints from STRINGS', () => {
  const out = notificationsJs();

  it('tags the enable toggle and both quiet-hours inputs with data-i18n-tip, English default intact', () => {
    expect(out).toContain(
      "enableEl.setAttribute('data-tip', 'Asks the browser for permission, then notifies when a project needs you, hits an anomaly, or lands.');",
    );
    expect(out).toContain("enableEl.setAttribute('data-i18n-tip', 'notifyEnableTip');");
    expect(out).toContain(
      "startEl.setAttribute('data-tip', 'Start of the daily quiet window — popups are suppressed, the dashboard chip still updates.');",
    );
    expect(out).toContain("startEl.setAttribute('data-i18n-tip', 'notifyQuietStartTip');");
    expect(out).toContain(
      "endEl.setAttribute('data-tip', 'End of the daily quiet window — popups resume after this time.');",
    );
    expect(out).toContain("endEl.setAttribute('data-i18n-tip', 'notifyQuietEndTip');");
  });

  it('reads the permission-blocked hint from STRINGS at call time, not a hardcoded literal', () => {
    expect(out).toContain("return tr('notifyBlockedHint');");
    expect(out).not.toMatch(/return ['"]Blocked by your browser/);
  });

  it('reads the "not supported" hint from STRINGS at call time, not a hardcoded literal', () => {
    expect(out).toContain("setNotifyHint(tr('notifyUnsupportedHint'));");
    expect(out).not.toMatch(/setNotifyHint\(['"]Notifications are not supported/);
  });

  const keys: StringKey[] = [
    'notifyEnableTip',
    'notifyQuietStartTip',
    'notifyQuietEndTip',
    'notifyBlockedHint',
    'notifyUnsupportedHint',
  ];

  it('every new key exists in every locale', () => {
    for (const key of keys) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale], `${locale}.${key}`).toHaveProperty(key);
        expect(STRINGS[locale][key], `${locale}.${key} is empty`).toBeTruthy();
      }
    }
  });

  it('the Hebrew table actually translates rather than mirroring English', () => {
    for (const key of keys) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
    }
  });
});
