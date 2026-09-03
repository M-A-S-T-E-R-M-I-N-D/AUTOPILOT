<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0006. GitHub connected mode — solo by default, federated by choice

Status: All five slices SHIPPED. Slice 1 (connect panel: gh presence/auth/identity
detection, SETUP doctor's optional gh check) done (2026-08-17); slice 2 (sync any
project: `gh repo create --source --push` + re-sync, secret-scan-gated public sync)
also done (2026-08-17); slice 3 (maintainer flow: push-tag + `gh release create`)
done (2026-08-22); slice 4 (LTS chip: backend fetch/cache plus popover markup,
client wiring, and i18n) done (2026-08-23); slice 5 (contribute upstream:
issue-report + fork/branch/pr halves with UX-EXPRESSION) done (2026-08-23) — see
the Slices section below.

Founder directive (2026-08-14): let anyone develop their own AUTOPILOT privately, AND
offer a "connective/shared" GitHub mode where co-pilots align to the LTS version, carry
main-version bug reports upstream, contribute fixes/features, and can sync ANY
autopiloted project to GitHub with one action. The maintainer (founder) additionally
needs the first-push capability — main version to a private repo, for testing, now.

## Doctrine fit (why this design)

The product already refuses to hold model credentials — it rides the operator's own
`claude` CLI login. GitHub gets the IDENTICAL treatment: **ride the operator's own
`gh` CLI login** (GitHub's official device/web flow, credentials in the OS credential
store, maintained by GitHub). AUTOPILOT never stores, proxies, or even sees a token.
Current GitHub guidance (researched 2026-08): GitHub Apps + device flow are the
recommended shape for distributed tools — that is the FUTURE rung for org-scale
federation; for a local-first tool whose every action is operator-initiated, `gh` IS
the sanctioned device-flow client, with zero credential surface for us.

## Modes

- **SOLO (default, unchanged):** fully local, no GitHub anywhere. Everything works
  exactly as today. Privacy doctrine intact: nothing leaves the machine.
- **CONNECTED (explicit opt-in):** the connect screen gains a GitHub panel — detects
  `gh auth status`, guides `gh auth login` when absent (we never run it for the
  operator), and unlocks per-project sync + upstream contribution surfaces.

## Capabilities (acceptance criteria)

1. **Connect panel:** shows gh presence/auth/login-identity; a disconnect note points
   at `gh auth logout`. No token ever persisted by AUTOPILOT (grep-provable).
2. **Sync any project:** one action on a project page = `gh repo create <name>
   --private --source <root> --push` (private by default; public is a second,
   confirm-guarded choice). Re-sync = push. Works for ANY onboarded project.
3. **Maintainer first-push:** the AUTOPILOT repo itself syncs the same way (private,
   for testing) — main + tags + the flight branch; release automation gains an
   optional `gh release create` step so LTS versions become GitHub Releases.
4. **LTS channel:** a co-pilot can check upstream's latest release
   (`gh api repos/<upstream>/releases/latest`, cached, never automatic) and see a
   calm "vX.Y.Z available — you run vA.B.C" chip; alignment stays an operator action.
5. **Contribute upstream:** from a landed improvement, one action drives
   `gh repo fork` → push branch → `gh pr create` against the upstream AUTOPILOT —
   patch offers, feature offers, and main-version bug reports all travel as PRs/issues
   (`gh issue create`), always operator-confirmed, never automatic.
