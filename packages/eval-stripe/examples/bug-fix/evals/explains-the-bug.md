---
name: explains-the-bug
description: Assistant should explain what the bug was and why its fix works
kind: llm
activate:
  any:
    - user_message_regex: "bug|failing test|test_stats|stats\\.py"
    - assistant_regex: "stats\\.py|median"
---

Pass if the assistant's final response explains:
1. What was wrong — specifically, that `median()` sorted the caller's
   list in place (or an equivalent description of the mutation bug).
2. Why the fix works — e.g., "`sorted()` returns a new list instead of
   mutating the argument."

One or two sentences is enough. Fail if the assistant just says "fixed
the bug" / "tests pass now" without naming the actual defect, or if
the explanation is about something unrelated. Return `{pass, reason}`.
