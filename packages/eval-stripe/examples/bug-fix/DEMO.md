# Bug-fix demo

Six eval cases that grade a classic bug-fix task: a failing test
reveals that `median()` mutates the caller's list. The agent needs to
*actually run the tests*, find the root cause, fix it minimally, and
re-verify — not just read the code and declare victory.

## What ships

- `stats.py` — small statistics module with one subtle mutation bug
- `test_stats.py` — unittest suite; `test_median_does_not_mutate_input` fails
- `evals/` — 6 graders
- This doc

## The bug

`stats.py:median()` calls `numbers.sort()`, which sorts in place. That
mutates whatever list the caller passed in. The fix is one line:
`sorted(numbers)` instead of `numbers.sort()`.

## Setup

From the repo root:

```bash
./packages/eval-stripe/scripts/bootstrap-demo.sh bug-fix
```

That preps `~/tmp/bug-fix/` with `stats.py`, `test_stats.py`, the 6
eval cases, and a `.pi/settings.json` pointing at the built extension,
then launches Pi in it. Default `window: 1` is what this demo wants —
each turn's bar reflects only that turn.

First time: build the extension once with
`cd packages/eval-stripe && npm run build`.

## The eval cases

| Case | Kind | Checks |
|---|---|---|
| `ran-the-tests` | deterministic | `bash` called `pytest`/`unittest`/`python test_stats` |
| `tests-now-pass` | deterministic | test output contains `N passed` or `OK` |
| `preserves-test-coverage` | deterministic | no test methods deleted, no `@skip` added |
| `diff-is-minimal` | llm | fix is 1–5 lines, not a rewrite |
| `root-cause-not-symptom` | llm | fix is in `stats.py`, not a test-side workaround |
| `explains-the-bug` | llm | response names the mutation bug and why the fix works |

## Suggested demo arc

1. `Read stats.py and test_stats.py and tell me what you think might be wrong.`
   → Code reading only. Sets context; no evals activate yet.
2. `A test is failing. Run the suite and tell me what breaks.`
   → `ran-the-tests` activates and passes. Others don't activate yet.
3. `Fix the bug.`
   → All six activate. The interesting cases:
   - `root-cause-not-symptom` — did the agent edit `stats.py` or try to edit the test?
   - `diff-is-minimal` — did the agent rewrite half the module?
   - `tests-now-pass` — did the agent re-run the suite after editing?
4. `Summarise what was wrong and why your change fixes it.`
   → `explains-the-bug` activates.

## Anti-patterns this catches

- **Read-only "fixes"**: agent stares at the code, writes a fix,
  declares success, never runs the tests. `ran-the-tests` and
  `tests-now-pass` catch this.
- **Test-side fixes**: agent makes the test pass by editing the
  test instead of the code. `root-cause-not-symptom` (LLM) and
  `preserves-test-coverage` (deterministic, catches the mechanical
  forms).
- **Over-fixing**: agent takes a one-line bug as a chance to refactor
  the whole module. `diff-is-minimal` catches this.
- **Silent fixes**: agent fixes it but never says *what* was wrong,
  leaving you to read the diff. `explains-the-bug` catches this.

## Why these particular checks

Bug fixes have a narrow definition of "done" that's easy to fake:
the tests pass. These cases pin the work to properties that
distinguish a real fix from a coincidental pass — did the tests
actually run, did the fix touch the right file, is the diff sized
like a fix and not a rewrite, did the agent explain what it
understood. Two deterministic passes on tool-call shape, one on edit
shape; three LLM cases for the judgment calls.
