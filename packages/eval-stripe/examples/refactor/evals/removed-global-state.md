---
name: removed-global-state
description: Module-level mutable globals should be replaced with a class or explicit state
kind: llm
activate:
  any:
    - user_message_regex: "refactor|user_manager"
    - assistant_regex: "user_manager"
---

The original uses module-level mutable globals — `USERS = []` and
`NEXT_ID = 1` — and functions mutate them via `global` statements.
Pass if the refactor replaces this with an explicit container (a
`UserRepository` class, a dataclass-backed store, passing state
through function arguments, or equivalent) so the code no longer
relies on module-level `global` declarations. Fail if the refactor
just reshuffles the same globals into a different file.
