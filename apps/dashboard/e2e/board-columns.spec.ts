// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { skipFirstRunTour, setTheme } from './helpers.js';
import { POPULATED_BASE_URL, POPULATED_NOW } from './playwright.config.js';

/**
 * THE BOARD AS COLUMNS (epic 0021 slice 9) — desktop project only. At 1280px
 * (lg and up) the Board subject lays its one task list out as three columns
 * by status through CSS grid; this proves in a real browser what jsdom
 * cannot: rows of different statuses sit in different columns, the DOM
 * order is untouched, and the remembered toggle turns it back into a list.
 */
test.describe('app shell — the board as columns', () => {
  test('rows sit in a column by status while the list order stays; the toggle is remembered', async ({
    page,
  }) => {
    await skipFirstRunTour(page);
    await setTheme(page, 'dark');
    await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
    await page.goto(`${POPULATED_BASE_URL}/p/demo-checkout-web`);
    await page.clock.runFor(3000);
    await expect(page.locator('main#fleet')).toHaveClass(/project-mode/);
    await page.locator('[data-subject-link="board"]').click();
    await expect(page.locator('main#fleet .task-add')).toBeVisible({ timeout: 20_000 });

    const card = page.locator('[data-board-view]');
    // Columns show FLOW (2026-09-12): the fixture's rows all sit in one status
    // group, so "auto" reads as a list here and the toggle offers Columns —
    // thirty queued rows beside two empty lanes was a list squeezed to a
    // third of the width. Forcing columns still places every row by status.
    await expect(card).toHaveAttribute('data-board-view', 'list');
    await expect(page.locator('.board-columns')).toBeHidden();
    const toggle = page.locator('[data-board-view-toggle]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(card).toHaveAttribute('data-board-view', 'columns');
    await expect(page.locator('.board-columns')).toBeVisible();

    // Every row's left edge is its status column's head: the fixture may hold
    // one task or ten, of any status — the law is the same for each.
    const heads = page.locator('.board-column-head');
    await expect(heads).toHaveCount(3);
    const headX = [0, 1, 2].map(async (i) => (await heads.nth(i).boundingBox())!.x);
    const columnX = await Promise.all(headX);
    expect(new Set(columnX.map((x) => Math.round(x))).size).toBe(3);
    const rows = page.locator('.tasks > .task');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    const columnOf = (status: string): number =>
      status === 'queued' ? 0 : status === 'in_progress' || status === 'needs_approval' ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const status = (await row.getAttribute('data-task-status')) ?? '';
      const box = (await row.boundingBox())!;
      expect(Math.abs(box.x - columnX[columnOf(status)]!), status).toBeLessThan(2);
    }

    // The toggle back: List, remembered across a reload.
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(card).toHaveAttribute('data-board-view', 'list');
    await expect(page.locator('.board-columns')).toBeHidden();
    const listX = new Set<number>();
    for (let i = 0; i < count; i++) listX.add(Math.round((await rows.nth(i).boundingBox())!.x));
    expect(listX.size).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('ap-board-view'))).toBe('list');
  });
});
