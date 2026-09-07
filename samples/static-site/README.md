# sample-static-site

A two-page brochure site — home + about — with no `package.json` and no
build tooling. Part of AUTOPILOT's [`samples/`](../README.md) target-repo
fixtures.

## What this demonstrates

- AUTOPILOT's `static-site` onboarding detector
  (`packages/onboarding/src/gate/detectors/static-site.ts`) recognizing an
  ecosystem from file shape alone — no manifest, just `.html` files — rather
  than a `scripts.*` block like the `js`/`python` detectors use.
- A real 2-command gate that both actually enforce something: `html-validate`
  catches markup errors (missing `lang`, an unclosed tag, an accessibility
  violation), `linkinator` catches a broken internal link.
- Every link on the site is local by design, so the gate never depends on
  network access to pass.

## Usage

Open `index.html` in a browser — there is nothing to install or build.

## Gate

```sh
npx --yes html-validate "**/*.html"
npx --yes linkinator . --recurse
```

Both commands run clean standalone from this directory.
