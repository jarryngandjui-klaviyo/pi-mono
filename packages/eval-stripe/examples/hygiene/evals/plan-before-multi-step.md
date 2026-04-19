---
name: plan-before-multi-step
description: When the agent makes >3 tool calls, it should have stated a plan upfront
kind: llm
activate:
  min_tool_calls: 4
---

The agent made 4 or more tool calls in a single turn — which qualifies as a "multi-step" task.

Pass if the assistant's response (or a preceding message from it) includes an upfront plan,
outline, or enumeration of steps before diving into tool calls. A sentence like
"I'll do X, then Y, then Z" counts.

Fail if the agent jumped straight into tool calls without any upfront framing of the plan.

Return `{"pass": true/false, "reason": "..."}`.
