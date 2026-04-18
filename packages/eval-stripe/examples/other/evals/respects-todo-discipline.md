---
name: respects-todo-discipline
description: When TodoWrite is used, only one task should be in_progress at a time
kind: deterministic
activate:
  any_tool: TodoWrite
check: |
  const todoWriteCalls = toolCalls.filter(t => t.name === 'TodoWrite');
  for (const tc of todoWriteCalls) {
    const todos = tc.args.todos;
    if (!Array.isArray(todos)) continue;
    const inProgress = todos.filter(t => t.status === 'in_progress');
    if (inProgress.length > 1) return false;
  }
  return true;
---

Enforces the standard todo discipline: at most one task should be `in_progress` at a time.
Multiple concurrent `in_progress` tasks suggest the agent isn't serializing its work properly.
