// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The masthead is the one surface on screen in every locale before any
 * other content loads, so it is the first real per-string translation slice
 * (board web-msnsndki-dz3vn1, follow-on to the locale foundation) — every
 * `data-i18n` key `renderShell()` tags must have a matching `STRINGS` entry,
 * or `features/locale.ts`'s `applyLocale()` silently leaves the English text
 * in place when a reader switches to Hebrew.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS, type StringKey } from '@autopilot/tokens';
import { renderShell } from '../../src/web/shell.js';

function i18nKeysIn(html: string): StringKey[] {
  return [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1] as StringKey);
}

describe('renderShell masthead i18n wiring', () => {
  it('tags the always-visible masthead chrome with data-i18n', () => {
    const html = renderShell();
    for (const key of ['skipToFleet', 'connect', 'loginClaude', 'testConnection', 'tour']) {
      expect(html).toContain(`data-i18n="${key}"`);
    }
  });

  it('tags the masthead Connect panel (auth form) with data-i18n', () => {
    const html = renderShell();
    for (const key of [
      'claudeAuthLabel',
      'authModeSubscription',
      'authModeApiKey',
      'authModeOauthToken',
      'credentialLabel',
      'saveVerify',
    ]) {
      expect(html).toContain(`data-i18n="${key}"`);
    }
  });

  it('tags the Theme/Language switcher navs with data-i18n-aria', () => {
    const html = renderShell();
    expect(html).toContain('aria-label="Theme" data-i18n-aria="themeNav"');
    expect(html).toContain('aria-label="Language" data-i18n-aria="languageNav"');
  });

  it('tags the flightbar ("Fly a folder" form) with data-i18n', () => {
    const html = renderShell();
    for (const key of [
      'flyFolder',
      'browse',
      'byCount',
      'byTotal',
      'firings',
      'stopAtTotal',
      'perFiringBudget',
      'lanes',
      'flyIt',
      'pause',
      'stop',
    ]) {
      expect(html).toContain(`data-i18n="${key}"`);
    }
    expect(html).toContain('aria-label="Fly a folder" data-i18n-aria="flyFolder"');
  });

  it('tags the flightbar budget-mode select and active-flights group with data-i18n-aria', () => {
    const html = renderShell();
    expect(html).toContain(
      'aria-label="Budget mode: fixed firing count or total spend target" data-i18n-aria="budgetMode"',
    );
    expect(html).toContain('aria-label="Active flights" data-i18n-aria="activeFlights"');
  });

  it("tags the flightbar's 🍀 I'm-feeling-lucky calibrator button with data-i18n-aria", () => {
    const html = renderShell();
    expect(html).toContain(
      'aria-label="I\'m feeling lucky — probe this machine and fill a calibrated launch" data-i18n-aria="flyLuckyAria"',
    );
  });

  it('tags the flightbar budget-mode visually-hidden label with data-i18n', () => {
    const html = renderShell();
    expect(html).toContain(
      '<label for="fly-mode" class="visually-hidden" data-i18n="budgetModeLabel">Budget mode</label>',
    );
  });

  it('tags the OTLP masthead chip with data-i18n-tip and data-i18n-aria', () => {
    const html = renderShell();
    expect(html).toContain(
      'data-i18n-tip="otlpExportTip" aria-label="OTLP export: configured" data-i18n-aria="otlpExportConfigured"',
    );
  });

  it('tags the masthead tour button with data-i18n-tip', () => {
    const html = renderShell();
    expect(html).toContain('data-tip="A short guided tour: firing, slice, gate, flight"');
    expect(html).toContain('data-i18n-tip="tourTip" data-i18n="tour"');
  });

  it('tags the fly-bar browse button with data-i18n-tip', () => {
    const html = renderShell();
    expect(html).toContain('data-tip="Browse the filesystem to pick a folder"');
    expect(html).toContain('data-i18n-tip="flyBrowseTip" data-i18n="browse"');
  });

  it('tags the searchbar ("Search a project" / "Ask" form) with data-i18n', () => {
    const html = renderShell();
    for (const key of ['search', 'deep', 'ask']) {
      expect(html).toContain(`data-i18n="${key}"`);
    }
    expect(html).toContain('aria-label="Search a project" data-i18n-aria="searchProject"');
    expect(html).toContain(
      'aria-label="Search query or question" data-i18n-aria="searchQueryAria"',
    );
    expect(html).toContain('aria-label="Ask persona" data-i18n-aria="askPersona"');
  });

  it('tags the searchbar Search/Deep/Ask/persona data-tips with data-i18n-tip', () => {
    // The five static data-tips the searchbar renders were the last
    // renderShell() hover texts left as English literals after the fly-bar,
    // masthead, and tour-button tip slices.
    const html = renderShell();
    expect(html).toContain('data-i18n="search" data-i18n-tip="searchTip" data-tip="');
    expect(html).toContain('class="ask-deep-label" data-i18n-tip="askDeepTip" data-tip="');
    expect(html).toContain('data-i18n="ask" data-i18n-tip="askTip" data-tip="');
    expect(html).toContain('data-i18n="personaGenius" data-i18n-tip="personaGeniusTip" data-tip="');
    expect(html).toContain(
      'data-i18n="personaArchitect" data-i18n-tip="personaArchitectTip" data-tip="',
    );
  });

  it('tags the search input placeholder with data-i18n-placeholder', () => {
    const html = renderShell();
    expect(html).toContain(
      'placeholder="find code — or ask a question…" data-i18n-placeholder="searchPlaceholder"',
    );
  });

  it('tags the fly-folder input placeholder with data-i18n-placeholder', () => {
    const html = renderShell();
    expect(html).toContain(
      'placeholder="absolute path to a git repo" data-i18n-placeholder="flyFolderPlaceholder"',
    );
  });

  it('tags the masthead notify (quiet hours) panel with data-i18n', () => {
    const html = renderShell();
    expect(html).toContain(
      'data-i18n-tip="notifySettingsTip" aria-label="Notification settings" data-i18n-aria="notifySettings"',
    );
    expect(html).toContain('data-i18n="notifyEnable"');
    expect(html).toContain(
      '<label for="notify-quiet-start" data-i18n="quietHours">Quiet hours</label>',
    );
    expect(html).toContain('aria-label="Quiet hours start" data-i18n-aria="quietHoursStart"');
    expect(html).toContain('aria-label="Quiet hours end" data-i18n-aria="quietHoursEnd"');
  });

  it('tags the masthead "Report a bug" GitHub-issue form with data-i18n', () => {
    const html = renderShell();
    expect(html).toContain(
      '<label for="gh-issue-title" data-i18n="reportBugLabel">Report a bug or request a feature upstream</label>',
    );
    expect(html).toContain('placeholder="Title" data-i18n-placeholder="titlePlaceholder"');
    expect(html).toContain(
      'placeholder="Details (optional)" data-i18n-placeholder="detailsOptionalPlaceholder"',
    );
    expect(html).toContain('data-i18n="openGithubIssue">Open GitHub issue</button>');
  });

  it('tags the Fleet section landmarks (totals/live-workers/stat-tiles/pr-review-panel/main) with data-i18n', () => {
    const html = renderShell();
    expect(html).toContain('aria-label="Fleet summary" data-i18n-aria="fleetSummary"');
    expect(html).toContain('aria-label="Who\'s flying now" data-i18n-aria="liveWorkers"');
    expect(html).toContain('aria-label="Fleet performance" data-i18n-aria="fleetPerformance"');
    expect(html).toContain('aria-label="KEEPER PR review" data-i18n-aria="keeperPrReview"');
    expect(html).toContain('aria-label="Fleet" data-i18n-aria="fleetMain"');
    expect(html).toContain('data-i18n="connectingFleet"');
  });

  it('tags the "Check for updates" button and fleet-wisdom section with data-i18n', () => {
    const html = renderShell();
    expect(html).toContain(
      'id="gh-lts-check" data-i18n="checkForUpdates">Check for updates</button>',
    );
    expect(html).toContain(
      'aria-label="Fleet wisdom proposal" data-i18n-aria="fleetWisdomProposal"',
    );
  });

  it('tags the ask-persona GENIUS/ARCHITECT buttons with data-i18n', () => {
    const html = renderShell();
    expect(html).toContain(
      '<button type="button" data-persona-btn="genius" aria-pressed="true" data-i18n="personaGenius" data-i18n-tip="personaGeniusTip" data-tip="Read-only persona (default): answers questions but never touches the dashboard.">GENIUS</button>',
    );
    expect(html).toContain(
      '<button type="button" data-persona-btn="architect" aria-pressed="false" data-i18n="personaArchitect" data-i18n-tip="personaArchitectTip" data-tip="Can propose dashboard actions for you to approve — opt-in per session, resets to GENIUS on reload.">ARCHITECT</button>',
    );
  });

  it('tags the initial connection-status placeholders (masthead + CONNECT popover) with data-i18n', () => {
    // These are the FIRST-PAINT strings shown before connect.ts's fetches
    // resolve and overwrite them via tr() (connect-i18n.test.ts covers that
    // later, event-time text) — until now they were plain English literals,
    // so a Hebrew reader saw untranslated text for the gap between page load
    // and the first status response.
    const html = renderShell();
    expect(html).toContain(
      'id="updated" role="status" aria-live="polite" data-i18n="updatedConnecting">connecting…</span>',
    );
    expect(html).toContain(
      'id="connect-status" role="status" aria-live="polite" data-i18n="connectCheckingConnection">checking connection…</p>',
    );
    expect(html).toContain(
      'id="gh-status" role="status" aria-live="polite" data-i18n="ghChecking">checking GitHub…</p>',
    );
    expect(html).toContain(
      'id="gh-lts" role="status" aria-live="polite" data-i18n="ltsChecking">checking for updates…</p>',
    );
  });

  it('every data-i18n key in the rendered shell has a STRINGS entry in every locale', () => {
    const keys = i18nKeysIn(renderShell());
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key]).toBeTruthy();
      }
    }
  });

  it('every data-i18n-aria key in the rendered shell has a STRINGS entry in every locale', () => {
    const html = renderShell();
    const keys = [...html.matchAll(/data-i18n-aria="([^"]+)"/g)].map((m) => m[1] as StringKey);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key]).toBeTruthy();
      }
    }
  });

  it('every data-i18n-placeholder key in the rendered shell has a STRINGS entry in every locale', () => {
    const html = renderShell();
    const keys = [...html.matchAll(/data-i18n-placeholder="([^"]+)"/g)].map(
      (m) => m[1] as StringKey,
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key]).toBeTruthy();
      }
    }
  });

  it('every data-i18n-tip key in the rendered shell has a STRINGS entry in every locale', () => {
    const html = renderShell();
    const keys = [...html.matchAll(/data-i18n-tip="([^"]+)"/g)].map((m) => m[1] as StringKey);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      for (const locale of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
        expect(STRINGS[locale][key]).toBeTruthy();
      }
    }
  });
});
