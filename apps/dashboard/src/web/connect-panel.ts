// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure CONNECT popover per-auth-mode copy — client-only (no server
 * counterpart; the server only stores/returns the mode string, and mapping
 * it to the credential field's visibility/label/placeholder/hint is purely a
 * client presentation concern), so it lives in `web/` rather than `shared/`
 * (epic 0002 "shell decomposition", slice 2).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `connectJs()` — instead
 * of hand-retyping it, so the two copies can no longer drift apart.
 *
 * i18n (board web-msnsndki-dz3vn1): every helper here that composes a
 * sentence takes the bundle's `tr()` as its last parameter — the injection
 * route `flightProgressOf` (`web/flight-progress.ts`) took — because a
 * `.toString()`-spliced function can no more import a translator than a
 * formatter: only its own scope survives the splice. Text the SERVER sends
 * (the status `description`, the LTS chip's `text`, the test `detail`) is
 * slotted into each locale's template as-is, by the same server-message
 * stance every prior slice took.
 */

/** The STRINGS keys this module's helpers read (board web-msnsndki-dz3vn1).
 *  Named here, not imported from `@autopilot/tokens`, so the module stays
 *  import-free like every other spliced `web/` helper — the union still
 *  typechecks each key against `STRINGS.en` wherever a real table backs the
 *  translator (its tests). */
export type ConnectPanelKey =
  | 'connect'
  | 'connected'
  | 'authModeApiKey'
  | 'connectApiKeyHint'
  | 'connectOauthTokenLabel'
  | 'connectTokenPlaceholder'
  | 'connectOauthTokenHint'
  | 'connectSubscriptionHint'
  | 'connectionUnavailable'
  | 'connectDotTipUnavailable'
  | 'connectHeadUnavailable'
  | 'connectDotAria'
  | 'connectCliVersion'
  | 'cliVersionFound'
  | 'connectCliNotFound'
  | 'connectHeadCliMissing'
  | 'connectHeadNotLoggedIn'
  | 'connectHeadNoCredential'
  | 'connectStatusLine'
  | 'connectTestVerified'
  | 'connectTestNotAuthenticated'
  | 'connectTestStatusLine'
  | 'connectDotAriaVerified'
  | 'connectDotAriaNotAuthenticated'
  | 'ghUnavailable'
  | 'ghCliNotFound'
  | 'ghInstallHint'
  | 'ghNotLoggedIn'
  | 'ghLoginHint'
  | 'ghConnectedAs'
  | 'ghLoginUnknown'
  | 'ghLogoutHint'
  | 'ltsUnavailable'
  | 'ltsTipUpToDate'
  | 'ltsTipUpdateAvailable'
  | 'ltsTipAhead'
  | 'ltsTipUnknown'
  | 'ghIssueConfirm'
  | 'ghIssueOpened'
  | 'ghIssueOpenFailed';

/** The bundle's `tr(key, subs)` (`web/features/locale.ts`), injected into
 *  each sentence-composing helper below — see the module note. */
export type ConnectPanelTranslator = (
  key: ConnectPanelKey,
  subs?: Readonly<Record<string, string | number>>,
) => string;

/** The CONNECT popover's credential field state for one auth mode. */
export interface ConnectModeMeta {
  readonly show: boolean;
  readonly label: string;
  readonly ph: string;
  readonly hint: string;
}

/** Maps a connection `mode` ('api-key' | 'oauth-token' | 'subscription') to
 *  the credential field's visibility, label, placeholder, and hint line —
 *  'api-key' and 'oauth-token' both show a secret input; 'subscription'
 *  (and anything else) hides it and points at `claude`/`/login` instead.
 *  The API-key placeholder is a format prefix, not prose, so it stays a
 *  literal in every locale. */
export function connectModeMeta(mode: string, tr: ConnectPanelTranslator): ConnectModeMeta {
  if (mode === 'api-key') {
    return {
      show: true,
      label: tr('authModeApiKey'),
      ph: 'sk-ant-...',
      hint: tr('connectApiKeyHint'),
    };
  }
  if (mode === 'oauth-token') {
    return {
      show: true,
      label: tr('connectOauthTokenLabel'),
      ph: tr('connectTokenPlaceholder'),
      hint: tr('connectOauthTokenHint'),
    };
  }
  return {
    show: false,
    label: '',
    ph: '',
    hint: tr('connectSubscriptionHint'),
  };
}

/** Shape of the `/api/connection` JSON payload the CONNECT popover's status
 *  line reads — structurally mirrors `ConnectionStatus`
 *  (`connection/service.ts`) without importing it, same reason
 *  `connectModeMeta` stays server-import-free: parsed JSON carries no
 *  compile-time guarantee of matching a server type anyway. */
export interface ConnectStatusInput {
  readonly mode: unknown;
  readonly ready: boolean;
  readonly cliPresent: boolean;
  readonly cliVersion?: string | null;
  readonly description: string;
}

/** The CONNECT popover's live status display — text for the status line,
 *  the connection dot's class, and the toggle button's label.
 *  `statusClass` is omitted (not empty-string) for the "unavailable"
 *  fallback, matching the original inline code's behavior of leaving
 *  `statusEl.className` untouched rather than overwriting it.
 *  `dotTip`/`dotAriaLabel` feed the masthead connection dot's [data-tip] +
 *  aria-label (App-wide interactivity audit v2, web-msm66jlc-gm4oom) — the
 *  dot's collapsed-state neighbor (`#connect-label`) only ever shows a
 *  coarse "Connect"/"Connected" binary, never the finer distinctions
 *  ("CLI missing" / "Not logged in" / "No credential") this computes. */
export interface ConnectStatusMeta {
  readonly statusText: string;
  readonly statusClass?: string;
  readonly dotClass: string;
  readonly labelText: string;
  readonly dotTip: string;
  readonly dotAriaLabel: string;
}

/** Maps the CONNECT popover's fetched status payload to its status-line
 *  text/class, connection-dot class, and toggle-button label — a missing or
 *  malformed payload (`!s || typeof s.mode !== 'string'`) falls back to an
 *  "unavailable" display, mirroring the original inline `render(s)` guard.
 *  The status line is a `{head}`/`{description}`/`{cli}` template so each
 *  locale decides where the server-sent description lands. */
export function connectStatusMeta(
  s: ConnectStatusInput | null | undefined,
  tr: ConnectPanelTranslator,
): ConnectStatusMeta {
  if (!s || typeof s.mode !== 'string') {
    return {
      statusText: tr('connectionUnavailable'),
      dotClass: 'conn-dot off',
      labelText: tr('connect'),
      dotTip: tr('connectDotTipUnavailable'),
      dotAriaLabel: tr('connectDotAria', { head: tr('connectHeadUnavailable') }),
    };
  }
  const cli = s.cliPresent
    ? tr('connectCliVersion', { version: s.cliVersion || tr('cliVersionFound') })
    : tr('connectCliNotFound');
  let head: string;
  if (!s.cliPresent) head = tr('connectHeadCliMissing');
  else if (s.ready) head = tr('connected');
  else if (s.mode === 'subscription') head = tr('connectHeadNotLoggedIn');
  else head = tr('connectHeadNoCredential');
  const statusText = tr('connectStatusLine', { head, description: s.description, cli });
  return {
    statusText,
    statusClass: `connect-status ${s.ready ? 'connect-ok' : 'connect-bad'}`,
    dotClass: `conn-dot ${s.ready ? 'on' : 'off'}`,
    labelText: s.ready ? tr('connected') : tr('connect'),
    dotTip: statusText,
    dotAriaLabel: tr('connectDotAria', { head }),
  };
}

/** Shape of the `/api/connection/test` JSON payload the CONNECT popover's
 *  "Test" button reads — structurally mirrors `VerifyResult`
 *  (`connection/verify.ts`) without importing it, same reason
 *  `ConnectStatusInput` stays server-import-free. */
export interface ConnectTestResultInput {
  readonly authenticated: boolean;
  readonly detail?: string;
}

/** The CONNECT popover's "Test" button result — status-line text/class,
 *  connection-dot class, and toggle-button label — for a real
 *  `claude`-call verification, as opposed to `connectStatusMeta`'s
 *  cheaper "is a credential configured" check. A missing/malformed
 *  payload (`!p`) reports as not authenticated with an empty detail,
 *  mirroring the original inline handler's `p && p.authenticated`/
 *  `p && p.detail` guards. */
export function connectTestResultMeta(
  p: ConnectTestResultInput | null | undefined,
  tr: ConnectPanelTranslator,
): ConnectStatusMeta {
  const ok = !!(p && p.authenticated);
  const head = ok ? tr('connectTestVerified') : tr('connectTestNotAuthenticated');
  const statusText = tr('connectTestStatusLine', { head, detail: (p && p.detail) || '' });
  return {
    statusText,
    statusClass: `connect-status ${ok ? 'connect-ok' : 'connect-bad'}`,
    dotClass: `conn-dot ${ok ? 'on' : 'off'}`,
    labelText: ok ? tr('connected') : tr('connect'),
    dotTip: statusText,
    dotAriaLabel: ok ? tr('connectDotAriaVerified') : tr('connectDotAriaNotAuthenticated'),
  };
}

/** Shape of the `/api/connection/gh` JSON payload the CONNECT popover's
 *  GitHub section reads — structurally mirrors `GhStatus`
 *  (`connection/gh-probe.ts`) without importing it, same reason
 *  `ConnectStatusInput` stays server-import-free. */
export interface GhStatusInput {
  readonly present: boolean;
  readonly version?: string | null;
  readonly authenticated: boolean;
  readonly login?: string | null;
}

/** The CONNECT popover's GitHub status display — status-line text and a hint
 *  pointing at the exact `gh` command to run next. AUTOPILOT never runs `gh
 *  auth login` for the operator (docs/epics/0006), so the hint is guidance
 *  text only — never a button that spends the operator's auth for them. */
export interface GhStatusMeta {
  readonly statusText: string;
  readonly hint: string;
}

/** Maps the CONNECT popover's fetched `/api/connection/gh` payload to its
 *  GitHub status-line text + hint — a missing/malformed payload
 *  (`!s || typeof s.present !== 'boolean'`) falls back to an "unavailable"
 *  display, mirroring `connectStatusMeta`'s guard. The `gh` version and the
 *  login are `{version}`/`{login}` template slots, so each locale decides
 *  where they land. */
export function ghStatusMeta(
  s: GhStatusInput | null | undefined,
  tr: ConnectPanelTranslator,
): GhStatusMeta {
  if (!s || typeof s.present !== 'boolean') {
    return { statusText: tr('ghUnavailable'), hint: '' };
  }
  if (!s.present) {
    return {
      statusText: tr('ghCliNotFound'),
      hint: tr('ghInstallHint'),
    };
  }
  if (!s.authenticated) {
    return {
      statusText: tr('ghNotLoggedIn', { version: s.version || tr('cliVersionFound') }),
      hint: tr('ghLoginHint'),
    };
  }
  return {
    statusText: tr('ghConnectedAs', { login: s.login || tr('ghLoginUnknown') }),
    hint: tr('ghLogoutHint'),
  };
}

/** Shape of the `/api/connection/gh-lts` JSON payload the CONNECT popover's
 *  LTS chip reads — structurally mirrors `LtsCheckResult`
 *  (`connection/gh-lts.ts`) without importing it, same reason
 *  `GhStatusInput` stays server-import-free. `status` mirrors engine's
 *  `LtsStatus` union structurally for the same reason. */
export interface GhLtsInput {
  readonly chip?: {
    readonly text?: unknown;
    readonly status?: unknown;
  };
}

/** The CONNECT popover's LTS chip display — the calm status text
 *  (`ltsChipMeta`'s own text, e.g. "v0.14.0 available — you run v0.13.0")
 *  plus a `statusTip` explaining what that status means on hover/focus
 *  (App-wide interactivity audit v2, web-msm66jlc-gm4oom): what each
 *  `LtsStatus` means and, for 'update-available', that alignment stays an
 *  operator action (epic 0006's "never automatic" policy) — the chip's
 *  visible text states the versions but not what to do about them. The tip
 *  table lives inside the function body, not as module-level constants,
 *  because `web/features/connect.ts` embeds this function's real compiled
 *  source into `/app.js` via `.toString()` — only the function's own scope
 *  survives that; a module-level const would splice out as a free variable.
 *  A missing/malformed payload (`!s || !s.chip || typeof ... !== 'string'`)
 *  falls back to an "unavailable" display, mirroring `ghStatusMeta`'s guard.
 *  The chip text itself is server-composed and stays as sent. */
export function ghLtsMeta(
  s: GhLtsInput | null | undefined,
  tr: ConnectPanelTranslator,
): {
  readonly statusText: string;
  readonly statusTip: string;
} {
  const tips: Readonly<Record<string, string>> = {
    'up-to-date': tr('ltsTipUpToDate'),
    'update-available': tr('ltsTipUpdateAvailable'),
    ahead: tr('ltsTipAhead'),
  };
  const unknownTip = tr('ltsTipUnknown');
  if (!s || !s.chip || typeof s.chip.text !== 'string') {
    return { statusText: tr('ltsUnavailable'), statusTip: unknownTip };
  }
  const status = typeof s.chip.status === 'string' ? s.chip.status : undefined;
  return {
    statusText: s.chip.text,
    statusTip: (status && tips[status]) || unknownTip,
  };
}

/** The CONNECT popover's "report to upstream" button's `window.confirm()`
 *  message (epic 0006 "GitHub connected mode", slice 5 "contribute
 *  upstream") — same reasoning `card-actions.ts`'s
 *  `githubSyncConfirmMessage` uses: every GitHub write stays a visible,
 *  operator-confirmed act, never a silent one-click POST. The operator-typed
 *  title is a `{title}` template slot, so each locale decides where it
 *  lands; `tr()` substitutes by split/join, so a title carrying braces or
 *  dollar signs survives untouched. */
export function githubIssueConfirmMessage(title: string, tr: ConnectPanelTranslator): string {
  return tr('ghIssueConfirm', { title });
}

/** Shape of the `POST /api/github-issue/execute` JSON response
 *  {@link githubIssueExecuteResult} reads. */
export interface GithubIssueExecuteResponse {
  readonly ok: boolean;
  readonly details?: string;
  readonly url?: string;
  readonly error?: string;
}

/** The CONNECT popover's `.gh-issue-result` element's class + message text
 *  for one `POST /api/github-issue/execute` response — same
 *  `className`/`text` shape `card-actions.ts`'s `githubSyncExecuteResult`
 *  uses. Appends the created issue's URL when the response carries one.
 *  The server's own `details`/`error` text stays as sent; only the two
 *  generic fallbacks come from the locale table. The ✓/✗ marks are glyphs,
 *  not prose, so they stay literal in every locale (the same shape
 *  `ghIssueRequestFailed`'s table entry already takes). */
export function githubIssueExecuteResult(
  data: GithubIssueExecuteResponse | null | undefined,
  tr: ConnectPanelTranslator,
): {
  readonly className: string;
  readonly text: string;
} {
  const ok = !!(data && data.ok);
  const message =
    (data && (data.details || data.error)) || (ok ? tr('ghIssueOpened') : tr('ghIssueOpenFailed'));
  return {
    className: 'gh-issue-result ' + (ok ? 'gh-issue-result-ok' : 'gh-issue-result-fail'),
    text: (ok ? '✓ ' : '✗ ') + message + (ok && data && data.url ? ' ' + data.url : ''),
  };
}
