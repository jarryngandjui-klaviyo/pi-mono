---
name: explains-decisions
description: Refactor response should summarise what moved where and why
kind: llm
activate:
  any:
    - user_message_regex: "refactor|user_manager"
    - assistant_regex: "user_manager"
window: 1
---

The user asked for a refactor of `user_manager.py`. Pass if the
assistant's final response summarises the refactor — which new files
exist, what each is responsible for, and the specific smells fixed
(mutable default arg, globals, print-instead-of-raise, duplicated
validation, etc.). One or two concise paragraphs is enough. Fail if
the assistant just dropped code with no explanation, or if the
explanation is generic ("cleaned it up") without naming the actual
changes.
