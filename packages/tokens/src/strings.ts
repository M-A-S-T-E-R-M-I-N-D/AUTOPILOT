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
 * `tasks` for the normal case and `tasksFocusMode` for the "🎯 FOCUS MODE"
 * variant — `tasksSection()` picks the key matching `anyFocus` the same way
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
 * Its persistent controls (Fly it/Pause/Stop, the four form inputs, the
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
  claudeAuthLabel: 'Claude authentication',
  authModeSubscription: 'Subscription (default)',
  authModeApiKey: 'API key',
  authModeOauthToken: 'Subscription token (headless)',
  credentialLabel: 'Credential',
  saveVerify: 'Save & verify',
  themeNav: 'Theme',
  languageNav: 'Language',
  themeMenuTip: 'Choose a color theme',
  langMenuTip: 'Choose a language',
  flyFolder: 'Fly a folder',
  browse: 'Browse…',
  byCount: 'by count',
  byTotal: 'by total $',
  firings: 'Firings',
  stopAtTotal: 'Stop at total $',
  perFiringBudget: '$ / firing',
  lanes: 'Lanes',
  flyIt: 'Fly it',
  flying: 'Flying…',
  queued: 'Queued…',
  resume: 'Resume',
  pause: 'Pause',
  stop: 'Stop',
  searchProject: 'Search a project',
  search: 'Search',
  searchQueryAria: 'Search query or question',
  deep: 'Deep',
  ask: 'Ask',
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
  askTip:
    'Ask the question instead of searching — an AI answer built from the indexed code streams in below.',
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
  updatedConnecting: 'connecting…',
  offlineRetrying: 'offline — retrying…',
  updateBannerAria: 'Software update available',
  updateBannerText: 'A new version is ready: v{from} → v{to}',
  updateNow: 'Update now',
  updateLater: 'Later',
  updateInProgress: 'Updating — pulling, installing, restarting… the dashboard reconnects itself',
  updateDirtyPrompt:
    'Local progress detected. Park it safely in git stash and update? ("git stash pop" restores it afterwards)',
  updateStashAndGo: 'Stash & update',
  updateRefused: 'Update refused: ',
  offlineRetryingTip: 'Lost the connection to the server — it will keep retrying automatically',
  removeCard: 'Remove',
  soulEditorSummary: '✎ view/edit SOUL',
  soulEditorLabel: "This project's live SOUL text — edit and propose a change",
  soulEditorSubmit: 'Propose edit',
  soulProposed: 'Proposed — review it above to ratify or dismiss.',
  soulProposeFailed: 'Could not propose the edit — try again.',
  soulProposalSummary: '◇ SOUL proposal pending — review',
  soulRatify: '✓ ratify',
  soulDismiss: '✗ dismiss',
  soulUnratify: '↺ un-ratify',
  startOver: '↺ Start over',
  prReviewTitle: '🗝️ KEEPER PR review',
  prReviewApply: 'Apply',
  prReviewFetchFailed:
    '⚠ The open-PR list could not be read from gh — an outage, not a confirmed-empty queue; the next poll retries.',
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
  coordinationTitle: '🤝 Fleet coordination',
  coordinationLoading: 'Checking for sibling claims and in-flight intents…',
  coordinationEmpty: 'No sibling claims or in-flight intents detected right now.',
  coordinationUnavailable: 'Fleet coordination unavailable.',
  // web/features/docs-viewer.ts (board web-msnsndki-dz3vn1): the project
  // page's Docs reader panel — title, and the empty/fetch-failure states.
  docsTitle: '📚 Docs',
  docsEmpty: 'No indexed documents yet.',
  docsUnavailable: 'Docs unavailable.',
  // web/features/round-panel.ts (board web-msnsndki-dz3vn1): the CURRENT
  // ROUND panel's own literal text — title, loading/unavailable states, and
  // the "no release tags yet" fallback.
  roundTitle: '🔄 This round',
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
  inboxSummary: '📝 Drop a note',
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
  // The same trace row's own hover tips on its composed count ("3 actions")
  // and started-ago ("2m ago") fields — the labels are
  // firingTimelineRowMeta()'s composed strings and stay as-is, only their
  // tips carry a key — plus the "🔧 auto-fixed" chip a formatting-rescued
  // firing carries: text, full tip, and screen-reader aria-label. The flight
  // log's rows (shell.ts's flightLogSection()) build the SAME chip from the
  // same three literals, so one set of keys tags both surfaces.
  firingCountTip: 'Tool calls and activity recorded for this firing',
  firingStartedTip: 'When this firing started',
  autoFixed: '🔧 auto-fixed',
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
  flightGuardChip: '🛡️ {n} blocked',
  flightGuardChipTip:
    'The containment/read-hygiene guard denied {n} tool call(s) during this firing — it tried to step outside its boundary and was stopped.',
  flightGuardChipAria: 'guard blocked {n} tool call(s) this firing (containment / read-hygiene)',
  tasks: 'Tasks',
  tasksFocusMode: 'Tasks — 🎯 FOCUS MODE',
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
  liveFocusTask: '🎯 working: {name}',
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
  githubPrSummary: '🔀 Contribute upstream',
  githubPrLabel: "Contribute {name}'s current branch upstream as a pull request",
  githubSyncing: 'Syncing…',
  githubPrOpening: 'opening…',
  githubRequestFailed: '✗ Request failed — try again shortly.',
  // web/card-actions.ts's githubSyncExecuteResult/githubPrExecuteResult
  // fallback text — used only when the server response carries no
  // details/error of its own.
  githubSyncResultOk: 'synced.',
  githubSyncResultFail: 'sync failed.',
  githubPrResultOk: 'pull request opened.',
  githubPrResultFail: 'failed to open pull request.',
  poolClientPanel: 'Contributor pool',
  publicityPanel: 'Publicity',
  pipelineView: 'Pipeline view',
  pipelineViewTitle: '🛠️ Pipeline view',
  pipelineLensLabel: 'Pipeline lens',
  pipelineLensFleet: 'Fleet',
  pipelineLensFiles: 'Files',
  pipelineModeLabel: 'Pipeline node grouping',
  pipelineModeGrouped: 'Grouped',
  pipelineModeFlat: 'Flat',
  pipelineLayoutLabel: 'Pipeline canvas layout',
  pipelineLayoutLayered: 'Layered',
  pipelineLayoutCompact: 'Compact',
  pipelineLoading: 'Loading pipeline spans…',
  pipelineUnavailable: 'Pipeline view unavailable.',
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
  poolTitle: '🧑‍🤝‍🧑 Pool',
  // web/features/pool-client.ts's per-entry text (board web-msnsndki-dz3vn1):
  // rebuilt fresh on every 30s poll or click, so tr() at build time is the
  // sweep, the same reasoning report-menu.ts's keys followed.
  poolNoLocalTask: 'No local task',
  poolProjectSelectAria: 'Local project to queue a board task on (optional)',
  poolProjectSelectTip:
    'Also queue a local board task on this project when claiming — leave unset to only claim on GitHub.',
  poolClaim: 'Claim',
  poolClaiming: 'Claiming…',
  poolFly: 'Fly',
  poolStarting: 'Starting…',
  poolRequestFailed: '✗ Request failed — try again shortly.',
  backlogTitle: '🔍 Detected backlog',
  backlogChecking: 'Checking recent commits against the open board…',
  backlogEmpty:
    'No unconfirmed matches — every open task is either done or not yet echoed by a commit.',
  backlogConfirmDone: '✓ confirm done',
  backlogUnavailable: 'Detected backlog unavailable.',
  releaseTitle: '🚀 Next release',
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
    'Probes this machine (CPU, RAM, cores) and the board, then fills Lanes/Firings/$ with a launch sized to what the computer can carry right now. Filling only — Fly it stays your click.',
  luckyNoAnswer: 'Lucky roll failed — no answer from the server.',
  luckyDashboardDown: 'Lucky roll failed — is the dashboard up?',
  luckyNotNow: '🍀 Not now: {reason}',
  luckyNoPlan: 'no plan',
  luckyPlanReady: 'plan ready',
  luckyPressFlyIt: '🍀 {reason} — press Fly it to launch.',
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
  ghLoginHint: 'Log in yourself in a terminal: gh auth login',
  ghConnectedAs: 'GitHub: connected as {login}',
  ghLoginUnknown: 'unknown',
  ghLogoutHint: 'Disconnect any time in a terminal: gh auth logout',
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
  // web/features/report-menu.ts — the right-click "🚩 Report from here"
  // menu + dialog, built fresh on every open so tr() at build time is the
  // sweep. reportFromHereTitle carries the 🚩 glyph literally (the menu item
  // and the dialog <h2> share it; the menu's aria-label is the plain
  // reportFromHere). reportNothingToFile's {reasoning} is the server's own
  // plan reasoning, slotted in as sent; reportRequestFailed keeps its ✗ mark
  // literal like ghIssueRequestFailed's. The spliced report-panel.ts helpers
  // (action labels, execute tip/result) stay English until they take an
  // injected tr; reportConfirmMessage is the first of those four to move —
  // reportConfirmExecute/reportConfirmEffectTask/reportConfirmEffectIssue/
  // reportConfirmSuffix are its four clauses, same base/effect/suffix shape
  // releaseConfirmMessage's keys use. plan.summary itself (server-composed)
  // stays untranslated, the same server-message stance every prior slice took.
  reportFromHere: 'Report from here',
  reportFromHereTitle: '🚩 Report from here',
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
  // panel's persistent ON-SCREEN text moves this slice — the per-commit
  // `data-tip`/`aria-label` hover text (sha, subject, files-changed, branch
  // arrow, best/worst firing) stays English, same as the per-project fleet
  // card hover text this table already leaves untranslated.
  landingTitle: '🛬 Landing',
  landingChecking: 'Checking for unmerged work…',
  landingUnavailable: 'Landing preview unavailable.',
  landingNothingToLand: 'Nothing to land — the branch is level with its base.',
  landingExecuteButton: '🛬 Execute landing → {base}',
  landingRestarting:
    '🔄 Landed — rebuilding & restarting the dashboard… this page reconnects automatically.',
  landingDebriefTitle: '📋 Flight debrief',
  landingDebriefBestLabel: '🏆 Best: ',
  landingDebriefWorstLabel: '💀 Worst: ',
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
  // web/features/issue-triage.ts (board web-msnsndki-dz3vn1): the project
  // page's KEEPER issue-triage panel — title, loading placeholder, and the
  // empty/fetch-failure states. "KEEPER" is the persona's proper name and
  // stays Latin in every locale, the way "AUTOPILOT" and "GitHub" do above.
  issueTriageTitle: '🗝️ KEEPER issue triage',
  issueTriageLoading: 'Checking open issues against the board…',
  issueTriageEmpty: 'No open issues to triage.',
  issueTriageUnavailable: 'Issue triage unavailable.',
  // web/features/foundation.ts's masthead heart + Foundation panel (FOUNDATION
  // 1/3, board web-mtq0rsit-ywz1m7) — hidden until GET /api/donations reports
  // a real, verified entry (see docs/FOUNDATION.md's "never before" custody
  // promise), so these strings sit dormant in most installs today.
  foundation: 'Foundation',
  foundationTip: 'Support AUTOPILOT — verified donation addresses',
  foundationCopyAddress: 'Copy address',
  foundationCopied: 'Copied!',
  foundationQrAlt: 'QR code for the {name} address',
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
    claudeAuthLabel: 'אימות Claude',
    authModeSubscription: 'מנוי (ברירת מחדל)',
    authModeApiKey: 'מפתח API',
    authModeOauthToken: 'אסימון מנוי (ללא ממשק)',
    credentialLabel: 'פרטי גישה',
    saveVerify: 'שמור ואמת',
    themeNav: 'ערכת נושא',
    languageNav: 'שפה',
    themeMenuTip: 'בחר ערכת נושא',
    langMenuTip: 'בחר שפה',
    flyFolder: 'טוס על תיקייה',
    browse: 'עיון…',
    byCount: 'לפי כמות',
    byTotal: 'לפי סכום כולל',
    firings: 'הפעלות',
    stopAtTotal: 'עצור בסכום כולל של $',
    perFiringBudget: '$ / הפעלה',
    lanes: 'נתיבים',
    flyIt: 'טוס!',
    flying: 'בטיסה…',
    queued: 'בתור…',
    resume: 'המשך',
    pause: 'השהה',
    stop: 'עצור',
    searchProject: 'חיפוש בפרויקט',
    search: 'חיפוש',
    searchQueryAria: 'שאילתת חיפוש או שאלה',
    deep: 'מעמיק',
    ask: 'שאל',
    askPersona: 'פרסונת שאלה',
    personaGenius: 'GENIUS',
    personaArchitect: 'ARCHITECT',
    searchTip: 'מציאת קוד תואם בפרויקט שנבחר — התוצאות מציגות את הקובץ, השורה והקטע שסביבה.',
    askDeepTip:
      'הסלמה לסשן סוכני לקריאה בלבד (Read/Grep/Glob, עד 10 תורות) שיוצא לחפש את התשובה במקום להסתמך על הקטעים המאונדקסים',
    askTip: 'שאלו את השאלה במקום לחפש — תשובת AI שנבנית מהקוד המאונדקס מוזרמת למטה.',
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
    updatedConnecting: 'מתחבר…',
    offlineRetrying: 'לא מקוון — מנסה שוב…',
    updateBannerAria: 'עדכון תוכנה זמין',
    updateBannerText: 'גרסה חדשה מוכנה: v{from} ← v{to}',
    updateNow: 'עדכן עכשיו',
    updateLater: 'אחר-כך',
    updateInProgress: 'מעדכן — מושך, מתקין, מאתחל… הדשבורד יתחבר מחדש לבד',
    updateDirtyPrompt:
      'זוהתה התקדמות מקומית לא-שמורה. לשמור אותה בצד (git stash) ולעדכן? ‏"git stash pop" מחזיר אותה אחר-כך',
    updateStashAndGo: 'שמור בצד ועדכן',
    updateRefused: 'העדכון סורב: ',
    offlineRetryingTip: 'החיבור לשרת אבד — הניסיון החוזר יתבצע אוטומטית',
    removeCard: 'הסר',
    soulEditorSummary: '✎ צפייה/עריכת SOUL',
    soulEditorLabel: 'טקסט ה-SOUL החי של הפרויקט — ערכו והציעו שינוי',
    soulEditorSubmit: 'הצע עריכה',
    soulProposed: 'ההצעה נשלחה — סקרו אותה למעלה כדי לאשר או לדחות.',
    soulProposeFailed: 'לא ניתן היה להציע את העריכה — נסו שוב.',
    soulProposalSummary: '◇ הצעת SOUL ממתינה — יש לסקור',
    soulRatify: '✓ אשרר',
    soulDismiss: '✗ בטל',
    soulUnratify: '↺ בטל אשרור',
    startOver: '↺ התחל מחדש',
    prReviewTitle: '🗝️ סקירת PR של KEEPER',
    prReviewApply: 'החל',
    prReviewFetchFailed:
      '⚠ לא ניתן היה לקרוא את רשימת ה-PR הפתוחים מ-gh — זו תקלה, לא תור ריק מאומת; התשאול הבא ינסה שוב.',
    prReviewMergeLabel: 'מיזוג',
    prReviewRequestChangesLabel: 'בקשת שינויים',
    prReviewQueueForHumanLabel: 'העברה לבדיקה אנושית',
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
    coordinationTitle: '🤝 תיאום הצי',
    coordinationLoading: 'בודק תביעות של מופעים אחים וכוונות בטיסה…',
    coordinationEmpty: 'לא זוהו כרגע תביעות של מופעים אחים או כוונות בטיסה.',
    coordinationUnavailable: 'תיאום הצי אינו זמין.',
    docsTitle: '📚 מסמכים',
    docsEmpty: 'עדיין אין מסמכים באינדקס.',
    docsUnavailable: 'המסמכים אינם זמינים.',
    roundTitle: '🔄 הסבב הזה',
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
    inboxSummary: '📝 הוסף הערה',
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
    firingCountTip: 'קריאות כלים ופעילות שנרשמו להפעלה הזו',
    firingStartedTip: 'מתי ההפעלה הזו התחילה',
    autoFixed: '🔧 תוקן אוטומטית',
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
    tasksFocusMode: 'משימות — 🎯 מצב מיקוד',
    taskNewLabel: 'משימה חדשה',
    taskNewPlaceholder: 'מה ה-AUTOPILOT הזה צריך לעשות?',
    taskAdd: 'הוסף',
    taskAddTip: 'מוסיף לתור משימת מפעיל חדשה שה-AUTOPILOT ייקח',
    cardFindingsTip: 'ממצאי סקירה פתוחים לפרויקט הזה — ראו את הפירוט למטה',
    cardActivityTip: 'מתי הייתה בפרויקט הזה פעילות כלשהי בפעם האחרונה',
    cardActivityAria: 'פעילות אחרונה: {name}',
    liveToolTip: 'קריאת הכלי האחרונה שההפעלה הזו ביצעה',
    liveToolAria: 'כלי: {name}',
    liveTargetTip: 'הקובץ, הפקודה או היעד שקריאת הכלי הזו נגעה בהם',
    liveTargetAria: 'יעד: {name}',
    liveElapsedTip: 'כמה זמן המסלול הזה פועל',
    liveLabel: 'חי — הפעלה בעיצומה',
    livePhaseAria: 'שלב נוכחי: {name}',
    liveNarratorTip: 'הסיכום של AUTOPILOT עצמו, במשפט אחד, לפעולה האחרונה שלו בהפעלה הזו',
    liveFocusTask: '🎯 עובדת על: {name}',
    liveFocusTaskTip: 'משימת הלוח שההפעלה הזו עובדת עליה במפורש',
    flightGuardChip: '🛡️ {n} נחסמו',
    flightGuardChipTip:
      'שומר ההכלה/היגיינת הקריאה דחה {n} קריאות כלים במהלך ההפעלה הזו — היא ניסתה לחרוג מהגבול שלה ונעצרה.',
    flightGuardChipAria: 'השומר חסם {n} קריאות כלים בהפעלה הזו (הכלה / היגיינת קריאה)',
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
    githubPrSummary: '🔀 תרום למאגר המקור',
    githubPrLabel: 'תרום את הענף הנוכחי של {name} למאגר המקור כ-pull request',
    githubSyncing: 'מסנכרן…',
    githubPrOpening: 'פותח…',
    githubRequestFailed: '✗ הבקשה נכשלה — נסו שוב בעוד רגע.',
    githubSyncResultOk: 'סונכרן.',
    githubSyncResultFail: 'הסנכרון נכשל.',
    githubPrResultOk: 'ה-pull request נפתח.',
    githubPrResultFail: 'פתיחת ה-pull request נכשלה.',
    poolClientPanel: 'מאגר תורמים',
    publicityPanel: 'פרסום',
    pipelineView: 'תצוגת צנרת',
    pipelineViewTitle: '🛠️ תצוגת צנרת',
    pipelineLensLabel: 'מסנן הצנרת',
    pipelineLensFleet: 'צי',
    pipelineLensFiles: 'קבצים',
    pipelineModeLabel: 'קיבוץ צמתי הצנרת',
    pipelineModeGrouped: 'מקובץ',
    pipelineModeFlat: 'שטוח',
    pipelineLayoutLabel: 'פריסת קנבס הצנרת',
    pipelineLayoutLayered: 'בשכבות',
    pipelineLayoutCompact: 'קומפקטי',
    pipelineLoading: 'טוען נתוני צנרת…',
    pipelineUnavailable: 'תצוגת הצנרת אינה זמינה.',
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
    poolTitle: '🧑‍🤝‍🧑 מאגר',
    poolNoLocalTask: 'ללא משימה מקומית',
    poolProjectSelectAria: 'פרויקט מקומי להוספת משימת לוח (אופציונלי)',
    poolProjectSelectTip:
      'מוסיף גם משימת לוח מקומית לפרויקט הזה בעת התביעה — השאירו ללא בחירה כדי לתבוע רק ב-GitHub.',
    poolClaim: 'תבע',
    poolClaiming: 'תובע…',
    poolFly: 'טוס',
    poolStarting: 'מתחיל…',
    poolRequestFailed: '✗ הבקשה נכשלה — נסו שוב בעוד רגע.',
    backlogTitle: '🔍 פיגור שזוהה',
    backlogChecking: 'בודק קומיטים אחרונים מול הלוח הפתוח…',
    backlogEmpty: 'אין התאמות לא מאושרות — כל משימה פתוחה כבר בוצעה או שטרם הודהדה בקומיט.',
    backlogConfirmDone: '✓ אשר בוצע',
    backlogUnavailable: 'הפיגור שזוהה אינו זמין.',
    releaseTitle: '🚀 המהדורה הבאה',
    releaseMaturityLabel: 'שלב המהדורה',
    releaseMaturityAutoTemplate: 'אוטומטי — זוהה: {phase}',
    releaseMaturityAlpha: 'אלפא',
    releaseMaturityBeta: 'בטא',
    releaseMaturityRc: 'מועמדת לשחרור',
    releaseMaturityStable: 'יציבה',
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
      'בודק את המחשב הזה (מעבד, זיכרון, ליבות) ואת הלוח, ואז ממלא נתיבים/הפעלות/$ בשיגור בגודל שהמחשב יכול לשאת כרגע. מילוי בלבד — "טוס!" נשאר הלחיצה שלכם.',
    luckyNoAnswer: 'הגרלת המזל נכשלה — אין תשובה מהשרת.',
    luckyDashboardDown: 'הגרלת המזל נכשלה — האם לוח הבקרה פועל?',
    luckyNotNow: '🍀 לא עכשיו: {reason}',
    luckyNoPlan: 'אין תוכנית',
    luckyPlanReady: 'התוכנית מוכנה',
    luckyPressFlyIt: '🍀 {reason} — לחצו על "טוס!" כדי לשגר.',
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
    ghLoginHint: 'התחברו בעצמכם בטרמינל: gh auth login',
    ghConnectedAs: 'GitHub: מחובר בתור {login}',
    ghLoginUnknown: 'לא ידוע',
    ghLogoutHint: 'ניתן להתנתק בכל עת בטרמינל: gh auth logout',
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
    reportFromHereTitle: '🚩 דיווח מכאן',
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
    landingTitle: '🛬 נחיתה',
    landingChecking: 'בודק אם יש עבודה שלא מוזגה…',
    landingUnavailable: 'תצוגה מקדימה של הנחיתה אינה זמינה.',
    landingNothingToLand: 'אין מה לנחות — הענף מעודכן עם הבסיס שלו.',
    landingExecuteButton: '🛬 בצע נחיתה אל {base}',
    landingRestarting: '🔄 נחת — בונה ומפעיל מחדש את לוח הבקרה… הדף הזה יתחבר מחדש אוטומטית.',
    landingDebriefTitle: '📋 תחקיר טיסה',
    landingDebriefBestLabel: '🏆 הטובה ביותר: ',
    landingDebriefWorstLabel: '💀 הגרועה ביותר: ',
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
    issueTriageTitle: '🗝️ טריאז׳ issues של KEEPER',
    issueTriageLoading: 'בודק issues פתוחים מול הלוח…',
    issueTriageEmpty: 'אין issues פתוחים לטריאז׳.',
    issueTriageUnavailable: 'טריאז׳ ה-issues אינו זמין.',
    foundation: 'קרן',
    foundationTip: 'תמכו ב-AUTOPILOT — כתובות תרומה מאומתות',
    foundationCopyAddress: 'העתק כתובת',
    foundationCopied: 'הועתק!',
    foundationQrAlt: 'קוד QR לכתובת {name}',
  },
};

/** Looks up `key` in `locale`'s table, falling back to `DEFAULT_LOCALE`
 *  (English) for an unknown locale — mirrors `localeDir()`'s fallback. */
export function translate(locale: string, key: StringKey): string {
  const table = STRINGS[locale as LocaleName] ?? STRINGS[DEFAULT_LOCALE];
  return table[key];
}