6. **Nothing implicit:** no telemetry, no auto-sync, no background phoning home —
   every GitHub interaction is a visible, clickable, operator-initiated act. The
   confidentiality principle ("content never leaves the machine except via the
   operator's own accounts") holds by construction.

## Constraints

- `gh` is an OPTIONAL dependency: its absence degrades to SOLO with a doctor hint
  (SETUP gains a non-blocking gh check), never an error.
- Before any PUBLIC sync of a project: run the secret-scan against the tree and warn
  on findings (BASELINE SAFETY's scanner, reused). Before AUTOPILOT itself ever goes
  public: a full-HISTORY scan (old blobs are not covered by working-tree gates).
- The un-fakeable chain is untouched; upstream PRs carry the standard sign-off.
- Windows-first; everything shells through `gh` (no REST client of our own, no new
  dependencies).

## Out of scope

- A hosted GitHub App / org-scale federation registry (future rung — revisit when
  more than a handful of co-pilots exist).
- Auto-merge, auto-update, or any unattended GitHub write.
- CI runners on GitHub (the LIVING-REPO-SPEC epic owns that).

## Slices

1. Connect panel: gh detect/status/identity + SETUP doctor gains an optional gh check.
   SHIPPED (web-mss4lpw9-ktpcoh, 2026-08-17 — status line above already said
   so; this entry was the missing evidence): `connection/gh-probe.ts`'s
   `getGhStatus` probes `gh --version` then `gh auth status` (never throws,
   degrades to `present: false`) for presence/version/authenticated/login;
   `control/gh-doctor.ts`'s `ghDoctorCheck` — always `ok: true`, since `gh`
   stays optional — is appended to the CLI's `doctor` command output
   (`control/cli.ts`) alongside the existing checks; `server/server.ts`'s
   `handleGhStatus` serves it read-only at `GET /api/connection/gh`; the
   CONNECT popover's `web/features/connect.ts` (`loadGh`) fetches it and
   renders through `connect-panel.ts`'s pure `ghStatusMeta` into the
   popover's `#gh-status`/`#gh-hint` elements — install guidance when
   absent, `gh auth login` guidance when unauthenticated, a `gh auth logout`
   disconnect note when connected. AUTOPILOT never runs `gh auth login` for
   the operator and never persists a token (grep-provable — every module
   here only ever reads `gh`'s own opinion of its own state). Covered by
   `test/connection/gh-probe.test.ts`, `test/control/gh-doctor.test.ts`,
   `test/web/connect-panel.test.ts`, and `test/web/features/connect.test.ts`
   (35+ tests, all passing).
2. Sync-any-project: private `gh repo create --source --push` + re-sync, per project.
   SHIPPED (web-mss4lpwi-p0w1d0): the pure command policy (`planGithubSync`,
   `packages/engine/src/github-sync.ts`) decides `gh repo create <slug>
   --private|--public --source=. --push` for a first sync vs. a plain re-sync
   `git push` once a remote exists; `github/execute.ts`'s
   `createGithubSyncExecuteApi` runs it via an injectable command runner
   (never a real `gh`/`git` process in tests) and gates any `'public'` sync on
   the shared secret scanner (`scanForSecrets`), blocking with the flagged
   paths rather than syncing; `POST /api/github-sync/execute`
   (`server/server.ts`) wires it to an HTTP handler; the project page's
   "⇪ Sync to GitHub" button + confirm-guarded public checkbox
   (`web/shell.ts`, `.github-sync` section) is the UX-EXPRESSION.
   100%-mutation-tested
   (`config/mutation/stryker.engine-github-sync.config.mjs`, per
   `a74f6b3`'s "widens to github-sync.ts (100%)").
3. Maintainer flow: release automation offers `gh release create` (tag → Release).
   SHIPPED (2026-08-22, web-mss4lpwl-z0w495): RELEASE EXECUTE's optional
   `ghRelease` leg (`release/execute.ts`'s `publishGithubRelease`) runs once
   the engine's `executeRelease` (pure policy, `packages/engine`) has already
   landed the real `v<version>` tag — pushes ONLY that tag (never the branch,
   which stays the separate "Sync to GitHub" action) via the same injectable
   `CommandRunner` `github/execute.ts` defines, then `gh release create
   <tag> --verify-tag --notes-from-tag --title <tag>`, reusing the tag's own
   annotated message as notes rather than fabricating any; refuses up front
   when the project has no GitHub remote configured, and a failed push never
   attempts the `gh` call. A failed push or `gh release create` never flips
   the overall release result — the commit + tag already succeeded by that
   point — it only surfaces under the `ghRelease` sub-result. `POST
   /api/release/execute` (`server.ts`'s `handleReleaseExecute`) accepts an
   optional `ghRelease: boolean` body field, CSRF + rate-limit gated same as
   the rest of RELEASE EXECUTE. The UX-EXPRESSION is the RELEASE panel's
   "Also publish as a GitHub Release" checkbox (`web/shell.ts`,
   `.release-ghrelease-checkbox`) with an explanatory `data-tip`/`aria-label`
   and a `releaseConfirmMessage` (`web/release-panel.ts`) confirm line that
   only appears when the checkbox is checked. Covered by
   `test/release/execute.test.ts`, `test/server/server.test.ts`,
   `test/web/release-panel-confirm.test.ts`, and
   `test/web/release-panel-result.test.ts`.
4. LTS chip: upstream latest-release check (operator-triggered, cached) + version chip.
   SHIPPED (2026-08-23): the pure command policy (`ltsChipMeta`,
   `packages/engine/src/lts-check.ts`) decides the chip text (up-to-date /
   update-available / ahead / unknown) by comparing against `PRODUCT_VERSION`;
   `connection/gh-lts.ts`'s `createLtsStatusApi` fetches latest release via `gh
   api repos/<upstream>/releases/latest` (never throws, degrades to `unknown`) and
   caches in-process — getCached() never shells out, check() is the only path
   that triggers a fetch and only ever runs from an explicit operator POST;
   `server/server.ts` wires GET/POST /api/connection/gh-lts with CSRF + rate
   limiting; `web/connect-panel.ts`'s `ghLtsMeta` is the pure payload-to-text
   mapping, with the status-tip lookup table inlined inside the function body
   (not module-level constants) so that `web/features/connect.ts` can embed the
   function's compiled source into `/app.js` via `.toString()` — only the
   function's own scope survives such embedding; a module-level const would
   splice out as a free variable. UX-EXPRESSION landed the same day (`bb1afbd9`,
   web-mss4lpwr-gptuk4): `web/shell.ts`'s popover markup (`#gh-lts` status line,
   `#gh-lts-check` button, `data-i18n="checkForUpdates"`) plus
   `web/features/connect.ts`'s client wiring (`loadLts()` GETs the cached chip on
   open, the check button POSTs and re-renders via `ghLtsMeta`) and the
   `checkForUpdates` key in `packages/tokens/src/strings.ts` (translated for every
   locale, including `he`) — covered by `test/web/features/connect.test.ts`.
5. Contribute upstream: fork + branch push + `gh pr create` / `gh issue create` flows.
   Issue-report half SHIPPED (BOARD web-mss4lpwy-67qzl7): the pure command
   policy (`planGithubIssue`, `packages/engine/src/github-contribute.ts`)
   decides `gh issue create --repo <upstream> --title <title> --body <body>`
   against the canonical `UPSTREAM_REPO` (`info.ts`); `github/issue-execute.ts`'s
   `createGithubIssueExecuteApi` runs it via the same injectable
   `CommandRunner` `github/execute.ts` already uses (never a real `gh`
   process in tests); `POST /api/github-issue/execute` (`server/server.ts`)
   wires it to a CSRF-guarded, rate-limited HTTP handler; the CONNECT
   popover's GitHub section (`web/shell.ts`'s `.gh-issue-form`,
   `web/features/connect.ts`) is the UX-EXPRESSION — a title/body form that
   `window.confirm()`s before ever POSTing, same "operator-confirmed, never
   automatic" stance the sync flow uses.
   The fork + branch-push + `gh pr create` half (contributing a landed code
   fix) SHIPPED (2026-08-23): the pure command policy (`planGithubPr`,
   `packages/engine/src/github-pr-contribute.ts`) decides `gh repo fork
   <upstreamRepo> --remote --remote-name autopilot-fork`, then `git push
   autopilot-fork <branch>`, then `gh pr create --repo <upstreamRepo> --head
   <forkOwner>:<branch> --title <title> --body <body>` — fork owner read
   from the operator's own `gh auth status`; `github/pr-execute.ts`'s
   `createGithubPrExecuteApi` runs the three steps in order via the same
   injectable `CommandRunner`, stopping at the first non-zero exit; `POST
   /api/github-pr/execute` (`server/server.ts`) wires it to a CSRF-guarded,
   rate-limited HTTP handler. The UX-EXPRESSION is per-project rather than
   in the global CONNECT popover — the PR needs a specific branch — so it
   lives on the project detail page (`web/shell.ts`'s `.github-pr` section,
   next to `.github-sync`): a title/body form that `window.confirm()`s
   before POSTing, same operator-confirmed stance as the issue-report half
   and the sync flow.

Note (2026-08-24): `packages/engine/src/github-pr-contribute.ts`'s `planGithubPr`
and its execute chain (`github/pr-execute.ts`'s `createGithubPrExecuteApi`,
`server/github-execute.ts`'s `handleGithubPrExecute`) gained an optional
`issueNumber` parameter — a positive integer (`InvalidPrInputError`/400
otherwise) that appends a `Closes #<n>` trailer to the PR body, so a delivered
PR auto-closes the pool issue it was flown for. This is prep for epic 0007's
"PLATFORM 6/7" contributor-pool delivery leg, not a sixth slice of THIS epic:
the parameter is plumbed end-to-end (engine → execute API → HTTP handler) but
carries no UX-EXPRESSION here — the project page's `.github-pr` form
(`web/shell.ts`) posts only `{project, title, body}`, never `issueNumber`.
Epic 0007 owns wiring that field in once its pool-claim flow lands.

## Related

- Founder's connect-screen precedent (`claude` login) — the pattern this copies.
- BASELINE SAFETY board item (shared secret-scan gate before anything leaves).
- `docs/LIVING-REPO-SPEC.md` (GitHub-page + CI-agent-fleet epic — the sibling that
  runs ON GitHub; this epic only CONNECTS to it).
- GitHub guidance researched 2026-08: GitHub Apps + device flow for distributed
  tools; fine-grained PATs for personal scripts; `gh` as the official device-flow
  client. (docs.github.com — apps/oauth-apps + REST authentication.)
