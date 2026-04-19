---
name: split-into-modules
description: Refactor should split user_manager.py into multiple focused modules
kind: deterministic
activate:
  any:
    - user_message_regex: "refactor|user_manager"
    - assistant_regex: "user_manager"
check: |
  const pyWrites = toolCalls.filter(
    (t) => (t.name === 'write' || t.name === 'edit') &&
           /\.py$/i.test(String(t.args?.file_path ?? ''))
  );
  const uniqueFiles = new Set(pyWrites.map((t) => String(t.args?.file_path ?? '')));
  return uniqueFiles.size >= 2;
---

Expect the refactor to produce at least two distinct `.py` files (via
`write` or `edit`). A single-file "refactor" that just cleans up the
original isn't really a refactor for a file this size.
