---
name: claims-have-evidence
description: File-path or function-name claims in the assistant response should correspond to files that were read
kind: llm
activate:
  all:
    - min_tool_calls: 1
    - any_tool: read
window: 1
---

The assistant's response mentions specific file paths, function names, or code symbols.
Pass if every concrete claim about code (e.g. "the function `foo` in `bar.ts`") is backed
by a corresponding Read tool call for that file in this turn.

Fail if the assistant makes up file paths or function names not seen in any read results.
Return `{"pass": true/false, "reason": "..."}`.
