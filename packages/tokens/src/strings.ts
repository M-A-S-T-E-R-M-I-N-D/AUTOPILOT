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
  // web/features/round-panel.ts (board web-msnsndki-dz3vn1): the CURRENT
  // ROUND panel's own literal text — title, loading/unavailable states, and
  // the "no release tags yet" fallback. roundSinceLabel/roundStatItems'
  // chip labels (packages/tokens's sibling web/stat-tiles.ts) stay
  // English-only for now, the same incremental-slice reasoning every other
  // still-untranslated surface follows.
  roundTitle: '🔄 This round',
  roundLoading: 'Loading round totals…',
  roundUnavailable: 'Round totals unavailable.',
  roundNoTags: 'No release tags yet — every firing counts toward the round so far.',
  roundSinceTagTip: 'This project’s most recently created git tag',
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
  detailsSummary: 'Details',
  gate: 'Gate',
  backup: 'Backup',
  languages: 'Languages',
  topDirectories: 'Top directories',
  activity: 'Activity',
  metrics: 'Metrics',
  inbox: 'Inbox',
  firingActivity: 'Firing activity',
  inboxSummary: '📝 Drop a note',
  hotFiles: 'Hot files',
  hotFilesAria: 'Hot files: the largest tracked files by byte size, not frequently changed',
  flightLog: 'Flight log',
  flightLogAria:
    'Flight log: every firing this project has flown, newest first, click a row to expand it',
  firingTrace: 'Per-firing trace',
  firingTraceAria:
    'Per-firing trace: every firing for this project, grouped and collapsible, unlike the Activity feed above which only shows the last flight',
  tasks: 'Tasks',
  tasksFocusMode: 'Tasks — 🎯 FOCUS MODE',
  reportBugLabel: 'Report a bug or request a feature upstream',
  titlePlaceholder: 'Title',
  detailsOptionalPlaceholder: 'Details (optional)',
  openGithubIssue: 'Open GitHub issue',
  openPullRequest: 'Open pull request',
  checkForUpdates: 'Check for updates',
  fleetWisdomProposal: 'Fleet wisdom proposal',
  githubPrSummary: '🔀 Contribute upstream',
  githubPrLabel: "Contribute {name}'s current branch upstream as a pull request",
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
    roundTitle: '🔄 הסבב הזה',
    roundLoading: 'טוען סיכומי סבב…',
    roundUnavailable: 'סיכומי הסבב אינם זמינים.',
    roundNoTags: 'עדיין אין תגיות שחרור — כל הפעלה נספרת לסבב עד כה.',
    roundSinceTagTip: 'תגית ה-git האחרונה שנוצרה עבור הפרויקט הזה',
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
    detailsSummary: 'פרטים',
    gate: 'שער',
    backup: 'גיבוי',
    languages: 'שפות',
    topDirectories: 'תיקיות עליונות',
    activity: 'פעילות',
    metrics: 'מדדים',
    inbox: 'תיבת הודעות',
    firingActivity: 'פעילות טיסות',
    inboxSummary: '📝 הוסף הערה',
    hotFiles: 'קבצים חמים',
    hotFilesAria: 'קבצים חמים: הקבצים הגדולים ביותר במעקב לפי גודל בבתים, לא לפי תדירות שינוי',
    flightLog: 'יומן טיסות',
    flightLogAria:
      'יומן טיסות: כל הפעלה שהפרויקט הזה טס, החדשה ביותר קודם, לחצו על שורה כדי להרחיב אותה',
    firingTrace: 'עקבה לפי הפעלה',
    firingTraceAria:
      'עקבה לפי הפעלה: כל הפעלה עבור פרויקט זה, מקובצת וניתנת לכיווץ, בניגוד לפיד הפעילות למעלה שמציג רק את הטיסה האחרונה',
    tasks: 'משימות',
    tasksFocusMode: 'משימות — 🎯 מצב מיקוד',
    reportBugLabel: 'דיווח על באג או בקשת תכונה במאגר המקור',
    titlePlaceholder: 'כותרת',
    detailsOptionalPlaceholder: 'פרטים (אופציונלי)',
    openGithubIssue: 'פתח issue ב-GitHub',
    openPullRequest: 'פתח pull request',
    checkForUpdates: 'בדוק עדכונים',
    fleetWisdomProposal: 'הצעת חוכמת הצי',
    githubPrSummary: '🔀 תרום למאגר המקור',
    githubPrLabel: 'תרום את הענף הנוכחי של {name} למאגר המקור כ-pull request',
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
  },
};

/** Looks up `key` in `locale`'s table, falling back to `DEFAULT_LOCALE`
 *  (English) for an unknown locale — mirrors `localeDir()`'s fallback. */
export function translate(locale: string, key: StringKey): string {
  const table = STRINGS[locale as LocaleName] ?? STRINGS[DEFAULT_LOCALE];
  return table[key];
}
