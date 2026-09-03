// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * citation/generate-citation — regenerates CITATION.cff (GitHub's native "Cite
 * this repository" button — APA/BibTeX export), README.md's "How to cite"
 * block AND its Status section's "Current version **x.y.z**" line,
 * docs/SELF-STUDY/PAPER.md's "How to cite this document" block, and
 * docs/MODEL-CARD.md's §6 "Engine/package version" pointer from ONE metadata
 * source: root package.json (version, description, author, license, homepage)
 * plus the matching CHANGELOG.md release heading for that version's release
 * date. Hand-maintained citation artifacts drift apart the moment one is
 * edited and the other forgotten; generating all of them from the same values
 * — the same fix `ci:architecture` applies to docs/ARCHITECTURE.md's
 * container diagram — keeps them identical, and a future repo move (the
 * `homepage` GitHub URL) or version bump updates every format at once.
 *
 * `--check` (wired into `pnpm verify` as `ci:citation`) fails without writing
 * if any artifact differs from what's committed; no flag writes all four
 * (`pnpm citation:update`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const PKG_PATH = join(repoRoot, 'package.json');
const CHANGELOG_PATH = join(repoRoot, 'CHANGELOG.md');
const CFF_PATH = join(repoRoot, 'CITATION.cff');
const README_PATH = join(repoRoot, 'README.md');
const PAPER_PATH = join(repoRoot, 'docs/SELF-STUDY/PAPER.md');
const PAPER_REPO_RELATIVE_PATH = 'docs/SELF-STUDY/PAPER.md';
const MODEL_CARD_PATH = join(repoRoot, 'docs/MODEL-CARD.md');

const TITLE = 'AUTOPILOT';
const PAPER_TITLE =
  'The AUTOPILOT Self-Study — a living account of an agent flying its own repository';
const MARKER_START = '<!-- HOW-TO-CITE:START -->';
const MARKER_END = '<!-- HOW-TO-CITE:END -->';

/** @typedef {{ version: string, description: string, author: string, license: string, homepage: string, dateReleased: string }} CitationMeta */

/** Escapes every regex metacharacter in `s` so it matches only as a literal
 *  string when spliced into a `RegExp` — mirrors `release/execute.ts`'s
 *  `escapeRegExp`, which the same "splice an untrusted version string into a
 *  regex" problem already solved correctly there. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds the regex that locates a version's CHANGELOG.md release heading
 *  (`## [<version>] — YYYY-MM-DD`). `version` is spliced into a `RegExp`, so
 *  every regex metacharacter it may contain — semver build metadata's `+`
 *  included (e.g. `1.2.3+build.5`), not just `.` — must be escaped, or the
 *  heading fails to match even though it's present verbatim. */
export function changelogVersionHeadingPattern(version) {
  const escapedVersion = escapeRegExp(String(version));
  return new RegExp(`^## \\[${escapedVersion}\\].*?—\\s*(\\d{4}-\\d{2}-\\d{2})`, 'm');
}

/** @returns {CitationMeta} */
function loadMetadata() {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
  const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  const versionHeading = changelogVersionHeadingPattern(pkg.version);
  const match = changelog.match(versionHeading);
  if (!match) {
    throw new Error(
      `generate-citation: no CHANGELOG.md release heading found for version ${pkg.version} — ` +
        `add "## [${pkg.version}] — YYYY-MM-DD ..." before regenerating`,
    );
  }
  return {
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    license: pkg.license,
    homepage: pkg.homepage,
    dateReleased: match[1],
  };
}

/** Double-quoted YAML scalar escaping matches JSON string escaping for the
 *  plain text + unicode values used here — no YAML-specific escapes needed. */
function yamlString(value) {
  return JSON.stringify(value);
}

/** @param {CitationMeta} meta */
function renderCff(meta) {
  return [
    '# This file is generated — see scripts/citation/generate-citation.mjs.',
    '# Refresh with `pnpm citation:update`; `pnpm run ci:citation` checks it matches.',
    'cff-version: 1.2.0',
    `message: ${yamlString('If you use this software, please cite it as below.')}`,
    `title: ${yamlString(TITLE)}`,
    `abstract: ${yamlString(meta.description)}`,
    'type: software',
    `version: ${yamlString(meta.version)}`,
    `date-released: ${yamlString(meta.dateReleased)}`,
    `license: ${meta.license}`,
    `repository-code: ${yamlString(meta.homepage)}`,
    `url: ${yamlString(meta.homepage)}`,
    'authors:',
    `  - name: ${yamlString(meta.author)}`,
    '',
  ].join('\n');
}

/** @param {CitationMeta} meta */
function releaseYear(meta) {
  return meta.dateReleased.slice(0, 4);
}

/** @param {CitationMeta} meta */
function renderBibtex(meta) {
  return [
    '```bibtex',
    `@software{autopilot_${releaseYear(meta)},`,
    `  author  = {${meta.author}},`,
    `  title   = {{${TITLE}}},`,
    `  url     = {${meta.homepage}},`,
    `  version = {${meta.version}},`,
    `  year    = {${releaseYear(meta)}}`,
    '}',
    '```',
  ].join('\n');
}

/** @param {CitationMeta} meta */
function renderApa(meta) {
  return `${meta.author}. (${releaseYear(meta)}). *${TITLE}* (Version ${meta.version}) [Computer software]. ${meta.homepage}`;
}

/** @param {CitationMeta} meta */
function renderIeee(meta) {
  return `${meta.author}, "${TITLE}," Version ${meta.version}, ${releaseYear(meta)}. [Online]. Available: ${meta.homepage}`;
}

/** @param {CitationMeta} meta */
function renderHowToCiteBlock(meta) {
  return [
    MARKER_START,
    '_Generated by `pnpm citation:update` from `package.json` + `CHANGELOG.md` — the same' +
      ' values [`CITATION.cff`](CITATION.cff) uses for GitHub\'s native "Cite this repository"' +
      ' button, so neither drifts from the other._',
    '',
    '**BibTeX**',
    '',
    renderBibtex(meta),
    '',
    '**APA**',
    '',
    renderApa(meta),
    '',
    '**IEEE**',
    '',
    renderIeee(meta),
    MARKER_END,
  ].join('\n');
}

/** @param {CitationMeta} meta */
function paperUrl(meta) {
  return `${meta.homepage}/blob/main/${PAPER_REPO_RELATIVE_PATH}`;
}

/** @param {CitationMeta} meta */
function renderPaperBibtex(meta) {
  return [
    '```bibtex',
    `@misc{autopilot_self_study_${releaseYear(meta)},`,
    `  author = {${meta.author}},`,
    `  title  = {{${PAPER_TITLE}}},`,
    `  url    = {${paperUrl(meta)}},`,
    `  note   = {Living document, version ${meta.version}},`,
    `  year   = {${releaseYear(meta)}}`,
    '}',
    '```',
  ].join('\n');
}

/** @param {CitationMeta} meta */
function renderPaperApa(meta) {
  return `${meta.author}. (${releaseYear(meta)}). *${PAPER_TITLE}* (Version ${meta.version}) [Living document]. ${paperUrl(meta)}`;
}

/** @param {CitationMeta} meta */
function renderPaperIeee(meta) {
  return `${meta.author}, "${PAPER_TITLE}," Version ${meta.version}, ${releaseYear(meta)}. [Online]. Available: ${paperUrl(meta)}`;
}

/** @param {CitationMeta} meta */
function renderPaperHowToCiteBlock(meta) {
  return [
    MARKER_START,
    '_Generated by `pnpm citation:update` from `package.json` + `CHANGELOG.md` — the same' +
      ' metadata source as [`CITATION.cff`](../../CITATION.cff) and' +
      ' [README.md\'s "How to cite"](../../README.md#how-to-cite) block, so none of the three drift' +
      ' from each other. This entry cites the document itself (a living, continuously-updated' +
      ' account — the `version`/`year` reflect the AUTOPILOT release this snapshot ships with, not a' +
      ' fixed publication date); cite [`CITATION.cff`](../../CITATION.cff) instead to cite the' +
      ' software.',
    '',
    '**BibTeX**',
    '',
    renderPaperBibtex(meta),
    '',
    '**APA**',
    '',
    renderPaperApa(meta),
    '',
    '**IEEE**',
    '',
    renderPaperIeee(meta),
    MARKER_END,
  ].join('\n');
}

function replaceBlock(source, block, path) {
  const start = source.indexOf(MARKER_START);
  const end = source.indexOf(MARKER_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `generate-citation: markers not found in ${path} — expected ${MARKER_START} / ${MARKER_END}`,
    );
  }
  return source.slice(0, start) + block + source.slice(end + MARKER_END.length);
}

