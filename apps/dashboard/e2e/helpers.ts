// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { Page } from '@playwright/test';

/** Same key `apps/dashboard/src/web/shell.ts` (`TOUR_SEEN_KEY`) checks before
 *  auto-opening the first-run tour for a genuinely fresh (empty) profile —
 *  the fixture every e2e spec boots. Pre-seeding it keeps specs focused on
 *  their own subject instead of the tour dialog (which has its own dedicated
 *  axe-core coverage in test/web/a11y.test.ts). */
export async function skipFirstRunTour(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem('ap-tour-seen', '1'));
}

/** Same key `switcherJs()` (`apps/dashboard/src/web/shell.ts`) reads on load —
 *  pre-seeding it selects a theme before first paint instead of racing a
 *  click against the external script that applies it. */
export async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.addInitScript((t) => window.localStorage.setItem('ap-theme', t), theme);
}
