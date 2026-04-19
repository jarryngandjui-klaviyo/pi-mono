---
name: tool-call-budget
description: No more than 20 tool calls per turn — enforces focus
kind: deterministic
check: |
  return toolCalls.length <= 20;
window: 1
---

A turn with more than 20 tool calls usually indicates the agent went off the rails —
either looping, over-exploring, or doing far more work than asked. This eval fails
any turn that exceeds the budget, prompting you to review the session.

Adjust the threshold (20) to match your project's expected complexity.
