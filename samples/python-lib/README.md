# sample-python-lib

A tiny text-statistics library (`word_count`, `char_count`,
`average_word_length`, `most_common_word`). Part of AUTOPILOT's
[`samples/`](../README.md) target-repo fixtures.

## What this demonstrates

- AUTOPILOT's `python` onboarding detector
  (`packages/onboarding/src/gate/detectors/python.ts`) picking up a real
  `pyproject.toml` with `[tool.pytest.ini_options]` / `[tool.mypy]` /
  `[tool.ruff]` sections and generating a working starter `SOUL.md` gate
  from it (`typecheck` + `test` + `lint` — the detector emits no `build`
  key for Python).
- A gate that actually enforces something: `mypy --strict` typechecking,
  a `pytest` suite with edge cases (empty string, repeated whitespace,
  case-insensitivity), and a `ruff check` lint pass.

## Usage

```sh
python -m venv .venv
.venv/Scripts/activate   # .venv/bin/activate on macOS/Linux
pip install -e .
python -c "from textstats import word_count; print(word_count('a b c'))"
```

## Gate

```sh
python -m venv .venv
.venv/Scripts/activate   # .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
mypy .
pytest
ruff check .
```

This sample has its own `pyproject.toml` and is intentionally outside the
root pnpm workspace and any Python tooling this monorepo might use
elsewhere — it is a target repo for AUTOPILOT to fly, not a package of the
AUTOPILOT monorepo itself.
