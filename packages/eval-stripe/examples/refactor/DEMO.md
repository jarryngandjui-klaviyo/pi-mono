# Refactor demo

Seven eval cases that grade a refactor of a deliberately messy Python file,
`user_manager.py`. The file has classic junior-code smells — mutable default
args, global state, manual `open/close`, duplicated validation, no types —
so the refactor has plenty to fix and each eval has a clear pass/fail signal.

## What ships

- `user_manager.py` — 125-line target file, full of smells
- `evals/` — 7 graders
- This doc

## Setup

From the repo root:

```bash
./packages/eval-stripe/scripts/bootstrap-demo.sh refactor
```

That preps `~/tmp/refactor/` with `user_manager.py`, the 7 eval cases,
and a `.pi/settings.json` pointing at the built extension, then
launches Pi in it.

`windowDefault` is `-1` (session-wide) and `aggregatorDefault` is
`"last"` — the bar reflects the current state of the refactor, not a
cumulative hit rate. The one per-turn case (`explains-decisions`) overrides
to `window: 1` in its frontmatter so the explanation check only fires on
the most recent response.

First time: build the extension once with
`cd packages/eval-stripe && npm run build`.

## The eval cases

| Case | Kind | Checks |
|---|---|---|
| `split-into-modules` | deterministic | ≥2 distinct `.py` files written/edited |
| `preserves-public-api` | deterministic | all 9 original top-level functions still defined |
| `uses-context-manager-for-files` | deterministic | `with open(...)` present, no bare `f = open(...)` |
| `removed-mutable-default-arg` | deterministic | no `def foo(..., x=[])` or `x={}` in new code |
| `added-type-hints` | llm | type hints on the public API |
| `removed-global-state` | llm | module-level `USERS`/`NEXT_ID` replaced with class/instance state |
| `explains-decisions` | llm | response summarises what moved where and the smells fixed |

## Suggested demo arc

Unlike the snake demo, this one is usually **one big turn**: the user pastes
the file (or says "read user_manager.py and refactor it") and Pi does the
work in a single response. That's fine — the bar fills once and you inspect
per-case results with `/eval last`.

If you want a progressive arc for a longer demo:

1. `Read user_manager.py and tell me what's wrong with it — don't change anything yet.`
   → No deterministic passes (no writes yet). Sets context.
2. `Split user_manager.py into focused modules. Keep every existing function callable from somewhere.`
   → `split-into-modules`, `preserves-public-api` activate.
3. `Now fix the file I/O — use context managers — and remove the mutable default argument.`
   → `uses-context-manager-for-files`, `removed-mutable-default-arg` activate.
4. `Add type hints on the public API and replace the module-level globals with a class.`
   → `added-type-hints`, `removed-global-state` activate.
5. `Summarise what you changed and why, for a PR description.`
   → `explains-decisions` activates.

## Useful commands mid-demo

- `/eval list` — show the 7 loaded cases.
- `/eval last` — surface the specific cases that failed on the last turn.
- `/eval window 1` — switch to per-turn view if the session window feels too smoothed.
- `/eval aggregator all` — switch to cumulative view (sum all activations per case).

## Why these particular checks

Most "refactor quality" checks you'd write by hand live in code-review
guidelines that rot. These cases pin the refactor to properties Pi can
verify mechanically: public API preserved (grep-able), globals removed
(grep-able), context managers used (grep-able). The LLM cases handle
the things grep can't — *did it explain its choices, did it add the
right kind of type hints*. Two grader kinds, one signal.