/** README.md's Status section states the version in prose — `Current version
 *  **x.y.z** — see CHANGELOG.md`. The bold span is the whole anchor: the
 *  version inside is whatever the last writer left there. */
const README_STATUS_VERSION_PATTERN = /(Current version \*\*)([^*\n]+)(\*\*)/;

/** Rewrites README.md's Status "Current version **x.y.z**" line to `version`.
 *
 *  That line is the one place outside the HOW-TO-CITE block where README
 *  states the package version, and it was hand-maintained: the 2026-08-28
 *  KEEPER page-upkeep pass fixed it by hand, then three 2026-09-02 releases
 *  each refreshed the citation block (`pnpm citation:update`) and left the
 *  Status line at the old number — `--check` stayed green throughout because
 *  it only compared the block. Putting the line under the same generator
 *  makes the drift impossible rather than merely fixable.
 *
 *  Throws when the anchor is absent: returning the source unchanged would
 *  let `--check` pass forever on a README that no longer states its version
 *  at all — the same fail-loud stance `replaceBlock` takes on missing
 *  HOW-TO-CITE markers. */
export function refreshReadmeStatusVersion(source, version) {
  if (!README_STATUS_VERSION_PATTERN.test(source)) {
    throw new Error(
      'generate-citation: README.md Status "Current version **x.y.z**" line not found — ' +
        'restore it (see README.md ## Status) before regenerating',
    );
  }
  return source.replace(README_STATUS_VERSION_PATTERN, `$1${version}$3`);
}

