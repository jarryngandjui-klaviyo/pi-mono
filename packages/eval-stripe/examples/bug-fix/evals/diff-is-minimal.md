---
name: diff-is-minimal
description: Bug fix should be a small, targeted change — not a rewrite
kind: llm
activate:
  any:
    - user_message_regex: "bug|failing test|test_stats|stats\\.py"
    - assistant_regex: "stats\\.py"
---

The user reported a failing test in `test_stats.py`. Pass if the
assistant's edits to `stats.py` are minimal and targeted — changing
only the code responsible for the bug (roughly 1–5 lines). Fail if the
assistant rewrote the whole file, refactored unrelated functions,
reformatted code, added unrelated features, or reshuffled imports.
A bug fix should look like a surgical change, not a refactor. Return
`{pass, reason}`.
