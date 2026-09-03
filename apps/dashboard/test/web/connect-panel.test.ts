// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the CONNECT popover's per-auth-mode copy math
 * (`web/connect-panel.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2, forty-fourth cut. No test, direct or indirect,
 * ever exercised `meta(mode)`'s show/label/placeholder/hint values before
 * this — `connect-body-m3-surface.test.ts` only asserts the popover's CSS.
 *
 * `connectStatusMeta` (fifty-second cut) gets the same treatment: no test,
 * direct or indirect, ever exercised `render(s)`'s status-line text/class,
 * connection-dot class, or toggle-label branching before this — a true
 * zero-coverage gap.
 *
 * `connectTestResultMeta` (eighty-first cut) gets the same treatment: no
 * test, direct or indirect, ever exercised the "Test" button's click
 * handler's status-line text/class, connection-dot class, or toggle-label
 * branching before this — a true zero-coverage gap.
 *
 * i18n (board web-msnsndki-dz3vn1): every helper that composes a sentence
 * now takes the bundle's `tr()` as its last parameter, the injection route
 * `flightProgressOf` took — the helpers stay spliced into `/app.js` via
 * `.toString()`, so they can no longer import a translator than a
 * formatter. Every English assertion below passes a STRINGS.en-backed
 * translator and is byte-for-byte what the old literals produced; the
 * Hebrew cases prove the numbers, versions, logins and server-sent
 * descriptions land where each locale's template puts them.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import {
  connectModeMeta,
  connectStatusMeta,
  connectTestResultMeta,
  ghStatusMeta,
  ghLtsMeta,
  githubIssueConfirmMessage,
  githubIssueExecuteResult,
  type ConnectPanelTranslator,
} from '../../src/web/connect-panel.js';

/** A translator over one real STRINGS table, substituting `{name}` slots the
 *  way the bundle's `tr()` (`web/features/locale.ts`) does. */
function translatorFor(locale: 'en' | 'he'): ConnectPanelTranslator {
  return (key, subs) => {
    const text: string = STRINGS[locale][key];
    if (!subs) return text;
    return Object.keys(subs).reduce((t, k) => t.split('{' + k + '}').join(String(subs[k])), text);
  };
}
const trEn = translatorFor('en');
const trHe = translatorFor('he');

describe('connectModeMeta', () => {
  it('shows a secret input for api-key mode', () => {
    const meta = connectModeMeta('api-key', trEn);

    expect(meta.show).toBe(true);
    expect(meta.label).toBe('API key');
    expect(meta.ph).toBe('sk-ant-...');
    expect(meta.hint).toBe('Stored locally (0600), never shown again.');
  });

  it('shows a secret input for oauth-token mode', () => {
    const meta = connectModeMeta('oauth-token', trEn);

    expect(meta.show).toBe(true);
    expect(meta.label).toBe('Subscription OAuth token');
    expect(meta.ph).toBe('paste token');
    expect(meta.hint).toBe('Generate with: claude setup-token');
  });

  it('hides the secret input for subscription mode', () => {
    const meta = connectModeMeta('subscription', trEn);

    expect(meta.show).toBe(false);
    expect(meta.label).toBe('');
    expect(meta.ph).toBe('');
    expect(meta.hint).toBe('Log in once in a terminal: run claude, then /login.');
  });

  it('falls back to the subscription hint for an unknown mode', () => {
    const meta = connectModeMeta('bogus', trEn);

    expect(meta.show).toBe(false);
    expect(meta.hint).toBe('Log in once in a terminal: run claude, then /login.');
  });

  it('reads the label, placeholder and hint from the injected locale table', () => {
    const apiKey = connectModeMeta('api-key', trHe);
    expect(apiKey.label).toBe(STRINGS.he.authModeApiKey);
    expect(apiKey.hint).toBe(STRINGS.he.connectApiKeyHint);
    // The key prefix is a format, not prose — it stays Latin in every locale.
    expect(apiKey.ph).toBe('sk-ant-...');

    const token = connectModeMeta('oauth-token', trHe);
    expect(token.label).toBe(STRINGS.he.connectOauthTokenLabel);
    expect(token.ph).toBe(STRINGS.he.connectTokenPlaceholder);
    expect(token.hint).toBe(STRINGS.he.connectOauthTokenHint);

    expect(connectModeMeta('subscription', trHe).hint).toBe(STRINGS.he.connectSubscriptionHint);
  });
});

describe('connectStatusMeta', () => {
  it('reports the connected state when ready with the CLI present', () => {
    const meta = connectStatusMeta(
      {
        mode: 'subscription',
        ready: true,
        cliPresent: true,
        cliVersion: '2.1.0',
        description: 'Logged in via subscription',
      },
      trEn,
    );

    expect(meta.statusText).toBe('Connected - Logged in via subscription - claude 2.1.0');
    expect(meta.statusClass).toBe('connect-status connect-ok');
    expect(meta.dotClass).toBe('conn-dot on');
    expect(meta.labelText).toBe('Connected');
    expect(meta.dotTip).toBe('Connected - Logged in via subscription - claude 2.1.0');
    expect(meta.dotAriaLabel).toBe('Claude connection: Connected');
  });

  it('reports CLI missing ahead of any other bad state', () => {
    const meta = connectStatusMeta(
      {
        mode: 'subscription',
        ready: false,
        cliPresent: false,
        cliVersion: null,
        description: 'No CLI on PATH',
      },
      trEn,
    );

    expect(meta.statusText).toBe('CLI missing - No CLI on PATH - claude CLI not found');
    expect(meta.statusClass).toBe('connect-status connect-bad');
    expect(meta.dotClass).toBe('conn-dot off');
    expect(meta.labelText).toBe('Connect');
    expect(meta.dotTip).toBe('CLI missing - No CLI on PATH - claude CLI not found');
    expect(meta.dotAriaLabel).toBe('Claude connection: CLI missing');
  });

  it('reports not logged in for subscription mode without a session', () => {
    const meta = connectStatusMeta(
      {
        mode: 'subscription',
        ready: false,
        cliPresent: true,
        cliVersion: '2.1.0',
        description: 'No subscription session',
      },
      trEn,
    );

    expect(meta.statusText).toBe('Not logged in - No subscription session - claude 2.1.0');
  });

  it('reports no credential for api-key/oauth-token modes without one stored', () => {
    const meta = connectStatusMeta(
      {
        mode: 'api-key',
        ready: false,
        cliPresent: true,
        cliVersion: '2.1.0',
        description: 'No API key stored',
      },
      trEn,
    );

    expect(meta.statusText).toBe('No credential - No API key stored - claude 2.1.0');
  });

  it('falls back to "found" when the CLI is present but reports no version', () => {
    const meta = connectStatusMeta(
      {
        mode: 'subscription',
        ready: true,
        cliPresent: true,
        cliVersion: null,
        description: 'Logged in',
      },
      trEn,
    );

    expect(meta.statusText).toBe('Connected - Logged in - claude found');
  });

  it('falls back to an unavailable display without overwriting statusClass for a null payload', () => {
    const meta = connectStatusMeta(null, trEn);

    expect(meta.statusText).toBe('connection unavailable');
    expect(meta.statusClass).toBeUndefined();
    expect(meta.dotClass).toBe('conn-dot off');
    expect(meta.labelText).toBe('Connect');
    expect(meta.dotTip).toBe('Claude connection status unavailable');
    expect(meta.dotAriaLabel).toBe('Claude connection: unavailable');
  });

  it('falls back to an unavailable display for a payload with a non-string mode', () => {
    const meta = connectStatusMeta(
      {
        mode: null,
        ready: true,
        cliPresent: true,
        cliVersion: '2.1.0',
        description: 'should be ignored',
      } as unknown as Parameters<typeof connectStatusMeta>[0],
      trEn,
    );

    expect(meta.statusText).toBe('connection unavailable');
    expect(meta.statusClass).toBeUndefined();
  });

  it('composes the status line, toggle label and dot aria-label from the injected locale table', () => {
    const meta = connectStatusMeta(
      {
        mode: 'subscription',
        ready: true,
        cliPresent: true,
        cliVersion: '2.1.0',
        description: 'Logged in via subscription',
      },
      trHe,
    );

    // The server-sent description and the CLI version land inside the
    // Hebrew template; the head and the "claude" clause come from the table.
    expect(meta.statusText).toBe('מחובר - Logged in via subscription - claude 2.1.0');
    expect(meta.labelText).toBe(STRINGS.he.connected);
    expect(meta.dotAriaLabel).toBe('חיבור Claude: מחובר');

    const missing = connectStatusMeta(
      { mode: 'subscription', ready: false, cliPresent: false, description: 'x' },
      trHe,
    );
    expect(missing.statusText).toBe(
      `${STRINGS.he.connectHeadCliMissing} - x - ${STRINGS.he.connectCliNotFound}`,
    );
    expect(missing.labelText).toBe(STRINGS.he.connect);

    const unavailable = connectStatusMeta(null, trHe);
    expect(unavailable.statusText).toBe(STRINGS.he.connectionUnavailable);
    expect(unavailable.dotTip).toBe(STRINGS.he.connectDotTipUnavailable);
    expect(unavailable.dotAriaLabel).toBe(`חיבור Claude: ${STRINGS.he.connectHeadUnavailable}`);
  });
});

describe('connectTestResultMeta', () => {
  it('reports verified-connected with the detail appended when authenticated', () => {
    const meta = connectTestResultMeta({ authenticated: true, detail: 'claude-3-5-sonnet' }, trEn);

    expect(meta.statusText).toBe('Verified connected - claude-3-5-sonnet');
    expect(meta.statusClass).toBe('connect-status connect-ok');
    expect(meta.dotClass).toBe('conn-dot on');
    expect(meta.labelText).toBe('Connected');
    expect(meta.dotTip).toBe('Verified connected - claude-3-5-sonnet');
    expect(meta.dotAriaLabel).toBe('Claude connection: verified connected');
  });

  it('reports not-authenticated with the failure detail appended when unauthenticated', () => {
    const meta = connectTestResultMeta(
      { authenticated: false, detail: 'error: auth failed' },
      trEn,
    );

    expect(meta.statusText).toBe('Not authenticated - error: auth failed');
    expect(meta.statusClass).toBe('connect-status connect-bad');
    expect(meta.dotClass).toBe('conn-dot off');
    expect(meta.labelText).toBe('Connect');
    expect(meta.dotTip).toBe('Not authenticated - error: auth failed');
    expect(meta.dotAriaLabel).toBe('Claude connection: not authenticated');
  });

  it('falls back to an empty detail when the payload omits one', () => {
    const meta = connectTestResultMeta({ authenticated: true }, trEn);

    expect(meta.statusText).toBe('Verified connected - ');
  });

  it('reports not-authenticated for a missing payload', () => {
    const meta = connectTestResultMeta(null, trEn);

    expect(meta.statusText).toBe('Not authenticated - ');
    expect(meta.statusClass).toBe('connect-status connect-bad');
    expect(meta.dotClass).toBe('conn-dot off');
    expect(meta.labelText).toBe('Connect');
  });

  it('composes the verdict line and dot aria-label from the injected locale table', () => {
    const ok = connectTestResultMeta({ authenticated: true, detail: 'claude-3-5-sonnet' }, trHe);
    expect(ok.statusText).toBe(`${STRINGS.he.connectTestVerified} - claude-3-5-sonnet`);
    expect(ok.labelText).toBe(STRINGS.he.connected);
    expect(ok.dotAriaLabel).toBe(STRINGS.he.connectDotAriaVerified);

    const bad = connectTestResultMeta({ authenticated: false, detail: 'error: auth failed' }, trHe);
    expect(bad.statusText).toBe(`${STRINGS.he.connectTestNotAuthenticated} - error: auth failed`);
    expect(bad.labelText).toBe(STRINGS.he.connect);
    expect(bad.dotAriaLabel).toBe(STRINGS.he.connectDotAriaNotAuthenticated);
  });
});

describe('ghStatusMeta', () => {
  it('reports the gh CLI missing with an install hint', () => {
    const meta = ghStatusMeta({ present: false, authenticated: false }, trEn);

    expect(meta.statusText).toBe('GitHub: gh CLI not found');
    expect(meta.hint).toBe('Optional — install the GitHub CLI to sync projects: cli.github.com');
  });

  it('reports installed-but-not-logged-in with a login hint, never running it', () => {
    const meta = ghStatusMeta({ present: true, version: '2.86.0', authenticated: false }, trEn);

    expect(meta.statusText).toBe('GitHub: gh 2.86.0, not logged in');
    expect(meta.hint).toBe('Log in yourself in a terminal: gh auth login');
  });

  it('falls back to "found" when present but no version is reported', () => {
    const meta = ghStatusMeta({ present: true, version: null, authenticated: false }, trEn);

    expect(meta.statusText).toBe('GitHub: gh found, not logged in');
  });

  it('reports connected-as-login with a logout hint when authenticated', () => {
    const meta = ghStatusMeta(
      {
        present: true,
        version: '2.86.0',
        authenticated: true,
        login: 'octocat',
      },
      trEn,
    );

    expect(meta.statusText).toBe('GitHub: connected as octocat');
    expect(meta.hint).toBe('Disconnect any time in a terminal: gh auth logout');
  });

  it('falls back to "unknown" when authenticated but the login could not be parsed', () => {
    const meta = ghStatusMeta(
      {
        present: true,
        version: '2.86.0',
        authenticated: true,
        login: null,
      },
      trEn,
    );

    expect(meta.statusText).toBe('GitHub: connected as unknown');
  });

  it('falls back to an unavailable display for a missing payload', () => {
    const meta = ghStatusMeta(null, trEn);

    expect(meta.statusText).toBe('GitHub: unavailable');
    expect(meta.hint).toBe('');
  });

  it('falls back to an unavailable display for a payload with a non-boolean present', () => {
    const meta = ghStatusMeta(
      {
        present: 'yes',
        authenticated: false,
      } as unknown as Parameters<typeof ghStatusMeta>[0],
      trEn,
    );

    expect(meta.statusText).toBe('GitHub: unavailable');
  });

  it('composes the GitHub status line and hint from the injected locale table', () => {
    const notLoggedIn = ghStatusMeta(
      { present: true, version: '2.86.0', authenticated: false },
      trHe,
    );
    // The version lands inside the Hebrew template, not appended after it.
    expect(notLoggedIn.statusText).toBe('GitHub: gh 2.86.0, לא בוצעה התחברות');
    expect(notLoggedIn.hint).toBe(STRINGS.he.ghLoginHint);

    const noVersion = ghStatusMeta({ present: true, version: null, authenticated: false }, trHe);
    expect(noVersion.statusText).toBe(`GitHub: gh ${STRINGS.he.cliVersionFound}, לא בוצעה התחברות`);

    const connected = ghStatusMeta(
      { present: true, version: '2.86.0', authenticated: true, login: 'octocat' },
      trHe,
    );
    expect(connected.statusText).toBe('GitHub: מחובר בתור octocat');
    expect(connected.hint).toBe(STRINGS.he.ghLogoutHint);

    const missing = ghStatusMeta({ present: false, authenticated: false }, trHe);
    expect(missing.statusText).toBe(STRINGS.he.ghCliNotFound);
    expect(missing.hint).toBe(STRINGS.he.ghInstallHint);

    expect(ghStatusMeta(null, trHe).statusText).toBe(STRINGS.he.ghUnavailable);
  });
});

describe('ghLtsMeta', () => {
  it('shows the chip text from a cached or freshly checked payload', () => {
    const meta = ghLtsMeta({ chip: { text: 'v0.14.0 available — you run v0.13.0' } }, trEn);

    expect(meta.statusText).toBe('v0.14.0 available — you run v0.13.0');
  });

  it('falls back to an unavailable display for a missing payload', () => {
    expect(ghLtsMeta(null, trEn).statusText).toBe('LTS: unavailable');
    expect(ghLtsMeta(undefined, trEn).statusText).toBe('LTS: unavailable');
  });

  it('falls back to an unavailable display when chip.text is not a string', () => {
    expect(ghLtsMeta({ chip: {} }, trEn).statusText).toBe('LTS: unavailable');
    expect(
      ghLtsMeta({ chip: { text: 42 } } as unknown as Parameters<typeof ghLtsMeta>[0], trEn)
        .statusText,
    ).toBe('LTS: unavailable');
  });

  it('tips each known status with what it means (interactivity audit v2)', () => {
    expect(
      ghLtsMeta({ chip: { text: 'up to date — v0.14.0', status: 'up-to-date' } }, trEn).statusTip,
    ).toBe('Running the latest GitHub Release — no update needed.');
    expect(
      ghLtsMeta(
        {
          chip: { text: 'v0.15.0 available — you run v0.14.0', status: 'update-available' },
        },
        trEn,
      ).statusTip,
    ).toContain('never updates itself');
    expect(
      ghLtsMeta(
        {
          chip: { text: 'you run v0.15.0 (ahead of upstream v0.14.0)', status: 'ahead' },
        },
        trEn,
      ).statusTip,
    ).toContain('ahead of the latest GitHub Release');
  });

  it('tips an unknown or missing status with how to run the first check', () => {
    const noCheckYet =
      'No successful check yet — click "Check for updates" to compare against the latest GitHub Release.';
    expect(
      ghLtsMeta({ chip: { text: 'you run v0.14.0', status: 'unknown' } }, trEn).statusTip,
    ).toBe(noCheckYet);
    expect(ghLtsMeta({ chip: { text: 'you run v0.14.0' } }, trEn).statusTip).toBe(noCheckYet);
    expect(ghLtsMeta(null, trEn).statusTip).toBe(noCheckYet);
  });

  it('reads the status tips from the injected locale table, keeping the server-sent chip text', () => {
    const upToDate = ghLtsMeta(
      { chip: { text: 'up to date — v0.14.0', status: 'up-to-date' } },
      trHe,
    );
    expect(upToDate.statusText).toBe('up to date — v0.14.0');
    expect(upToDate.statusTip).toBe(STRINGS.he.ltsTipUpToDate);
    expect(
      ghLtsMeta({ chip: { text: 'v0.15.0 available', status: 'update-available' } }, trHe)
        .statusTip,
    ).toBe(STRINGS.he.ltsTipUpdateAvailable);
    expect(ghLtsMeta({ chip: { text: 'you run v0.15.0', status: 'ahead' } }, trHe).statusTip).toBe(
      STRINGS.he.ltsTipAhead,
    );
    // The unknown tip names the "Check for updates" button by its own key's
    // wording, so the hint and the button never disagree in a locale.
    expect(ghLtsMeta(null, trHe).statusTip).toBe(STRINGS.he.ltsTipUnknown);
    expect(STRINGS.he.ltsTipUnknown).toContain(STRINGS.he.checkForUpdates);
    expect(ghLtsMeta(null, trHe).statusText).toBe(STRINGS.he.ltsUnavailable);
  });
});

describe('githubIssueConfirmMessage', () => {
  it('names the title and warns this runs a real gh issue create', () => {
    const msg = githubIssueConfirmMessage('flights crash on empty SOUL', trEn);
    expect(msg).toContain('flights crash on empty SOUL');
    expect(msg).toContain('gh issue create');
    expect(msg).toContain('cannot be undone');
  });

  it('is byte-for-byte the pre-i18n English literal', () => {
    expect(githubIssueConfirmMessage('a bug', trEn)).toBe(
      'Open a GitHub issue titled "a bug" against the upstream AUTOPILOT repo?\n\nThis runs a real `gh issue create` using your own authenticated gh. This cannot be undone by this dashboard.',
    );
  });

  it('lands the operator-typed title inside the injected locale template, untouched', () => {
    // A title is user input: braces and dollar signs must survive substitution.
    const title = 'crash on ${SOUL} with {braces}';
    expect(githubIssueConfirmMessage(title, trHe)).toBe(
      STRINGS.he.ghIssueConfirm.split('{title}').join(title),
    );
    expect(githubIssueConfirmMessage(title, trHe)).toContain('gh issue create');
    expect(githubIssueConfirmMessage(title, trHe)).not.toContain('Open a GitHub issue');
  });
});

describe('githubIssueExecuteResult', () => {
  it('reports success with a checkmark and the created issue URL', () => {
    const result = githubIssueExecuteResult(
      {
        ok: true,
        details: 'opening an issue against mastermind/autopilot: "a bug"',
        url: 'https://github.com/mastermind/autopilot/issues/1',
      },
      trEn,
    );
    expect(result.className).toBe('gh-issue-result gh-issue-result-ok');
    expect(result.text).toBe(
      '✓ opening an issue against mastermind/autopilot: "a bug" https://github.com/mastermind/autopilot/issues/1',
    );
  });

  it('reports success without a URL when the response carries none', () => {
    const result = githubIssueExecuteResult({ ok: true, details: 'opened' }, trEn);
    expect(result.text).toBe('✓ opened');
  });

  it('falls back to a generic success message when details are missing', () => {
    const result = githubIssueExecuteResult({ ok: true }, trEn);
    expect(result.className).toBe('gh-issue-result gh-issue-result-ok');
    expect(result.text).toBe('✓ issue opened.');
  });

  it('reports failure with an X and the server error/details', () => {
    const result = githubIssueExecuteResult({ ok: false, error: 'gh: not authenticated' }, trEn);
    expect(result.className).toBe('gh-issue-result gh-issue-result-fail');
    expect(result.text).toBe('✗ gh: not authenticated');
  });

  it('falls back to generic text for a missing/malformed payload', () => {
    expect(githubIssueExecuteResult(null, trEn).text).toBe('✗ failed to open issue.');
    expect(githubIssueExecuteResult(undefined, trEn).text).toBe('✗ failed to open issue.');
  });

  it('reads both generic fallbacks from the injected locale table, keeping server-sent text as sent', () => {
    expect(githubIssueExecuteResult({ ok: true }, trHe).text).toBe(`✓ ${STRINGS.he.ghIssueOpened}`);
    expect(githubIssueExecuteResult(null, trHe).text).toBe(`✗ ${STRINGS.he.ghIssueOpenFailed}`);
    // The server's own details/error and the URL slot in untranslated.
    expect(
      githubIssueExecuteResult(
        { ok: true, details: 'opened', url: 'https://github.com/x/y/issues/1' },
        trHe,
      ).text,
    ).toBe('✓ opened https://github.com/x/y/issues/1');
    expect(githubIssueExecuteResult({ ok: false, error: 'gh: not authenticated' }, trHe).text).toBe(
      '✗ gh: not authenticated',
    );
  });
});