/** docs/MODEL-CARD.md's §6 evidence-pointer table names the engine version
 *  in one row — `| Engine/package version | \`x.y.z\` (\`package.json\`) |`.
 *  The row label plus the opening backtick is the anchor; the code span's
 *  content is whatever the last writer left there. The sibling
 *  `Firing-Prompt-Version` row is deliberately NOT matched: the card's §2
 *  documents that the two version axes drift independently. */
const MODEL_CARD_ENGINE_VERSION_PATTERN = /(\| Engine\/package version \| `)([^`\n]+)(`)/;

/** Rewrites docs/MODEL-CARD.md's §6 "Engine/package version" pointer to
 *  `version`.
 *
 *  That pointer was the last hand-maintained freshness surface: the
 *  2026-08-28 KEEPER page-upkeep pass fixed it by hand alongside README's
 *  Status line, and the 2026-09-03 pass that put the Status line under this
 *  generator still had to touch the card by hand. Same stance as
 *  `refreshReadmeStatusVersion`: rewrite from `package.json`, and throw when
 *  the anchor is absent rather than let `--check` pass forever on a card that
 *  no longer states its version. */
export function refreshModelCardEngineVersion(source, version) {
  if (!MODEL_CARD_ENGINE_VERSION_PATTERN.test(source)) {
    throw new Error(
      'generate-citation: docs/MODEL-CARD.md §6 "| Engine/package version | `x.y.z` ..." row not found — ' +
        'restore it (see docs/MODEL-CARD.md ## 6. Evidence pointers) before regenerating',
    );
  }
  return source.replace(MODEL_CARD_ENGINE_VERSION_PATTERN, `$1${version}$3`);
}

function main() {
  const check = process.argv.includes('--check');
  const meta = loadMetadata();
  const cffContent = renderCff(meta);

  const readmeSource = readFileSync(README_PATH, 'utf8');
  const readmeWithCiteBlock = replaceBlock(readmeSource, renderHowToCiteBlock(meta), README_PATH);
  const nextReadme = refreshReadmeStatusVersion(readmeWithCiteBlock, meta.version);
  const currentCff = existsSync(CFF_PATH) ? readFileSync(CFF_PATH, 'utf8') : null;

  const paperSource = readFileSync(PAPER_PATH, 'utf8');
  const nextPaper = replaceBlock(paperSource, renderPaperHowToCiteBlock(meta), PAPER_PATH);

  const modelCardSource = readFileSync(MODEL_CARD_PATH, 'utf8');
  const nextModelCard = refreshModelCardEngineVersion(modelCardSource, meta.version);

  if (check) {
    const stale = [];
    if (currentCff !== cffContent) stale.push('CITATION.cff');
    if (readmeWithCiteBlock !== readmeSource) stale.push('README.md "How to cite" section');
    if (nextReadme !== readmeWithCiteBlock) stale.push('README.md Status "Current version" line');
    if (nextPaper !== paperSource) stale.push('docs/SELF-STUDY/PAPER.md "How to cite" section');
    if (nextModelCard !== modelCardSource) {
      stale.push('docs/MODEL-CARD.md §6 "Engine/package version" pointer');
    }
    if (stale.length > 0) {
      console.error(
        `citation FAILED: out of date — ${stale.join(', ')}. Run \`pnpm citation:update\`.`,
      );
      process.exit(1);
    }
    console.log(
      'citation OK: CITATION.cff, README.md (Status version + "How to cite"), docs/SELF-STUDY/PAPER.md, and docs/MODEL-CARD.md (§6 engine version) are in sync with package.json/CHANGELOG.md',
    );
    return;
  }

  writeFileSync(CFF_PATH, cffContent);
  writeFileSync(README_PATH, nextReadme);
  writeFileSync(PAPER_PATH, nextPaper);
  writeFileSync(MODEL_CARD_PATH, nextModelCard);
  console.log(`citation: wrote ${CFF_PATH}`);
  console.log(
    `citation: refreshed the Status "Current version" line and the "How to cite" block in ${README_PATH}`,
  );
  console.log(`citation: refreshed the "How to cite this document" block in ${PAPER_PATH}`);
  console.log(`citation: refreshed the §6 "Engine/package version" pointer in ${MODEL_CARD_PATH}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
