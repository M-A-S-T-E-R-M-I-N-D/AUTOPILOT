// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the CONNECT
 * popover's five action buttons — "Log in with Claude", "Test connection",
 * "Save & verify", the GitHub "Check for updates", and "Open GitHub issue" —
 * carried no [data-tip], while the popover's connection dot already explains
 * itself (`connectStatusMeta`'s dotTip). Each button's click has real,
 * non-obvious consequences (opens a terminal, spends a billed claude call,
 * stores a credential, files a real upstream issue), so hover/focus should
 * say so BEFORE the click.
 *
 * i18n (board web-msnsndki-dz3vn1): each tip is now a STRINGS key rather
 * than an English literal — `setTip()` writes `tr(key)` AND tags
 * `data-i18n-tip`, the same two-part contract `fly.ts`'s `setTip()` uses.
 * The tag matters here for a different reason than the fly bar's: this
 * module rides the deferred `/panels.js` chunk, which executes after core's
 * `tr()` exists but BEFORE `locale-data.ts` (last in that same chunk) widens
 * `STRINGS` with the non-English tables, so a saved Hebrew locale reads
 * English at init and settles into Hebrew on locale-data's own re-sweep.
 * Same generated-text assertion style as `fly-tooltips-i18n.test.ts`;
 * `client-tr-keys.test.ts` resolves every key asserted here against STRINGS.
 */

import { describe, it, expect } from 'vitest';
import { connectJs } from '../../src/web/features/connect.js';

describe('the CONNECT popover buttons explain themselves on hover/focus, in the active locale', () => {
  const out = connectJs();

  it('defines setTip writing both the translated tip and the data-i18n-tip resweep tag', () => {
    expect(out).toContain('function setTip(target, key) {');
    expect(out).toContain('target.dataset.i18nTip = key;');
    expect(out).toContain("target.setAttribute('data-tip', tr(key));");
  });

  it('tips "Log in with Claude" with the terminal-then-paste flow it starts', () => {
    expect(out).toContain("setTip(loginBtn, 'connectLoginTip');");
    expect(out).not.toContain("'Opens a terminal running Claude login");
  });

  it('tips "Test connection" as a real (not cached) claude call', () => {
    expect(out).toContain("setTip(testBtn, 'connectTestTip');");
    expect(out).not.toContain("'Verifies the saved credentials");
  });

  it('tips "Save & verify" with where the credential goes', () => {
    expect(out).toContain("setTip(saveBtn, 'connectSaveTip');");
    expect(out).not.toContain("'Saves the credential locally");
  });

  it('tips the GitHub "Check for updates" with what it compares', () => {
    expect(out).toContain("setTip(ghLtsCheckBtn, 'ghLtsCheckTip');");
    expect(out).not.toContain("'Fetches the latest release from GitHub");
  });

  it('tips "Open GitHub issue" as a confirmed real gh call, never silent', () => {
    expect(out).toContain("setTip(ghIssueBtn, 'ghIssueTip');");
    expect(out).not.toContain("'Files a real GitHub issue");
  });
});
