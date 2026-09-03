// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the Notifications
 * controls — the enable toggle and the two quiet-hours time inputs — carried
 * no [data-tip], yet each has a real, non-obvious consequence: the toggle
 * fires the browser's permission prompt the moment it is checked, and the
 * quiet-hours window silently suppresses popups while the dashboard chip
 * keeps updating. Hover/focus should say so BEFORE the click, same as the
 * CONNECT popover buttons. Tips are set at runtime from `notifyInit()` (not
 * in the shell markup) so the change stays inside the feature module. Same
 * generated-text assertion style as `connect-tooltips.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { notificationsJs } from '../../src/web/features/notifications.js';

describe('the Notifications controls explain themselves on hover/focus', () => {
  const out = notificationsJs();

  it('tips the enable toggle with the permission prompt and what triggers a popup', () => {
    expect(out).toContain(
      "enableEl.setAttribute('data-tip', 'Asks the browser for permission, then notifies when a project needs you, hits an anomaly, or lands.');",
    );
  });

  it('tips quiet-hours start as suppressing popups without losing the chip', () => {
    expect(out).toContain(
      "startEl.setAttribute('data-tip', 'Start of the daily quiet window — popups are suppressed, the dashboard chip still updates.');",
    );
  });

  it('tips quiet-hours end with when popups resume', () => {
    expect(out).toContain(
      "endEl.setAttribute('data-tip', 'End of the daily quiet window — popups resume after this time.');",
    );
  });
});
