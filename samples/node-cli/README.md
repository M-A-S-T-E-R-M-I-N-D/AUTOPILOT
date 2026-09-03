# sample-node-cli

A tiny `wc`-style line/word/char counter. Part of AUTOPILOT's
[`samples/`](../README.md) target-repo fixtures.

## What this demonstrates

- AUTOPILOT's `js` onboarding detector
  (`packages/onboarding/src/gate/detectors/js.ts`) picking up a real
  `package.json` with `scripts.typecheck` / `scripts.test` / `scripts.build`
  / `scripts.lint` and generating a working starter `SOUL.md` gate from it.
- A full 4-command gate that actually enforces something: `tsc --strict`
  typechecking, a `node --test` suite with edge cases (empty input, no
  trailing newline, collapsed whitespace, a missing-argument usage error),
  a real `tsc` build, and a flat-config ESLint pass.

## Usage

```sh
npm install
npm run build
node dist/cli.js <file>
```

## Gate

```sh
npm install
npm run typecheck
npm test    # runs `npm run build` first (pretest), then `node --test dist`
npm run build
npm run lint
```

This sample has its own `package.json`/`tsconfig.json`/`eslint.config.js`
and is intentionally outside the root pnpm workspace — it is a target repo
for AUTOPILOT to fly, not a package of the AUTOPILOT monorepo itself.
