---
name: uses-context-manager-for-files
description: File I/O should use `with open(...)` rather than manual open/close
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
  // Fail if any bare open( ...) assigned to a var (no 'with')
  const rawOpen = /^\s*(?!with\b)[A-Za-z_]\w*\s*=\s*open\s*\(/m.test(corpus);
  // Pass if there's at least one `with open(`
  const contextOpen = /\bwith\s+open\s*\(/.test(corpus);
  return contextOpen && !rawOpen;
---

The refactor should use `with open(...) as f:` for file I/O, not the
original's manual `f = open(...); f.close()` pattern. Any bare
`f = open(...)` assignment in the new code fails this check.
