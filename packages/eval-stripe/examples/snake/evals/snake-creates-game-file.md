---
name: snake-creates-game-file
description: Snake request should produce at least one game source file
kind: deterministic
activate:
  user_message_regex: "snake"
check: |
  const writes = toolCalls.filter(t => t.name === 'write' || t.name === 'edit');
  return writes.some(t => {
    const p = String(t.args?.file_path ?? '');
    return /\.(js|ts|tsx|jsx|py|html)$/i.test(p);
  });
---

Deterministic check: expect at least one `write` or `edit` tool call
against a `.js`, `.ts`, `.tsx`, `.jsx`, `.py`, or `.html` file. If the
agent only talks about snake without producing code, this fails.
