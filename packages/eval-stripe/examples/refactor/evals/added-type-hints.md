---
name: added-type-hints
description: Refactored functions should have type hints
kind: llm
activate:
  any:
    - user_message_regex: "refactor|user_manager"
    - assistant_regex: "user_manager"
---

The original `user_manager.py` has zero type hints. Pass if the refactor
adds meaningful type hints to most function signatures (parameters and
return types). Pass even if one or two simple internal helpers are left
untyped. Fail if type hints are missing across the board, or if they
were added to trivial functions but skipped on the public API.
