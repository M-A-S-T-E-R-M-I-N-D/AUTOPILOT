// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Per-string translation catalog — the i18n foundation's next slice (board
 * web-msnsndki-dz3vn1) after `locales.ts` (locale identity/direction) and
 * `web/features/locale.ts` (the switcher). Started with the masthead: the
 * one surface that is on screen in every locale, on every page, before any
 * other content loads. Coverage already reached the masthead's "Connect"
 * panel (auth mode label/options, credential label, save button), the
 * Theme/Language switcher navs' `aria-label`s (`themeNav`, `languageNav`),
 * and the flightbar (`renderShell()`'s `#flightbar` section) — the "Fly a
 * folder" form, AUTOPILOT's single most primary action surface after the
 * masthead itself, and the searchbar (`#searchbar`) — the "Search a project" /
 * "Ask" form. This slice moves on to the static landmarks between the
 * searchbar and the dynamically-rendered fleet content itself: the
 * `#totals`/`#live-workers`/`#stat-tiles`/`#pr-review-panel` section
 * `aria-label`s, the `main#fleet` landmark's `aria-label`, and its
 * "Connecting to the fleet…" loading placeholder — every one of them static
 * chrome regardless of locale, unlike the per-project fleet cards themselves
 * (client-rendered from live data, a much larger surface a later slice must
 * finish tackling). This slice takes the first bite: the two elements
 * `cardActions()` renders on EVERY card regardless of project state — the
 * "Remove" button and the "view/edit SOUL" entry's summary/label/submit text
 * (`web/shell.ts`'s `soulEditorPanel()`). This slice continues into the two
 * SOUL evolution loop surfaces (board web-mswqemor-ab3jsu) that render
 * conditionally on the same card — `soulProposalPanel()`'s pending-review
 * summary and ratify/dismiss buttons, and `soulUnratifyChip()`'s undo
 * button — their static text tagged the same way; the `window.confirm()`
 * dialogs those buttons raise stay English-only for now, same as the
 * per-project `data-tip`/`aria-label` hover text throughout this table,
 * since neither is a persistent on-screen element. Doing this for
 * client-rendered cards (unlike the server-rendered surfaces above) also
 * required closing a
 * real gap: `features/locale.ts`'s `applyLocale()` only swept `[data-i18n]`
 * text at page load / language-switch time, so a card created or patched
 * afterward (the live fleet stream re-renders cards continuously) rendered
 * in English regardless of the active locale. `applyLocale()`'s sweep is now
 * its own `translateDom()`, which `renderFleet()` also calls after every
 * patch, so freshly-built card DOM always lands in the current locale. This
 * slice extends that same fix to the KEEPER PR review panel
 * (`renderPrReviewPanel()`): its title and per-plan "Apply" button, tagged
 * the same way, plus its own `translateDom()` call — it rebuilds on a
 * separate 30s poll timer, not the fleet stream's tick, so it needed the
 * same fix `renderFleet()` already had rather than inheriting it for free.
 * This slice closes the last two untagged `aria-label`s inside the
 * flightbar itself: the budget-mode `<select>` (`#fly-mode`) and the
 * `#fly-flights` progress group, both persistent chrome siblings of the
 * already-tagged form controls around them. This slice also tags the
 * masthead's `#otlp-chip` — a persistent element (shown/hidden, never
 * removed, per `renderShell()`'s masthead) that had been overlooked when
 * its neighbors (Theme/Language navs, Connect panel) were tagged earlier.
 * This slice tags the flightbar's `#fly-mode` `<label>` — a
 * `.visually-hidden` element read by screen readers only, distinct from the
 * `<select>`'s own `budgetMode` aria-label (fuller text, redundant by
 * design: the label names the control, the aria-label explains it) — which
 * had been left as plain English text when the `<select>`'s aria-label was
 * tagged in an earlier slice.
 * This slice closes a third attribute gap alongside text content and
 * `aria-label`: the searchbar's `#search-q` `placeholder` ("find code — or
 * ask a question…") was still plain English even though its `aria-label`
 * (`searchQueryAria`) had been tagged two slices ago — a placeholder reads
 * to sighted users before they ever focus the field, so leaving it English
 * undercut the aria-label fix. `features/locale.ts`'s `translateDom()` grew
 * a third sweep, `[data-i18n-placeholder]`, mirroring the existing
 * `data-i18n`/`data-i18n-aria` pair.
 * This slice closes the other half of that same placeholder gap: the
 * flightbar's own `#fly-folder` input ("absolute path to a git repo") was
 * left plain English when `#search-q`'s placeholder was tagged — the same
 * persistent, always-visible-before-focus text, just on the form above the
 * searchbar instead of inside it.
 * This slice tags the masthead's notify (🔔) panel — a persistent chrome
 * sibling of Connect/Theme/Language/Tour that had been entirely untagged:
 * the bell summary's `aria-label`, the "Notify me when a flight needs me or
 * is dying" checkbox label, the "Quiet hours" label, and the quiet-hours
 * start/end time inputs' `aria-label`s.
 * This slice closes the last gap inside the searchbar's `ask-persona`
 * group: its `aria-label` was tagged two slices ago, but the "GENIUS" /
 * "ARCHITECT" persona buttons inside it were not — both are mode names
 * (like "KEEPER" and "OTLP" elsewhere in this table), so the Hebrew
 * table keeps them in Latin script rather than translating them.
 * This slice takes the first bite out of the fleet card's "Details" panel
 * (`shell.ts`'s `updateDetailPanel()`/`DETAIL_SECTION_BUILDERS`) — the much
 * larger client-rendered surface earlier slices deferred. It tags only the
 * PLAIN static headings that carry no separate `aria-label`/`data-tip` of
 * their own: the `<details>` toggle's "Details" summary, the facts list's
 * "Gate"/"Backup" `<dt>`s, and the "Languages"/"Top directories"/"Activity"/
 * "Metrics"/"Inbox" section `<h3>`s. `detailSectionNode()` (shared by the
 * Activity/Metrics sections) grew an optional third `i18nKey` param so both
 * callers can opt in without duplicating its heading-building logic. The
 * sections whose heading ALSO carries a bespoke `aria-label` — "Hot files",
 * "Flight log", "Per-firing trace" — and the "Tasks" heading, whose text
 * varies with focus-mode state, need the two-key (`data-i18n` +
 * `data-i18n-aria`) treatment `otlpExportConfigured` established; that is
 * left to a follow-up slice rather than folded in here.
 * This slice is that follow-up: `hotFiles`/`hotFilesAria`, `flightLog`/
 * `flightLogAria`, and `firingTrace`/`firingTraceAria` give those three
 * headings both a `data-i18n` (heading text) and `data-i18n-aria` (their
 * existing longer `aria-label`) key, the same `otlpExportConfigured`
 * pattern — their `data-tip` hover text stays English, same as every other
 * `data-tip` in this table. The "Tasks" heading's text itself (not just an
 * `aria-label`) changes with state, so it gets two whole-text keys instead —
 * `tasks` for the normal case and `tasksFocusMode` for the "FOCUS MODE"
 * variant (the 🎯 glyph moved to a leading icon — epic 0025 — so the text
 * itself carries no emoji) — `tasksSection()` picks the key matching `anyFocus` the same way
 * `detailSectionNode()`'s callers already pick a fixed key.
 * This slice tags the masthead Connect panel's "Report a bug" GitHub-issue
 * mini-form — the `#gh-issue-form`'s label, its title/body placeholders, and
 * the submit button — flagged by `scripts/i18n/find-untagged-strings.mjs`
 * (`pnpm i18n:untagged`) as the only untagged strings the scanner could see.
 * `titlePlaceholder`/`detailsOptionalPlaceholder` are named generically
 * rather than `ghIssue*`-prefixed since the "Contribute upstream" PR form
 * (`shell.ts`'s client-built `ghPrTitle`/`ghPrBodyLabel`) uses the same
 * English text and can reuse these keys once a follow-up slice tags it too.
 * This slice is that follow-up: the per-project inside page's "Contribute
 * upstream" form (`renderProjectPage()`'s `.github-pr` section) reuses
 * `titlePlaceholder` for its title input's placeholder and
 * `detailsOptionalPlaceholder` for its body `<label>` text (same English
 * string, a label here rather than a placeholder), and gets one new key,
 * `openPullRequest`, for its submit button. Left untagged: the form's OWN
 * `<label>` naming the target branch (`githubPrLabel(name)`), which
 * interpolates the live project name mid-sentence — this table's flat
 * per-key strings have no template-with-placeholder support yet, the same
 * reason the sibling `window.confirm()` dialogs stay English-only.
 * This slice closes the two gaps `pnpm i18n:untagged`
 * (`scripts/i18n/find-untagged-strings.mjs`) flagged next: the masthead
 * Connect panel's "Check for updates" button (`#gh-lts-check`, a sibling of
 * the already-tagged GitHub-issue mini-form) and the fleet-wisdom proposal
 * section's `aria-label` (`#fleet-wisdom`, a persistent chrome landmark like
 * `#totals`/`#pr-review-panel` above it). By this point `pnpm i18n:untagged`
 * reports zero findings — every scanner-visible string is tagged.
 * This slice closes the one gap the scanner can never see, since it targets
 * literal `<tag>` markup in source text and this string is built via
 * imperative DOM calls: the "Contribute upstream" PR form's own `<label>`
 * naming the target project (`card-actions.ts`'s `githubPrLabel(name)`,
 * `shell.ts`'s `ghPrTitleLabel`), left untagged when the form's other
 * fields were tagged because this table's flat per-key strings had no
 * template-with-placeholder support — "Contribute Alpha's current branch…"
 * needs the project name mid-sentence, and Hebrew's construct-state
 * possessive puts the equivalent noun in a different position entirely, so
 * a naive English-order prefix/suffix split around the name would not
 * translate. `githubPrLabel` gets a `{name}` placeholder instead: the
 * client sweeps it via a new `[data-i18n-template]`/`data-i18n-name` pair
 * (`features/locale.ts`'s `translateDom()`) that looks up the template by
 * key and substitutes `{name}` for the element's own `data-i18n-name`
 * value, so each locale's translation can place the name wherever its own
 * grammar requires. `card-actions.ts`'s `githubPrLabel(name)` itself is
 * untouched — it still builds the English default text inline the same way
 * every other tagged element does before its first `translateDom()` sweep.
 * This slice closes two more `pnpm i18n:untagged` findings that appeared
 * after the "zero findings" milestone above, from chrome sections added in
 * later slices: the contributor-pool panel's `aria-label` (`#pool-client-panel`)
 * and the publicity panel's `aria-label` (`#publicity-panel`), both persistent
 * landmark chrome like `#fleet-wisdom` above them.
 * This slice tags the three `window.confirm()` dialogs earlier slices (see
 * above) explicitly left English-only: soul-ratify, soul-un-ratify, and
 * fleet-wisdom-ratify — the ones with no interpolated project/task name.
 * `pnpm i18n:untagged`'s scanner still can't see these (they're a call
 * argument, not a tagged DOM attribute), but they're real English-only text
 * a Hebrew-speaking founder hits on every SOUL ratification.
 * `web/features/locale.ts` grows a small `tr(key)` lookup — the client-side
 * mirror of this file's own `translate()`, reading
 * `document.documentElement.lang` instead of taking a locale argument, since
 * these fire from click handlers rather than a `translateDom()` sweep — and
 * `web/shell.ts`'s three call sites swap their literal strings for
 * `tr('soulRatifyConfirm')` and friends. The `confirm()` dialogs that still
 * interpolate a live name (remove/start-over/task-delete/GitHub sync/PR)
 * stay deferred for the same reason `githubPrLabel`'s own label did: this
 * flat table has no template-with-placeholder support beyond the single
 * already-solved `{name}` case.
 * This slice takes the first of those five: `taskDeleteConfirm` gets the
 * same `{name}` placeholder `githubPrLabel` already established, and
 * `features/locale.ts`'s `tr(key)` grows an optional second `name` argument
 * that substitutes it in — the `window.confirm()` equivalent of
 * `translateDom()`'s `[data-i18n-template]`/`data-i18n-name` sweep, needed
 * here because a confirm dialog has no DOM node to carry a `data-i18n-name`
 * attribute; the name has to travel with the call itself.
 * This slice takes two more of those five, both event-delegated so their
 * `window.confirm()` call lives in `clientJs()`'s top-level click handlers
 * rather than a per-card render function: `removeProjectConfirm` (the
 * masthead card's "Remove" button) and `startOverConfirm` (its "Start over"
 * button), each with the same `{name}` placeholder substituted via
 * `tr(key, name)`. Left deferred: the GitHub-sync and PR-open confirms,
 * which interpolate more than a bare project/task name.
 * This slice takes the GitHub-sync confirm — on closer look it only ever
 * interpolates the project `{name}`; `visibility` ('public'/'private')
 * merely PICKS one of two fixed wordings rather than substituting into a
 * shared template, so it needs no multi-placeholder support after all, just
 * two keys instead of one: `githubSyncConfirmPrivate` and
 * `githubSyncConfirmPublic`. `web/shell.ts`'s `[data-github-sync]` click
 * handler now calls `tr(key, name)` the same way `startOverConfirm`'s does,
 * picking the key by the checked state of the adjacent visibility checkbox.
 * `card-actions.ts`'s `githubSyncConfirmMessage` stays as the English
 * source these two keys mirror, tested directly, but is no longer called
 * from the generated bundle. The PR-open confirm stays deferred — it
 * genuinely interpolates three independent values (name, title, an
 * optional issue number), which this flat table still can't express.
 * This slice is that final deferred confirm: the PR-open dialog really does
 * need two independent placeholders in its base sentence (`{name}` AND a
 * user-typed `{title}`, unlike every prior template here which only ever
 * carried one), plus an optional trailing clause naming a THIRD value (the
 * pool issue number) only when one was prefilled. Rather than growing this
 * flat table's substitution rule to handle an arbitrary-arity template,
 * the trailing clause becomes its own key —`githubPrConfirmIssueClause`,
 * a `{issueNumber}` sentence fragment concatenated onto the base message
 * only when an issue number exists, the same way `card-actions.ts`'s
 * `githubPrConfirmMessage` itself appends it with a ternary today. This
 * needed `web/features/locale.ts`'s `tr(key, name)` generalized to accept a
 * substitution MAP (`tr(key, {name, title})`) alongside its existing single
 * `name`-string shorthand, so a template can carry more than one
 * placeholder without a breaking change to the five call sites that already
 * pass a bare name. `card-actions.ts`'s `githubPrConfirmMessage` stays as
 * the English source both new keys mirror, tested directly, but — like
 * `githubSyncConfirmMessage` before it — is no longer embedded in the
 * generated client bundle. Both i18n scanners (`pnpm i18n:untagged`,
 * `pnpm i18n:rtl`) still report zero findings; every `window.confirm()`
 * dialog in the app now reads its text from this table.
 * Both scanners are regex-over-literal-markup and stay blind to aria-labels
 * set imperatively on elements built at runtime rather than parsed from
 * `<tag data-i18n-aria>` source text — `web/features/fly.ts`'s browse-folder
 * modal (`paintBrowse()`) builds its drive-switcher group and the ".. (up)"
 * entry this way, once per open, so neither was ever swept by
 * `translateDom()` either. `browseDrives`/`browseUpParent` close that gap
 * the same way the `window.confirm()` dialogs above did: `tr(key)` calls at
 * the point the attribute is set, since there is no persistent DOM node for
 * a later sweep to revisit.
 * This slice closes the one `pnpm i18n:untagged` finding raised by epic
 * 0015's newest surface, the PIPELINE VIEW panel's server-rendered
 * `<section aria-label="Pipeline view">` (`web/pipeline-panel.ts`'s
 * `renderPipelinePanel()`). `features/pipeline.ts`'s `pipelineJs()` client
 * control surface (switch labels, loading/empty copy) is built via plain JS
 * `el()` calls the tag scanner cannot see, same blind spot as the
 * `browseDrives`/`browseUpParent` case above — it stays English-only until a
 * follow-up slice tags it and adds its own regression test, the same way
 * `project-page-i18n.test.ts` covers the "Contribute upstream" form.
 * This slice is that follow-up: `pipelineJs()`'s panel title, its three
 * `role="group"` switch labels (lens/mode/layout) and six button labels
 * (Fleet/Files, Grouped/Flat, Layered/Compact), and its loading/unavailable
 * copy all get keys. The persistent structural elements (title, switch
 * groups, buttons) are tagged `data-i18n`/`data-i18n-aria` like every other
 * client-rendered panel — `pipelineSection()` runs synchronously inside
 * `renderProjectPage()`, before `renderFleet()`'s own `translateDom()` call,
 * so they're swept for free on first paint and again on any later locale
 * switch. The loading/unavailable `<p>` text is different: `load()` also
 * fires from a switch button's own click handler (a lens/mode/layout
 * change), a code path outside `renderFleet()`'s sweep entirely — so, same
 * as `browseDrives`/`browseUpParent` above, it reads `tr(key)` directly at
 * the point each element is built rather than relying on a tag a sweep might
 * never revisit.
 * This slice tags the project page's "Recently shipped" flight summary
 * panel heading (`web/features/flight-summary.ts`'s `flightSummarySection()`)
 * — another `el()`-built `<h2 class="detail-h">` the regex scanner cannot
 * see, the same blind spot `pipelineJs()`'s title had. It runs synchronously
 * inside `renderProjectPage()` like the Details panel headings above, so it
 * is swept for free by the same `translateDom()` call.
 * This slice tags the contributor pool panel's "🧑‍🤝‍🧑 Pool" heading
 * (`web/features/pool-client.ts`'s `renderPoolClientPanel()`) — another
 * `el()`-built `<h3>` the regex scanner cannot see. Unlike the flight
 * summary heading above, this panel rebuilds on its own 30s poll timer
 * rather than inside `renderProjectPage()`'s sweep, so `renderPoolClientPanel()`
 * grows its own `translateDom()` call at the end of every render, the same
 * fix `prReviewTitle` needed for the sibling KEEPER PR review panel.
 * This slice tags the project page's "Firing activity" heatmap heading
 * (`shell.ts`'s `contributionHeatmap()`) — another `el()`-built
 * `<h2 class="detail-h">` the regex scanner cannot see, the same blind spot
 * the Languages/Top directories/Hot files headings above already had fixed.
 * It runs synchronously inside `renderProjectPage()`, so it is swept for
 * free by the same `translateDom()` call — no extra wiring needed.
 * This slice tags the project page's "🔍 Detected backlog" panel heading
 * (`web/features/backlog.ts`'s `backlogSection()`) — another `el()`-built
 * `<h3 class="backlog-title">` the regex scanner cannot see, the same blind
 * spot every other feature-module heading above already had fixed. Like
 * `flightSummarySection()`, it runs synchronously inside
 * `renderProjectPage()`, so it is swept for free by the same
 * `translateDom()` call — no extra wiring needed.
 * This slice tags the one remaining scanner-invisible surface: the first-run
 * guided tour dialog (`web/features/tour.ts`'s `paintTour()`). Like the
 * `window.confirm()` dialogs above, it is built entirely via imperative DOM
 * calls (`el()`, `.textContent =`) with no persistent node a `[data-i18n]`
 * sweep could reach, so `pnpm i18n:untagged` never saw it — every step's
 * title/body, the Skip/Close button (and its two tips, picked by whether the
 * step is last), and the Back/Next buttons (and their tips) were still
 * hardcoded English. `web/tour.ts`'s `TOUR_STEPS`/`tourStepMeta` stay exactly
 * as they were — the tested English source of truth `tour.test.ts` mirrors,
 * same as `card-actions.ts`'s confirm-message builders above — and gain one
 * sibling export, `TOUR_STEP_KEYS`, an index-parallel array of each step's
 * `{titleKey, bodyKey}` pair into this table. `paintTour()`'s served script
 * now calls `tr(key)` for every piece of tour text instead of reading it off
 * `TOUR_STEPS`/`tourStepMeta` directly, the same `tr()`-at-render pattern the
 * confirm dialogs use, needed for the same reason: no DOM node to tag ahead
 * of time.
 * UX weakness sweep (epic 0015, board web-mtju8ekq-dlpe9n): the project
 * page's "Contribute upstream" PR form used to render fully expanded on
 * every visit — an always-open form for a rare, occasional action. It now
 * lives behind a closed-by-default `<details>` disclosure, same shape as
 * `soulEditorPanel`'s `.soul-editor`, and needs its own trigger text:
 * `githubPrSummary`. Unlike `githubPrLabel`, it names no project, so it
 * stays a plain key with no `{name}` placeholder.
 * Sweep cut 2 of 3: the same weakness applied to the Inbox note form
 * (`tasksSection()`'s heading + `.inbox-add` form) — also rare/occasional,
 * also now a closed-by-default `<details>`, also needing its own plain
 * trigger text: `inboxSummary`.
 * This slice finishes that modal: its aria-labels were translated above but
 * its static TEXT was not — the "Browse a folder" title (both the success
 * and the error paint), the error body, the Close/Cancel/"Use this folder"
 * buttons, the "No subfolders here." empty state, and the subfolder group's
 * `aria-label`, which interpolates the listed path mid-sentence and so gets
 * a `{path}` template (`browseSubfoldersOf`) substituted via `tr()`'s map
 * form rather than an English-order string concatenation. `close`/`cancel`
 * are named generically, like `titlePlaceholder` before them, for the next
 * dialog to reuse. The modal's `data-tip` hover texts stay English, same as
 * every other `data-tip` in this table, and the literal '.. (up)' entry
 * stays path-notation — its `browseUpParent` aria-label is the translated
 * half.
 * This slice finishes the fly bar's dynamic go-button states — the labels
 * `setGoLabel()` paints while a flight is active ('Flying…'/'Queued…'/
 * 'Resume'), which the mid-locale-revert fix above deliberately left as
 * "English literals until their keys exist in STRINGS" — plus the flight
 * rows' Cancel/Resume buttons, whose Pause/Stop siblings were translated
 * earlier (`cancel` already existed, named generically for exactly this
 * reuse; only `flying`/`queued`/`resume` are new). `setGoLabel()` now swaps
 * `#fly-go`'s `data-i18n` key per state instead of dropping the attribute,
 * so a locale switch mid-flight retranslates the live label on the very
 * next `translateDom()` sweep instead of waiting out the 3s poll.
 * This slice translates the fly bar's `#fly-status` line — every message
 * the CLIENT itself generates was still an English literal: the launch flow
 * (`enterFolderPath`/`launching`/`launched`/`couldNotLaunch`/`launchFailed`),
 * the global Stop/Pause flow (`stopping`/`stopFailed`/`pausing`/
 * `pauseFailed`), the per-flight row actions' fallbacks (`stoppingName`/
 * `pausingName`/`stopFailedName`/`pauseFailedName`, each `{name}`-templated
 * so the folder lands where the locale's grammar puts it), and the
 * single-flight running/paused sentence (`flyingUpToTotal`/`flyingFirings`,
 * two-placeholder templates via `tr()`'s map form, `pausedUntilResumed`,
 * and the `aFolder` fallback for a status payload with no folder). All are
 * written at event time (`setMsg`/`paint`), never swept by `translateDom()`,
 * so `tr()` at the write site is the right fix — the same reasoning as the
 * `window.confirm()` dialogs and the browse modal before them. Messages the
 * SERVER sends back (`res.message`) stay untranslated here: those originate
 * server-side, a slice this client-facing table can't reach. The spliced
 * `flightRowStatusText()` per-row line stays English too — it's a shared
 * `web/flights.ts` helper with its own direct tests, a separate follow-up
 * slice.
 * This slice ends the "`data-tip` hover texts stay English" policy every
 * prior slice restated — for the fly bar, the app's primary action surface.
 * Its persistent controls (Fire/Pause/Stop, the four form inputs, the
 * flight-row status span, the total-progress bar) get `fly*Tip`/
 * `flight*Tip` keys written by `web/features/fly.ts`'s new `setTip()`,
 * which also tags `data-i18n-tip` so `translateDom()`'s new fourth
 * attribute sweep retranslates them on a locale switch — the same two-part
 * contract `setGoLabel()` uses for #fly-go's label. The browse modal's
 * per-paint buttons (no persistent node for a sweep to revisit) call
 * `tr()` at build time instead: `browseCloseTip` (shared by Cancel and the
 * error dialog's Close), `browseUpTip`, and the templated `browseDriveTip`
 * `{drive}`/`browseEntryTip` `{name}`/`browseUseTip` `{path}`, so the
 * interpolated value lands where each locale's grammar puts it. The
 * per-row Pause/Stop/Cancel/Resume button tips come from the spliced
 * `flightActionAriaLabel()` helper (`web/flights.ts`, own tests) and stay
 * a follow-up, same as `flightRowStatusText()` above; every other
 * surface's `data-tip`s stay English until their own slices.
 * This slice is that deferred fly-bar rows follow-up, named twice above:
 * the per-row status sentence (`web/flights.ts`'s `flightRowStatusText()`)
 * and the per-row Pause/Stop/Cancel/Resume tips (`flightActionAriaLabel()`).
 * Both helpers stay as the tested English source their keys mirror —
 * `flightRowFlyingTotal`/`flightRowFlyingFirings` (plus
 * `flightRowWatchdogSuffix`, a trailing clause appended only when RING-0
 * FLEET WATCHDOG launched the flight, the `githubPrConfirmIssueClause`
 * shape; "fleet-watchdog" itself stays Latin in Hebrew, a mode name like
 * KEEPER/GENIUS), `flightRowQueued`, and the existing `pausedUntilResumed`
 * (whose English already matched the row's paused sentence exactly, so it
 * is reused rather than duplicated); `pauseFlightOn`/`stopFlightOn`/
 * `cancelQueuedFlightOn`/`resumeFlightOn` for the tips — but, like
 * `card-actions.ts`'s `githubSyncConfirmMessage`/`githubPrConfirmMessage`
 * before them, are no longer embedded in the generated bundle:
 * `flightRow()` rebuilds each row on every state change, so `tr()` at
 * build time is the row's established pattern (its Pause/Stop/Cancel/
 * Resume button TEXT already reads `tr('pause')` and friends).
 * `fly-rows-i18n.test.ts` holds the mirror contract.
 * This slice tags the fly bar's 🍀 "I'm feeling lucky" launch calibrator
 * (`#fly-lucky`, the 2026-09-03 feature that landed after the fly-bar
 * sweeps above and was the sole `pnpm i18n:untagged` finding left): its
 * `aria-label` (`flyLuckyAria` — the button's only name, since its visible
 * content is the 🍀 glyph), its `data-tip` (`flyLuckyTip`, via
 * `web/features/fly.ts`'s `setTip()` like the persistent controls beside
 * it), and the client-generated `#fly-status` messages the roll paints —
 * `luckyNoAnswer`/`luckyDashboardDown` for the two failure shapes,
 * `luckyNotNow` `{reason}` for a refusal, `luckyPressFlyIt` `{reason}` for
 * a filled plan, with `luckyNoPlan`/`luckyPlanReady` as the fallbacks
 * substituted when the server sent no text. `{reason}` itself is
 * `flight/lucky-plan.ts`'s own English reasoning/refusal line and passes
 * through untranslated — the server-message stance
 * `fly-status-i18n.test.ts` documents for `res.message`: a server-side
 * slice, not this one.
 * This slice closes the fly bar's last client-generated `#fly-status`
 * literals — the multi-lane fleet-launch branch of the submit handler
 * (`web/features/fly.ts`, the `lanes > 1` path that POSTs `/api/fleet`
 * instead of `/api/fly`), which the single-flight status sweep above did
 * not reach: `lanesFixedFiringCount` for the total-spend-mode refusal
 * painted before any request, `fleetLaunched`/`fleetLaunchFailed` for the
 * response-shape fallbacks when the server sent no `lines`, and
 * `fleetLaunchDashboardDown` for the fetch-rejected case (the fleet twin of
 * `launchFailed`). The server's own `lines` — one per lane — still pass
 * through untranslated, the same `res.message` stance as every other fly
 * bar message the server composes.
 * This slice translates the fly bar's TOTAL flight-progress label — the
 * progress bar's visible text and its `aria-label` — which
 * `web/features/fly.ts`'s `renderTotalProgress()` composed as an English
 * concatenation around two clauses `web/flight-progress.ts`'s
 * `flightProgressOf()` composed in English itself. That helper stays
 * spliced into the bundle (`fly.test.ts` pins its `.toString()`), so unlike
 * `flightRowStatusText()` above it cannot simply be dropped in favour of
 * `tr()` at the call site; instead the bundle's `tr` is INJECTED into it as
 * a sixth parameter, the same route its `fmtCost`/`fmtDuration` formatters
 * already take. `flightProgressLabel` is the outer
 * `{elapsed}`/`{progress}`/`{pct}`/`{eta}` template (Hebrew puts the verb
 * first: "חלפו {elapsed}"), `flightProgressSpentOfTotal` `{spent}`/`{total}`
 * and `flightProgressFiringsSoFar` `{done}`/`{count}`/`{spent}` are the two
 * progress clauses, and `flightProgressEta` `{eta}`/`flightProgressFinishingUp`
 * are the trailing ETA clause — each carrying its own leading " · "
 * separator, the `flightRowWatchdogSuffix` shape. `fmtElapsed`/`fmtDuration`'s
 * unit letters ("2m 40s") stay Latin in Hebrew like the digits beside them.
 * The spliced `flyHintText()` sentence (`web/fly-hint.ts`) was the same shape
 * of holdout — `flyHintFixedMode`/`flyHintTotalMode`/`flyHintCapsWithTurns`/
 * `flyHintCapsNoTurns` closed it the same route (`tr` injected as a sixth
 * parameter, `{caps}` a pre-rendered clause like `flightProgressLabel`'s
 * `{progress}`/`{eta}`).
 * This slice finishes the Inbox "Drop a note" form behind the `<details>`
 * above (`tasksSection()`'s `.inbox-add`): its heading (`inbox`) and trigger
 * (`inboxSummary`) were translated earlier, but the form itself stayed
 * English — the textarea's `<label>` (`inboxNoteLabel`) and `placeholder`
 * (`inboxNotePlaceholder`), the submit button (`inboxDropNote`), and its
 * `data-tip`/`aria-label` (`inboxDropNoteTip`, ONE key for both because the
 * button's tip IS its accessible name and `inbox-add.test.ts` pins them
 * equal) — as did the two `aria-live` status lines its submit handler paints
 * (`inboxNoteDropped`/`inboxNoteDropFailed`, `tr()` at paint time, the
 * `removing`/`resetting` route). `pnpm i18n:untagged` never listed any of
 * them: the form is built with DOM calls (`el()`/`createElement`), not an
 * HTML template the tag scanner reads. `INBOX/` and `ORIENT` stay Latin in
 * Hebrew, like `KEEPER`/`OTLP` — a directory name and a phase name.
 * The same runtime-`textContent` hole in three more delegated handlers
 * closes next: the SOUL editor's submit paints `soulProposed`/
 * `soulProposeFailed` into its `aria-live` status, the github-sync click
 * swaps the button label to `githubSyncing` for the request's duration, the
 * github-pr submit paints `githubPrOpening` into its result span, and both
 * GitHub handlers' network-error branch paints `githubRequestFailed` — one
 * key for both, they are the same surface and the same sentence (the
 * pool/report panels keep their own copies because they are separate
 * surfaces). All five route through `tr()` at paint time, the
 * `inboxNoteDropped` way.
 * This slice tags the Inbox form's older sibling directly above it: the
 * Tasks panel's "Add a task" form (`tasksSection()`'s `.task-add`, the human
 * side of the board), whose label (`taskNewLabel`), placeholder
 * (`taskNewPlaceholder`), "Add" button (`taskAdd`), and the button's
 * `data-tip`/`aria-label` (`taskAddTip`, ONE key for both because
 * `task-add-button-tooltip.test.ts` pins them equal, the `inboxDropNoteTip`
 * shape) were still plain English — built with the same DOM calls the tag
 * scanner cannot see. Its submit handler paints no status text (it clears
 * the input and refreshes), so unlike the Inbox form there is no `tr()`
 * companion; the four tags plus `renderFleet()`'s existing `translateDom()`
 * sweep cover the whole surface. "AUTOPILOT" stays Latin in Hebrew, a
 * product name like the `ghIssueConfirm`/`githubPrConfirm` dialogs above.
 * This slice tags the live worker card's action line (`liveWorkerCard()`'s
 * tool/target spans): its two tips (`liveToolTip`, `liveTargetTip`) the
 * `data-i18n-tip` way, and its "tool: "/"target: " screen-reader prefixes
 * (`liveToolAria`, `liveTargetAria`) as `{name}` templates — which needed a
 * new `translateDom()` sweep, `[data-i18n-aria-template]` (the `aria-label`
 * twin of `[data-i18n-template]`, reading the same `data-i18n-name`), since
 * an aria-label wrapping a live value has no fixed text `[data-i18n-aria]`
 * can paint. The gauge label's `cardActivityAria` prefix rides the same
 * sweep, closing the mid-session-switch gap the previous slice left open.
 * Tool names (`Bash`, `Grep`) and targets (paths, commands) stay Latin in
 * Hebrew — they are the live value in the `{name}` slot, never translated.
 * This slice tags the rest of `liveWorkerCard()`'s own lines: the "live —
 * firing in progress" label (`liveLabel`, `data-i18n`), the narrator/task/
 * count/turns/progress tips (`live*Tip`, `data-i18n-tip`), and every line
 * wrapping a live value — the phase pill's "current phase: " prefix
 * (`livePhaseAria`), the "🎯 working: "/"probably working: " task lines
 * (`liveFocusTask`/`liveProbableTask`, text AND aria from one key), the
 * "recent actions: " prefix (`liveCountAria`) — as `{name}` templates
 * painted via `tr()` at build and swept as `[data-i18n-template]`/
 * `[data-i18n-aria-template]`. Phase names, task titles and the count label
 * itself stay as-is in the slot. The phase pill's own `data-tip` (the shared
 * `OFFICE_TIPS` map, also read by the office map and the activity phase
 * rail) and the callsign/model/fixation chips' text from `live-progress.ts`
 * helpers stay English — a later slice.
 * This slice tags the Firing Replay playback controls inside a drilled-open
 * trace row (`web/features/firing-timeline.ts`): the "▶ Step through"
 * toggle and the Prev / Next / Exit bar it opens — visible text via
 * `data-i18n`, concise aria-label via `data-i18n-aria`, full tip via
 * `data-i18n-tip` (`replay*`). The "Step N of M" position label is an
 * aria-live region whose text `replayNav()` composes, so only its tip was
 * tagged there — a later slice (below) makes it a two-slot template.
 * The next slice tags the same row's "View diff" / "Hide diff"
 * toggle (`diffView` / `diffHide`, one state-aware key for text and
 * aria-label; `diffViewTip` / `diffHideTip` for the tip) and its three
 * muted placeholders (`traceLoading`, `diffLoading`, `diffEmpty`).
 * The slice after that tags the row's own count / started-ago tips
 * (`firingCountTip` / `firingStartedTip` — the labels are composed and stay
 * as-is) and the "🔧 auto-fixed" chip's text, tip and aria-label
 * (`autoFixed` / `autoFixedTip` / `autoFixedAria`), the same three keys also
 * tagging the flight log's copy of that chip in `shell.ts`.
 * The slice after that tags the flight log rows' own cost / real-cost /
 * happened-ago tips (`flightCostTip` / `flightAgoTip` / `flightRealCostTip`
 * on a flat row, `flightSliceCostTip` / `flightSliceAgoTip` on a slice-run
 * group's member rows, `flightGroupAgoTip` on its collapsed head) — the
 * chips' text and aria-labels are composed from live values and stay as-is.
 * The slice after that finishes the replay's "Step N of M" position label
 * (`replayPosition`, a `{step}`/`{total}` template; `replayNoSteps` for an
 * empty trace): the bundle's `tr` is injected into the spliced `replayNav()`
 * the way `flightProgressOf()` takes it, and the label carries its slots as
 * a `data-i18n-args` JSON map — new to `translateDom()`'s template sweep,
 * the DOM twin of `tr()`'s substitution map — so a mid-session switch flips
 * the live region in place.
 * The slice after that tags the flight log's commit-sha chip (`flightShaTip`
 * / `flightShaAria`, `{name}` templates reading the chip's `data-i18n-name`)
 * and the slice-run group head's composed cost tip (`flightGroupCostTip`, an
 * `{n}` template reading `data-i18n-args`) via `translateDom()`'s new
 * `[data-i18n-tip-template]` sweep, the `data-tip` twin of the aria one.
 * The slice after that tags the flight log's "slice of <task>" chip
 * (`flightSliceChip` / `flightSliceChipTip` / `flightSliceChipAria`): its
 * text truncates the title (`{short}`, a `data-i18n-args` slot) while its
 * tip and aria-label carry the full one (`{name}`) — the first element to
 * ride the text, tip and aria template sweeps at once.
 * The slice after that tags the guard-denial chip (`flightGuardChip` /
 * `flightGuardChipTip` / `flightGuardChipAria`, `{n}` templates reading the
 * chip's `data-i18n-args`) on both surfaces that build it from
 * `web/anomaly.ts`'s `guardDenialChipMeta` — the flight log row and the
 * per-firing trace row — so a bounced firing reads the same in both.
 * The slice after that tags `web/features/office-map.ts`'s own two
 * self-contained strings — the orbiting subagent satellites' tip/aria-label
 * (`officeSubagent`, a `{name}` template embedding the live subagent's
 * label) and the map SVG's own aria-label (`officeMapAria`, a `{name}`
 * template embedding the live phase key) — via `tr()` at build plus
 * `[data-i18n-tip-template]`/`[data-i18n-aria-template]` reading the
 * element's own `data-i18n-name`. The zone rects' and the live dot's
 * tips/aria-labels stay English: both embed the shared `OFFICE_TIPS` map
 * (also read by `liveWorkerCard`/`renderStatTiles`/the activity phase rail),
 * already flagged above as a later slice.
 * The slice after that tags the live worker card's fixation-warning chip
 * (`shell.ts`'s `liveWorkerCard()`, built from `live-progress.ts`'s
 * `orientFixationChipMeta`): `orientFixationTipSingular`/`Plural` for the
 * tip and `orientFixationAriaSingular`/`Plural` for the aria-label — two
 * distinct sentences, so unlike `consoleLinesAria` they can't share one key
 * between the two attributes. The call site picks the template key by
 * `turnsSeen === 1`, same as `flight-console.ts`'s line-count aria, with
 * `{n}` riding `data-i18n-args`. The callsign/model chips built by
 * `liveWorkerHeadMeta` and the phase pill's `OFFICE_TIPS` tip stay English —
 * still a later slice.
 * This slice closes the `pnpm i18n:untagged` finding on the contributor
 * standing panel's landmark (`shell.ts`'s `<section id="contributor-standing-panel">`,
 * a static server-rendered element like `#pool-client-panel`/`#publicity-panel`
 * beside it): `contributorStandingPanel` tags its `aria-label` the same way.
 * Same pattern again for the neighboring `#contributor-issue-list-panel`
 * landmark: `contributorIssueListPanel` tags its `aria-label`.
 */

import { DEFAULT_LOCALE, type LocaleName } from './locales.js';

/** English is the source of truth for which keys exist — every other
 *  locale's table is checked against this shape by `translations.test.ts`. */
const EN_STRINGS = {
  skipToFleet: 'Skip to fleet',
  connect: 'Connect',
  loginClaude: 'Log in with Claude',
  testConnection: 'Test connection',
  tour: 'Tour',
  tourTip: 'A short guided tour: firing, slice, gate, flight',
  // The overflow menu (epic 0017 slice 3): Tour, the docs and Report from here.
  moreNav: 'More: tour, docs, report from here',
  moreTip: 'Tour, the docs, report from here',
  docsLink: 'Docs',
  docsLinkTip: 'The documentation index on GitHub (opens a new tab)',
  benchmarkLink: 'Benchmark',
  benchmarkLinkTip: 'Every model the fleet has flown, compared on its own firings',
  reportBtn: 'Report from here',
  reportBtnTip: 'Capture this page for an issue, a quick fix or a note — a preview first, always',
  claudeAuthLabel: 'Claude authentication',
  authModeSubscription: 'Subscription (default)',
  authModeApiKey: 'API key',
  authModeOauthToken: 'Subscription token (headless)',
  credentialLabel: 'Credential',
  saveVerify: 'Save & verify',
  themeNav: 'Theme',
  languageNav: 'Language',
  themeMenuTip: 'Choose a color theme',
  themeDark: 'Dark',
  themeLight: 'Light',
  themeTerminal: 'Terminal',
  themeTipDark: 'Switch to the dark theme',
  themeTipLight: 'Switch to the light theme',
  themeTipTerminal: 'Switch to the terminal theme',
  langMenuTip: 'Choose a language',
  flyFolder: 'Fly a folder',
  browse: 'Browse…',
  flyOptions: 'Options',
  flyOptionsAria:
    'Show or hide the launch settings: browse, budget mode, firings, $ per firing, lanes',
  flyOptionsTip:
    'Show or hide the launch settings — browse, budget mode, firings, $ per firing, lanes',
  byCount: 'by count',
  byTotal: 'by total $',
  firings: 'Firings',
  stopAtTotal: 'Stop at total $',
  perFiringBudget: '$ / firing',
  lanes: 'Lanes',
  flyIt: 'Fire',
  flying: 'Flying…',
  queued: 'Queued…',
  resume: 'Resume',
  pause: 'Pause',
  stop: 'Stop',
  searchProject: 'Search a project',
  search: 'Search',
  searchQueryAria: 'Search query or question',
  // web/features/search.ts's four result-state notes (board
  // web-msnsndki-dz3vn1): each paints via tr() at birth and carries its key.
  searchPickProject: 'Pick a project and type a query.',
  searchSearching: 'Searching…',
  searchNoMatches: 'No matches.',
  searchFailed: 'Search failed.',
  deep: 'Deep',
  ask: 'Ask',
  // web/features/search.ts's Ask flow (board web-msnsndki-dz3vn1): the
  // button's busy label (tagged with THIS key mid-request, so a fleet tick's
  // sweep repaints it and not the idle `ask`), and the four #ask-answer notes
  // — each paints via tr() at birth and carries its key.
  askAsking: 'Asking…',
  askPickProject: 'Pick a project and type a question first.',
  askThinking: 'Asking the model (grounded in the indexed code)…',
  askThinkingDeep: 'Reading the project to find the answer (Deep)…',
  askFailed: 'Ask failed — is the dashboard still running?',
  // The follow-up slice flagged in fd617a93's commit body (board
  // web-msnsndki-dz3vn1): the ARCHITECT proposal card's summary/status/
  // confirm strings, the completed answer's "sources:" line, and the live
  // tool-activity chip's tip/aria — search.ts's renderProposal()/
  // renderAnswer()/renderActivity(). architectProposes/proposalFailed/
  // askActivityAria/askSources/askSourcesAria are {name}-templates (like
  // liveToolAria above) embedding live, untranslated data (a tool name, a
  // server error string, a joined file list) inside fixed UI text.
  architectProposes: 'ARCHITECT proposes: {name}',
  proposalRunning: 'Running…',
  proposalDone: 'Done.',
  proposalFailed: 'Failed: {name}',
  proposalUnknownError: 'unknown error',
  proposalRequestError: 'request error.',
  proposalConfirm: 'Confirm',
  proposalConfirmDestructive: 'Confirm (destructive)',
  proposalConfirmTip: 'Run this proposed action',
  proposalConfirmDestructiveTip: 'This action cannot be undone — confirm to run it',
  askActivityTip: 'A tool call the model made while researching this answer',
  askActivityAria: 'Tool call: {name}',
  askSources: 'sources: {name}',
  // The answer's footer (2026-09-13): who answered, how long, what it cost.
  askMeta: 'answered by {model} · {time} · {cost}',
  askSourcesTip: 'Indexed files the model consulted to ground this answer',
  askSourcesAria: 'Sources: {name}',
  askPersona: 'Ask persona',
  personaGenius: 'GENIUS',
  personaArchitect: 'ARCHITECT',
  // The searchbar's five data-tip hover texts (board web-msnsndki-dz3vn1) —
  // the last static data-tips in renderShell() left English after the
  // fly-bar/masthead tip slices; tagged data-i18n-tip so translateDom()'s
  // existing [data-i18n-tip] sweep rewrites them on a locale switch.
  searchTip:
    'Find matching code in the selected project — hits list the file, line, and surrounding excerpt.',
  askDeepTip:
    'Escalate to a read-only agentic session (Read/Grep/Glob, up to 10 turns) that can go looking for the answer instead of relying on the indexed excerpts',
  // The escalation-offer affordance (ASK/ARCHITECT answer-quality doctrine
  // slice 3, docs/epics/0022-ask-answer-quality-doctrine.md, board
  // web-mtt5qwjp-xns6ps): search.ts's renderOffer() shows this button only
  // when the terminal frame's lowConfidence signal is true AND the request
  // that produced it was NOT already Deep — clicking it checks #ask-deep and
  // re-asks the same question in one click. Static, translated copy, never
  // model-generated (epic's own framing note) — it opens no injection
  // surface and never auto-fires Deep on its own.
  askLowConfidenceOffer: 'Not confident in that answer — try Deep?',
  askLowConfidenceOfferTip:
    'Re-ask this exact question with Deep escalation (a read-only agentic session that can go looking for the answer)',
  askTip:
    'Ask the question instead of searching — an AI answer built from the indexed code streams in below.',
  // (#30's parallel Ask/ARCHITECT vocabulary — ask* variants and the whole
  // control* family — pruned 2026-09-08: the fleet's own keys above are the
  // live ones and every #30 key had ZERO references outside this table.
  // The pruning also cleared the 0.2KB core raw-budget overage the merged
  // double-vocabulary caused — the deferred-locale-table VERDICT remains
  // the structural fix when the wall knocks next.)
  personaGeniusTip:
    'Read-only persona (default): answers questions but never touches the dashboard.',
  personaArchitectTip:
    'Can propose dashboard actions for you to approve — opt-in per session, resets to GENIUS on reload.',
  fleetSummary: 'Fleet summary',
  liveWorkers: "Who's flying now",
  fleetPerformance: 'Fleet performance',
  keeperPrReview: 'KEEPER PR review',
  fleetMain: 'Fleet',
  connectingFleet: 'Connecting to the fleet…',
  liveWorkersLabel: 'flying now',
  fleetEmptyTitle: 'No projects flying yet',
  fleetEmptyHint: 'Onboard a repo to watch it here. To see the dashboard populated now, run:',
  updatedConnecting: 'connecting…',
  offlineRetrying: 'offline — retrying…',
  brbTitle: 'Be right back',
  brbSub: 'Building something cool while we reconnect…',
  updateBannerAria: 'Software update available',
  updateBannerText: 'A new version is ready: v{from} → v{to}',
  updateNow: 'Update now',
  // THE VERSION MENU (2026-09-13): the masthead chip and its popover.
  versionSummaryTip:
    'Running this version — open for the newest-release check and the run-the-latest button',
  versionSummaryAria: 'Version',
  versionChecking: 'checking for the newest release…',
  versionUnknown: 'Could not reach the release list — check the connection and try again.',
  versionLatest: 'v{version} is the newest release · checked {time}',
  versionAvailable: 'v{from} → v{to} is available',
  versionUpToDate: 'Already on the latest version.',
  versionRunLatest: 'Run the latest',
  versionRunUpdate: 'Update to v{to}',
  versionCheckNow: 'Check now',
  versionRunTip:
    'Pulls the newest release, reinstalls, rebuilds and restarts the dashboard — a clean reset onto the latest, even when you are already on it',
  versionRunNote:
    'Local progress is never touched: with uncommitted changes you are asked before they are parked in git stash.',
  updateLater: 'Later',
  updateInProgress: 'Updating — pulling, installing, restarting… the dashboard reconnects itself',
  updateDirtyPrompt:
    'Local progress detected. Park it safely in git stash and update? ("git stash pop" restores it afterwards)',
  updateStashAndGo: 'Stash & update',
  updateRefused: 'Update refused: ',
  offlineRetryingTip: 'Lost the connection to the server — it will keep retrying automatically',
  removeCard: 'Remove',
  soulEditorSummary: 'view/edit SOUL',
  soulEditorLabel: "This project's live SOUL text — edit and propose a change",
  soulEditorSubmit: 'Propose edit',
  soulProposed: 'Proposed — review it above to ratify or dismiss.',
  soulProposeFailed: 'Could not propose the edit — try again.',
  soulProposalSummary: '◇ SOUL proposal pending — review',
  soulRatify: '✓ ratify',
  soulDismiss: '✗ dismiss',
  soulUnratify: '↺ un-ratify',
  // The card head's "◐ SOUL unreviewed" badge-button (shell.ts's
  // soulReviewBtn(), board web-msnsndki-dz3vn1). Its aria-describedby tip
  // stays the English sentence for now — only the visible label rides the
  // [data-i18n] sweep. The fleet-wisdom banner's ✓ ratify / ✗ dismiss pair
  // reuses soulRatify / soulDismiss above rather than minting twins.
  soulUnreviewed: '◐ SOUL unreviewed',
  startOver: '↺ Start over',
  prReviewTitle: 'KEEPER PR review',
  prReviewApply: 'Apply',
  prReviewFetchFailed:
    'The open-PR list could not be read from gh — an outage, not a confirmed-empty queue; the next poll retries.',
  // web/pr-review-panel.ts's spliced helpers (board web-msnsndki-dz3vn1):
  // the confirm dialog, the EXECUTE tip, and the execute-result sentences —
  // each takes an injected tr() the same route flightProgressOf/the
  // connect-panel.ts family took. The ✓/✗/🟣 marks stay literal glyphs in
  // the calling code, not part of these templates. prReviewApplying is the
  // Apply button's in-progress label, written at click time so translateDom's
  // markup sweep never sees it — the same reasoning connect.ts's "testing…"/
  // "saving…" lines follow.
  prReviewMergeLabel: 'merge',
  prReviewRequestChangesLabel: 'request changes',
  prReviewQueueForHumanLabel: 'queue for human',
  prReviewAwaitingApprovalLabel: 'awaiting approval to run CI',
  prReviewConfirmMessage:
    'Apply KEEPER review to #{number} "{title}"?\n\nDecision: {decision}\n{reasoning}\n\nThe decision is re-derived fresh from gh at execute time — this will not blindly trust what is shown here if the PR changed.',
  prReviewConfirmUndoMerge:
    ' This approves AND squash-merges the PR — it cannot be undone by this dashboard.',
  prReviewExecuteTip: 'Apply KEEPER review to #{number}: {decision}.',
  prReviewExecuteTipUndoOther: ' This posts a review/comment on GitHub — reversible there.',
  prReviewUnknownDecision: 'unknown',
  prReviewStaleDecision:
    'Not applied — the PR changed since this preview; the fresh verdict is now "{fresh}". Review the updated plan (it refreshes shortly) and apply again.',
  prReviewExecuteFailedGeneric: 'PR review execute failed.',
  prReviewCommandFailedSuffix: ' failed (exit {code}).',
  prReviewApplying: 'Applying…',
  // web/features/coordination.ts (board web-msnsndki-dz3vn1): the FLEET
  // COORDINATION panel's own literal text — title, loading placeholder, and
  // the empty/unavailable states. The coordination lines themselves stay as
  // served (they quote the firing prompt's FLEET digest verbatim).
  coordinationTitle: 'Fleet coordination',
  coordinationLoading: 'Checking for sibling claims and in-flight intents…',
  coordinationEmpty: 'No sibling claims or in-flight intents detected right now.',
  coordinationUnavailable: 'Fleet coordination unavailable.',
  // web/features/docs-viewer.ts (board web-msnsndki-dz3vn1): the project
  // page's Docs reader panel — title, and the empty/fetch-failure states.
  docsTitle: 'Docs',
  docsEmpty: 'No indexed documents yet.',
  docsUnavailable: 'Docs unavailable.',
  // web/features/docs-viewer.ts (epic 0023 "the docs reader" slice 3): the
  // split-preview editor's own static text — the edit toggle beside the path
  // heading, and its Save/Cancel buttons. The dynamic result line ("✗
  // <reason>" on a refused save) stays English-only, the same convention
  // every other execute-result line in this codebase already follows.
  docsEditToggle: 'Edit',
  docsEditSave: 'Save',
  docsEditCancel: 'Cancel',
  // web/features/round-panel.ts (board web-msnsndki-dz3vn1): the CURRENT
  // ROUND panel's own literal text — title, loading/unavailable states, and
  // the "no release tags yet" fallback.
  roundTitle: 'This round',
  roundLoading: 'Loading round totals…',
  roundUnavailable: 'Round totals unavailable.',
  roundNoTags: 'No release tags yet — every firing counts toward the round so far.',
  roundSinceTagTip: 'This project’s most recently created git tag',
  // web/stat-tiles.ts's roundSinceLabel/roundStatItems (board
  // web-msnsndki-dz3vn1): the "since <tag>" chip and the firings/shipped/
  // spend/ship-rate chips' tip word and composed aria-label, the last
  // surface round-panel.ts's own note had left "English-only for now".
  // `tr` rides injection the same route flightProgressOf's clauses take
  // (a pure math module spliced via .toString() cannot import a
  // translator), so each locale's grammar decides where {tag}/{ago}/{n}/
  // {cost}/{pct} land.
  roundSinceChip: 'since {tag} · {ago}',
  roundSinceChipAria: 'round boundary: since {tag}, {ago}',
  roundFiringsTip: 'Firings this round',
  roundFiringsAria: '{n} firings this round',
  roundShippedTip: 'Shipped this round',
  roundShippedAria: '{n} shipped this round',
  roundSpendTip: 'Spend this round',
  roundSpendAria: 'cost this round: {cost}',
  roundShipRateTip: 'Ship rate this round',
  roundShipRateAria: 'ship rate this round: {pct}',
  budgetMode: 'Budget mode: fixed firing count or total spend target',
  budgetModeLabel: 'Budget mode',
  activeFlights: 'Active flights',
  otlpExportConfigured: 'OTLP export: configured',
  otlpExportTip:
    'An OTEL_EXPORTER_OTLP_* endpoint is configured — every flight exports its spans there',
  searchPlaceholder: 'find code — or ask a question…',
  flyFolderPlaceholder: 'absolute path to a git repo',
  notifySettings: 'Notification settings',
  notifySettingsTip: 'Browser notifications when a flight needs you or is dying',
  notifyEnable: 'Notify me when a flight needs me or is dying',
  quietHours: 'Quiet hours',
  quietHoursStart: 'Quiet hours start',
  quietHoursEnd: 'Quiet hours end',
  notifyEnableTip:
    'Asks the browser for permission, then notifies when a project needs you, hits an anomaly, or lands.',
  notifyQuietStartTip:
    'Start of the daily quiet window — popups are suppressed, the dashboard chip still updates.',
  notifyQuietEndTip: 'End of the daily quiet window — popups resume after this time.',
  notifyBlockedHint: 'Blocked by your browser — check this site’s notification permission.',
  notifyUnsupportedHint: 'Notifications are not supported in this browser.',
  detailsSummary: 'Details',
  gate: 'Gate',
  backup: 'Backup',
  languages: 'Languages',
  topDirectories: 'Top directories',
  activity: 'Activity',
  metrics: 'Metrics',
  inbox: 'Inbox',
  firingActivity: 'Firing activity',
  activityHeatmapAria:
    'Firing activity over the last {weeks} weeks — green days shipped, red days had a death',
  activityHeatmapLegend: 'green = shipped · red = died · gray = other activity',
  inboxSummary: 'Drop a note',
  inboxNoteLabel: 'Drop a note for the next firing',
  inboxNotePlaceholder:
    'context, a plan, a correction — read fresh at the start of the next firing',
  inboxDropNote: 'Drop note',
  inboxDropNoteTip: 'Write a note into INBOX/ — every firing reads it fresh, ahead of ORIENT',
  inboxNoteDropped: 'Note dropped — the next firing will read it.',
  inboxNoteDropFailed: 'Could not drop the note — try again.',
  hotFiles: 'Hot files',
  hotFilesAria: 'Hot files: the largest tracked files by byte size, not frequently changed',
  flightLog: 'Flight log',
  flightLogAria:
    'Flight log: every firing this project has flown, newest first, click a row to expand it',
  // The flight log's server round-trip for firings older than the initial
  // window carried; the tip doubles as the button's accessible name.
  flightLogLoadMore: 'Load older firings',
  flightLogLoadMoreLoading: 'Loading…',
  flightLogLoadMoreTip:
    'Fetch firings older than what the browser already holds — a real server round-trip, not a local reveal',
  // The "Show all (N)" / "Show fewer" toggle above that button
  // (web/flight-log-rows.ts's spliced flightLogMoreMeta(), which takes the
  // bundle's tr() injected the replayNav way): {n} is the locally-held row
  // count, {compact} the collapsed window. Each state's tip doubles as the
  // button's accessible name; the counts ride data-i18n-args for the sweep.
  flightLogShowAll: 'Show all ({n})',
  flightLogShowAllTip: 'Reveal all {n} locally-held firings, not just the most recent {compact}',
  flightLogShowFewer: 'Show fewer',
  flightLogShowFewerTip: 'Collapse back to the most recent {compact} firings',
  firingTrace: 'Per-firing trace',
  firingTraceAria:
    'Per-firing trace: every firing for this project, grouped and collapsible, unlike the Activity feed above which only shows the last flight',
  // The Firing Replay playback controls inside a drilled-open trace row
  // (web/features/firing-timeline.ts's firingTimelineSection(): the
  // "▶ Step through" toggle and the Prev / Next / Exit bar it opens). Each
  // button's visible text rides [data-i18n], its concise aria-label
  // [data-i18n-aria], its full data-tip [data-i18n-tip] — Exit's text and
  // aria-label share replayExit, the D1 attribute-payload audit having
  // already made them identical. The "Step N of M" position label between
  // Prev and Next is an aria-live region whose announced text replayNav()
  // (web/replay-nav.ts) composes, so it is a two-slot {step}/{total}
  // template (replayPosition; replayNoSteps for an empty trace) the bundle's
  // tr() fills inside the spliced helper, and the element carries the slots
  // as a data-i18n-args map for the sweep — never a fixed-text data-i18n
  // tag. The ‹ › glyphs are bidi-mirrored characters, so Hebrew keeps them:
  // the browser flips them with the layout.
  replayStart: '▶ Step through',
  replayStartAria: 'Step through',
  replayStartTip: 'Replay this firing one action at a time with Prev and Next controls',
  replayPrev: '‹ Prev',
  replayPrevAria: 'Previous action',
  replayPrevTip: 'Step back to the previous action in this replay',
  replayPositionTip: 'Your position in this replay — Left and Right arrow keys also step',
  replayPosition: 'Step {step} of {total}',
  replayNoSteps: 'No steps',
  replayNext: 'Next ›',
  replayNextAria: 'Next action',
  replayNextTip: 'Advance to the next action in this replay',
  replayExit: 'Exit replay',
  replayExitTip: 'Leave playback and show the full trace list',
  // The same trace row's "View diff" / "Hide diff" toggle and its muted
  // placeholders. The toggle's text and aria-label are identical (the D1
  // attribute-payload audit), so ONE state-aware key serves both — the
  // replayExit shape; its tip's English entries are pinned equal to
  // web/diff-view.ts's diffToggleTip() literals (the spliced default) by
  // firing-diff-i18n.test.ts so the two cannot drift. The placeholders show
  // while the trace / diff fetch is in flight, or once the diff endpoint
  // answered with nothing.
  diffView: 'View diff',
  diffHide: 'Hide diff',
  diffViewTip: "Show this firing's code diff — the git commit patch it shipped",
  diffHideTip: 'Hide this diff',
  traceLoading: 'Loading full trace…',
  diffLoading: 'Loading diff…',
  diffEmpty: 'No diff available for this firing.',
  // The same drill-down's commit-time review summary (docs/BACKLOG-999.md
  // C5): {model}/{n}/{reason} ride data-i18n-args; the findings under it are
  // the reviewer's own words and carry no key.
  reviewFindings: 'Commit review ({model}): {n} finding(s)',
  reviewClean: 'Commit review ({model}): no findings',
  reviewSkipped: 'Commit review skipped: {reason}',
  reviewTip:
    'A fresh model read this diff after the gate passed. Advisory: it never reverts a commit.',
  // The same trace row's own hover tips on its composed count ("3 actions")
  // and started-ago ("2m ago") fields — the labels are
  // firingTimelineRowMeta()'s composed strings and stay as-is, only their
  // tips carry a key — plus the "🔧 auto-fixed" chip a formatting-rescued
  // firing carries: text, full tip, and screen-reader aria-label. The flight
  // log's rows (shell.ts's flightLogSection()) build the SAME chip from the
  // same three literals, so one set of keys tags both surfaces.
  firingCountTip: 'Tool calls and activity recorded for this firing',
  firingStartedTip: 'When this firing started',
  // Epic 0025 slice 2 continuation (icons, board web-mtzpcw6f-26443t): no
  // more baked-in 🔧 glyph — the callers (shell.ts, features/
  // firing-timeline.ts) now pass tipChip() a leading wrench icon instead.
  autoFixed: 'auto-fixed',
  autoFixedTip:
    'The gate failed a formatting check; mechanical remediation fixed it automatically and this firing shipped clean instead of reverting.',
  autoFixedAria: 'auto-fixed: formatting was mechanically remediated before this firing shipped',
  // The flight log rows' cost / real-cost / happened-ago chips (shell.ts's
  // flightLogNode() flat rows, flightGroupRow()'s member rows and its
  // collapsed head) — their text ("$0.20", "real $0.05", "2m ago") and
  // aria-labels are composed from live values and stay as-is; only the tips
  // carry a key, the firingCountTip / firingStartedTip shape. The group
  // head's cost tip ("Total spend across all N slices") is composed too and
  // stays untagged until a template slice.
  flightCostTip: 'Total spend for this firing',
  flightAgoTip: 'When this firing happened',
  flightRealCostTip:
    'Real cost: this spend apportioned by your subscription share, not API list-price',
  flightSliceCostTip: 'Spend for this slice',
  flightSliceAgoTip: 'When this slice happened',
  flightGroupAgoTip: 'When the most recent slice happened',
  // The flight log's commit-sha chip (flightLogRowMeta's shaTip/shaAriaLabel
  // in web/flight-log-rows.ts) and the slice-run group head's cost tip
  // (flightGroupHeadMeta's costTip): each wraps a live value, so they ride
  // translateDom()'s [data-i18n-tip-template] / [data-i18n-aria-template]
  // sweeps — {name} from the chip's data-i18n-name, {n} from data-i18n-args.
  flightShaTip: 'Commit: {name}',
  flightShaAria: 'commit {name}',
  flightGroupCostTip: 'Total spend across all {n} slices',
  // The flight log's "slice of <task>" chip (sliceChipMeta in
  // web/flight-log-rows.ts) on an isolated slice firing: its text wraps the
  // title truncated at 40 chars ({short}, from data-i18n-args) while its tip
  // and aria-label wrap the full title ({name}, from data-i18n-name) — one
  // chip riding translateDom()'s text, tip and aria template sweeps at once.
  flightSliceChip: 'slice of {short}',
  flightSliceChipTip: 'Part of a multi-firing task, still open: {name}',
  flightSliceChipAria: 'slice of {name}',
  // The guard-denial chip (guardDenialChipMeta in web/anomaly.ts) a firing
  // carries when the containment/read-hygiene guard denied one of its tool
  // calls — on the flight log row (shell.ts) AND the per-firing trace row
  // (features/firing-timeline.ts). Its text, tip and aria-label each wrap the
  // live denial count ({n}, from data-i18n-args), so all three ride the
  // template sweeps; the English is byte-identical to what the meta paints.
  // Epic 0025 slice 2 continuation (icons, board web-mtzpcw6f-26443t): no
  // more baked-in 🛡️ glyph — the callers pass tipChip() a shield icon.
  flightGuardChip: '{n} blocked',
  flightGuardChipTip:
    'The containment/read-hygiene guard denied {n} tool call(s) during this firing — it tried to step outside its boundary and was stopped.',
  flightGuardChipAria: 'guard blocked {n} tool call(s) this firing (containment / read-hygiene)',
  // The commit-review chip (commitReviewChipMeta in web/anomaly.ts, board
  // ap-mui3cjp9-3) on a flight log row whose independent diff review flagged
  // something. {n} is the finding count and {top} the most severe finding
  // (reviewer text, never translated), both from data-i18n-args; the English
  // is byte-identical to what the meta paints.
  flightReviewChip: '{n} flagged',
  flightReviewChipTip:
    "An independent reviewer read this firing's diff after the gate passed and flagged {n} possible problem(s) — advisory only, the gate verdict stands. Most severe: {top}",
  flightReviewChipAria: "commit review flagged {n} possible problem(s) in this firing's diff",
  // The per-firing trace row's step-cost line (shell.ts's actRow(), rendered
  // only in the reasoning drill-down — features/firing-timeline.ts). The tip
  // is fixed text, swept as [data-i18n-tip]; the aria prefix wraps the live
  // model/token text in {name}, painted via tr() and swept as
  // [data-i18n-aria-template]/[data-i18n-name] on a locale switch.
  actMetaTip: 'Model and token usage billed for this step',
  actMetaAria: 'step cost: {name}',
  tasks: 'Tasks',
  tasksFocusMode: 'Tasks — FOCUS MODE',
  boardViewColumns: 'Columns',
  boardViewList: 'List',
  boardColQueued: 'Queued',
  boardColActive: 'In flight · needs you',
  boardColDone: 'Done',
  // The task board's notes and per-task decision buttons (shell.ts's
  // tasksSection(), board web-msnsndki-dz3vn1): the FOCUS-MODE lock note, the
  // empty-board note, and ✓ approve / ✗ reject on a self-proposed task,
  // ✓ done on an open one. Only the buttons' visible label rides the
  // [data-i18n] sweep — their data-tip/aria-label stay the per-task
  // taskActionTip() sentence.
  tasksFocusNote: 'Focus locked: flights work ONLY the focused task(s) until done.',
  tasksEmpty: 'No tasks yet — add one below, or let the autopilot seed its own board as it flies.',
  taskApprove: '✓ approve',
  taskReject: '✗ reject',
  taskDone: '✓ done',
  // The board's keyboard legend (shell.ts's boardKeysHint(), epic 0026): one
  // label per key group — the <kbd> keys themselves are not translated.
  boardKeysMove: 'move',
  boardKeysOpen: 'open',
  boardKeysSelect: 'select',
  boardKeysExtend: 'extend',
  boardKeysSelectAll: 'select all',
  boardKeysApprove: 'approve',
  boardKeysDone: 'done',
  boardKeysLeave: 'leave',
  // Row selection (epic 0026): the leading checkbox's accessible name wraps
  // the task title in {name} (data-i18n-aria-template); the status line
  // under the legend counts the set through {n} riding data-i18n-args.
  taskSelectAria: 'Select: {name}',
  boardSelected: '{n} selected — Esc clears',
  // A row's read-only detail (epic 0026, Enter) when its task has no body.
  taskDetailEmpty: 'No description.',
  // The open task row's decorative drag handle (aria-hidden; the ↑/↓ buttons
  // are its accessible equivalent) — tip only, swept as [data-i18n-tip].
  taskDragTip: 'Drag to reorder',
  // The "Add a task" form under the Tasks heading (shell.ts's tasksSection(),
  // the human side of the board) — the Inbox form's older sibling, built the
  // same DOM-call way the tag scanner cannot see. taskAddTip is ONE key for
  // both data-tip and aria-label (task-add-button-tooltip.test.ts pins them
  // equal), the inboxDropNoteTip shape.
  taskNewLabel: 'New task',
  taskNewPlaceholder: 'what should this autopilot do?',
  taskAdd: 'Add',
  taskAddTip: 'Queue a new operator task for the autopilot to pick up',
  // The fleet card's gauge label (shell.ts's cardGauge(): the "N open
  // findings" count and last-activity timestamp above every card's severity
  // gauge). The two tips are swept as [data-i18n-tip]; cardActivityAria is
  // the timestamp span's screen-reader prefix, painted via tr() when the
  // section is built because its {name} slot carries the live "ago" text.
  cardFindingsTip: 'Unresolved review findings for this project — see the breakdown below',
  cardActivityTip: 'When this project last had any activity',
  cardActivityAria: 'last activity: {name}',
  // The severity gauge's all-clear segment (shell.ts's gaugeBar(): the single
  // role="img" span painted when the project has no open findings) — its tip
  // IS its accessible name, so ONE key rides both [data-i18n-tip] and
  // [data-i18n-aria].
  gaugeClearTip: 'No open findings',
  // The live worker card's action line (shell.ts's liveWorkerCard(): the
  // most recent tool call and the target it touched). The two tips are swept
  // as [data-i18n-tip]; the two aria prefixes wrap the live tool/target name
  // in their {name} slot, so they are painted via tr() when the card is
  // built AND swept as [data-i18n-aria-template] on a locale switch.
  liveToolTip: 'the most recent tool call this firing made',
  liveToolAria: 'tool: {name}',
  liveTargetTip: 'the file, command, or target that tool call touched',
  liveTargetAria: 'target: {name}',
  // The many-lanes grid's compact per-lane card (epic 0018 slice 2,
  // shell.ts's laneCard()): its own elapsed line, distinct from the single
  // live-worker card's liveTurnsTip (that one also covers a turn count and
  // progress-vs-average this compact card omits).
  liveElapsedTip: 'How long this lane has been running',
  // The rest of liveWorkerCard()'s own lines (the tool/target line above was
  // the first): the "live" label rides [data-i18n], the static tips ride
  // [data-i18n-tip], and the lines that wrap a live value — the phase pill's
  // aria prefix, the focus/probable task line's text AND aria, the
  // action-count aria prefix — are {name} templates painted via tr() at
  // build and swept as [data-i18n-template]/[data-i18n-aria-template]. Phase
  // names, task titles and the count label stay as-is in the {name} slot.
  liveLabel: 'live — firing in progress',
  livePhaseAria: 'current phase: {name}',
  liveNarratorTip: "AUTOPILOT's own one-sentence summary of its most recent action this firing",
  liveFocusTask: 'working: {name}',
  liveFocusTaskTip: 'The board task this firing is explicitly working on',
  liveProbableTask: 'probably working: {name}',
  liveProbableTaskTip:
    "AUTOPILOT's best guess at the task this firing is working on, inferred from the board queue — not a confirmed link",
  liveCountTip: 'Every action this live firing has taken, within the shared recent-activity window',
  liveCountTipCapped:
    'The shared recent-activity window is entirely this firing — it may have taken more actions than are visible here',
  liveCountAria: 'recent actions: {name}',
  liveTurnsTip:
    'An approximate turn count — adjacent tool calls collapse into one turn when they share the same model, token usage, and reasoning; the real cost is unknown until this firing lands',
  liveProgressTip:
    'Elapsed time for this firing against the average duration of past firings on this project',
  // The live worker card's fixation-warning chip (shell.ts's liveWorkerCard(),
  // board web-msnsndki-dz3vn1) — shown when orientFixation is true. The tip
  // and aria-label are two different sentences (not one string reused, like
  // consoleLinesAria), so each needs its own singular/plural pair; the
  // template key itself is chosen by turnsSeen === 1 at the call site, {n}
  // filling from data-i18n-args. The callsign/model chips built by
  // liveWorkerHeadMeta stay English — a later slice.
  orientFixationTipSingular:
    '{n} turn with no edit yet — may be stuck reading/planning instead of making progress',
  orientFixationTipPlural:
    '{n} turns with no edit yet — may be stuck reading/planning instead of making progress',
  orientFixationAriaSingular: 'possible fixation: {n} turn with no edit yet',
  orientFixationAriaPlural: 'possible fixation: {n} turns with no edit yet',
  // Status pills (shell.ts's statusPill(), board web-msnsndki-dz3vn1): the
  // fleet card header's project-status badge and the task board's per-task
  // status pill. Each status has a label key + its `Tip` twin; the pill's
  // aria-label is the ONE shared statusAria template, whose {label}/{tip}
  // slots translateDom() fills from the pill's own two keys — not a third
  // hand-synced string per status that could drift from its label and tip.
  statusAria: 'Status: {label} — {tip}',
  projectStatusRegistered: 'registered',
  projectStatusRegisteredTip: 'Registered but has not flown yet',
  projectStatusFlying: 'flying',
  projectStatusFlyingTip: 'A firing is in progress right now',
  projectStatusPaused: 'paused',
  projectStatusPausedTip: 'Paused — will not fly until resumed',
  projectStatusHibernating: 'hibernating',
  projectStatusHibernatingTip: 'No recent activity — skipped by the scheduler until it wakes',
  projectStatusNeedsYou: 'needs you',
  projectStatusNeedsYouTip: 'Blocked on a decision only you can make',
  taskStatusQueued: 'queued',
  taskStatusQueuedTip: 'Queued — waiting its turn in the flight queue',
  taskStatusInProgress: 'in progress',
  taskStatusInProgressTip: 'Currently being worked by the autopilot',
  taskStatusDone: 'done',
  taskStatusDoneTip: 'Completed and verified by the gate',
  taskStatusNeedsApproval: 'needs approval',
  taskStatusNeedsApprovalTip: 'Self-proposed — waiting on your approve/reject decision',
  taskStatusDeferred: 'deferred',
  taskStatusDeferredTip: 'Deferred — set aside for later',
  reportBugLabel: 'Report a bug or request a feature upstream',
  titleLabel: 'Title',
  titlePlaceholder: 'Title',
  detailsOptionalPlaceholder: 'Details (optional)',
  openGithubIssue: 'Open GitHub issue',
  // LLM ISSUE COMPOSER 2/3 (board web-mtpzdruu-vf25ry): the gh-issue-form's
  // free-text "note" path — Compose sends it to POST /api/report/compose
  // (slice 1/3's flight/report-compose.ts) for a local, tool-less model call
  // that writes a polished English title/body, then pre-fills the form's
  // existing title/body fields so the existing "Open GitHub issue" submit
  // (GithubIssueExecuteApi) stays a one-click act. The raw note itself is
  // never sent anywhere but that local compose endpoint.
  reportComposeNoteLabel:
    'Or describe it in your own words — Compose writes the title and body for you',
  reportComposeNotePlaceholder: 'What happened, or what you wish existed…',
  reportComposeButton: 'Compose',
  reportComposeTip:
    'Turns your note into a polished English title and body with a local model call — your raw words never leave this machine.',
  reportComposing: 'Composing…',
  reportComposeReady:
    'Composed — suggested labels: {labels}. Review the fields below, then submit.',
  reportComposeUnavailable: 'Compose is unavailable right now — try again shortly.',
  reportComposeRequestFailed: '✗ Compose request failed — try again shortly.',
  openPullRequest: 'Open pull request',
  checkForUpdates: 'Check for updates',
  fleetWisdomProposal: 'Fleet wisdom proposal',
  githubPrSummary: 'Contribute upstream',
  githubPrLabel: "Contribute {name}'s current branch upstream as a pull request",
  githubSyncing: 'Syncing…',
  githubPrOpening: 'opening…',
  githubRequestFailed: '✗ Request failed — try again shortly.',
  // web/card-actions.ts's githubSyncExecuteResult/githubPrExecuteResult
  // fallback text — used only when the server response carries no
  // details/error of its own.
  githubSyncResultOk: 'synced.',
  githubSyncResultFail: 'sync failed.',
  // The project page's settings-row hints beside "↺ Start over" and
  // "⇪ Sync to GitHub" (shell.ts renderProjectPage, board web-msnsndki-dz3vn1).
  startOverHint: 'Resets firings + ship-rate counters to 0/0. Tasks, index, and backups are kept.',
  githubSyncHint: 'Private by default. Creates a repo on first sync, pushes on every one after.',
  // The "⇪ Sync to GitHub" button's idle label (its click handler swaps the
  // button's data-i18n key to githubSyncing for the request's duration) and
  // the opt-in public checkbox's text beside it.
  githubSync: '⇪ Sync to GitHub',
  githubSyncPublicLabel: 'Make public instead (visible to everyone)',
  githubPrResultOk: 'pull request opened.',
  githubPrResultFail: 'failed to open pull request.',
  poolClientPanel: 'Contributor pool',
  ciStatusPanel: 'CI status',
  ciRunning: 'running',
  // THE SNACKBAR (epic 0031) — the region, its dismiss, and the outcomes the
  // Fly bar raises through it.
  snackDismiss: 'Dismiss this notice',
  luckyRolled:
    'Rolled {lanes} lane(s) × {firings} firing(s) at ${budget} each — press Fire to take off.',
  luckyWhyTitle: 'Why this size',
  luckyHandToPilot: 'Hand to the pilot',
  luckyHandToPilotTip:
    'Queues this issue on your board so the next firing can pick it up — nothing is claimed on GitHub and nothing flies until you press Fire',
  luckyHandedOff: 'Queued for your pilot: #{number}. Press Fire when you are ready.',
  luckyHandOffFailed: 'Could not queue #{number} on the board — try again shortly.',
  luckyOpenBoard: 'Open the board',
  ciNoRuns: 'no runs yet',
  publicityPanel: 'Publicity',
  contributorStandingPanel: 'Contributor standing',
  contributorIssueListPanel: 'Good first issues',
  // Epic 0025 slice 2: the panel's own h3 heading (built via panelHeading()
  // with the sprout icon) — distinct from contributorIssueListPanel above,
  // which stays the section's aria-label.
  contributorIssueListTitle: 'Good first issues',
  // APP SHELL (epic 0021): the subject navigation — a bottom bar on a phone,
  // a rail from tablet width up. Each subject is a place in the app.
  subjectNav: 'Sections',
  subjectFleet: 'Fleet',
  // Project-page subjects (epic 0021 slice 5 — 0018's tabs): Overview,
  // Board, Keeper, Plan, Docs, Data. Plain words a non-technical operator
  // can read as places, not features.
  subjectOverview: 'Overview',
  subjectBoard: 'Board',
  subjectPlan: 'Plan',
  subjectDocs: 'Docs',
  subjectData: 'Data',
  // FOCUS MODE (epic 0021 slice 8): the chrome leaves, the work stays.
  focusMode: 'Focus',
  focusModeTip: 'Hide the chrome, keep the work (Esc to exit)',
  focusExit: 'Exit focus',
  // COMMAND PALETTE (epic 0021 slice 7, closes 0017 slice 4): go to a
  // place, open a project, or do an action — by typing.
  paletteOpen: 'Commands (Ctrl or ⌘ K)',
  paletteTitle: 'Go to, open, or do',
  palettePlaceholder: 'Type a place, a project or an action…',
  paletteEmpty: 'No match',
  paletteGoTo: 'Go to {name}',
  paletteOpenProject: 'Open {name}',
  paletteTheme: 'Theme: {name}',
  paletteLanguage: 'Language: {name}',
  paletteSearch: 'Search or ask the project',
  // PLAN CANVAS (epic 0021 slice 3, first cut): the pipeline as a camera.
  planZoomIn: 'Zoom in',
  planZoomOut: 'Zoom out',
  planFit: 'Fit to view',
  planCanvasAria: 'Plan canvas: scroll or pinch to zoom, drag to pan, 0 to fit',
  // KEEPER (epic 0021 slice 4, first cut): how many things wait on a human.
  keeperWaiting: '{n} waiting on you',
  subjectFly: 'Fly',
  subjectKeeper: 'Keeper',
  subjectCommunity: 'Community',
  subjectEmpty: 'Nothing here yet — this area fills as the fleet works.',
  contextRail: 'Context: lanes in flight and the Keeper queue',
  contextRailEmpty: 'Nothing in flight and nothing waiting on you.',
  keeperQueueTitle: 'Waiting on you',
  keeperQueueHint: 'j / k or the arrows move · Enter opens · a acts',
  keeperQueueSettled: '{n} settled this session',
  keeperQueueClear: 'Nothing waiting on you',
  keeperSourcePr: 'PR',
  keeperSourcePool: 'Pool',
  keeperSourceTriage: 'Triage',
  keeperSourceMirror: 'Mirror',
  keeperSourceBacklog: 'Backlog',
  keeperSourceWisdom: 'Wisdom',
  keeperSourceApproval: 'Approval',
  pipelineView: 'Pipeline view',
  pipelineViewTitle: 'Pipeline view',
  pipelineLensLabel: 'Pipeline lens',
  pipelineLensFleet: 'Fleet',
  pipelineLensFleetTip: 'Every recorded trace across the fleet.',
  pipelineLensFiles: 'Files',
  pipelineLensFilesTip: 'Only files touched by gate-passed firings.',
  pipelineModeLabel: 'Pipeline node grouping',
  pipelineModeGrouped: 'Grouped',
  pipelineModeGroupedTip: 'Folds each trace or file into a single node.',
  pipelineModeFlat: 'Flat',
  pipelineModeFlatTip: 'One node per individual span.',
  pipelineLayoutLabel: 'Pipeline canvas layout',
  pipelineLayoutLayered: 'Layered',
  pipelineLayoutLayeredTip: 'Gives every trace its own row.',
  pipelineLayoutCompact: 'Compact',
  pipelineLayoutCompactTip: 'Merges connected traces and grids single-span ones.',
  pipelineLoading: 'Loading pipeline spans…',
  pipelineUnavailable: 'Pipeline view unavailable.',
  planEditorTitle: 'Flight plan',
  planEditorLoading: 'Loading the flight plan…',
  planEditorUnavailable: 'The flight plan is read-only here.',
  planEditorEnabled: 'Runs',
  planEditorCommand: 'Command',
  planEditorLabel: 'Label',
  planEditorStepOff: 'off',
  planEditorDraft:
    'Draft — autosaved here, not yet published. The next landing and firing still run the published plan.',
  planEditorPublished: 'Published — this is what every landing and firing runs.',
  planEditorPublishedNow: 'Published. The next landing and firing run this plan.',
  planEditorPublishFailed: 'Not published',
  planEditorPublish: 'Publish',
  planEditorDiscard: 'Discard draft',
  planEditorUndo: 'Undo',
  planEditorRedo: 'Redo',
  planEditorOutcomePass: 'passed',
  planEditorOutcomeFail: 'failed',
  planEditorOutcomeNone: 'not run',
  planEditorLastRun: 'Last gate run {ago}: {passed}/{total} passed.',
  planEditorLastRunFailed: 'Failed: {labels}',
  planEditorNoRun: 'No gate run yet.',
  soulRatifyConfirm:
    'Replace the live SOUL prompt with the proposed text?\n\nYou can undo this afterward with un-ratify.',
  soulUnratifyConfirm:
    'Undo the last SOUL ratification?\n\nThis restores the SOUL text this project had before it.',
  fleetWisdomRatifyConfirm:
    'Apply this amendment as the live fleet-wide wisdom?\n\nEvery project reads the shared wisdom on its next firing.',
  taskDeleteConfirm: 'Delete "{name}"?\n\nThis removes the task from the board entirely.',
  removeProjectConfirm:
    'Remove {name} from the dashboard?\n\nYour files and git history are NOT touched — only the dashboard record.',
  startOverConfirm:
    'Start over for {name}?\n\nThis clears its firings and ship-rate telemetry (back to 0/0) and starts a fresh round.\nThe project, its tasks, its search index, and its git backups are all KEPT.',
  githubSyncConfirmPrivate:
    'Sync {name} to GitHub?\n\nThis creates a private GitHub repo and pushes (first sync), or pushes to the existing remote (re-sync), using your own authenticated gh/git. This cannot be undone by this dashboard.',
  githubSyncConfirmPublic:
    'Make {name} PUBLIC on GitHub?\n\nAnyone on the internet will be able to see this code and its full history. This creates a public GitHub repo and pushes (first sync), or pushes to the existing remote (re-sync), using your own authenticated gh/git. This cannot be undone by this dashboard.',
  githubPrConfirm:
    'Open a pull request titled "{title}" against the upstream AUTOPILOT repo from {name}\'s current branch?\n\nThis forks the upstream repo, pushes your branch to that fork, and runs a real `gh pr create` using your own authenticated gh/git. This cannot be undone by this dashboard.',
  githubPrConfirmIssueClause: '\n\nThis will close issue #{issueNumber} on merge.',

  // web/release-panel.ts's releaseConfirmMessage — the RELEASE EXECUTE button's
  // window.confirm() text, the last untranslated confirm dialog in the dashboard.
  // Split into a base sentence, two independently-optional clauses (milestone tag,
  // GitHub Release publish) and a fixed suffix, the same shape
  // githubPrConfirm/githubPrConfirmIssueClause established for a conditionally
  // appended clause.
  releaseConfirmBase:
    'Cut this release?\n\nThis bumps package.json, cuts the CHANGELOG, creates a real git commit + tag, and attaches a git-notes attestation.',
  releaseConfirmMilestoneClause: ' Also tags "{milestoneTag}" at the same commit.',
  releaseConfirmGhReleaseClause: ' Also pushes the new tag and publishes it as a GitHub Release.',
  releaseConfirmSuffix: ' This cannot be undone by this dashboard.',
  browseDrives: 'Drives',
  browseUpParent: 'Up to the parent folder',
  flightSummaryTitle: 'Recently shipped',
  poolTitle: 'Pool',
  poolAudience:
    'For AUTOPILOT fleets: claim an issue here and your own pilot flies it, on your tokens. People claim on GitHub with /claim.',
  contributorIssueListAudience:
    'For people: reserved for humans, the fleet steps around these. Claim one on GitHub with /claim; the walkthrough is below. A good first issue nobody claims within 14 days opens to the fleet (agent-ok) — /claim still takes it back.',
  ciStatusTitle: 'CI status',
  // web/features/pool-client.ts's per-entry text (board web-msnsndki-dz3vn1):
  // rebuilt fresh on every 30s poll or click, so tr() at build time is the
  // sweep, the same reasoning report-menu.ts's keys followed.
  poolNoLocalTask: 'No local task',
  poolNoLocalCheckout: 'No local checkout of {repo}',
  poolRoutedByRepo:
    'Routed automatically: this is the registered project whose git origin is {repo}.',
  poolProjectSelectAria: 'Local project to queue a board task on (optional)',
  poolProjectSelectTip:
    'Also queue a local board task on this project when claiming — leave unset to only claim on GitHub.',
  poolClaim: 'Claim',
  poolClaimAnyway: 'Claim anyway',
  // DISPLAY & ACCESSIBILITY (epic 0029 slice 1): the Settings popover.
  settingsNav: 'Display and accessibility',
  settingsTip: 'Display and accessibility settings',
  prefText: 'Text size',
  prefTextSm: 'Small',
  prefTextMd: 'Default',
  prefTextLg: 'Large',
  prefTextXl: 'Larger',
  prefFont: 'Font',
  prefFontInter: 'Inter',
  prefFontSystem: 'System',
  prefFontMono: 'Mono',
  prefDensity: 'Spacing',
  prefDensityCompact: 'Compact',
  prefDensityComfortable: 'Default',
  prefDensityRelaxed: 'Relaxed',
  prefMotion: 'Motion',
  prefMotionSystem: 'Follow the system',
  prefMotionReduce: 'Reduce',
  prefPhosphor: 'Terminal phosphor',
  prefPhosphorGreen: 'Green',
  prefPhosphorAmber: 'Amber',
  prefPhosphorWhite: 'White',
  prefHue: 'Hue',
  prefHueAria: 'Rotate every colour of the design, in degrees; 0 is the theme as designed',
  prefsReset: 'Reset to defaults',
  prefsHint:
    'Saved in this browser only. Text resizes to 125% and spacing widens without loss; Reduce motion holds even when the system does not ask for it.',
  // ANOMALY POPOVERS (operator, 2026-09-18: "every run has these odd chips
  // and I don't know what they say or what I can do with them"): what a
  // chip means and what to do, one pair per kind in web/anomaly.ts's
  // ANOMALY_KINDS — anomaly-popover.test.ts walks the census.
  anomalyPopEvidence: 'Why it fired:',
  anomalyPopAction: 'What you can do:',
  anomalyWhatCostSpike: 'The latest firing cost several times the recent average.',
  anomalyActionCostSpike:
    'Open its trace: a runaway read loop or a huge diff is the usual cause. Consider a tighter budget or a smaller task.',
  anomalyWhatDeathCluster: 'Several of the last firings died (turn cap or error) without shipping.',
  anomalyActionDeathCluster:
    "Read the last death's tail. Repeated deaths on one task mean it is too big or its gate is unreachable: split it or fix the gate.",
  anomalyWhatGateFailStreak: 'Consecutive firings were reverted by the gate.',
  anomalyActionGateFailStreak:
    'Run the gate by hand. A gate that is red on the branch itself reverts every firing until it is fixed.',
  anomalyWhatOrientDrag:
    'The latest firing read and searched far longer than usual before its first edit.',
  anomalyActionOrientDrag:
    'Check the task text: a vague task makes the agent wander. Name the files it should start from.',
  anomalyWhatFamilyRunaway: 'One recurring task pattern keeps burning money under many task ids.',
  anomalyActionFamilyRunaway:
    'Retire or rewrite that family of tasks; no single id ever crossed the per-task cap, the family did.',
  anomalyWhatIntentCollision:
    'A firing shipped a file that a sibling lane had claimed as its intent.',
  anomalyActionIntentCollision:
    "Fewer lanes, or lanes on disjoint areas. Check the sync-back for a silent overwrite of the sibling's work.",
  anomalyWhatNearMissRecurring: 'One near-miss class stayed nonzero across consecutive flights.',
  anomalyActionNearMissRecurring:
    'Open the near-miss ritual. A near-miss that recurs is an incident waiting for its day.',
  anomalyWhatGuardDenial: 'The containment or read-hygiene guard blocked a tool call.',
  anomalyActionGuardDenial:
    'Read the denied target. A firing that tries to leave its folder is either mis-scoped or confused; the guard held.',
  anomalyWhatSyncBackRefusal: "A lane's sync-back into the flight branch was refused.",
  anomalyActionSyncBackRefusal:
    'Merge the lane branch by hand after the round: its commits are not on the flight branch yet.',
  anomalyWhatLandGateAlarm: 'The out-of-band land gate went red while a flight was running.',
  anomalyActionLandGateAlarm:
    'Do not land. Run the gate on a detached checkout and fix what is red first.',
  anomalyWhatConvergenceRed: 'A convergence gate went red after a sync-back.',
  anomalyActionConvergenceRed:
    'The merged state is broken even though each lane was green. Fix it on the flight branch before landing.',
  anomalyWhatE2eLandBlock: "A landing was refused because the converged branch's e2e is red.",
  anomalyActionE2eLandBlock:
    'Land the remedy: the branch that touches the failing spec or its snapshots clears the block. Otherwise wait for a green run.',
  anomalyWhatConvergenceUnverifiable:
    'A convergence gate reported green faster than it could have run.',
  anomalyActionConvergenceUnverifiable:
    'Treat it as no verdict. Run the gate by hand and check that the gate command really runs tests.',
  anomalyWhatGuardVerifyFailed:
    'A flight refused to start because its containment guard could not be verified.',
  anomalyActionGuardVerifyFailed:
    'Check the hook settings file the guard is written to. The flight will not run unguarded.',
  // THE DOCS READER (parity slice, 2026-09-18): an image is rendered as a link
  // labelled by its alt text — this word marks it as one.
  docsImage: 'image',
  // THE TERMINAL HUD (epic 0029 slice 3): a floating bar under the terminal theme.
  terminalHudAria: 'Terminal HUD',
  terminalHudLabel: 'Terminal HUD',
  terminalHudScanlines: 'Scanlines',
  terminalHudScanlinesOff: 'Off',
  terminalHudScanlinesOn: 'On',
  terminalHudGlow: 'Glow',
  terminalHudGlowOff: 'Off',
  terminalHudGlowOn: 'On',
  terminalHudDismiss: 'Dismiss the terminal HUD',
  terminalHudDismissTip: 'Settings › HUD bar › Shown brings it back (so does Reset to defaults)',
  // Settings carries the same terminal rows (operator, 2026-09-18).
  prefHud: 'HUD bar',
  prefHudShown: 'Shown',
  prefHudHidden: 'Hidden',
  // THE ASK SHEET (epic 0026 slice 3): the floating button and its sheet.
  askFab: 'Ask',
  askFabTip: 'Ask Architect or Genius about this page — opens beside it',
  askSheetTitle: 'Ask',
  askSheetClose: 'Close',
  // #16 (gabibi555, first slice): the fleet totals, the project card stats
  // and the project page's back link.
  tileProjects: 'projects',
  tileProjectsTip: 'Distinct projects AUTOPILOT is tracking',
  tileFlying: 'flying',
  tileFlyingTip: 'Projects with a firing running right now',
  tileFirings: 'firings',
  tileFiringsTip: 'Total engine firings across all projects',
  tileFiringsProjectTip: 'Total engine firings for this project',
  tileShipped: 'shipped',
  tileShippedTip: 'Firings that passed the gate and committed',
  tileCost: 'cost',
  tileCostTip: 'Total spend across every firing',
  tileOpenFindings: 'open findings',
  tileOpenFindingsTip: 'Unresolved review findings across all projects',
  tileNeedYou: 'need you',
  tileNeedYouTip: 'Items waiting on a decision from you',
  tileRealCost: 'real cost',
  tileRealCostTip:
    'Total spend apportioned by real subscription share instead of API list price (cost semantics v3)',
  tileShipRate: 'ship rate',
  tileShipRateProjectTip: 'Shipped firings as a share of all firings for this project',
  tileRecentForm: 'recent form',
  tileRecentFormTip: 'Ship rate over the last 5 firings',
  backToFleet: 'Fleet',
  // BUSY STATES (web/features/busy.ts): the ritual scrim's words.
  ritualLanding: 'Landing',
  ritualRelease: 'Release',
  ritualClaim: 'Claiming an issue',
  ritualPrReview: 'PR review',
  ritualIssueTriage: 'Issue triage',
  ritualMirrorPass: 'Mirror pass',
  ritualDiscussionsTriage: 'Discussions triage',
  ritualReport: 'Filing a report',
  ritualGithubIssue: 'Opening an issue',
  ritualCompose: 'Composing',
  ritualUpdate: 'Updating',
  ritualWorking: 'Working — this can take a few minutes.',
  ritualWritesPaused: 'writes paused',
  ritualWarning:
    'Everything else waits: writes are paused until this finishes; reads keep flowing. Minimize to keep looking around.',
  ritualMinimize: 'Minimize',
  ritualClose: 'Close',
  ritualDone: 'Done.',
  ritualFailed: 'Failed.',
  ritualRequestFailed:
    'The request failed — the server may be restarting; the panel shows the outcome when it is back.',
  ritualReconnecting: 'Reconnecting…',
  ritualWaitToast: 'Wait for “{title}” to finish — writes are paused.',
  ritualStepOf: 'step {index} of {total}',
  ritualPillTip: 'Show the running action',
  poolClaiming: 'Claiming…',
  poolFly: 'Fly',
  poolStarting: 'Starting…',
  poolRequestFailed: '✗ Request failed — try again shortly.',
  backlogTitle: 'Detected backlog',
  backlogChecking: 'Checking recent commits against the open board…',
  backlogEmpty:
    'No unconfirmed matches — every open task is either done or not yet echoed by a commit.',
  backlogConfirmDone: '✓ confirm done',
  backlogUnavailable: 'Detected backlog unavailable.',
  releaseTitle: 'Next release',
  // web/features/release.ts's body states: the loading placeholder rides the
  // page-level sweep; the other three are rebuilt inside the async
  // /api/release handlers, which sweep themselves (same split as the
  // issueTriage* keys above).
  releaseLoading: 'Checking for release-worthy commits…',
  releaseUnavailable: 'Release preview unavailable.',
  releaseNoTags: 'No release tags yet — nothing to diff the next release against.',
  releaseMilestoneLabel: 'Milestone tag (optional)',
  // web/features/release.ts's RELEASE PHASE select (board github-4): built
  // fresh on every panel render, so tr() at build time is the sweep, the
  // same reasoning report-menu.ts's keys followed. releaseMaturityAutoTemplate's
  // {phase} substitutes one of the other four labels below, never the raw
  // 'alpha'/'beta'/'rc'/'stable' phase id — a translated select must never
  // mix an untranslated fragment into an otherwise-localized sentence.
  releaseMaturityLabel: 'Release phase',
  releaseMaturityAutoTemplate: 'Auto — detected: {phase}',
  releaseMaturityAlpha: 'Alpha',
  releaseMaturityBeta: 'Beta',
  releaseMaturityRc: 'Release candidate',
  releaseMaturityStable: 'Stable',
  // web/features/release.ts's EXECUTE button (board web-msnsndki-dz3vn1): the
  // label carries the live {version}, so it takes the data-i18n-template
  // route rather than a plain data-i18n tag; the two transient click-handler
  // states are painted via tr() since they're never a DOM attribute a sweep
  // can reach, the same shape issueTriageExecuting/issueTriageRequestFailed
  // follow for the KEEPER panel's own EXECUTE button.
  releaseExecuteTemplate: 'Cut release v{version}',
  releaseExecuting: 'Releasing…',
  releaseRequestFailed: '✗ Request failed — try again shortly.',
  tourFiringTitle: 'Firing',
  tourFiringBody:
    'One autonomous work session: the agent orients, does the work, runs the gate, then commits — and stops. A flight is made of many firings.',
  tourSliceTitle: 'Slice',
  tourSliceBody:
    'A firing that advances a task without finishing it. The task stays open and the next firing resumes it — nothing is lost waiting on one giant firing.',
  tourGateTitle: 'Gate',
  tourGateBody:
    'The project’s own checks — typecheck, lint, test, build — run before every commit. A red gate means the change is reverted, never shipped broken.',
  tourFlightTitle: 'Flight',
  tourFlightBody:
    'A run of firings against one project, bounded by a budget you set (a firing count or a $ total), until it finishes or you pause it.',
  tourSkip: 'Skip',
  tourClose: 'Close',
  tourSkipTipMid:
    'Dismisses the tour and marks it seen — it will not auto-open again, but the masthead Tour button reopens it any time.',
  tourSkipTipLast: 'Closes the tour — the masthead Tour button reopens it any time.',
  tourBack: 'Back',
  tourBackTip: 'Steps back to the previous term.',
  tourNext: 'Next',
  tourNextTip: 'Advances to the next term — the tour stays open.',
  browseFolderTitle: 'Browse a folder',
  browseError: 'Could not list that folder.',
  close: 'Close',
  cancel: 'Cancel',
  useThisFolder: 'Use this folder',
  noSubfolders: 'No subfolders here.',
  browseSubfoldersOf: 'Subfolders of {path}',
  enterFolderPath: 'Enter a folder path.',
  launching: 'Launching…',
  launched: 'Launched.',
  couldNotLaunch: 'Could not launch.',
  launchFailed: 'Launch failed — is the dashboard still running?',
  stopping: 'Stopping…',
  stopFailed: 'Stop failed.',
  pausing: 'Pausing…',
  pauseFailed: 'Pause failed.',
  stoppingName: 'Stopping {name}…',
  pausingName: 'Pausing {name}…',
  stopFailedName: 'Stop failed for {name}.',
  pauseFailedName: 'Pause failed for {name}.',
  removing: 'Removing…',
  resetting: 'Resetting…',
  flyingUpToTotal: 'Flying {name} — up to ${total} total…',
  flyingFirings: 'Flying {name} — {count} firing(s)…',
  pausedUntilResumed: 'Paused {name} — will not fly until resumed.',
  aFolder: 'a folder',
  flyBrowseTip: 'Browse the filesystem to pick a folder',
  flyGoTip:
    'Launches an autonomous flight over this folder with the firings and budget set here — it starts spending real budget immediately.',
  flyPauseTip: 'Pauses the running flight — no new firings until you resume it.',
  flyStopTip: 'Stops the running flight — work already committed stays.',
  flyFiringsTip: 'How many firings this flight runs before stopping (ignored in total-spend mode).',
  flyBudgetTip: 'Maximum USD one firing may spend before the flight moves on.',
  flyModeTip: 'Budget mode: fixed firing count or total spend target.',
  flyTotalTip: 'Stops the flight once total spend across all firings reaches this amount.',
  flyLanesTip:
    'More than 1 splits the open board across that many parallel lanes with disjoint task scopes (the same hub-aware partitioner dashboard fleet uses) instead of flying a single lane.',
  flyProgressTip:
    "Progress for the whole flight — elapsed time, spend or firing count against its target, and an ETA from this flight's own average firing duration",
  flightRunningTip: 'This flight is running now — Stop ends it, Pause suspends it until Resume.',
  flightQueuedTip: 'Queued behind another flight — starts automatically once a slot frees up.',
  flightPausedTip: 'Paused — will not fly again until you click Resume.',
  browseCloseTip: 'Closes this dialog without changing the fly folder.',
  browseDriveTip: 'Switch to drive {drive} and list its folders.',
  browseUpTip: 'Go up one level and list the parent folder.',
  browseEntryTip: 'Open {name} and list its subfolders.',
  browseUseTip: 'Sets {path} as the fly folder and closes this dialog.',
  flightRowFlyingTotal: 'Flying {name} — up to ${total} total',
  flightRowFlyingFirings: 'Flying {name} — {count} firing(s)',
  flightRowWatchdogSuffix: ' (fleet-watchdog)',
  flightRowQueued: 'Queued: {name} — waiting for a flight slot',
  pauseFlightOn: 'Pause the flight on {name}',
  stopFlightOn: 'Stop the flight on {name}',
  cancelQueuedFlightOn: 'Cancel the queued flight on {name}',
  resumeFlightOn: 'Resume the flight on {name}',
  flyLuckyAria: "I'm feeling lucky — probe this machine and fill a calibrated launch",
  flyLuckyTip:
    'Probes this machine (CPU, RAM, cores) and the board, then fills Lanes/Firings/$ with a launch sized to what the computer can carry right now. Filling only — Fire stays your click.',
  luckyNoAnswer: 'Lucky roll failed — no answer from the server.',
  luckyDashboardDown: 'Lucky roll failed — is the dashboard up?',
  luckyNotNow: 'Not now: {reason}',
  luckyNoPlan: 'no plan',
  luckyPlanReady: 'plan ready',
  luckyPressFlyIt: '{reason} — press Fire to launch.',
  luckyFitTitle: 'Work that fits you',
  luckyFitAttentionAria: 'How much attention you have',
  luckyFitEvening: 'one evening',
  luckyFitDay: 'a day',
  luckyFitWeek: 'a week',
  luckyFitScore: 'fit {score}',
  luckyFitSourcePool: 'Pool — your pilot can fly it',
  luckyFitSourcePeople: 'Good first — by hand',
  lanesFixedFiringCount:
    'Lanes launch with a fixed firing count — switch off total-spend mode first.',
  fleetLaunched: 'Fleet launched.',
  fleetLaunchFailed: 'Fleet launch failed.',
  fleetLaunchDashboardDown: 'Fleet launch failed — is the dashboard still running?',
  flightProgressLabel: '{elapsed} elapsed · {progress} ({pct}%){eta}',
  flightProgressSpentOfTotal: '{spent} of ${total} total',
  flightProgressFiringsSoFar: '{done} / {count} firing(s) · {spent} so far',
  flightProgressEta: ' · ETA ~{eta}',
  flightProgressFinishingUp: ' · finishing up',
  // web/fly-hint.ts's spliced flyHintText() (board web-msnsndki-dz3vn1) — the
  // last holdout strings.ts named alongside flightProgressLabel's family.
  // flyHintFixedMode/flyHintTotalMode are the two sentence shapes depending
  // on which budget mode is active; flyHintCapsWithTurns/flyHintCapsNoTurns
  // are the trailing per-firing-cap clause, injected as {caps} the same way
  // flightProgressLabel's {progress}/{eta} carry pre-rendered clauses.
  flyHintFixedMode: '{count} firing(s) × ${perFiring} each — spends up to ${ceiling} total{caps}.',
  flyHintTotalMode:
    'Keeps firing while the remaining ${remaining} can fund another ${perFiring} firing — ≈ up to {estimate} firing(s){caps}.',
  flyHintCapsWithTurns: ' · each firing: up to ${perFiring} and {maxTurns} turns',
  flyHintCapsNoTurns: ' · each firing: up to ${perFiring}',
  // The CONNECT popover's action-button tips and client-written status lines
  // (web/features/connect.ts), then the sentences the spliced
  // web/connect-panel.ts helpers compose through their injected tr —
  // connectModeMeta's credential-field copy, connectStatusMeta's and
  // connectTestResultMeta's status line / toggle label / dot aria-label,
  // ghStatusMeta's GitHub line + next-command hint, ghLtsMeta's chip tips,
  // and the GitHub-issue pair — githubIssueConfirmMessage's confirm dialog
  // ({title} is the operator-typed issue title) and
  // githubIssueExecuteResult's two generic fallbacks (its ✓/✗ marks stay
  // literal glyphs, like ghIssueRequestFailed's). Server-sent text
  // ({description}, {detail}, {version}, {login}, the LTS chip text, the
  // issue result's details/error and URL) slots into each locale's template
  // as-is.
  connectLoginTip:
    'Opens a terminal running Claude login — paste the token it prints below, then Save & verify.',
  connectTestTip: 'Verifies the saved credentials with one real claude call.',
  connectSaveTip:
    'Saves the credential locally (never shown again) and refreshes the connection status.',
  ghLtsCheckTip:
    'Fetches the latest release from GitHub and compares it to the version this dashboard runs.',
  ghIssueTip:
    'Files a real GitHub issue on the upstream AUTOPILOT repo using your own gh — asks for confirmation first.',
  connectionUnavailable: 'connection unavailable',
  connectCheckingConnection: 'checking connection…',
  ghUnavailable: 'GitHub: unavailable',
  ghChecking: 'checking GitHub…',
  ltsUnavailable: 'LTS: unavailable',
  ltsChecking: 'checking for updates…',
  ghIssueOpening: 'opening…',
  ghIssueRequestFailed: '✗ request failed.',
  connectTesting: 'testing (a real claude call)...',
  connectTestFailed: 'test failed',
  connectLaunchingLogin: 'launching Claude login...',
  connectTerminalOpened: 'a terminal opened — paste the token below, then Save & verify',
  connectLoginLaunchFailed: 'could not launch login',
  connectSaving: 'saving...',
  connectSaveError: 'error: {error}',
  connectSaveErrorGeneric: 'failed',
  connectSaveFailed: 'save failed',
  connected: 'Connected',
  connectApiKeyHint: 'Stored locally (0600), never shown again.',
  connectOauthTokenLabel: 'Subscription OAuth token',
  connectTokenPlaceholder: 'paste token',
  connectOauthTokenHint: 'Generate with: claude setup-token',
  connectSubscriptionHint: 'Log in once in a terminal: run claude, then /login.',
  connectDotTipUnavailable: 'Claude connection status unavailable',
  connectHeadUnavailable: 'unavailable',
  connectDotAria: 'Claude connection: {head}',
  connectCliVersion: 'claude {version}',
  cliVersionFound: 'found',
  connectCliNotFound: 'claude CLI not found',
  connectHeadCliMissing: 'CLI missing',
  connectHeadNotLoggedIn: 'Not logged in',
  connectHeadNoCredential: 'No credential',
  connectStatusLine: '{head} - {description} - {cli}',
  connectTestVerified: 'Verified connected',
  connectTestNotAuthenticated: 'Not authenticated',
  connectTestStatusLine: '{head} - {detail}',
  connectDotAriaVerified: 'Claude connection: verified connected',
  connectDotAriaNotAuthenticated: 'Claude connection: not authenticated',
  ghCliNotFound: 'GitHub: gh CLI not found',
  ghInstallHint: 'Optional — install the GitHub CLI to sync projects: cli.github.com',
  ghNotLoggedIn: 'GitHub: gh {version}, not logged in',
  ghLoginHint:
    'Log in with the button — a terminal opens running gh auth login — or run it yourself.',
  ghConnectedAs: 'GitHub: connected as {login}',
  ghLoginUnknown: 'unknown',
  ghLogoutHint:
    'Switch or log out with the buttons — each opens a terminal running gh auth — or run it yourself.',
  // GitHub connection management (epic 0029 slice 2): the three verbs, their
  // tips, and the status line each paints — every one a terminal launch.
  ghLogin: 'Log in with GitHub',
  ghSwitch: 'Switch account',
  ghLogout: 'Log out',
  ghLoginTip:
    'Opens a terminal running gh auth login — GitHub shows a one-time code there; nothing is done on your behalf.',
  ghSwitchTip:
    'Opens a terminal running gh auth switch — pick another account you are already logged in to.',
  ghLogoutTip: 'Opens a terminal running gh auth logout — you confirm there.',
  ghAuthLaunching: 'GitHub: opening a terminal…',
  ghLoginOpened:
    'GitHub: a terminal opened running gh auth login — follow the one-time code there; this line refreshes on its own.',
  ghSwitchOpened: 'GitHub: a terminal opened running gh auth switch — pick the account there.',
  ghLogoutOpened: 'GitHub: a terminal opened running gh auth logout — confirm there.',
  ghAuthLaunchFailed: 'GitHub: could not open a terminal — run the gh auth command yourself.',
  ltsTipUpToDate: 'Running the latest GitHub Release — no update needed.',
  ltsTipUpdateAvailable:
    "A newer GitHub Release is available upstream. This dashboard never updates itself — pull and rebuild when you're ready.",
  ltsTipAhead:
    'Running a version ahead of the latest GitHub Release upstream (e.g. an unreleased build).',
  ltsTipUnknown:
    'No successful check yet — click "Check for updates" to compare against the latest GitHub Release.',
  ghIssueConfirm:
    'Open a GitHub issue titled "{title}" against the upstream AUTOPILOT repo?\n\nThis runs a real `gh issue create` using your own authenticated gh. This cannot be undone by this dashboard.',
  ghIssueOpened: 'issue opened.',
  ghIssueOpenFailed: 'failed to open issue.',
  // web/features/report-menu.ts — the right-click "Report from here"
  // menu + dialog, built fresh on every open so tr() at build time is the
  // sweep. reportFromHereTitle used to carry a 🚩 glyph literally (the menu
  // item and the dialog <h2> share it); epic 0025 (icon system) replaced it
  // with the vendored flag stroke icon at both call sites, so the string is
  // plain text like reportFromHere (the menu's aria-label). reportNothingToFile's
  // {reasoning} is the server's own plan reasoning, slotted in as sent;
  // reportRequestFailed keeps its ✗ mark literal like ghIssueRequestFailed's.
  // The spliced report-panel.ts helpers (action labels, execute tip/result)
  // stay English until they take an injected tr; reportConfirmMessage is the
  // first of those four to move — reportConfirmExecute/reportConfirmEffectTask/
  // reportConfirmEffectIssue/reportConfirmSuffix are its four clauses, same
  // base/effect/suffix shape releaseConfirmMessage's keys use. plan.summary
  // itself (server-composed) stays untranslated, the same server-message
  // stance every prior slice took.
  reportFromHere: 'Report from here',
  reportFromHereTitle: 'Report from here',
  // The five copy-toolkit menu items below the separator (label + hover tip
  // each) and the transient ✓/✗ result flashed on the clicked item — the
  // "English literals for the copy labels until their STRINGS keys exist"
  // stance report-menu.ts's own comment flagged as the next i18n-lane sweep.
  reportCopyTextLabel: 'Copy text',
  reportCopyTextTip: 'Copies the current selection, or this element’s full text.',
  reportCopyHtmlLabel: '🧩 Copy element HTML',
  reportCopyHtmlTip: 'Copies this element’s outerHTML markup.',
  reportCopySelectorLabel: 'Copy CSS selector',
  reportCopySelectorTip: 'Copies a rooted selector path to this element.',
  reportCopyStylesLabel: 'Copy computed styles',
  reportCopyStylesTip: 'Copies this element’s computed CSS as a ready style block.',
  reportCopyContextLabel: '🧠 Copy smart context (JSON)',
  reportCopyContextTip:
    'Copies selector, geometry, data attributes, and the source modules that own this region — everything a bug report or an AI needs.',
  reportCopied: '✓ Copied',
  reportCopyFailed: '✗ Copy failed',
  reportDialogCloseTip: 'Closes this dialog without filing anything.',
  reportDescLabel: 'What is wrong or missing here?',
  reportDescTip: 'Your words become the title; the captured context above always travels with it.',
  reportActionPrompt: 'One click files a…',
  // LLM ISSUE COMPOSER 1/3 follow-up (board web-mtpzdrt1-lirsgh): the
  // dialog's own AI compose button — unlike the CONNECT popover's
  // reportCompose* keys above (which end in "review the fields, then
  // submit"), this one feeds the SAME /api/report/compose endpoint the
  // reportMenuContextOf capture + module sources, and its "ready" line
  // points at Preview/Execute rather than a submit button, so it earns its
  // own key instead of reusing reportComposeReady's wording.
  reportComposeAi: 'Compose with AI',
  reportComposeAiTip:
    'Turns your note into a polished description and a suggested action with a local model call, grounded in the capture above — your words never leave this machine.',
  reportComposeAiReady: 'Composed — suggested action: {action}. Review below, then Preview.',
  reportPreview: 'Preview',
  reportPreviewTip:
    'Resolve this capture into the exact plan — what gets filed where — without applying anything.',
  reportPreviewUnavailable: 'Preview unavailable — try again shortly.',
  reportNothingToFile: 'Nothing to file — {reasoning}',
  // #42 (gabibi555): the server's rejection and compose refusals, by key.
  reportNeedsRegion: 'a report needs the region it was made from — no region was captured.',
  reportNeedsDescription:
    'a report from "{regionId}" needs a description — there is nothing to file, task, or offer yet.',
  reportNeedsProject:
    'a "{action}" report becomes a board task, and a task needs a project. Open a project page and report from there, or choose "issue" or "pool offer" here.',
  composeNeedsDescription: 'a report needs a note to compose from.',
  composeModelUnavailable:
    'The model is unavailable right now (quota or connection) — try again shortly.',
  composeUnusable: 'The model returned an unusable composition — try rephrasing the note.',
  composeLeak:
    'The composed report appears to contain a secret, credential, or personal file path — rephrase the note without raw credentials, tokens, or local file paths.',
  // #41 (gabibi555): a task-shaped action needs a project page.
  reportActionNeedsProject: 'needs a project page',
  reportExecute: 'Execute',
  reportExecuting: 'Executing…',
  reportRequestFailed: '✗ Request failed — try again shortly.',
  reportConfirmExecute: 'Execute this report?',
  reportConfirmEffectTask:
    'This creates a queued board task — its id is content-addressed, so retrying the same capture never mints a second one.',
  reportConfirmEffectIssue:
    'This files a REAL GitHub issue via gh — this dashboard cannot recall it; close it on GitHub if it was a mistake.',
  reportConfirmSuffix:
    'The plan is re-derived fresh from the capture at execute time — this will not blindly trust what is shown here.',
  // web/features/landing.ts — the project page's post-flight LANDING panel
  // (`landingSection()`). Fetched once per open and never re-rendered on a
  // poll tick, so `tr()` at build time is the sweep, the same shape
  // `report-menu.ts`'s fresh-each-open dialog already uses. Per the stance
  // every prior slice took (see reportConfirmSuffix above), only the
  // panel's persistent ON-SCREEN text moved that slice — the per-commit
  // `data-tip`/`aria-label` hover text (sha, subject, files-changed,
  // best/worst firing) still stays English, same as the per-project fleet
  // card hover text this table already leaves untranslated; the branch line
  // below moved in a later slice.
  landingTitle: 'Landing',
  landingChecking: 'Checking for unmerged work…',
  landingUnavailable: 'Landing preview unavailable.',
  landingNothingToLand: 'Nothing to land — the branch is level with its base.',
  landingExecuteButton: 'Execute landing → {base}',
  landingRestarting:
    'Landed — rebuilding & restarting the dashboard… this page reconnects automatically.',
  landingDebriefTitle: 'Flight debrief',
  landingDebriefBestLabel: 'Best: ',
  landingDebriefWorstLabel: 'Worst: ',
  // The panel's branch line (renderLandingBody()'s "branch → base" row above
  // the commit list). The panel is never swept after its fetch resolves, so
  // every one of these is painted via tr() at build time AND tagged: the
  // three fixed tips as [data-i18n-tip], the arrow's fixed aria as
  // [data-i18n-aria], and the branch/base aria prefixes — which wrap the
  // live ref name in {name} — as [data-i18n-aria-template]/[data-i18n-name],
  // so a mid-session locale switch flips all six in place.
  landingBranchTip: 'Currently checked-out branch',
  landingBranchAria: 'branch: {name}',
  landingBranchArrowTip: 'Merge direction: branch into base',
  landingBranchArrowAria: 'merges into',
  landingBaseTip: 'Branch this would merge into',
  landingBaseAria: 'base branch: {name}',
  landingCommitShaTip: 'Abbreviated commit hash',
  landingCommitShaAria: 'commit {name}',
  landingCommitSubjectTip: 'What this commit changed',
  landingCommitFilesAria: '{n} files changed',
  landingDebriefBestTip: 'The most cost-efficient shipped firing this flight',
  landingDebriefBestAria: 'best firing: {name}',
  landingDebriefWorstTip: 'The priciest firing that did not ship this flight',
  landingDebriefWorstAria: 'worst firing: {name}',
  // web/flight-debrief.ts's flightDebriefChipItems/flightDebriefNotableItems
  // — the FLIGHT DEBRIEF panel's stat-chip and notable-event text.
  flightDebriefShippedCount: '{count} shipped',
  flightDebriefShippedTip: 'Firings that passed the gate and landed a real commit',
  flightDebriefDeathCount: '{count} died',
  flightDebriefDeathTip:
    'Firings that reverted, hit the turn cap, timed out, or errored with nothing committed',
  flightDebriefTotalSpendTip: 'Total spend across this flight',
  flightDebriefTotalSpendAria: 'total spend: {amount}',
  flightDebriefTotalDurationTip: 'Total wall-clock time across this flight',
  flightDebriefTotalDurationAria: 'total duration: {amount}',
  flightDebriefGuardDenialSingular: '{count} guard denial',
  flightDebriefGuardDenialPlural: '{count} guard denials',
  flightDebriefGuardDenialTip: 'PreToolUse containment/read-hygiene hits this flight',
  flightDebriefRemediationSingular: '{count} auto-remediation',
  flightDebriefRemediationPlural: '{count} auto-remediations',
  flightDebriefRemediationTip: 'Mechanical RemediatingGate auto-fixes this flight',
  projectNotFound: 'Project not found',
  projectNotFoundBody: 'It may have been removed from the dashboard. Head back to the fleet.',
  // web/features/flight-console.ts (board web-msnsndki-dz3vn1): the project
  // page's Flight console panel — collapsed placeholder, and the empty/
  // fetch-failure states. Relanded after the 07:47 revert burst (c9f4d502).
  consoleEmpty: 'No console output yet.',
  consoleCollapsed: 'Collapsed — expand to load.',
  consoleUnavailable: 'Flight console unavailable.',
  // The panel's own always-on chrome, missed by the states above: the
  // <summary> toggle's title/tip, and the loaded <pre>'s line-count
  // aria-label/tip. Singular/plural are separate keys — the same real-
  // grammar choice flightDebriefGuardDenialSingular/Plural already makes —
  // so the translated grammar matches console-panel.ts's own
  // consoleLinesAriaLabel(), not a lowest-common-denominator "(s)" suffix.
  consoleTitle: 'Flight console',
  consoleTitleTip: 'Raw stdout+stderr tail of the flight process for this project',
  consoleLinesAriaSingular: '{n} line of raw flight process output',
  consoleLinesAriaPlural: '{n} lines of raw flight process output',
  // web/features/issue-triage.ts (board web-msnsndki-dz3vn1): the project
  // page's KEEPER issue-triage panel — title, loading placeholder, and the
  // empty/fetch-failure states. "KEEPER" is the persona's proper name and
  // stays Latin in every locale, the way "AUTOPILOT" and "GitHub" do above.
  issueTriageTitle: 'KEEPER issue triage',
  issueTriageLoading: 'Checking open issues against the board…',
  issueTriageEmpty: 'No open issues to triage.',
  issueTriageUnavailable: 'Issue triage unavailable.',
  issueTriageExecute: 'Run KEEPER triage',
  issueTriageExecuting: 'Triaging…',
  issueTriageRequestFailed: '✗ Request failed — try again shortly.',
  // web/features/issue-triage.ts (epic 0020 "the legible surface" slice 3,
  // board web-mtt8loci-8hnte4, "decisions link to the comment they will
  // post"): the static label ahead of the real gh-reported comment links a
  // successful KEEPER execute leaves behind — the links themselves (#N)
  // are live GitHub data, never a translation target, the same split this
  // file's header comment already draws for every dynamic value it renders.
  issueTriageCommentsPosted: 'Comments posted:',
  // web/features/mirror-pass.ts (EPIC 0019 S3, board web-mtrh1hlh-62l41b,
  // VERDICT ap-mtsg3nc0-3 slice (c)): the project page's MIRROR PASS panel —
  // title, loading placeholder, and the empty/fetch-failure states, same
  // shape issueTriage* above establishes for a fetch-then-render panel.
  mirrorPassTitle: 'Mirror pass',
  mirrorPassLoading: 'Checking the board against GitHub…',
  mirrorPassEmpty: 'Board and GitHub agree — nothing to reconcile.',
  mirrorPassUnavailable: 'Mirror pass unavailable.',
  // Its per-project gate on the client (EPIC 0019 S3 "per project"): the gh
  // CLI acts on ONE repository, and a project whose git origin is a different
  // one has nothing to mirror through it. A two-value template — {projectRepo}
  // and {ghRepo} ride data-i18n-args, translateDom()'s map twin of tr()'s own
  // — never a fixed data-i18n tag: both names are live GitHub facts the sweep
  // must re-fill, not overwrite.
  mirrorPassRepoMismatch:
    'Not compared — this project is a checkout of {projectRepo}, but gh is acting on {ghRepo}.',
  // Its "Run mirror pass" EXECUTE button (board web-msnsndki-dz3vn1): the
  // idle label rides a plain data-i18n tag (the button carried that tag from
  // its first render, but no key existed here — so it never translated); its
  // hover tip IS its accessible name, so one key rides both the
  // [data-i18n-tip] and [data-i18n-aria] sweeps. The window.confirm() text
  // and the two transient click-handler states are painted via tr() since
  // they're never a DOM attribute a sweep can reach — the same shape
  // issueTriageExecuting/issueTriageRequestFailed and releaseExecuting/
  // releaseRequestFailed follow for their own EXECUTE buttons.
  mirrorPassExecute: 'Run mirror pass',
  mirrorPassExecuteTip:
    'Applies every reconcile finding above — closes or reopens issues and posts comments via gh.',
  mirrorPassExecuteConfirm:
    'Run the mirror pass now? This closes or reopens issues and posts comments on GitHub for every reconcile finding above.',
  mirrorPassExecuting: 'Running…',
  mirrorPassRequestFailed: 'Mirror pass request failed.',
  // Its "Fix doc drift" EXECUTE button (derivation 3/4's own execute path) —
  // same i18n shape as mirrorPassExecute above: idle label rides data-i18n,
  // the tip doubles as the accessible name, and the confirm/in-flight/
  // failure states are painted via tr() at click time.
  mirrorPassDriftExecute: 'Fix doc drift',
  mirrorPassDriftExecuteTip:
    'Files a new GitHub issue for every doc-vs-tree drift finding above, skipping any that already have one open.',
  mirrorPassDriftExecuteConfirm:
    'File GitHub issues for the doc drift above now? This opens a new issue via gh for every finding that is not already tracked.',
  mirrorPassDriftExecuting: 'Filing…',
  mirrorPassDriftRequestFailed: 'Mirror pass drift fix request failed.',
  // web/features/discussions-triage.ts (epic 0007 S8, board
  // web-mtlsiac0-v8rksh): the project page's KEEPER DISCUSSIONS panel —
  // title, loading placeholder, empty/unavailable states, and the "Run
  // KEEPER Discussions triage" EXECUTE button, same shape mirrorPass* above
  // establishes for a fetch-then-render-then-execute panel. "KEEPER" stays
  // Latin in every locale, the same proper-name stance issueTriageTitle
  // above takes.
  discussionsTriageTitle: 'KEEPER Discussions triage',
  discussionsTriageLoading: 'Checking open discussions against the board…',
  discussionsTriageEmpty: 'No open discussions to triage.',
  discussionsTriageUnavailable: 'Discussions triage unavailable.',
  discussionsTriageExecute: 'Run KEEPER Discussions triage',
  discussionsTriageExecuteTip:
    'Posts a signed reply and applies the pool label to every accepted discussion above via gh.',
  discussionsTriageExecuting: 'Running…',
  discussionsTriageRequestFailed: 'Discussions triage request failed.',
  // Its "Post landing note(s)" EXECUTE button (derivation 2/4's own execute
  // path) — same i18n shape as mirrorPassExecute above: idle label rides
  // data-i18n, the tip doubles as the accessible name, and the
  // confirm/in-flight/failure states are painted via tr() at click time.
  mirrorPassLandingNoteExecute: 'Post landing note(s)',
  mirrorPassLandingNoteExecuteTip:
    'Posts a landing-note comment on every already-closed issue above that is missing one.',
  mirrorPassLandingNoteExecuteConfirm:
    'Post the landing note(s) above now? This comments on GitHub for every already-closed issue missing one.',
  mirrorPassLandingNoteExecuting: 'Posting…',
  mirrorPassLandingNoteRequestFailed: 'Mirror pass landing-note request failed.',
  // Its "Free stale claim(s)" EXECUTE button (derivation 4/4's own execute
  // path) — same i18n shape as mirrorPassExecute above: idle label rides
  // data-i18n, the tip doubles as the accessible name, and the
  // confirm/in-flight/failure states are painted via tr() at click time.
  mirrorPassStaleClaimExecute: 'Free stale claim(s)',
  mirrorPassStaleClaimExecuteTip:
    'Unassigns every claimed pool issue above whose assignee has gone quiet past the reap threshold.',
  mirrorPassStaleClaimExecuteConfirm:
    'Free the stale claim(s) above now? This unassigns every claimed pool issue whose assignee has gone quiet past the reap threshold.',
  mirrorPassStaleClaimExecuting: 'Freeing…',
  mirrorPassStaleClaimRequestFailed: 'Mirror pass stale-claim request failed.',
  // Its "Follow GitHub priority label(s)" EXECUTE button (the fifth
  // derivation's own execute path, law 2's GitHub-to-board direction) — same
  // i18n shape as mirrorPassExecute above: idle label rides data-i18n, the
  // tip doubles as the accessible name, and the confirm/in-flight/failure
  // states are painted via tr() at click time.
  mirrorPassPriorityFollowExecute: 'Follow GitHub priority label(s)',
  mirrorPassPriorityFollowExecuteTip:
    'Pins every board task above to the priority band its maintainer-set GitHub label already carries.',
  mirrorPassPriorityFollowExecuteConfirm:
    'Follow the GitHub priority label(s) above now? This pins every listed task to the priority band its issue label already carries.',
  mirrorPassPriorityFollowExecuting: 'Pinning…',
  mirrorPassPriorityFollowRequestFailed: 'Mirror pass priority-follow request failed.',
  // web/features/process-health.ts (board web-msnsndki-dz3vn1): the project
  // page's three process-health stat-tile panel titles. "DORA" is an acronym
  // (DevOps Research and Assessment) and stays Latin in every locale.
  doraTitle: 'Process health (DORA)',
  gateParallelTitle: 'Parallel gate savings',
  warmSessionsTitle: 'Warm sessions',
  // web/features/evolution.ts (board web-msnsndki-dz3vn1): the project page's
  // "is the agent improving?" evolution cluster — the trend chart's heading
  // and its stat-tile summary's heading. Both ride the page-level sweep, the
  // same wiring as the three process-health titles above.
  evolutionTrendTitle: 'Evolution — is the agent improving?',
  evolutionSummaryTitle: 'Approval summary',
  // web/features/foundation.ts's masthead heart + Foundation panel (FOUNDATION
  // 1/3, board web-mtq0rsit-ywz1m7) — hidden until GET /api/donations reports
  // a real, verified entry (see docs/FOUNDATION.md's "never before" custody
  // promise), so these strings sit dormant in most installs today.
  foundation: 'Foundation',
  foundationTip: 'Support AUTOPILOT — verified donation addresses',
  foundationCopyAddress: 'Copy address',
  foundationCopied: 'Copied!',
  foundationQrAlt: 'QR code for the {name} address',
  officeSubagent: 'Subagent — {name}',
  officeMapAria: 'Agent office map — currently {name}',
  // web/features/activity.ts's flightMap() (board web-msnsndki-dz3vn1) — the
  // files-in-flight map's own aria-label, its first i18n wiring; the
  // orient/do/gate/commit phase names above it name AUTOPILOT's own flight
  // phases, not translatable English words, so they stay out of this table.
  flightMapAria: 'Files in flight',
  // web/{issue-triage,pr-review,release}-panel.ts's *GuestNote() (epic 0019
  // law 1's role gate, board web-mtt3f7j6-3bj899): the maintainer-verb guest
  // notices were plain English concatenation, a gap prReviewGuestNote's own
  // header comment flagged against release-panel.ts's twin. {owner}/{login}
  // are the resolved identity's live values, the same two-slot
  // data-i18n-args map firing-timeline.ts's replayPosition established.
  issueTriageGuestNote:
    'Issue triage on this repo is run by its maintainer ({owner}) — you are signed in as {login}.',
  prReviewGuestNote:
    'PR review actions on this repo are taken by its maintainer ({owner}) — you are signed in as {login}.',
  releaseGuestNote:
    'Releases on this repo are cut by its maintainer ({owner}) — you are signed in as {login}.',

  // ── THE ONBOARDING LADDER (epic 0032) ───────────────────────────────────
  // A tour tells; this ladder asks the newcomer to DO one small thing at a
  // time. Level 1 gets them to a real commit; level 2 is optional and only
  // ever offered once level 1 is done. See web/onboarding.ts.
  obTitle: 'Getting started',
  obTip: 'Your first flight, one small step at a time',
  obProgress: '{done} of {total} steps done',
  obStepDone: 'Done',
  obStepCurrent: 'Do this next',
  obLevel1: 'Fly something',
  obLevel2: 'Contribute back',
  obLevel2Intro: 'Optional, and in no hurry — it waits as long as you like.',
  obBadgePilot: 'Pilot',
  obBadgeContributor: 'Contributor',
  obBadgeEarned: 'Earned',
  obBadgeLocked: 'Not earned yet',
  obAddSample: 'Add the calculator sample',
  obAddSampleBody:
    'Copies a small real project into a folder of your own, so you have something to fly before you risk anything you care about.',
  obAddSampleAction: 'Add it',
  obLockOn: 'Lock on the folder',
  obLockOnBody:
    'Point the Fly bar at the folder you want worked on. Adding the sample fills this in for you.',
  obLockOnAction: 'Lock on',
  obFire: 'Press Fire',
  obFireBody:
    'One firing: the agent orients, does one task, runs your own checks, and commits only if they pass.',
  obReadBack: 'Read what came back',
  obReadBackBody:
    'Every firing records what it cost, what it changed and how the gate ruled. That record is the product.',
  obReadBackAction: 'Open the record',
  obConnectGithub: 'Connect GitHub',
  obConnectGithubBody:
    'Signs in the GitHub CLI on this machine, so a finding or a fix can leave your laptop.',
  obConnectGithubAction: 'Connect',
  obPublishFinding: 'Publish a finding',
  obPublishFindingBody:
    'Report from here turns whatever is on your screen into an issue someone else can act on.',
  obPublishFindingAction: 'Report from here',
  obSubmitFix: 'Submit a fix',
  obSubmitFixBody:
    'Claim an open task, let a flight do the work, and open the pull request from its branch.',
  obSubmitFixAction: 'Open the pool',
  obSnooze: 'Remind me later',
  obSnoozeDone: 'Put away — it comes back the next day you open the dashboard.',
  obComplete: 'Both ticks earned. Thank you — contributors are why this gets better.',
  obSocialLocked: 'Fly one firing to open the pool, the discussions and the standing board.',
  // The tour and the ladder are one path, not two (operator, 2026-09-15):
  // the tour teaches the four words, its last step hands over to the
  // checklist, and the checklist links back for anyone who wants the words.
  // THE GUIDED WALK (operator, 2026-09-15): the tour points at each real
  // control in turn instead of defining four words in the abstract. The
  // vocabulary is still all here — firing, gate, slice, flight — taught on
  // the thing that embodies it. See web/tour.ts.
  tourLockOnTitle: 'Lock on a folder',
  tourLockOnBody:
    'Point AUTOPILOT at a git repository. Everything it does happens inside that folder, on its own branch — it never pushes and never merges on its own.',
  tourLuckyTitle: 'Let it size the flight',
  tourLuckyBody:
    'The clover measures this machine — idle cores, free memory, even whether the disk is a platter or flash — and fills in how many lanes and firings it can carry without freezing your own work.',
  tourFireTitle: 'Fire',
  tourFireBody:
    'One firing: the agent orients, does ONE task, runs your project’s own gate — typecheck, lint, test, build — and commits only if it passes. Red means the change is reverted, never shipped broken. A flight is many firings, bounded by the budget you set.',
  tourLadderTitle: 'Your progress',
  tourLadderBody:
    'The checklist tracks what you have done and what it earned. Two ticks: one for flying something, one for contributing back. It puts itself away when you ask, and for good once both are earned.',
  tourFleetTitle: 'The fleet',
  tourFleetBody:
    'One card per project: what it cost, what shipped, how the gate ruled, and which commit is on HEAD. A firing that advances a task without finishing it is a slice — the task stays open and the next firing resumes it.',
  tourSearchTitle: 'Search the code',
  tourSearchBody:
    'Find matching code across a project — or ask this same box a question and get an answer built from the indexed source, with citations.',
  tourAskTitle: 'Ask about this page',
  tourAskBody:
    'Ask about whatever is on screen. It answers read-only by default, and can escalate to a real agentic session when the answer needs going and looking.',
  tourConnectTitle: 'Connections',
  tourConnectBody:
    'Claude is what flies the work. GitHub is how a finding or a fix leaves this machine — both live behind this one control.',
  tourReportTitle: 'Report from here',
  tourReportBody:
    'Turn whatever is on screen into an issue, with the page captured alongside it. It is the fastest way to tell us something is wrong — and you always see the draft before anything is filed.',
  tourStepCount: 'Step {step} of {total}',
  tourToLadder: 'Start the checklist',
  tourToLadderTip: 'Closes the tour and takes you to the first thing to do',
  obTourLink: 'What do these words mean?',
  // MY PROGRESS (operator, 2026-09-18): the more-menu entry that reopens the ladder.
  progressBtn: 'My progress',
  progressBtnTip:
    'Your getting-started ladder, badges and standing — at any time, snoozed or finished',
  // MINIMIZED, NOT GONE (operator, 2026-09-18): the collapsed ladder's strip.
  obMinimize: 'Minimize the checklist',
  obExpand: 'Show the checklist',
  obMinimizeTip:
    'Keeps your standing at the top; My progress, or this button, brings the steps back',
  obStripDone: 'All {total} steps done',
  obSocialOn: 'GitHub connected — social unlocked',
  obSocialOff: 'Go social: connect GitHub',
  obTourLinkTip: 'Opens the short tour: firing, slice, gate, flight',
  obBadgesAria: 'Badges earned',
  obWatermark: 'Built with AUTOPILOT',
} as const;

export type StringKey = keyof typeof EN_STRINGS;

export const STRINGS: Readonly<Record<LocaleName, Readonly<Record<StringKey, string>>>> = {
  en: EN_STRINGS,
  he: {
    skipToFleet: 'דלג לצי',
    connect: 'התחבר',
    loginClaude: 'התחברות עם Claude',
    testConnection: 'בדיקת חיבור',
    tour: 'סיור',
    tourTip: 'סיור מודרך קצר: הפעלה, פרוסה, שער, טיסה',
    moreNav: 'עוד: סיור, תיעוד, דיווח מכאן',
    moreTip: 'סיור, התיעוד, דיווח מכאן',
    docsLink: 'תיעוד',
    docsLinkTip: 'אינדקס התיעוד ב-GitHub (נפתח בלשונית חדשה)',
    benchmarkLink: 'בנצ׳מרק',
    benchmarkLinkTip: 'כל מודל שהצי הטיס, בהשוואה על ההפעלות שלו',
    reportBtn: 'דיווח מכאן',
    reportBtnTip: 'לכידת העמוד הזה ל-issue, תיקון מהיר או הערה — תמיד תצוגה מקדימה קודם',
    claudeAuthLabel: 'אימות Claude',
    authModeSubscription: 'מנוי (ברירת מחדל)',
    authModeApiKey: 'מפתח API',
    authModeOauthToken: 'אסימון מנוי (ללא ממשק)',
    credentialLabel: 'פרטי גישה',
    saveVerify: 'שמור ואמת',
    themeNav: 'ערכת נושא',
    languageNav: 'שפה',
    themeMenuTip: 'בחר ערכת נושא',
    themeDark: 'כהה',
    themeLight: 'בהיר',
    themeTerminal: 'טרמינל',
    themeTipDark: 'מעבר לערכת הנושא הכהה',
    themeTipLight: 'מעבר לערכת הנושא הבהירה',
    themeTipTerminal: 'מעבר לערכת נושא טרמינל',
    langMenuTip: 'בחר שפה',
    flyFolder: 'טוס על תיקייה',
    browse: 'עיון…',
    flyOptions: 'אפשרויות',
    flyOptionsAria: 'הצגה או הסתרה של הגדרות השיגור: עיון, מצב תקציב, הפעלות, $ להפעלה, נתיבים',
    flyOptionsTip: 'הצגה או הסתרה של הגדרות השיגור — עיון, מצב תקציב, הפעלות, $ להפעלה, נתיבים',
    byCount: 'לפי כמות',
    byTotal: 'לפי סכום כולל',
    firings: 'הפעלות',
    stopAtTotal: 'עצור בסכום כולל של $',
    perFiringBudget: '$ / הפעלה',
    lanes: 'נתיבים',
    flyIt: 'שגר!',
    flying: 'בטיסה…',
    queued: 'בתור…',
    resume: 'המשך',
    pause: 'השהה',
    stop: 'עצור',
    searchProject: 'חיפוש בפרויקט',
    search: 'חיפוש',
    searchQueryAria: 'שאילתת חיפוש או שאלה',
    searchPickProject: 'בחרו פרויקט והקלידו שאילתה.',
    searchSearching: 'מחפש…',
    searchNoMatches: 'לא נמצאו תוצאות.',
    searchFailed: 'החיפוש נכשל.',
    deep: 'מעמיק',
    ask: 'שאל',
    askAsking: 'שואל…',
    askPickProject: 'בחרו פרויקט והקלידו שאלה תחילה.',
    askThinking: 'שואל את המודל (על סמך הקוד המאונדקס)…',
    askThinkingDeep: 'קורא את הפרויקט כדי למצוא את התשובה (מעמיק)…',
    askFailed: 'הבקשה נכשלה — האם לוח הבקרה עדיין פועל?',
    architectProposes: 'ה-ARCHITECT מציע: {name}',
    proposalRunning: 'בביצוע…',
    proposalDone: 'בוצע.',
    proposalFailed: 'נכשל: {name}',
    proposalUnknownError: 'שגיאה לא ידועה',
    proposalRequestError: 'שגיאת בקשה.',
    proposalConfirm: 'אשר',
    proposalConfirmDestructive: 'אשר (לא הפיך)',
    proposalConfirmTip: 'מריץ את הפעולה המוצעת הזו',
    proposalConfirmDestructiveTip: 'לא ניתן לבטל פעולה זו — אשרו כדי להריץ אותה',
    askActivityTip: 'קריאה לכלי שהמודל ביצע תוך כדי המחקר לתשובה הזו',
    askActivityAria: 'קריאה לכלי: {name}',
    askSources: 'מקורות: {name}',
    askMeta: 'נענה על ידי {model} · {time} · {cost}',
    askSourcesTip: 'קבצים מאונדקסים שהמודל התייעץ בהם כדי לבסס את התשובה הזו',
    askSourcesAria: 'מקורות: {name}',
    askPersona: 'פרסונת שאלה',
    personaGenius: 'GENIUS',
    personaArchitect: 'ARCHITECT',
    searchTip: 'מציאת קוד תואם בפרויקט שנבחר — התוצאות מציגות את הקובץ, השורה והקטע שסביבה.',
    askDeepTip:
      'הסלמה לסשן סוכני לקריאה בלבד (Read/Grep/Glob, עד 10 תורות) שיוצא לחפש את התשובה במקום להסתמך על הקטעים המאונדקסים',
    askLowConfidenceOffer: 'לא בטוחים בתשובה הזו — לנסות מעמיק?',
    askLowConfidenceOfferTip:
      'לשאול שוב את אותה השאלה בהסלמה למעמיק (סשן סוכני לקריאה בלבד שיוצא לחפש את התשובה)',
    askTip: 'שאלו את השאלה במקום לחפש — תשובת AI שנבנית מהקוד המאונדקס מוזרמת למטה.',
    // (#30's parallel ask*/control* vocabulary pruned with its en side —
    // zero references; see the en-table note.)
    personaGeniusTip:
      'פרסונה לקריאה בלבד (ברירת מחדל): עונה על שאלות אך לעולם לא נוגעת בלוח הבקרה.',
    personaArchitectTip:
      'יכולה להציע פעולות בלוח הבקרה לאישורכם — הצטרפות לפי סשן, חוזרת ל-GENIUS בטעינה מחדש.',
    fleetSummary: 'סיכום הצי',
    liveWorkers: 'מי טס כרגע',
    fleetPerformance: 'ביצועי הצי',
    keeperPrReview: 'סקירת PR של KEEPER',
    fleetMain: 'צי',
    connectingFleet: 'מתחבר לצי…',
    liveWorkersLabel: 'טסים כרגע',
    fleetEmptyTitle: 'עדיין אין פרויקטים בטיסה',
    fleetEmptyHint:
      'הוסיפו מאגר כדי לעקוב אחריו כאן. כדי לראות את לוח הבקרה מלא בנתונים כבר עכשיו, הריצו:',
    updatedConnecting: 'מתחבר…',
    offlineRetrying: 'לא מקוון — מנסה שוב…',
    brbTitle: 'תכף חוזרים',
    brbSub: 'בונים משהו מגניב בזמן שאנחנו מתחברים מחדש…',
    updateBannerAria: 'עדכון תוכנה זמין',
    updateBannerText: 'גרסה חדשה מוכנה: v{from} ← v{to}',
    updateNow: 'עדכן עכשיו',
    versionSummaryTip: 'הגרסה שרצה — פתחו לבדיקת הגרסה החדשה ביותר ולכפתור ההרצה',
    versionSummaryAria: 'גרסה',
    versionChecking: 'בודק מהי הגרסה החדשה ביותר…',
    versionUnknown: 'לא ניתן להגיע לרשימת הגרסאות — בדקו את החיבור ונסו שוב.',
    versionLatest: 'v{version} היא הגרסה החדשה ביותר · נבדק {time}',
    versionAvailable: 'v{from} ← v{to} זמינה',
    versionUpToDate: 'כבר על הגרסה האחרונה.',
    versionRunLatest: 'הרץ את העדכנית',
    versionRunUpdate: 'עדכן ל-v{to}',
    versionCheckNow: 'בדוק עכשיו',
    versionRunTip:
      'מושך את הגרסה החדשה ביותר, מתקין מחדש, בונה ומפעיל מחדש את הדשבורד — איפוס נקי לעדכנית, גם כשכבר אתם עליה',
    versionRunNote:
      'התקדמות מקומית לא נפגעת: עם שינויים לא מקומטים תישאלו לפני שהם נשמרים ב-git stash.',
    updateLater: 'אחר-כך',
    updateInProgress: 'מעדכן — מושך, מתקין, מאתחל… הדשבורד יתחבר מחדש לבד',
    updateDirtyPrompt:
      'זוהתה התקדמות מקומית לא-שמורה. לשמור אותה בצד (git stash) ולעדכן? ‏"git stash pop" מחזיר אותה אחר-כך',
    updateStashAndGo: 'שמור בצד ועדכן',
    updateRefused: 'העדכון סורב: ',
    offlineRetryingTip: 'החיבור לשרת אבד — הניסיון החוזר יתבצע אוטומטית',
    removeCard: 'הסר',
    soulEditorSummary: 'צפייה/עריכת SOUL',
    soulEditorLabel: 'טקסט ה-SOUL החי של הפרויקט — ערכו והציעו שינוי',
    soulEditorSubmit: 'הצע עריכה',
    soulProposed: 'ההצעה נשלחה — סקרו אותה למעלה כדי לאשר או לדחות.',
    soulProposeFailed: 'לא ניתן היה להציע את העריכה — נסו שוב.',
    soulProposalSummary: '◇ הצעת SOUL ממתינה — יש לסקור',
    soulRatify: '✓ אשרר',
    soulDismiss: '✗ בטל',
    soulUnratify: '↺ בטל אשרור',
    soulUnreviewed: '◐ SOUL לא נסקר',
    startOver: '↺ התחל מחדש',
    prReviewTitle: 'סקירת PR של KEEPER',
    prReviewApply: 'החל',
    prReviewFetchFailed:
      'לא ניתן היה לקרוא את רשימת ה-PR הפתוחים מ-gh — זו תקלה, לא תור ריק מאומת; התשאול הבא ינסה שוב.',
    prReviewMergeLabel: 'מיזוג',
    prReviewRequestChangesLabel: 'בקשת שינויים',
    prReviewQueueForHumanLabel: 'העברה לבדיקה אנושית',
    prReviewAwaitingApprovalLabel: 'ממתין לאישור הרצת CI',
    prReviewConfirmMessage:
      'להחיל את סקירת KEEPER על #{number} "{title}"?\n\nהחלטה: {decision}\n{reasoning}\n\nההחלטה נגזרת מחדש מ-gh בזמן ההרצה — פעולה זו לא תסמוך באופן עיוור על מה שמוצג כאן אם ה-PR השתנה.',
    prReviewConfirmUndoMerge:
      ' פעולה זו מאשרת וממזגת (squash) את ה-PR — לא ניתן לבטל פעולה זו מלוח הבקרה.',
    prReviewExecuteTip: 'להחיל את סקירת KEEPER על #{number}: {decision}.',
    prReviewExecuteTipUndoOther: ' פעולה זו מפרסמת סקירה/הערה ב-GitHub — ניתנת לביטול שם.',
    prReviewUnknownDecision: 'לא ידוע',
    prReviewStaleDecision:
      'לא הוחל — ה-PR השתנה מאז התצוגה המקדימה; ההחלטה העדכנית כעת היא "{fresh}". סקרו את התוכנית המעודכנת (היא מתרעננת בקרוב) והחילו שוב.',
    prReviewExecuteFailedGeneric: 'ביצוע סקירת ה-PR נכשל.',
    prReviewCommandFailedSuffix: ' נכשל (קוד יציאה {code}).',
    prReviewApplying: 'מחיל…',
    coordinationTitle: 'תיאום הצי',
    coordinationLoading: 'בודק תביעות של מופעים אחים וכוונות בטיסה…',
    coordinationEmpty: 'לא זוהו כרגע תביעות של מופעים אחים או כוונות בטיסה.',
    coordinationUnavailable: 'תיאום הצי אינו זמין.',
    docsTitle: 'מסמכים',
    docsEmpty: 'עדיין אין מסמכים באינדקס.',
    docsUnavailable: 'המסמכים אינם זמינים.',
    docsEditToggle: 'עריכה',
    docsEditSave: 'שמירה',
    docsEditCancel: 'ביטול',
    roundTitle: 'הסבב הזה',
    roundLoading: 'טוען סיכומי סבב…',
    roundUnavailable: 'סיכומי הסבב אינם זמינים.',
    roundNoTags: 'עדיין אין תגיות שחרור — כל הפעלה נספרת לסבב עד כה.',
    roundSinceTagTip: 'תגית ה-git האחרונה שנוצרה עבור הפרויקט הזה',
    roundSinceChip: 'מאז {tag} · {ago}',
    roundSinceChipAria: 'גבול הסבב: מאז {tag}, {ago}',
    roundFiringsTip: 'הפעלות בסבב הזה',
    roundFiringsAria: '{n} הפעלות בסבב הזה',
    roundShippedTip: 'שוחרר בסבב הזה',
    roundShippedAria: '{n} שוחררו בסבב הזה',
    roundSpendTip: 'הוצאה בסבב הזה',
    roundSpendAria: 'עלות בסבב הזה: {cost}',
    roundShipRateTip: 'שיעור שילוח בסבב הזה',
    roundShipRateAria: 'שיעור שילוח בסבב הזה: {pct}',
    budgetMode: 'מצב תקציב: מספר הפעלות קבוע או יעד הוצאה כולל',
    budgetModeLabel: 'מצב תקציב',
    activeFlights: 'טיסות פעילות',
    otlpExportConfigured: 'ייצוא OTLP: מוגדר',
    otlpExportTip: 'הוגדרה נקודת קצה של OTEL_EXPORTER_OTLP_* — כל טיסה מייצאת אליה את ה-spans שלה',
    searchPlaceholder: 'חפשו קוד — או שאלו שאלה…',
    flyFolderPlaceholder: 'נתיב מוחלט למאגר Git',
    notifySettings: 'הגדרות התראות',
    notifySettingsTip: 'התראות דפדפן כשטיסה זקוקה לך או גוססת',
    notifyEnable: 'הודע לי כשטיסה זקוקה לי או גוססת',
    quietHours: 'שעות שקט',
    quietHoursStart: 'תחילת שעות שקט',
    quietHoursEnd: 'סיום שעות שקט',
    notifyEnableTip:
      'מבקש הרשאה מהדפדפן, ולאחר מכן מתריע כאשר פרויקט זקוק לך, נתקל בחריגה, או נוחת.',
    notifyQuietStartTip:
      'תחילת חלון השקט היומי — חלונות קופצים מוסתרים, אך התג בדשבורד ממשיך להתעדכן.',
    notifyQuietEndTip: 'סיום חלון השקט היומי — חלונות קופצים מתחדשים לאחר שעה זו.',
    notifyBlockedHint: 'נחסם על ידי הדפדפן שלך — בדקו את הרשאת ההתראות של האתר.',
    notifyUnsupportedHint: 'התראות אינן נתמכות בדפדפן זה.',
    detailsSummary: 'פרטים',
    gate: 'שער',
    backup: 'גיבוי',
    languages: 'שפות',
    topDirectories: 'תיקיות עליונות',
    activity: 'פעילות',
    metrics: 'מדדים',
    inbox: 'תיבת הודעות',
    firingActivity: 'פעילות טיסות',
    activityHeatmapAria:
      'פעילות טיסות ב-{weeks} השבועות האחרונים — בימים ירוקים שוגר קוד, בימים אדומים אירע כשל',
    activityHeatmapLegend: 'ירוק = שוגר · אדום = נכשל · אפור = פעילות אחרת',
    inboxSummary: 'הוסף הערה',
    inboxNoteLabel: 'הוסף הערה להפעלה הבאה',
    inboxNotePlaceholder: 'הקשר, תוכנית, תיקון — נקרא מחדש בתחילת ההפעלה הבאה',
    inboxDropNote: 'הוסף הערה',
    inboxDropNoteTip: 'כותב הערה לתוך INBOX/ — כל הפעלה קוראת אותה מחדש, לפני ORIENT',
    inboxNoteDropped: 'ההערה נוספה — ההפעלה הבאה תקרא אותה.',
    inboxNoteDropFailed: 'לא ניתן היה להוסיף את ההערה — נסו שוב.',
    hotFiles: 'קבצים חמים',
    hotFilesAria: 'קבצים חמים: הקבצים הגדולים ביותר במעקב לפי גודל בבתים, לא לפי תדירות שינוי',
    flightLog: 'יומן טיסות',
    flightLogAria:
      'יומן טיסות: כל הפעלה שהפרויקט הזה טס, החדשה ביותר קודם, לחצו על שורה כדי להרחיב אותה',
    flightLogLoadMore: 'טען הפעלות ישנות יותר',
    flightLogLoadMoreLoading: 'טוען…',
    flightLogLoadMoreTip:
      'מביא הפעלות ישנות יותר מאלה שהדפדפן כבר מחזיק — סבב אמיתי מול השרת, לא חשיפה מקומית',
    flightLogShowAll: 'הצג הכול ({n})',
    flightLogShowAllTip: 'חושף את כל {n} ההפעלות המוחזקות מקומית, לא רק את {compact} האחרונות',
    flightLogShowFewer: 'הצג פחות',
    flightLogShowFewerTip: 'כיווץ חזרה אל {compact} ההפעלות האחרונות',
    firingTrace: 'עקבה לפי הפעלה',
    firingTraceAria:
      'עקבה לפי הפעלה: כל הפעלה עבור פרויקט זה, מקובצת וניתנת לכיווץ, בניגוד לפיד הפעילות למעלה שמציג רק את הטיסה האחרונה',
    replayStart: '▶ צעד אחר צעד',
    replayStartAria: 'צעד אחר צעד',
    replayStartTip: 'שחזור ההפעלה הזו פעולה אחת בכל פעם, עם כפתורי הקודם והבא',
    replayPrev: '‹ הקודם',
    replayPrevAria: 'הפעולה הקודמת',
    replayPrevTip: 'חזרה לפעולה הקודמת בשחזור הזה',
    replayPositionTip: 'המיקום שלכם בשחזור הזה — גם מקשי החצים שמאלה וימינה מדפדפים בין הצעדים',
    replayPosition: 'צעד {step} מתוך {total}',
    replayNoSteps: 'אין צעדים',
    replayNext: 'הבא ›',
    replayNextAria: 'הפעולה הבאה',
    replayNextTip: 'מעבר לפעולה הבאה בשחזור הזה',
    replayExit: 'יציאה מהשחזור',
    replayExitTip: 'עזיבת מצב השחזור והצגת רשימת העקבה המלאה',
    diffView: 'הצגת ההבדלים',
    diffHide: 'הסתרת ההבדלים',
    diffViewTip: 'הצגת הבדלי הקוד של ההפעלה הזו — טלאי הקומיט ב-git שהיא שיגרה',
    diffHideTip: 'הסתרת ההבדלים האלה',
    traceLoading: 'טוען את העקבה המלאה…',
    diffLoading: 'טוען את ההבדלים…',
    diffEmpty: 'אין הבדלים זמינים להפעלה הזו.',
    reviewFindings: 'סקירת קומיט ({model}): {n} ממצאים',
    reviewClean: 'סקירת קומיט ({model}): אין ממצאים',
    reviewSkipped: 'סקירת הקומיט דולגה: {reason}',
    reviewTip: 'מודל חדש קרא את ההבדלים אחרי שהשער עבר. מייעץ בלבד: הוא לא מבטל קומיט.',
    firingCountTip: 'קריאות כלים ופעילות שנרשמו להפעלה הזו',
    firingStartedTip: 'מתי ההפעלה הזו התחילה',
    autoFixed: 'תוקן אוטומטית',
    autoFixedTip:
      'השער נכשל בבדיקת עיצוב הקוד; תיקון מכני פתר זאת אוטומטית וההפעלה הזו שוגרה נקייה במקום להתבטל.',
    autoFixedAria: 'תוקן אוטומטית: עיצוב הקוד תוקן באופן מכני לפני שההפעלה הזו שוגרה',
    flightCostTip: 'ההוצאה הכוללת על ההפעלה הזו',
    flightAgoTip: 'מתי ההפעלה הזו התרחשה',
    flightRealCostTip:
      'עלות אמיתית: ההוצאה הזו מחולקת לפי חלקכם במנוי, לא לפי מחיר המחירון של ה-API',
    flightSliceCostTip: 'ההוצאה על הפרוסה הזו',
    flightSliceAgoTip: 'מתי הפרוסה הזו התרחשה',
    flightGroupAgoTip: 'מתי הפרוסה האחרונה התרחשה',
    flightShaTip: 'קומיט: {name}',
    flightShaAria: 'קומיט {name}',
    flightGroupCostTip: 'ההוצאה הכוללת על כל {n} הפרוסות',
    flightSliceChip: 'פרוסה של {short}',
    flightSliceChipTip: 'חלק ממשימה מרובת הפעלות, עדיין פתוחה: {name}',
    flightSliceChipAria: 'פרוסה של {name}',
    tasks: 'משימות',
    tasksFocusMode: 'משימות — מצב מיקוד',
    boardViewColumns: 'עמודות',
    boardViewList: 'רשימה',
    boardColQueued: 'בתור',
    boardColActive: 'בטיסה · מחכה לך',
    boardColDone: 'בוצע',
    tasksFocusNote: 'המיקוד נעול: הטיסות עובדות רק על המשימות הממוקדות עד לסיומן.',
    tasksEmpty:
      'אין משימות עדיין — הוסיפו אחת למטה, או תנו ל-AUTOPILOT לזרוע את הלוח שלו בעצמו תוך כדי טיסה.',
    taskApprove: '✓ אשר',
    taskReject: '✗ דחה',
    taskDone: '✓ בוצע',
    boardKeysMove: 'מעבר',
    boardKeysOpen: 'פתיחה',
    boardKeysSelect: 'בחירה',
    boardKeysExtend: 'הרחבה',
    boardKeysSelectAll: 'בחירת הכול',
    boardKeysApprove: 'אישור',
    boardKeysDone: 'בוצע',
    boardKeysLeave: 'יציאה',
    taskSelectAria: 'בחירה: {name}',
    boardSelected: '{n} נבחרו — Esc מנקה',
    taskDetailEmpty: 'אין תיאור.',
    taskDragTip: 'גררו כדי לשנות את הסדר',
    taskNewLabel: 'משימה חדשה',
    taskNewPlaceholder: 'מה ה-AUTOPILOT הזה צריך לעשות?',
    taskAdd: 'הוסף',
    taskAddTip: 'מוסיף לתור משימת מפעיל חדשה שה-AUTOPILOT ייקח',
    cardFindingsTip: 'ממצאי סקירה פתוחים לפרויקט הזה — ראו את הפירוט למטה',
    cardActivityTip: 'מתי הייתה בפרויקט הזה פעילות כלשהי בפעם האחרונה',
    cardActivityAria: 'פעילות אחרונה: {name}',
    gaugeClearTip: 'אין ממצאים פתוחים',
    liveToolTip: 'קריאת הכלי האחרונה שההפעלה הזו ביצעה',
    liveToolAria: 'כלי: {name}',
    liveTargetTip: 'הקובץ, הפקודה או היעד שקריאת הכלי הזו נגעה בהם',
    liveTargetAria: 'יעד: {name}',
    liveElapsedTip: 'כמה זמן המסלול הזה פועל',
    liveLabel: 'חי — הפעלה בעיצומה',
    livePhaseAria: 'שלב נוכחי: {name}',
    liveNarratorTip: 'הסיכום של AUTOPILOT עצמו, במשפט אחד, לפעולה האחרונה שלו בהפעלה הזו',
    liveFocusTask: 'עובדת על: {name}',
    liveFocusTaskTip: 'משימת הלוח שההפעלה הזו עובדת עליה במפורש',
    flightGuardChip: '{n} נחסמו',
    flightGuardChipTip:
      'שומר ההכלה/היגיינת הקריאה דחה {n} קריאות כלים במהלך ההפעלה הזו — היא ניסתה לחרוג מהגבול שלה ונעצרה.',
    flightGuardChipAria: 'השומר חסם {n} קריאות כלים בהפעלה הזו (הכלה / היגיינת קריאה)',
    flightReviewChip: '{n} סומנו',
    flightReviewChipTip:
      'סוקר בלתי תלוי קרא את השינויים של ההפעלה הזו אחרי שהשער עבר וסימן {n} בעיות אפשריות — לידיעה בלבד, פסק הדין של השער נשאר בתוקף. החמורה ביותר: {top}',
    flightReviewChipAria: 'סקירת הקומיט סימנה {n} בעיות אפשריות בשינויים של ההפעלה הזו',
    actMetaTip: 'המודל וכמות הטוקנים שחויבו על הצעד הזה',
    actMetaAria: 'עלות הצעד: {name}',
    liveProbableTask: 'כנראה עובדת על: {name}',
    liveProbableTaskTip:
      'ההערכה הטובה ביותר של AUTOPILOT למשימה שההפעלה הזו עובדת עליה, על סמך תור הלוח — לא קישור מאומת',
    liveCountTip: 'כל פעולה שההפעלה החיה הזו ביצעה, בתוך חלון הפעילות האחרונה המשותף',
    liveCountTipCapped:
      'חלון הפעילות האחרונה המשותף כולו שייך להפעלה הזו — ייתכן שהיא ביצעה יותר פעולות מהנראות כאן',
    liveCountAria: 'פעולות אחרונות: {name}',
    liveTurnsTip:
      'ספירת תורות משוערת — קריאות כלים סמוכות מתמזגות לתור אחד כשהן חולקות את אותם מודל, שימוש באסימונים והיגיון; העלות האמיתית אינה ידועה עד שההפעלה הזו תנחת',
    liveProgressTip: 'הזמן שחלף בהפעלה הזו לעומת משך ההפעלה הממוצע של ההפעלות הקודמות בפרויקט הזה',
    orientFixationTipSingular:
      '{n} תור ללא עריכה עדיין — ייתכן שהיא תקועה בקריאה/תכנון במקום להתקדם',
    orientFixationTipPlural:
      '{n} תורות ללא עריכה עדיין — ייתכן שהיא תקועה בקריאה/תכנון במקום להתקדם',
    orientFixationAriaSingular: 'קיבעון אפשרי: {n} תור ללא עריכה עדיין',
    orientFixationAriaPlural: 'קיבעון אפשרי: {n} תורות ללא עריכה עדיין',
    statusAria: 'סטטוס: {label} — {tip}',
    projectStatusRegistered: 'רשום',
    projectStatusRegisteredTip: 'רשום אך עדיין לא טס',
    projectStatusFlying: 'טס',
    projectStatusFlyingTip: 'הפעלה בעיצומה ברגע זה',
    projectStatusPaused: 'מושהה',
    projectStatusPausedTip: 'מושהה — לא יטוס עד שיחודש',
    projectStatusHibernating: 'בתרדמה',
    projectStatusHibernatingTip: 'אין פעילות אחרונה — המתזמן מדלג עליו עד שיתעורר',
    projectStatusNeedsYou: 'זקוק לכם',
    projectStatusNeedsYouTip: 'חסום עד להחלטה שרק אתם יכולים לקבל',
    taskStatusQueued: 'בתור',
    taskStatusQueuedTip: 'בתור — ממתינה לתורה בתור הטיסות',
    taskStatusInProgress: 'בביצוע',
    taskStatusInProgressTip: 'ה-AUTOPILOT עובד עליה כעת',
    taskStatusDone: 'הושלמה',
    taskStatusDoneTip: 'הושלמה ואומתה על ידי השער',
    taskStatusNeedsApproval: 'ממתינה לאישור',
    taskStatusNeedsApprovalTip: 'הוצעה עצמאית — ממתינה להחלטת האישור או הדחייה שלכם',
    taskStatusDeferred: 'נדחתה',
    taskStatusDeferredTip: 'נדחתה — הונחה בצד להמשך',
    reportBugLabel: 'דיווח על באג או בקשת תכונה במאגר המקור',
    titleLabel: 'כותרת',
    titlePlaceholder: 'כותרת',
    detailsOptionalPlaceholder: 'פרטים (אופציונלי)',
    openGithubIssue: 'פתח issue ב-GitHub',
    reportComposeNoteLabel: 'או תארו זאת במילים שלכם — Compose יכתוב עבורכם את הכותרת והגוף',
    reportComposeNotePlaceholder: 'מה קרה, או מה הייתם רוצים שיהיה קיים…',
    reportComposeButton: 'חבר',
    reportComposeTip:
      'הופך את ההערה שלכם לכותרת וגוף מלוטשים באנגלית באמצעות קריאה למודל מקומי — המילים הגולמיות שלכם אף פעם לא עוזבות את המחשב הזה.',
    reportComposing: 'מחבר…',
    reportComposeReady: 'חובר — תוויות מוצעות: {labels}. בדקו את השדות למטה ואז הגישו.',
    reportComposeUnavailable: 'החיבור אינו זמין כרגע — נסו שוב בעוד רגע.',
    reportComposeRequestFailed: '✗ בקשת החיבור נכשלה — נסו שוב בעוד רגע.',
    openPullRequest: 'פתח pull request',
    checkForUpdates: 'בדוק עדכונים',
    fleetWisdomProposal: 'הצעת חוכמת הצי',
    githubPrSummary: 'תרום למאגר המקור',
    githubPrLabel: 'תרום את הענף הנוכחי של {name} למאגר המקור כ-pull request',
    githubSyncing: 'מסנכרן…',
    githubPrOpening: 'פותח…',
    githubRequestFailed: '✗ הבקשה נכשלה — נסו שוב בעוד רגע.',
    githubSyncResultOk: 'סונכרן.',
    githubSyncResultFail: 'הסנכרון נכשל.',
    startOverHint:
      'מאפס את ספירת ההפעלות ואת שיעור השילוח ל-0/0. המשימות, האינדקס והגיבויים נשמרים.',
    githubSyncHint: 'פרטי כברירת מחדל. הסנכרון הראשון יוצר מאגר, וכל סנכרון לאחריו דוחף אליו.',
    githubSync: '⇪ סנכרן ל-GitHub',
    githubSyncPublicLabel: 'הפוך לציבורי במקום זאת (גלוי לכולם)',
    githubPrResultOk: 'ה-pull request נפתח.',
    githubPrResultFail: 'פתיחת ה-pull request נכשלה.',
    poolClientPanel: 'מאגר תורמים',
    ciStatusPanel: 'מצב CI',
    ciRunning: 'רץ',
    snackDismiss: 'סגירת ההודעה',
    luckyRolled:
      'הוגרלו {lanes} נתיב/ים × {firings} הפעלות ב-${budget} כל אחת — לחצו על "שגר!" כדי להמריא.',
    luckyWhyTitle: 'למה הגודל הזה',
    luckyHandToPilot: 'העבירו לטייס',
    luckyHandToPilotTip:
      'מוסיף את ה-issue הזה ללוח שלכם כדי שההפעלה הבאה תוכל לקחת אותו — שום דבר לא נתבע ב-GitHub ושום דבר לא טס עד שתלחצו "שגר!"',
    luckyHandedOff: 'נוסף ללוח עבור הטייס: #{number}. לחצו "שגר!" כשתהיו מוכנים.',
    luckyHandOffFailed: 'לא ניתן היה להוסיף את #{number} ללוח — נסו שוב עוד רגע.',
    luckyOpenBoard: 'פתחו את הלוח',
    ciNoRuns: 'טרם רץ',
    publicityPanel: 'פרסום',
    contributorStandingPanel: 'מעמד תורמים',
    contributorIssueListPanel: 'בעיות טובות למתחילים',
    contributorIssueListTitle: 'בעיות טובות למתחילים',
    subjectNav: 'אזורים',
    subjectFleet: 'צי',
    subjectOverview: 'סקירה',
    subjectBoard: 'לוח',
    subjectPlan: 'תוכנית',
    subjectDocs: 'מסמכים',
    subjectData: 'נתונים',
    focusMode: 'ריכוז',
    focusModeTip: 'להסתיר את המסגרת ולהשאיר את העבודה (Esc ליציאה)',
    focusExit: 'יציאה מריכוז',
    paletteOpen: 'פקודות (Ctrl או ⌘ K)',
    paletteTitle: 'לעבור, לפתוח או לבצע',
    palettePlaceholder: 'הקלידו מקום, פרויקט או פעולה…',
    paletteEmpty: 'אין התאמה',
    paletteGoTo: 'לעבור אל {name}',
    paletteOpenProject: 'לפתוח את {name}',
    paletteTheme: 'ערכת נושא: {name}',
    paletteLanguage: 'שפה: {name}',
    paletteSearch: 'לחפש או לשאול את הפרויקט',
    planZoomIn: 'להגדיל',
    planZoomOut: 'להקטין',
    planFit: 'להתאים לתצוגה',
    planCanvasAria: 'קנבס התוכנית: גלילה או צביטה להגדלה, גרירה להזזה, 0 להתאמה',
    keeperWaiting: '{n} ממתינים לך',
    subjectFly: 'טיסה',
    subjectKeeper: 'שומר',
    subjectCommunity: 'קהילה',
    subjectEmpty: 'עדיין אין כאן כלום — האזור הזה מתמלא ככל שהצי עובד.',
    contextRail: 'הקשר: נתיבים בטיסה ותור ה-Keeper',
    contextRailEmpty: 'שום דבר לא בטיסה ושום דבר לא מחכה לך.',
    keeperQueueTitle: 'ממתין לך',
    keeperQueueHint: 'j / k או החצים מזיזים · Enter פותח · a פועל',
    keeperQueueSettled: '{n} הוסדרו בסשן הזה',
    keeperQueueClear: 'שום דבר לא מחכה לך',
    keeperSourcePr: 'PR',
    keeperSourcePool: 'מאגר',
    keeperSourceTriage: 'מיון',
    keeperSourceMirror: 'מראה',
    keeperSourceBacklog: 'צבר',
    keeperSourceWisdom: 'חוכמה',
    keeperSourceApproval: 'אישור',
    pipelineView: 'תצוגת צנרת',
    pipelineViewTitle: 'תצוגת צנרת',
    pipelineLensLabel: 'מסנן הצנרת',
    pipelineLensFleet: 'צי',
    pipelineLensFleetTip: 'כל עקבה שנרשמה בכל הצי.',
    pipelineLensFiles: 'קבצים',
    pipelineLensFilesTip: 'רק קבצים שנגעו בהם הפעלות שעברו את השער.',
    pipelineModeLabel: 'קיבוץ צמתי הצנרת',
    pipelineModeGrouped: 'מקובץ',
    pipelineModeGroupedTip: 'מקפל כל עקבה או קובץ לצומת בודד.',
    pipelineModeFlat: 'שטוח',
    pipelineModeFlatTip: 'צומת אחד לכל עקבה בודדת.',
    pipelineLayoutLabel: 'פריסת קנבס הצנרת',
    pipelineLayoutLayered: 'בשכבות',
    pipelineLayoutLayeredTip: 'נותן לכל עקבה שורה משלה.',
    pipelineLayoutCompact: 'קומפקטי',
    pipelineLayoutCompactTip: 'ממזג עקבות מחוברות ומסדר עקבות בודדות ברשת.',
    pipelineLoading: 'טוען נתוני צנרת…',
    pipelineUnavailable: 'תצוגת הצנרת אינה זמינה.',
    planEditorTitle: 'תוכנית טיסה',
    planEditorLoading: 'טוען את תוכנית הטיסה…',
    planEditorUnavailable: 'תוכנית הטיסה לקריאה בלבד כאן.',
    planEditorEnabled: 'רץ',
    planEditorCommand: 'פקודה',
    planEditorLabel: 'תווית',
    planEditorStepOff: 'כבוי',
    planEditorDraft:
      'טיוטה — נשמרת כאן אוטומטית, עדיין לא פורסמה. הנחיתה והירי הבאים עדיין מריצים את התוכנית שפורסמה.',
    planEditorPublished: 'פורסם — זה מה שכל נחיתה וירי מריצים.',
    planEditorPublishedNow: 'פורסם. הנחיתה והירי הבאים מריצים את התוכנית הזו.',
    planEditorPublishFailed: 'לא פורסם',
    planEditorPublish: 'פרסם',
    planEditorDiscard: 'בטל טיוטה',
    planEditorUndo: 'בטל',
    planEditorRedo: 'בצע שוב',
    planEditorOutcomePass: 'עבר',
    planEditorOutcomeFail: 'נכשל',
    planEditorOutcomeNone: 'לא רץ',
    planEditorLastRun: 'ריצת שער אחרונה ({ago}): {passed} מתוך {total} עברו.',
    planEditorLastRunFailed: 'נכשלו: {labels}',
    planEditorNoRun: 'אין עדיין ריצת שער.',
    soulRatifyConfirm:
      'להחליף את הנחיית ה-SOUL החיה בטקסט המוצע?\n\nניתן לבטל זאת לאחר מכן באמצעות ביטול-אישור.',
    soulUnratifyConfirm:
      'לבטל את אישור ה-SOUL האחרון?\n\nפעולה זו משחזרת את טקסט ה-SOUL שהיה לפרויקט זה קודם לכן.',
    fleetWisdomRatifyConfirm:
      'להחיל את התיקון הזה כחוכמת הצי החיה?\n\nכל פרויקט קורא את החוכמה המשותפת בטיסה הבאה שלו.',
    taskDeleteConfirm: 'למחוק את "{name}"?\n\nפעולה זו מסירה את המשימה מהלוח לחלוטין.',
    removeProjectConfirm:
      'להסיר את {name} מלוח הבקרה?\n\nהקבצים ותולדות ה-git שלכם לא נפגעים — רק רשומת לוח הבקרה מוסרת.',
    startOverConfirm:
      'להתחיל מחדש עבור {name}?\n\nפעולה זו מאפסת את מדדי ההפעלות והשילוח (חזרה ל-0/0) ומתחילה סבב חדש.\nהפרויקט, המשימות שלו, אינדקס החיפוש שלו וגיבויי ה-git שלו — כולם נשמרים.',
    githubSyncConfirmPrivate:
      'לסנכרן את {name} ל-GitHub?\n\nפעולה זו יוצרת מאגר GitHub פרטי ודוחפת אליו (בסנכרון הראשון), או דוחפת למאגר המרוחק הקיים (בסנכרון חוזר), באמצעות ה-gh/git המאומתים שלכם. לא ניתן לבטל פעולה זו מלוח הבקרה.',
    githubSyncConfirmPublic:
      'להפוך את {name} לציבורי ב-GitHub?\n\nכל אחד באינטרנט יוכל לראות את הקוד הזה ואת ההיסטוריה המלאה שלו. פעולה זו יוצרת מאגר GitHub ציבורי ודוחפת אליו (בסנכרון הראשון), או דוחפת למאגר המרוחק הקיים (בסנכרון חוזר), באמצעות ה-gh/git המאומתים שלכם. לא ניתן לבטל פעולה זו מלוח הבקרה.',
    githubPrConfirm:
      'לפתוח pull request בשם "{title}" מול מאגר ה-AUTOPILOT במקור, מהענף הנוכחי של {name}?\n\nפעולה זו מבצעת fork למאגר המקור, דוחפת את הענף שלכם אל ה-fork, ומריצה `gh pr create` אמיתי באמצעות ה-gh/git המאומתים שלכם. לא ניתן לבטל פעולה זו מלוח הבקרה.',
    githubPrConfirmIssueClause: '\n\nפעולה זו תסגור את issue מספר #{issueNumber} עם המיזוג.',
    releaseConfirmBase:
      'להוציא את המהדורה הזו?\n\nפעולה זו מעדכנת את הגרסה ב-package.json, מעדכנת את ה-CHANGELOG, יוצרת קומיט ותג git אמיתיים, ומצרפת אישור git-notes.',
    releaseConfirmMilestoneClause: ' כמו כן מתייגת את "{milestoneTag}" על אותו קומיט.',
    releaseConfirmGhReleaseClause: ' כמו כן דוחפת את התג החדש ומפרסמת אותו כ-GitHub Release.',
    releaseConfirmSuffix: ' לא ניתן לבטל פעולה זו מלוח הבקרה.',
    browseDrives: 'כוננים',
    browseUpParent: 'עלייה לתיקיית האב',
    flightSummaryTitle: 'שוחררו לאחרונה',
    poolTitle: 'מאגר',
    poolAudience:
      'לציי AUTOPILOT: תבעו כאן issue והטייס שלכם מטיס אותו, על הטוקנים שלכם. אנשים תובעים ב-GitHub עם ‎/claim.',
    contributorIssueListAudience:
      'לאנשים: שמור לבני אדם, הצי עוקף אותם. תבעו אחד ב-GitHub עם ‎/claim; ההדרכה למטה. good first issue שאיש לא תבע תוך 14 ימים נפתח לצי (agent-ok) — ‎/claim עדיין מחזיר אותו אליכם.',
    ciStatusTitle: 'מצב CI',
    poolNoLocalTask: 'ללא משימה מקומית',
    poolNoLocalCheckout: 'אין עותק מקומי של {repo}',
    poolRoutedByRepo: 'ניתוב אוטומטי: זה הפרויקט הרשום שה-origin שלו ב-git הוא {repo}.',
    poolProjectSelectAria: 'פרויקט מקומי להוספת משימת לוח (אופציונלי)',
    poolProjectSelectTip:
      'מוסיף גם משימת לוח מקומית לפרויקט הזה בעת התביעה — השאירו ללא בחירה כדי לתבוע רק ב-GitHub.',
    poolClaim: 'תבע',
    poolClaimAnyway: 'תבע בכל זאת',
    settingsNav: 'תצוגה ונגישות',
    settingsTip: 'הגדרות תצוגה ונגישות',
    prefText: 'גודל טקסט',
    prefTextSm: 'קטן',
    prefTextMd: 'ברירת מחדל',
    prefTextLg: 'גדול',
    prefTextXl: 'גדול יותר',
    prefFont: 'גופן',
    prefFontInter: 'Inter',
    prefFontSystem: 'מערכת',
    prefFontMono: 'רוחב קבוע',
    prefDensity: 'ריווח',
    prefDensityCompact: 'צפוף',
    prefDensityComfortable: 'ברירת מחדל',
    prefDensityRelaxed: 'מרווח',
    prefMotion: 'תנועה',
    prefMotionSystem: 'לפי המערכת',
    prefMotionReduce: 'מופחתת',
    prefPhosphor: 'זרחן הטרמינל',
    prefPhosphorGreen: 'ירוק',
    prefPhosphorAmber: 'ענבר',
    prefPhosphorWhite: 'לבן',
    prefHue: 'גוון',
    prefHueAria: 'סיבוב כל צבעי העיצוב, במעלות; 0 הוא ערכת הנושא כפי שעוצבה',
    prefsReset: 'איפוס לברירת המחדל',
    prefsHint:
      'נשמר בדפדפן הזה בלבד. הטקסט גדל עד 125% והריווח מתרחב בלי אובדן; תנועה מופחתת נשמרת גם כשהמערכת לא מבקשת.',
    anomalyPopEvidence: 'למה זה נדלק:',
    anomalyPopAction: 'מה אפשר לעשות:',
    anomalyWhatCostSpike: 'ההפעלה האחרונה עלתה פי כמה מהממוצע האחרון.',
    anomalyActionCostSpike:
      'פתחו את ה-trace שלה: לולאת קריאה שברחה או diff ענק הם הסיבה הרגילה. שקלו תקציב הדוק יותר או משימה קטנה יותר.',
    anomalyWhatDeathCluster: 'כמה מההפעלות האחרונות מתו (תקרת תורות או שגיאה) בלי לשלוח.',
    anomalyActionDeathCluster:
      'קראו את סוף המוות האחרון. מיתות חוזרות על משימה אחת אומרות שהיא גדולה מדי או שהשער שלה לא ניתן להשגה: פצלו אותה או תקנו את השער.',
    anomalyWhatGateFailStreak: 'הפעלות רצופות הוחזרו לאחור על ידי השער.',
    anomalyActionGateFailStreak:
      'הריצו את השער ידנית. שער אדום על הענף עצמו מחזיר לאחור כל הפעלה עד שיתוקן.',
    anomalyWhatOrientDrag: 'ההפעלה האחרונה קראה וחיפשה הרבה יותר מהרגיל לפני העריכה הראשונה שלה.',
    anomalyActionOrientDrag:
      'בדקו את טקסט המשימה: משימה מעורפלת גורמת לסוכן לשוטט. ציינו את הקבצים שממנו כדאי להתחיל.',
    anomalyWhatFamilyRunaway: 'דפוס משימה חוזר ממשיך לשרוף כסף תחת מזהי משימה רבים.',
    anomalyActionFamilyRunaway:
      'פרשו או כתבו מחדש את משפחת המשימות הזו; אף מזהה בודד לא חצה את התקרה למשימה, המשפחה כן.',
    anomalyWhatIntentCollision: 'הפעלה שלחה קובץ שנתיב אח תבע ככוונה שלו.',
    anomalyActionIntentCollision:
      'פחות נתיבים, או נתיבים על אזורים נפרדים. בדקו ב-sync-back אם עבודת האח נדרסה בשקט.',
    anomalyWhatNearMissRecurring: 'מחלקת כמעט-תקרית אחת נשארה לא-אפס לאורך טיסות רצופות.',
    anomalyActionNearMissRecurring:
      'פתחו את טקס הכמעט-תקריות. כמעט-תקרית שחוזרת היא תקרית שמחכה ליומה.',
    anomalyWhatGuardDenial: 'שומר ההכלה או היגיינת-הקריאה חסם קריאת כלי.',
    anomalyActionGuardDenial:
      'קראו את היעד שנחסם. הפעלה שמנסה לצאת מהתיקייה שלה היא או מוגדרת לא נכון או מבולבלת; השומר החזיק.',
    anomalyWhatSyncBackRefusal: 'ה-sync-back של נתיב לענף הטיסה נדחה.',
    anomalyActionSyncBackRefusal:
      'מזגו את ענף הנתיב ידנית אחרי הסבב: הקומיטים שלו עדיין לא על ענף הטיסה.',
    anomalyWhatLandGateAlarm: 'שער הנחיתה החיצוני נעשה אדום בזמן שטיסה רצה.',
    anomalyActionLandGateAlarm:
      'אל תנחיתו. הריצו את השער על checkout מנותק ותקנו קודם את מה שאדום.',
    anomalyWhatConvergenceRed: 'שער התכנסות נעשה אדום אחרי sync-back.',
    anomalyActionConvergenceRed:
      'המצב הממוזג שבור למרות שכל נתיב היה ירוק. תקנו על ענף הטיסה לפני הנחיתה.',
    anomalyWhatE2eLandBlock: 'נחיתה נדחתה כי ה-e2e של הענף המתכנס אדום.',
    anomalyActionE2eLandBlock:
      'הנחיתו את התיקון: ענף שנוגע במפרט הנכשל או בצילומי הבסיס שלו מנקה את החסימה. אחרת חכו לריצה ירוקה.',
    anomalyWhatConvergenceUnverifiable: 'שער התכנסות דיווח ירוק מהר יותר ממה שיכול היה לרוץ.',
    anomalyActionConvergenceUnverifiable:
      'התייחסו לזה כאל היעדר פסק דין. הריצו את השער ידנית ובדקו שפקודת השער באמת מריצה בדיקות.',
    anomalyWhatGuardVerifyFailed: 'טיסה סירבה להתחיל כי לא ניתן היה לאמת את שומר ההכלה שלה.',
    anomalyActionGuardVerifyFailed:
      'בדקו את קובץ הגדרות ה-hook שהשומר נכתב אליו. הטיסה לא תרוץ בלי שומר.',
    docsImage: 'תמונה',
    terminalHudAria: 'תצוגת HUD של הטרמינל',
    terminalHudLabel: 'HUD של הטרמינל',
    terminalHudScanlines: 'קווי סריקה',
    terminalHudScanlinesOff: 'כבוי',
    terminalHudScanlinesOn: 'פעיל',
    terminalHudGlow: 'זוהר',
    terminalHudGlowOff: 'כבוי',
    terminalHudGlowOn: 'פעיל',
    terminalHudDismiss: 'סגירת ה-HUD של הטרמינל',
    terminalHudDismissTip: 'הגדרות › סרגל HUD › מוצג יחזיר אותו (וגם איפוס לברירת המחדל)',
    prefHud: 'סרגל HUD',
    prefHudShown: 'מוצג',
    prefHudHidden: 'מוסתר',
    askFab: 'שאל',
    askFabTip: 'שאלו את הארכיטקט או את הג׳ניוס על העמוד הזה — נפתח לצידו',
    askSheetTitle: 'שאל',
    askSheetClose: 'סגור',
    tileProjects: 'פרויקטים',
    tileProjectsTip: 'פרויקטים נפרדים ש-AUTOPILOT עוקב אחריהם',
    tileFlying: 'בטיסה',
    tileFlyingTip: 'פרויקטים עם ירי שרץ ברגע זה',
    tileFirings: 'יריות',
    tileFiringsTip: 'סך יריות המנוע בכל הפרויקטים',
    tileFiringsProjectTip: 'סך יריות המנוע בפרויקט הזה',
    tileShipped: 'שוגרו',
    tileShippedTip: 'יריות שעברו את השער ובוצע להן commit',
    tileCost: 'עלות',
    tileCostTip: 'סך ההוצאה על כל הירי',
    tileOpenFindings: 'ממצאים פתוחים',
    tileOpenFindingsTip: 'ממצאי סקירה שלא נפתרו בכל הפרויקטים',
    tileNeedYou: 'צריכים אותך',
    tileNeedYouTip: 'פריטים שממתינים להחלטה שלך',
    tileRealCost: 'עלות אמיתית',
    tileRealCostTip: 'סך ההוצאה לפי חלק המנוי האמיתי במקום מחיר המחירון של ה-API (סמנטיקת עלות v3)',
    tileShipRate: 'שיעור שיגור',
    tileShipRateProjectTip: 'יריות ששוגרו כחלק מכלל הירי בפרויקט הזה',
    tileRecentForm: 'כושר אחרון',
    tileRecentFormTip: 'שיעור השיגור בחמש היריות האחרונות',
    backToFleet: 'צי',
    ritualLanding: 'נחיתה',
    ritualRelease: 'שחרור גרסה',
    ritualClaim: 'תביעת סוגיה',
    ritualPrReview: 'סקירת PR',
    ritualIssueTriage: 'מיון סוגיות',
    ritualMirrorPass: 'מעבר מראה',
    ritualDiscussionsTriage: 'מיון דיונים',
    ritualReport: 'הגשת דיווח',
    ritualGithubIssue: 'פתיחת סוגיה',
    ritualCompose: 'ניסוח',
    ritualUpdate: 'עדכון',
    ritualWorking: 'עובד — זה עשוי לקחת כמה דקות.',
    ritualWritesPaused: 'כתיבות מושהות',
    ritualWarning:
      'כל השאר ממתין: כתיבות מושהות עד לסיום; קריאות ממשיכות לזרום. אפשר למזער ולהמשיך להסתכל.',
    ritualMinimize: 'מזער',
    ritualClose: 'סגור',
    ritualDone: 'הושלם.',
    ritualFailed: 'נכשל.',
    ritualRequestFailed: 'הבקשה נכשלה — ייתכן שהשרת מופעל מחדש; הפאנל יציג את התוצאה כשיחזור.',
    ritualReconnecting: 'מתחבר מחדש…',
    ritualWaitToast: 'המתינו לסיום “{title}” — כתיבות מושהות.',
    ritualStepOf: 'שלב {index} מתוך {total}',
    ritualPillTip: 'הצג את הפעולה שרצה',
    poolClaiming: 'תובע…',
    poolFly: 'טוס',
    poolStarting: 'מתחיל…',
    poolRequestFailed: '✗ הבקשה נכשלה — נסו שוב בעוד רגע.',
    backlogTitle: 'פיגור שזוהה',
    backlogChecking: 'בודק קומיטים אחרונים מול הלוח הפתוח…',
    backlogEmpty: 'אין התאמות לא מאושרות — כל משימה פתוחה כבר בוצעה או שטרם הודהדה בקומיט.',
    backlogConfirmDone: '✓ אשר בוצע',
    backlogUnavailable: 'הפיגור שזוהה אינו זמין.',
    releaseTitle: 'המהדורה הבאה',
    releaseLoading: 'בודק קומיטים ראויים לשחרור…',
    releaseUnavailable: 'תצוגה מקדימה של המהדורה אינה זמינה.',
    releaseNoTags: 'עדיין אין תגיות שחרור — אין מול מה להשוות את המהדורה הבאה.',
    releaseMilestoneLabel: 'תגית אבן דרך (אופציונלי)',
    releaseMaturityLabel: 'שלב המהדורה',
    releaseMaturityAutoTemplate: 'אוטומטי — זוהה: {phase}',
    releaseMaturityAlpha: 'אלפא',
    releaseMaturityBeta: 'בטא',
    releaseMaturityRc: 'מועמדת לשחרור',
    releaseMaturityStable: 'יציבה',
    releaseExecuteTemplate: 'הוצא מהדורה v{version}',
    releaseExecuting: 'מוציא…',
    releaseRequestFailed: '✗ הבקשה נכשלה — נסו שוב בעוד רגע.',
    tourFiringTitle: 'הפעלה',
    tourFiringBody:
      'מפגש עבודה אוטונומי אחד: הסוכן מתמצא, מבצע את העבודה, מריץ את השער, ואז מבצע קומיט — ועוצר. טיסה מורכבת מהפעלות רבות.',
    tourSliceTitle: 'פרוסה',
    tourSliceBody:
      'הפעלה שמקדמת משימה בלי לסיים אותה. המשימה נשארת פתוחה וההפעלה הבאה ממשיכה אותה — שום דבר לא הולך לאיבוד בהמתנה להפעלה ענקית אחת.',
    tourGateTitle: 'שער',
    tourGateBody:
      'הבדיקות של הפרויקט עצמו — בדיקת טיפוסים, linting, בדיקות, בנייה — רצות לפני כל קומיט. שער אדום פירושו שהשינוי מבוטל, ולעולם לא משוגר שבור.',
    tourFlightTitle: 'טיסה',
    tourFlightBody:
      'ריצה של הפעלות מול פרויקט אחד, מוגבלת בתקציב שקבעתם (מספר הפעלות או סכום כולל ב-$), עד שהיא מסתיימת או שאתם משהים אותה.',
    tourSkip: 'דלג',
    tourClose: 'סגור',
    tourSkipTipMid:
      'מבטל את הסיור ומסמן אותו כנצפה — הוא לא ייפתח אוטומטית שוב, אבל כפתור הסיור בכותרת העליונה פותח אותו מחדש בכל עת.',
    tourSkipTipLast: 'סוגר את הסיור — כפתור הסיור בכותרת העליונה פותח אותו מחדש בכל עת.',
    tourBack: 'הקודם',
    tourBackTip: 'חוזר למונח הקודם.',
    tourNext: 'הבא',
    tourNextTip: 'מתקדם למונח הבא — הסיור נשאר פתוח.',
    browseFolderTitle: 'עיון בתיקייה',
    browseError: 'לא ניתן להציג את תוכן התיקייה הזו.',
    close: 'סגור',
    cancel: 'ביטול',
    useThisFolder: 'השתמש בתיקייה זו',
    noSubfolders: 'אין כאן תיקיות משנה.',
    browseSubfoldersOf: 'תיקיות המשנה של {path}',
    enterFolderPath: 'הזינו נתיב לתיקייה.',
    launching: 'משגר…',
    launched: 'הטיסה שוגרה.',
    couldNotLaunch: 'לא ניתן לשגר.',
    launchFailed: 'השיגור נכשל — האם לוח הבקרה עדיין פועל?',
    stopping: 'עוצר…',
    stopFailed: 'העצירה נכשלה.',
    pausing: 'משהה…',
    pauseFailed: 'ההשהיה נכשלה.',
    stoppingName: 'עוצר את {name}…',
    pausingName: 'משהה את {name}…',
    stopFailedName: 'העצירה של {name} נכשלה.',
    pauseFailedName: 'ההשהיה של {name} נכשלה.',
    removing: 'מסיר…',
    resetting: 'מאפס…',
    flyingUpToTotal: 'בטיסה על {name} — עד ${total} בסך הכול…',
    flyingFirings: 'בטיסה על {name} — {count} הפעלות…',
    pausedUntilResumed: 'הטיסה על {name} הושהתה — לא תמשיך עד לחידוש.',
    aFolder: 'תיקייה',
    flyBrowseTip: 'עיון בקבצי המערכת לבחירת תיקייה',
    flyGoTip:
      'משגר טיסה אוטונומית על התיקייה הזו עם ההפעלות והתקציב שהוגדרו כאן — היא מתחילה להוציא תקציב אמיתי מיד.',
    flyPauseTip: 'משהה את הטיסה הפעילה — אין הפעלות חדשות עד לחידושה.',
    flyStopTip: 'עוצר את הטיסה הפעילה — עבודה שכבר בוצע לה commit נשמרת.',
    flyFiringsTip: 'כמה הפעלות הטיסה הזו מריצה לפני עצירה (לא רלוונטי במצב הוצאה כוללת).',
    flyBudgetTip: 'מקסימום דולרים שהפעלה אחת רשאית להוציא לפני שהטיסה ממשיכה הלאה.',
    flyModeTip: 'מצב תקציב: מספר הפעלות קבוע או יעד הוצאה כולל.',
    flyTotalTip: 'עוצר את הטיסה כשההוצאה הכוללת בכל ההפעלות מגיעה לסכום הזה.',
    flyLanesTip:
      'יותר מ-1 מפצל את הלוח הפתוח למספר הזה של נתיבים מקבילים עם תחומי משימות נפרדים (אותו מחלק המודע למרכז שבו משתמש "dashboard fleet"), במקום לטוס בנתיב בודד.',
    flyProgressTip:
      'התקדמות הטיסה כולה — זמן שחלף, הוצאה או מספר הפעלות מול היעד, והערכת סיום לפי משך ההפעלה הממוצע של הטיסה הזו',
    flightRunningTip: 'הטיסה הזו פעילה כעת — "עצור" מסיים אותה, "השהה" משהה אותה עד לחידוש.',
    flightQueuedTip: 'בתור אחרי טיסה אחרת — תתחיל אוטומטית כשיתפנה מקום.',
    flightPausedTip: 'מושהית — לא תטוס שוב עד ללחיצה על "המשך".',
    browseCloseTip: 'סוגר את הדו-שיח הזה בלי לשנות את תיקיית הטיסה.',
    browseDriveTip: 'מעבר לכונן {drive} והצגת התיקיות שבו.',
    browseUpTip: 'עלייה רמה אחת והצגת תיקיית האב.',
    browseEntryTip: 'פתיחת {name} והצגת תיקיות המשנה שלה.',
    browseUseTip: 'מגדיר את {path} כתיקיית הטיסה וסוגר את הדו-שיח הזה.',
    flightRowFlyingTotal: 'בטיסה על {name} — עד ${total} בסך הכול',
    flightRowFlyingFirings: 'בטיסה על {name} — {count} הפעלות',
    flightRowWatchdogSuffix: ' (fleet-watchdog)',
    flightRowQueued: 'בתור: {name} — ממתין למקום טיסה פנוי',
    pauseFlightOn: 'השהיית הטיסה על {name}',
    stopFlightOn: 'עצירת הטיסה על {name}',
    cancelQueuedFlightOn: 'ביטול הטיסה שבתור על {name}',
    resumeFlightOn: 'חידוש הטיסה על {name}',
    flyLuckyAria: 'יש לי מזל — בדיקת המחשב הזה ומילוי שיגור מכויל',
    flyLuckyTip:
      'בודק את המחשב הזה (מעבד, זיכרון, ליבות) ואת הלוח, ואז ממלא נתיבים/הפעלות/$ בשיגור בגודל שהמחשב יכול לשאת כרגע. מילוי בלבד — "שגר!" נשאר הלחיצה שלכם.',
    luckyNoAnswer: 'הגרלת המזל נכשלה — אין תשובה מהשרת.',
    luckyDashboardDown: 'הגרלת המזל נכשלה — האם לוח הבקרה פועל?',
    luckyNotNow: 'לא עכשיו: {reason}',
    luckyNoPlan: 'אין תוכנית',
    luckyPlanReady: 'התוכנית מוכנה',
    luckyPressFlyIt: '{reason} — לחצו על "שגר!" כדי להמריא.',
    luckyFitTitle: 'עבודה שמתאימה לכם',
    luckyFitAttentionAria: 'כמה קשב יש לכם',
    luckyFitEvening: 'ערב אחד',
    luckyFitDay: 'יום',
    luckyFitWeek: 'שבוע',
    luckyFitScore: 'התאמה {score}',
    luckyFitSourcePool: 'מאגר — הטייס שלכם יכול להטיס',
    luckyFitSourcePeople: 'צעד ראשון — ביד',
    lanesFixedFiringCount: 'נתיבים משוגרים עם מספר הפעלות קבוע — כבו קודם את מצב ההוצאה הכוללת.',
    fleetLaunched: 'הצי שוגר.',
    fleetLaunchFailed: 'שיגור הצי נכשל.',
    fleetLaunchDashboardDown: 'שיגור הצי נכשל — האם לוח הבקרה עדיין פועל?',
    flightProgressLabel: 'חלפו {elapsed} · {progress} ({pct}%){eta}',
    flightProgressSpentOfTotal: '{spent} מתוך ${total} בסך הכול',
    flightProgressFiringsSoFar: '{done} / {count} הפעלות · {spent} עד כה',
    flightProgressEta: ' · הערכת סיום ~{eta}',
    flightProgressFinishingUp: ' · לקראת סיום',
    flyHintFixedMode: '{count} הפעלות × ${perFiring} כל אחת — מוציא עד ${ceiling} בסך הכול{caps}.',
    flyHintTotalMode:
      'ממשיך לירות כל עוד הנותר ${remaining} יכול לממן הפעלה נוספת של ${perFiring} — עד כ-{estimate} הפעלות{caps}.',
    flyHintCapsWithTurns: ' · כל הפעלה: עד ${perFiring} ו-{maxTurns} תורות',
    flyHintCapsNoTurns: ' · כל הפעלה: עד ${perFiring}',
    connectLoginTip:
      'פותח טרמינל שמריץ התחברות ל-Claude — הדביקו למטה את האסימון שהוא מדפיס, ואז "שמור ואמת".',
    connectTestTip: 'מאמת את פרטי הגישה השמורים בקריאת claude אמיתית אחת.',
    connectSaveTip: 'שומר את פרטי הגישה מקומית (לא יוצגו שוב) ומרענן את מצב החיבור.',
    ghLtsCheckTip: 'מושך את הגרסה האחרונה מ-GitHub ומשווה אותה לגרסה שלוח הבקרה הזה מריץ.',
    ghIssueTip:
      'פותח issue אמיתי ב-GitHub במאגר AUTOPILOT במעלה הזרם באמצעות ה-gh שלכם — מבקש אישור קודם.',
    connectionUnavailable: 'החיבור אינו זמין',
    connectCheckingConnection: 'בודק חיבור…',
    ghUnavailable: 'GitHub: לא זמין',
    ghChecking: 'בודק את GitHub…',
    ltsUnavailable: 'LTS: לא זמין',
    ltsChecking: 'בודק עדכונים…',
    ghIssueOpening: 'פותח…',
    ghIssueRequestFailed: '✗ הבקשה נכשלה.',
    connectTesting: 'בודק (קריאת claude אמיתית)...',
    connectTestFailed: 'הבדיקה נכשלה',
    connectLaunchingLogin: 'מפעיל התחברות ל-Claude...',
    connectTerminalOpened: 'נפתח טרמינל — הדביקו למטה את האסימון, ואז "שמור ואמת"',
    connectLoginLaunchFailed: 'לא ניתן היה להפעיל את ההתחברות',
    connectSaving: 'שומר...',
    connectSaveError: 'שגיאה: {error}',
    connectSaveErrorGeneric: 'נכשל',
    connectSaveFailed: 'השמירה נכשלה',
    connected: 'מחובר',
    connectApiKeyHint: 'נשמר מקומית (0600), לא יוצג שוב.',
    connectOauthTokenLabel: 'אסימון OAuth של המנוי',
    connectTokenPlaceholder: 'הדביקו אסימון',
    connectOauthTokenHint: 'יצירה באמצעות: claude setup-token',
    connectSubscriptionHint: 'התחברו פעם אחת בטרמינל: הריצו claude ואז /login.',
    connectDotTipUnavailable: 'מצב החיבור ל-Claude אינו זמין',
    connectHeadUnavailable: 'לא זמין',
    connectDotAria: 'חיבור Claude: {head}',
    connectCliVersion: 'claude {version}',
    cliVersionFound: 'נמצא',
    connectCliNotFound: 'claude CLI לא נמצא',
    connectHeadCliMissing: 'CLI חסר',
    connectHeadNotLoggedIn: 'לא בוצעה התחברות',
    connectHeadNoCredential: 'אין פרטי גישה',
    connectStatusLine: '{head} - {description} - {cli}',
    connectTestVerified: 'החיבור אומת',
    connectTestNotAuthenticated: 'לא מאומת',
    connectTestStatusLine: '{head} - {detail}',
    connectDotAriaVerified: 'חיבור Claude: אומת ומחובר',
    connectDotAriaNotAuthenticated: 'חיבור Claude: לא מאומת',
    ghCliNotFound: 'GitHub: gh CLI לא נמצא',
    ghInstallHint: 'אופציונלי — התקינו את GitHub CLI כדי לסנכרן פרויקטים: cli.github.com',
    ghNotLoggedIn: 'GitHub: gh {version}, לא בוצעה התחברות',
    ghLoginHint: 'התחברו בכפתור — נפתח טרמינל שמריץ gh auth login — או הריצו בעצמכם.',
    ghConnectedAs: 'GitHub: מחובר בתור {login}',
    ghLoginUnknown: 'לא ידוע',
    ghLogoutHint:
      'החליפו חשבון או התנתקו בכפתורים — כל אחד פותח טרמינל שמריץ gh auth — או הריצו בעצמכם.',
    ghLogin: 'התחברות ל-GitHub',
    ghSwitch: 'החלפת חשבון',
    ghLogout: 'התנתקות',
    ghLoginTip: 'פותח טרמינל שמריץ gh auth login — GitHub מציג שם קוד חד-פעמי; דבר לא נעשה בשמכם.',
    ghSwitchTip: 'פותח טרמינל שמריץ gh auth switch — בחרו חשבון אחר שכבר מחוברים אליו.',
    ghLogoutTip: 'פותח טרמינל שמריץ gh auth logout — האישור נעשה שם.',
    ghAuthLaunching: 'GitHub: פותח טרמינל…',
    ghLoginOpened:
      'GitHub: נפתח טרמינל שמריץ gh auth login — עקבו אחרי הקוד החד-פעמי שם; השורה הזו מתרעננת מעצמה.',
    ghSwitchOpened: 'GitHub: נפתח טרמינל שמריץ gh auth switch — בחרו שם את החשבון.',
    ghLogoutOpened: 'GitHub: נפתח טרמינל שמריץ gh auth logout — אשרו שם.',
    ghAuthLaunchFailed: 'GitHub: לא ניתן היה לפתוח טרמינל — הריצו את פקודת gh auth בעצמכם.',
    ltsTipUpToDate: 'מריץ את ה-GitHub Release האחרון — אין צורך בעדכון.',
    ltsTipUpdateAvailable:
      'GitHub Release חדש יותר זמין במעלה הזרם. לוח הבקרה הזה לעולם לא מעדכן את עצמו — משכו ובנו מחדש כשתהיו מוכנים.',
    ltsTipAhead:
      'מריץ גרסה שמקדימה את ה-GitHub Release האחרון במעלה הזרם (למשל בנייה שטרם שוחררה).',
    ltsTipUnknown:
      'עדיין לא בוצעה בדיקה מוצלחת — לחצו על "בדוק עדכונים" כדי להשוות ל-GitHub Release האחרון.',
    ghIssueConfirm:
      'לפתוח issue ב-GitHub בשם "{title}" מול מאגר ה-AUTOPILOT במקור?\n\nפעולה זו מריצה `gh issue create` אמיתי באמצעות ה-gh המאומת שלכם. לא ניתן לבטל פעולה זו מלוח הבקרה.',
    ghIssueOpened: 'ה-issue נפתח.',
    ghIssueOpenFailed: 'פתיחת ה-issue נכשלה.',
    reportFromHere: 'דיווח מכאן',
    reportFromHereTitle: 'דיווח מכאן',
    reportCopyTextLabel: 'העתק טקסט',
    reportCopyTextTip: 'מעתיק את הבחירה הנוכחית, או את מלוא הטקסט של האלמנט הזה.',
    reportCopyHtmlLabel: '🧩 העתק HTML של האלמנט',
    reportCopyHtmlTip: 'מעתיק את ה-outerHTML של האלמנט הזה.',
    reportCopySelectorLabel: 'העתק בורר CSS',
    reportCopySelectorTip: 'מעתיק נתיב בורר מוענק לאלמנט הזה.',
    reportCopyStylesLabel: 'העתק סגנונות מחושבים',
    reportCopyStylesTip: 'מעתיק את ה-CSS המחושב של האלמנט הזה כבלוק סגנון מוכן.',
    reportCopyContextLabel: '🧠 העתק הקשר חכם (JSON)',
    reportCopyContextTip:
      'מעתיק בורר, גיאומטריה, מאפייני נתונים, ומודולי המקור הבעלים של האזור הזה — כל מה שדוח באג או AI צריכים.',
    reportCopied: '✓ הועתק',
    reportCopyFailed: '✗ ההעתקה נכשלה',
    reportDialogCloseTip: 'סוגר את הדו-שיח הזה בלי להגיש דבר.',
    reportDescLabel: 'מה שגוי או חסר כאן?',
    reportDescTip: 'המילים שלכם הופכות לכותרת; ההקשר שנלכד למעלה תמיד נשלח יחד איתן.',
    reportActionPrompt: 'לחיצה אחת מגישה…',
    reportComposeAi: 'חבר עם AI',
    reportComposeAiTip:
      'הופך את ההערה שלכם לתיאור מלוטש ולפעולה מוצעת באמצעות קריאה למודל מקומי, מבוסס על הלכידה שלמעלה — המילים שלכם אף פעם לא עוזבות את המחשב הזה.',
    reportComposeAiReady: 'חובר — פעולה מוצעת: {action}. בדקו למטה, ואז לחצו על תצוגה מקדימה.',
    reportPreview: 'תצוגה מקדימה',
    reportPreviewTip: 'פותר את הלכידה הזו לתוכנית המדויקת — מה מוגש ולאן — בלי להחיל דבר.',
    reportPreviewUnavailable: 'התצוגה המקדימה אינה זמינה — נסו שוב בעוד רגע.',
    reportNothingToFile: 'אין מה להגיש — {reasoning}',
    reportNeedsRegion: 'דיווח צריך את האזור שממנו נוצר — לא נלכד אזור.',
    reportNeedsDescription:
      'דיווח מ-"{regionId}" צריך תיאור — עדיין אין מה להגיש, למשימה או להצעה.',
    reportNeedsProject:
      'דיווח מסוג "{action}" הופך למשימת לוח, ומשימה צריכה פרויקט. פתחו עמוד פרויקט ודווחו משם, או בחרו כאן "issue" או "pool offer".',
    composeNeedsDescription: 'דיווח צריך הערה שממנה מנסחים.',
    composeModelUnavailable: 'המודל אינו זמין כרגע (מכסה או חיבור) — נסו שוב בעוד רגע.',
    composeUnusable: 'המודל החזיר ניסוח לא שמיש — נסו לנסח את ההערה מחדש.',
    composeLeak:
      'הדיווח המנוסח נראה כמכיל סוד, אישור גישה או נתיב קובץ אישי — נסחו מחדש בלי אישורי גישה, טוקנים או נתיבים מקומיים.',
    reportActionNeedsProject: 'דורש עמוד פרויקט',
    reportExecute: 'בצע',
    reportExecuting: 'מבצע…',
    reportRequestFailed: '✗ הבקשה נכשלה — נסו שוב בעוד רגע.',
    reportConfirmExecute: 'לבצע את הדיווח הזה?',
    reportConfirmEffectTask:
      'פעולה זו יוצרת משימת לוח בתור — המזהה שלה מבוסס-תוכן, כך שניסיון חוזר על אותה לכידה לעולם לא ייצור עותק שני.',
    reportConfirmEffectIssue:
      'פעולה זו מגישה issue אמיתי ב-GitHub דרך gh — לוח הבקרה אינו יכול לבטל זאת; סִגרו אותו ב-GitHub אם זו הייתה טעות.',
    reportConfirmSuffix:
      'התוכנית נגזרת מחדש מהלכידה בזמן הביצוע — היא לא תסמוך באופן עיוור על מה שמוצג כאן.',
    landingTitle: 'נחיתה',
    landingChecking: 'בודק אם יש עבודה שלא מוזגה…',
    landingUnavailable: 'תצוגה מקדימה של הנחיתה אינה זמינה.',
    landingNothingToLand: 'אין מה להנחית — הענף כבר מיושר עם הבסיס.',
    landingExecuteButton: 'בצע נחיתה אל {base}',
    landingRestarting: 'נחת — בונה ומפעיל מחדש את לוח הבקרה… הדף הזה יתחבר מחדש אוטומטית.',
    landingDebriefTitle: 'תחקיר טיסה',
    landingDebriefBestLabel: 'הטובה ביותר: ',
    landingDebriefWorstLabel: 'הגרועה ביותר: ',
    landingBranchTip: 'הענף הפעיל כרגע',
    landingBranchAria: 'ענף: {name}',
    landingBranchArrowTip: 'כיוון המיזוג: מהענף אל הבסיס',
    landingBranchArrowAria: 'מתמזג אל',
    landingBaseTip: 'הענף שאליו זה ימוזג',
    landingBaseAria: 'ענף הבסיס: {name}',
    landingCommitShaTip: 'גיבוב קומיט מקוצר',
    landingCommitShaAria: 'קומיט {name}',
    landingCommitSubjectTip: 'מה הקומיט הזה שינה',
    landingCommitFilesAria: '{n} קבצים שונו',
    landingDebriefBestTip: 'ההפעלה ששוגרה בעלות היעילה ביותר בטיסה הזו',
    landingDebriefBestAria: 'ההפעלה הטובה ביותר: {name}',
    landingDebriefWorstTip: 'ההפעלה היקרה ביותר שלא שוגרה בטיסה הזו',
    landingDebriefWorstAria: 'ההפעלה הגרועה ביותר: {name}',
    flightDebriefShippedCount: '{count} שוגרו',
    flightDebriefShippedTip: 'הפעלות שעברו את השער ונחתו כקומיט אמיתי',
    flightDebriefDeathCount: '{count} נכשלו',
    flightDebriefDeathTip:
      'הפעלות שבוטלו, חרגו ממכסת התורות, נתקלו בפסק זמן, או נכשלו בשגיאה בלי לבצע קומיט',
    flightDebriefTotalSpendTip: 'סך ההוצאה לאורך הטיסה הזו',
    flightDebriefTotalSpendAria: 'סך הוצאה: {amount}',
    flightDebriefTotalDurationTip: 'סך זמן הריצה לאורך הטיסה הזו',
    flightDebriefTotalDurationAria: 'סך משך זמן: {amount}',
    flightDebriefGuardDenialSingular: '{count} חסימת שמירה',
    flightDebriefGuardDenialPlural: '{count} חסימות שמירה',
    flightDebriefGuardDenialTip: 'פגיעות הכלה/היגיינת קריאה מסוג PreToolUse בטיסה הזו',
    flightDebriefRemediationSingular: '{count} תיקון אוטומטי',
    flightDebriefRemediationPlural: '{count} תיקונים אוטומטיים',
    flightDebriefRemediationTip: 'תיקוני RemediatingGate מכניים בטיסה הזו',
    projectNotFound: 'הפרויקט לא נמצא',
    projectNotFoundBody: 'ייתכן שהוא הוסר מלוח הבקרה. חזרו לצי.',
    consoleEmpty: 'עדיין אין פלט מסוף.',
    consoleCollapsed: 'מכווץ — הרחיבו כדי לטעון.',
    consoleUnavailable: 'מסוף הטיסה אינו זמין.',
    consoleTitle: 'מסוף טיסה',
    consoleTitleTip: 'זנב stdout+stderr גולמי של תהליך הטיסה עבור הפרויקט הזה',
    consoleLinesAriaSingular: '{n} שורה של פלט גולמי של תהליך הטיסה',
    consoleLinesAriaPlural: '{n} שורות של פלט גולמי של תהליך הטיסה',
    issueTriageTitle: 'טריאז׳ issues של KEEPER',
    issueTriageLoading: 'בודק issues פתוחים מול הלוח…',
    issueTriageEmpty: 'אין issues פתוחים לטריאז׳.',
    issueTriageUnavailable: 'טריאז׳ ה-issues אינו זמין.',
    issueTriageExecute: 'בצע טריאז׳ KEEPER',
    issueTriageExecuting: 'מבצע טריאז׳…',
    issueTriageRequestFailed: '✗ הבקשה נכשלה — נסו שוב בעוד רגע.',
    issueTriageCommentsPosted: 'תגובות פורסמו:',
    mirrorPassTitle: 'מעבר שיקוף',
    mirrorPassLoading: 'בודק את הלוח מול GitHub…',
    mirrorPassEmpty: 'הלוח וGitHub תואמים — אין מה לתאם.',
    mirrorPassUnavailable: 'מעבר השיקוף אינו זמין.',
    mirrorPassRepoMismatch:
      'לא הושווה — הפרויקט הזה הוא עותק של {projectRepo}, אבל gh פועל על {ghRepo}.',
    mirrorPassExecute: 'הרץ מעבר שיקוף',
    mirrorPassExecuteTip:
      'מחיל כל ממצא תיאום שלמעלה — סוגר או פותח מחדש issues ומפרסם תגובות דרך gh.',
    mirrorPassExecuteConfirm:
      'להריץ את מעבר השיקוף עכשיו? זה סוגר או פותח מחדש issues ומפרסם תגובות ב-GitHub עבור כל ממצא תיאום שלמעלה.',
    mirrorPassExecuting: 'מריץ…',
    mirrorPassRequestFailed: 'בקשת מעבר השיקוף נכשלה.',
    mirrorPassDriftExecute: 'תקן סטיית תיעוד',
    mirrorPassDriftExecuteTip:
      'פותח issue חדש ב-GitHub עבור כל ממצא סטיית תיעוד שלמעלה, ומדלג על כל ממצא שכבר יש לו issue פתוח.',
    mirrorPassDriftExecuteConfirm:
      'לפתוח issues ב-GitHub עבור סטיית התיעוד שלמעלה עכשיו? זה פותח issue חדש דרך gh עבור כל ממצא שאינו במעקב עדיין.',
    mirrorPassDriftExecuting: 'פותח…',
    mirrorPassDriftRequestFailed: 'בקשת תיקון סטיית התיעוד נכשלה.',
    discussionsTriageTitle: 'טריאז׳ Discussions של KEEPER',
    discussionsTriageLoading: 'בודק דיונים פתוחים מול הלוח…',
    discussionsTriageEmpty: 'אין דיונים פתוחים לטריאז׳.',
    discussionsTriageUnavailable: 'טריאז׳ הדיונים אינו זמין.',
    discussionsTriageExecute: 'הרץ טריאז׳ Discussions של KEEPER',
    discussionsTriageExecuteTip:
      'מפרסם תגובה חתומה ומחיל את תווית ה-pool על כל דיון שאושר למעלה דרך gh.',
    discussionsTriageExecuting: 'מריץ…',
    discussionsTriageRequestFailed: 'בקשת טריאז׳ הדיונים נכשלה.',
    mirrorPassLandingNoteExecute: 'פרסם הערות נחיתה',
    mirrorPassLandingNoteExecuteTip: 'מפרסם תגובת הערת-נחיתה על כל issue סגור שלמעלה שחסרה לו אחת.',
    mirrorPassLandingNoteExecuteConfirm:
      'לפרסם את הערות הנחיתה שלמעלה עכשיו? זה מפרסם תגובה ב-GitHub עבור כל issue סגור שחסרה לו אחת.',
    mirrorPassLandingNoteExecuting: 'מפרסם…',
    mirrorPassLandingNoteRequestFailed: 'בקשת הערת הנחיתה של מעבר השיקוף נכשלה.',
    mirrorPassStaleClaimExecute: 'שחרר תביעות ישנות',
    mirrorPassStaleClaimExecuteTip:
      'מבטל שיוך לכל issue תבוע ב-pool שלמעלה שהאחראי עליו שקט מעבר לסף הקצירה.',
    mirrorPassStaleClaimExecuteConfirm:
      'לשחרר את התביעות הישנות שלמעלה עכשיו? זה מבטל שיוך לכל issue תבוע שהאחראי עליו שקט מעבר לסף הקצירה.',
    mirrorPassStaleClaimExecuting: 'משחרר…',
    mirrorPassStaleClaimRequestFailed: 'בקשת שחרור התביעות הישנות של מעבר השיקוף נכשלה.',
    mirrorPassPriorityFollowExecute: 'עקוב אחרי תוויות עדיפות מ-GitHub',
    mirrorPassPriorityFollowExecuteTip:
      'מנעץ כל משימה שלמעלה לרמת העדיפות שתווית ה-GitHub שקבע האחראי כבר נושאת.',
    mirrorPassPriorityFollowExecuteConfirm:
      'לעקוב אחרי תוויות העדיפות שלמעלה עכשיו? זה מנעץ כל משימה רשומה לרמת העדיפות שתווית ה-issue שלה כבר נושאת.',
    mirrorPassPriorityFollowExecuting: 'מנעץ…',
    mirrorPassPriorityFollowRequestFailed: 'בקשת מעקב-העדיפות של מעבר השיקוף נכשלה.',
    doraTitle: 'בריאות התהליך (DORA)',
    gateParallelTitle: 'חיסכון משער מקבילי',
    warmSessionsTitle: 'מפגשים חמים',
    evolutionTrendTitle: 'אבולוציה — האם הסוכן משתפר?',
    evolutionSummaryTitle: 'סיכום אישורים',
    foundation: 'קרן',
    foundationTip: 'תמכו ב-AUTOPILOT — כתובות תרומה מאומתות',
    foundationCopyAddress: 'העתק כתובת',
    foundationCopied: 'הועתק!',
    foundationQrAlt: 'קוד QR לכתובת {name}',
    officeSubagent: 'תת-סוכן — {name}',
    officeMapAria: 'מפת משרד הסוכן — כרגע {name}',
    flightMapAria: 'קבצים בטיסה',
    issueTriageGuestNote:
      'טריאז׳ ה-issues במאגר זה מנוהל על ידי המתחזק שלו ({owner}) — אתם מחוברים בתור {login}.',
    prReviewGuestNote:
      'פעולות סקירת ה-PR במאגר זה מתבצעות על ידי המתחזק שלו ({owner}) — אתם מחוברים בתור {login}.',
    releaseGuestNote:
      'מהדורות במאגר זה מוצאות על ידי המתחזק שלו ({owner}) — אתם מחוברים בתור {login}.',

    obTitle: 'איך מתחילים',
    obTip: 'הטיסה הראשונה שלכם, צעד קטן בכל פעם',
    obProgress: '{done} מתוך {total} שלבים הושלמו',
    obStepDone: 'הושלם',
    obStepCurrent: 'זה הצעד הבא',
    obLevel1: 'לטוס על משהו',
    obLevel2: 'לתרום בחזרה',
    obLevel2Intro: 'רשות, ואין שום לחץ — זה ימתין לכם כמה שתרצו.',
    obBadgePilot: 'טייס',
    obBadgeContributor: 'תורם',
    obBadgeEarned: 'הושג',
    obBadgeLocked: 'עדיין לא הושג',
    obAddSample: 'הוסיפו את דוגמת המחשבון',
    obAddSampleBody:
      'מעתיק פרויקט אמיתי וקטן לתיקייה משלכם, כדי שיהיה על מה לטוס לפני שתסכנו משהו שחשוב לכם.',
    obAddSampleAction: 'הוסף',
    obLockOn: 'נעלו על התיקייה',
    obLockOnBody:
      'כוונו את סרגל הטיסה לתיקייה שתרצו שיעבדו עליה. הוספת הדוגמה ממלאת את זה בשבילכם.',
    obLockOnAction: 'נעילה',
    obFire: 'לחצו שגר',
    obFireBody:
      'הפעלה אחת: הסוכן מתמצא, מבצע משימה אחת, מריץ את הבדיקות שלכם, ומבצע commit רק אם הן עברו.',
    obReadBack: 'קראו מה חזר',
    obReadBackBody:
      'כל הפעלה מתעדת כמה היא עלתה, מה היא שינתה ואיך השער פסק. התיעוד הזה הוא המוצר.',
    obReadBackAction: 'פתחו את התיעוד',
    obConnectGithub: 'התחברו ל-GitHub',
    obConnectGithubBody: 'מחבר את ה-CLI של GitHub במחשב הזה, כדי שממצא או תיקון יוכלו לצאת מהמחשב.',
    obConnectGithubAction: 'התחברות',
    obPublishFinding: 'פרסמו ממצא',
    obPublishFindingBody: 'דיווח מכאן הופך את מה שעל המסך שלכם ל-issue שמישהו אחר יכול לפעול לפיו.',
    obPublishFindingAction: 'דיווח מכאן',
    obSubmitFix: 'הגישו תיקון',
    obSubmitFixBody: 'תבעו משימה פתוחה, תנו לטיסה לעשות את העבודה, ופתחו pull request מהענף שלה.',
    obSubmitFixAction: 'פתחו את הבריכה',
    obSnooze: 'הזכירו לי אחר כך',
    obSnoozeDone: 'הוסתר — זה יחזור ביום הבא שתפתחו את לוח המחוונים.',
    obComplete: 'שני הווים הושגו. תודה — תורמים הם הסיבה שזה משתפר.',
    obSocialLocked: 'טוסו הפעלה אחת כדי לפתוח את הבריכה, הדיונים ולוח הדירוג.',
    tourLockOnTitle: 'נעלו על תיקייה',
    tourLockOnBody:
      'כוונו את AUTOPILOT למאגר git. כל מה שהוא עושה קורה בתוך התיקייה הזו, בענף משלו — הוא אף פעם לא דוחף ולא ממזג מיוזמתו.',
    tourLuckyTitle: 'תנו לו לקבוע את גודל הטיסה',
    tourLuckyBody:
      'התלתן מודד את המחשב הזה — ליבות פנויות, זיכרון פנוי, ואפילו אם הדיסק מכני או פלאש — וממלא כמה נתיבים והפעלות הוא יכול לשאת בלי להקפיא לכם את העבודה.',
    tourFireTitle: 'שגר',
    tourFireBody:
      'הפעלה אחת: הסוכן מתמצא, מבצע משימה אחת, מריץ את השער של הפרויקט שלכם — בדיקת טיפוסים, לינט, טסטים, בנייה — ומבצע commit רק אם הוא עבר. אדום פירושו שהשינוי מוחזר לאחור, לעולם לא נשלח שבור. טיסה היא הרבה הפעלות, מוגבלת בתקציב שקבעתם.',
    tourLadderTitle: 'ההתקדמות שלכם',
    tourLadderBody:
      'הצ׳ק-ליסט עוקב אחרי מה שעשיתם ומה זה הקנה. שני ווים: אחד על טיסה, אחד על תרומה בחזרה. הוא מסתלק כשתבקשו, ולתמיד ברגע ששניהם הושגו.',
    tourFleetTitle: 'הצי',
    tourFleetBody:
      'כרטיס אחד לכל פרויקט: כמה הוא עלה, מה נשלח, איך השער פסק, ואיזה commit נמצא על HEAD. הפעלה שמקדמת משימה בלי לסיים אותה היא פרוסה — המשימה נשארת פתוחה וההפעלה הבאה ממשיכה אותה.',
    tourSearchTitle: 'חיפוש בקוד',
    tourSearchBody:
      'מצאו קוד תואם בכל הפרויקט — או שאלו את אותה תיבה שאלה וקבלו תשובה שנבנתה מהקוד המאונדקס, עם הפניות.',
    tourAskTitle: 'שאלו על העמוד הזה',
    tourAskBody:
      'שאלו על כל מה שנמצא על המסך. כברירת מחדל הוא עונה לקריאה בלבד, ויכול להסלים למפגש סוכן אמיתי כשהתשובה דורשת ללכת ולחפש.',
    tourConnectTitle: 'חיבורים',
    tourConnectBody:
      'Claude הוא מה שמטיס את העבודה. GitHub הוא איך שממצא או תיקון יוצאים מהמחשב הזה — שניהם יושבים מאחורי הפקד הזה.',
    tourReportTitle: 'דיווח מכאן',
    tourReportBody:
      'הפכו את מה שעל המסך ל-issue, עם צילום העמוד לצידו. זו הדרך המהירה ביותר להגיד לנו שמשהו לא תקין — ותמיד תראו את הטיוטה לפני שמשהו מוגש.',
    tourStepCount: 'שלב {step} מתוך {total}',
    tourToLadder: 'התחילו את הצ׳ק-ליסט',
    tourToLadderTip: 'סוגר את הסיור ולוקח אתכם לדבר הראשון שצריך לעשות',
    obTourLink: 'מה המילים האלה אומרות?',
    progressBtn: 'ההתקדמות שלי',
    progressBtnTip: 'סולם ההתחלה, התגים והדירוג שלכם — בכל עת, גם אחרי השהיה או סיום',
    obMinimize: 'מזערו את רשימת הצעדים',
    obExpand: 'הציגו את רשימת הצעדים',
    obMinimizeTip: 'הדירוג שלכם נשאר למעלה; ההתקדמות שלי, או הכפתור הזה, מחזירים את הצעדים',
    obStripDone: 'כל {total} הצעדים הושלמו',
    obSocialOn: 'GitHub מחובר — החלק החברתי פתוח',
    obSocialOff: 'לצאת לחברתי: חברו GitHub',
    obTourLinkTip: 'פותח את הסיור הקצר: הפעלה, פרוסה, שער, טיסה',
    obBadgesAria: 'תגים שהושגו',
    obWatermark: 'נבנה עם AUTOPILOT',
  },
};

/** Looks up `key` in `locale`'s table, falling back to `DEFAULT_LOCALE`
 *  (English) for an unknown locale — mirrors `localeDir()`'s fallback. */
export function translate(locale: string, key: StringKey): string {
  const table = STRINGS[locale as LocaleName] ?? STRINGS[DEFAULT_LOCALE];
  return table[key];
}
