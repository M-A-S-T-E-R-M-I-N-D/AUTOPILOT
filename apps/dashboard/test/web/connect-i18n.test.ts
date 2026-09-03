// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The CONNECT popover's client-written status lines (board
 * web-msnsndki-dz3vn1): every message `connect.ts` itself paints into
 * #connect-status / #gh-status / #gh-lts / #gh-issue-result — the fetch
 * failure fallbacks ("connection unavailable", "GitHub: unavailable",
 * "LTS: unavailable"), the in-progress lines ("testing…", "saving…",
 * "launching Claude login…", "checking for updates…", "opening…") and the
 * failure lines after them — was an English literal. All of it is written at
 * event time (a click or a fetch callback), not swept by `translateDom()`,
 * so `tr()` at write time is the right fix, the same reasoning the fly bar's
 * status line followed (fly-status-i18n.test.ts). The spliced
 * `connectModeMeta`/`connectStatusMeta`/`connectTestResultMeta`/
 * `ghStatusMeta`/`ghLtsMeta` helpers and the GitHub-issue pair
 * (`githubIssueConfirmMessage`/`githubIssueExecuteResult`; all in
 * `web/connect-panel.ts`, own tests) compose their sentences through an
 * injected `tr` — the route `flightProgressOf` took — because they stay
 * spliced into the bundle via `.toString()` and cannot import a translator;
 * the second block below pins that hand-off at each call site and the keys
 * the spliced source reads.
 * Messages the SERVER sends back (res.message, the status description, the
 * LTS chip text, the test detail) stay as-is by the same server-message
 * stance every prior slice took. `client-tr-keys.test.ts` resolves every
 * key asserted here against STRINGS.
 */

import { describe, it, expect } from 'vitest';
import { connectJs } from '../../src/web/features/connect.js';

describe('the CONNECT popover reads its client-written status lines from STRINGS', () => {
  const out = connectJs();

  it('translates the three fetch-failure fallbacks', () => {
    expect(out).toContain("if (statusEl) statusEl.textContent = tr('connectionUnavailable');");
    expect(out).toContain("if (ghStatusEl) ghStatusEl.textContent = tr('ghUnavailable');");
    const lts = out.match(/if \(ghLtsEl\) ghLtsEl\.textContent = tr\('ltsUnavailable'\);/g) ?? [];
    // Both the init-time GET and the click-time POST share one key.
    expect(lts).toHaveLength(2);
    expect(out).not.toContain("ghLtsEl.textContent = 'LTS: unavailable'");
    expect(out).not.toContain("statusEl.textContent = 'connection unavailable'");
  });

  it('translates the "Check for updates" in-progress line', () => {
    expect(out).toContain("if (ghLtsEl) ghLtsEl.textContent = tr('ltsChecking');");
    expect(out).not.toContain("ghLtsEl.textContent = 'checking for updates…'");
  });

  it('translates the GitHub-issue opening and request-failed lines', () => {
    expect(out).toContain("ghIssueResult.textContent = tr('ghIssueOpening');");
    expect(out).toContain("ghIssueResult.textContent = tr('ghIssueRequestFailed');");
    expect(out).not.toContain("'✗ request failed.'");
  });

  it('translates the Test connection flow', () => {
    expect(out).toContain("if (statusEl) statusEl.textContent = tr('connectTesting');");
    expect(out).toContain("if (statusEl) statusEl.textContent = tr('connectTestFailed');");
    expect(out).not.toContain("'testing (a real claude call)...'");
  });

  it('translates the Log in with Claude flow, keeping the server message when there is one', () => {
    expect(out).toContain("if (statusEl) statusEl.textContent = tr('connectLaunchingLogin');");
    expect(out).toContain(
      "statusEl.textContent = (res && res.message) ? res.message : tr('connectTerminalOpened');",
    );
    expect(out).toContain("if (statusEl) statusEl.textContent = tr('connectLoginLaunchFailed');");
    expect(out).not.toContain("'launching Claude login...'");
    expect(out).not.toContain("'could not launch login'");
  });

  it('translates the Save & verify flow, templating the server error into the locale sentence', () => {
    expect(out).toContain("if (statusEl) statusEl.textContent = tr('connectSaving');");
    expect(out).toContain(
      "statusEl.textContent = tr('connectSaveError', { error: (res.j && res.j.error) ? res.j.error : tr('connectSaveErrorGeneric') });",
    );
    expect(out).toContain("if (statusEl) statusEl.textContent = tr('connectSaveFailed');");
    expect(out).not.toContain("'saving...'");
    expect(out).not.toContain("'error: ' +");
  });
});

