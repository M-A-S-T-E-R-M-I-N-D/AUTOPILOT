// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0017 nav remake, slice 1/5 (board web-mtq019pd-rj8dsn): before the
 * masthead collapses into an icon cluster with per-domain popover menus
 * (theme, language, connect, notify), this test pins every control it
 * currently exposes — one assertion group per id/function — so slices 2-5
 * fail loudly the instant a redesign drops one instead of relocating it.
 * Deliberately markup-level (ids, aria, data-i18n keys), not visual: the
 * redesign is free to change HOW a control looks or where it lives, never
 * WHETHER it still exists and stays wired to the same behavior.
 */

import { describe, it, expect } from 'vitest';
import { renderShell } from '../../src/web/shell.js';

function mastheadHtml(): string {
  const html = renderShell();
  const start = html.indexOf('<header class="masthead">');
  const end = html.indexOf('</header>', start) + '</header>'.length;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

describe('masthead census (EPIC 0017 slice 1/5) — pins every existing control before the redesign', () => {
  const masthead = mastheadHtml();

  it('renders the brand mark and product name', () => {
    expect(masthead).toContain('class="brand"');
    expect(masthead).toContain('class="brand-mark"');
    expect(masthead).toContain('AUTOPILOT');
  });

  it('renders the live connection-status text', () => {
    expect(masthead).toContain('id="updated"');
    expect(masthead).toContain('role="status"');
    expect(masthead).toContain('data-i18n="updatedConnecting"');
  });

  it('renders the OTLP export indicator chip, hidden until configured', () => {
    expect(masthead).toContain('id="otlp-chip"');
    expect(masthead).toContain('data-i18n-tip="otlpExportTip"');
    expect(masthead).toContain('data-i18n-aria="otlpExportConfigured"');
  });

  it('renders the Connect popover toggle and its status dot/label', () => {
    expect(masthead).toContain('id="connect"');
    expect(masthead).toContain('id="connect-summary"');
    expect(masthead).toContain('id="conn-dot"');
    expect(masthead).toContain('id="connect-label"');
    expect(masthead).toContain('data-i18n="connect"');
  });

  it('renders the Connect panel status line and login/test actions', () => {
    expect(masthead).toContain('id="connect-status"');
    expect(masthead).toContain('id="connect-login"');
    expect(masthead).toContain('data-i18n="loginClaude"');
    expect(masthead).toContain('id="connect-test"');
    expect(masthead).toContain('data-i18n="testConnection"');
  });

  it('renders the Connect credential form (mode select, secret field, save)', () => {
    expect(masthead).toContain('id="connect-form"');
    expect(masthead).toContain('id="connect-mode"');
    expect(masthead).toContain('value="subscription"');
    expect(masthead).toContain('value="api-key"');
    expect(masthead).toContain('value="oauth-token"');
    expect(masthead).toContain('id="connect-secret-label"');
    expect(masthead).toContain('id="connect-secret"');
    expect(masthead).toContain('data-i18n="saveVerify"');
    expect(masthead).toContain('id="connect-hint"');
  });

  it('renders the GitHub connection status, update check, and issue-report form', () => {
    expect(masthead).toContain('id="gh-status"');
    expect(masthead).toContain('id="gh-hint"');
    expect(masthead).toContain('id="gh-lts"');
    expect(masthead).toContain('id="gh-lts-check"');
    expect(masthead).toContain('data-i18n="checkForUpdates"');
    expect(masthead).toContain('id="gh-issue-form"');
    expect(masthead).toContain('id="gh-issue-note"');
    expect(masthead).toContain('id="gh-issue-compose"');
    expect(masthead).toContain('id="gh-issue-compose-status"');
    expect(masthead).toContain('id="gh-issue-title"');
    expect(masthead).toContain('id="gh-issue-body"');
    expect(masthead).toContain('data-i18n="openGithubIssue"');
    expect(masthead).toContain('id="gh-issue-result"');
  });

  it('renders the theme switcher as its own labeled nav landmark', () => {
    expect(masthead).toContain('aria-label="Theme"');
    expect(masthead).toContain('data-i18n-aria="themeNav"');
  });

  it('renders the language switcher as its own labeled nav landmark', () => {
    expect(masthead).toContain('aria-label="Language"');
    expect(masthead).toContain('data-i18n-aria="languageNav"');
  });

  it('renders the notification settings popover (enable toggle + quiet hours)', () => {
    expect(masthead).toContain('id="notify"');
    expect(masthead).toContain('id="notify-summary"');
    expect(masthead).toContain('data-i18n-tip="notifySettingsTip"');
    expect(masthead).toContain('id="notify-enable"');
    expect(masthead).toContain('data-i18n="notifyEnable"');
    expect(masthead).toContain('id="notify-quiet-start"');
    expect(masthead).toContain('id="notify-quiet-end"');
    expect(masthead).toContain('id="notify-hint"');
  });

  it('renders the guided-tour launcher', () => {
    expect(masthead).toContain('id="tour-btn"');
    expect(masthead).toContain('aria-haspopup="dialog"');
    expect(masthead).toContain('data-i18n="tour"');
  });
});
