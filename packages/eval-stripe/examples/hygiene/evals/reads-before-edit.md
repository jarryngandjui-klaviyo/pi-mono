---
name: reads-before-edit
description: Every file that was edited must have been read first in the same turn
kind: deterministic
activate:
  any_tool: edit
check: |
  const edits = toolCalls
    .filter(t => t.name === 'edit')
    .map(t => t.args.file_path);
  const reads = toolCalls
    .filter(t => t.name === 'read')
    .map(t => t.args.file_path);
  return edits.every(p => reads.includes(p));
window: 1
---

Hygiene rule: the agent should always read a file before editing it.
Prevents blind edits that overwrite content the agent hasn't seen.