describe('the spliced connect-panel helpers compose their sentences through the injected tr', () => {
  const out = connectJs();

  it('hands the bundle tr() to every spliced helper at each call site', () => {
    expect(out).toContain('var m = connectModeMeta(mode, tr);');
    expect(out).toContain('var m = connectStatusMeta(s, tr);');
    expect(out).toContain('var m = connectTestResultMeta(p, tr);');
    expect(out).toContain('var m = ghStatusMeta(s, tr);');
    // Both the init-time GET and the click-time POST paint through one route.
    expect(out.match(/paintLts\(ghLtsMeta\(s, tr\)\);/g) ?? []).toHaveLength(2);
    // The GitHub-issue pair: the confirm dialog and the result line.
    expect(out).toContain('if (!window.confirm(githubIssueConfirmMessage(title, tr))) return;');
    expect(out).toContain('var m = githubIssueExecuteResult(res.j, tr);');
  });

  // Spliced source is compiler output, so its quote style is not ours to pin.
  const reads = (key: string): RegExp => new RegExp(`\\btr\\(["']${key}["']`);

  it('reads the credential field copy from STRINGS', () => {
    expect(out).toMatch(reads('authModeApiKey'));
    expect(out).toMatch(reads('connectApiKeyHint'));
    expect(out).toMatch(reads('connectOauthTokenLabel'));
    expect(out).toMatch(reads('connectTokenPlaceholder'));
    expect(out).toMatch(reads('connectOauthTokenHint'));
    expect(out).toMatch(reads('connectSubscriptionHint'));
    expect(out).not.toMatch(/["']Stored locally \(0600\)/);
    expect(out).not.toMatch(/["']Subscription OAuth token["']/);
  });

  it('reads the status heads, CLI clauses, toggle labels and dot aria-label from STRINGS', () => {
    expect(out).toMatch(reads('connectStatusLine'));
    expect(out).toMatch(reads('connectHeadCliMissing'));
    expect(out).toMatch(reads('connectHeadNotLoggedIn'));
    expect(out).toMatch(reads('connectHeadNoCredential'));
    expect(out).toMatch(reads('connectHeadUnavailable'));
    expect(out).toMatch(reads('connectCliVersion'));
    expect(out).toMatch(reads('connectCliNotFound'));
    expect(out).toMatch(reads('cliVersionFound'));
    expect(out).toMatch(reads('connectDotAria'));
    expect(out).toMatch(reads('connectDotTipUnavailable'));
    expect(out).toMatch(reads('connected'));
    expect(out).toMatch(reads('connect'));
    expect(out).not.toMatch(/["']CLI missing["']/);
    expect(out).not.toMatch(/["']claude CLI not found["']/);
    expect(out).not.toMatch(/["']Claude connection: /);
  });

  it('reads the Test-connection verdicts from STRINGS', () => {
    expect(out).toMatch(reads('connectTestVerified'));
    expect(out).toMatch(reads('connectTestNotAuthenticated'));
    expect(out).toMatch(reads('connectTestStatusLine'));
    expect(out).toMatch(reads('connectDotAriaVerified'));
    expect(out).toMatch(reads('connectDotAriaNotAuthenticated'));
    expect(out).not.toMatch(/["']Verified connected["']/);
  });

  it('reads the GitHub status lines and their next-command hints from STRINGS', () => {
    expect(out).toMatch(reads('ghCliNotFound'));
    expect(out).toMatch(reads('ghInstallHint'));
    expect(out).toMatch(reads('ghNotLoggedIn'));
    expect(out).toMatch(reads('ghLoginHint'));
    expect(out).toMatch(reads('ghConnectedAs'));
    expect(out).toMatch(reads('ghLoginUnknown'));
    expect(out).toMatch(reads('ghLogoutHint'));
    expect(out).not.toMatch(/gh auth login["']/);
    expect(out).not.toMatch(/["']GitHub: connected as /);
  });

  it('reads the LTS chip status tips from STRINGS', () => {
    expect(out).toMatch(reads('ltsTipUpToDate'));
    expect(out).toMatch(reads('ltsTipUpdateAvailable'));
    expect(out).toMatch(reads('ltsTipAhead'));
    expect(out).toMatch(reads('ltsTipUnknown'));
    expect(out).not.toContain('no update needed.');
    expect(out).not.toContain('No successful check yet');
  });

  it('reads the GitHub-issue confirm text and result fallbacks from STRINGS', () => {
    expect(out).toMatch(reads('ghIssueConfirm'));
    expect(out).toMatch(reads('ghIssueOpened'));
    expect(out).toMatch(reads('ghIssueOpenFailed'));
    expect(out).not.toMatch(/["']Open a GitHub issue titled/);
    expect(out).not.toMatch(/["']issue opened\.["']/);
    expect(out).not.toMatch(/["']failed to open issue\.["']/);
  });
});
