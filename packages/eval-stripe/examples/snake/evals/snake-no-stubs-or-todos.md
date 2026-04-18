---
name: snake-no-stubs-or-todos
description: Delivered snake code should be complete, not TODO-laden
kind: llm
activate:
  any:
    - user_message_regex: "snake"
    - assistant_regex: "snake"
---

The user asked for a snake game. Pass if the assistant delivered a
complete, runnable implementation. Fail if the code contains TODO/FIXME
markers, placeholder comments like `// implement later`, empty function
bodies where real logic belongs, `pass` / `throw new Error("not
implemented")` stubs, or if any core mechanic (movement, collision,
food, input) is left as an exercise to the user.
