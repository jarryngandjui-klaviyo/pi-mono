---
name: removed-mutable-default-arg
description: The `roles=[]` mutable default argument should be gone
kind: deterministic
activate:
  any:
    - user_message_regex: "refactor|user_manager"
    - assistant_regex: "user_manager"
check: |
  const writes = toolCalls.filter(
    (t) => t.name === 'write' || t.name === 'edit'
  );
  const corpus = writes
    .map((t) => String(t.args?.content ?? t.args?.new_string ?? ''))
    .join('\n');
  // Fail if any function signature still has a mutable default: = [] or = {}
  return !/def\s+\w+\s*\([^)]*=\s*(\[\s*\]|\{\s*\})/.test(corpus);
---

The original has a classic Python gotcha: `def add_user(name, email, roles=[])`.
The mutable default is shared across calls. Refactor should remove that —
typically by defaulting to `None` and materialising an empty list inside.
Any `def foo(..., x=[])` or `def foo(..., x={})` signature in the new
code fails this check.
