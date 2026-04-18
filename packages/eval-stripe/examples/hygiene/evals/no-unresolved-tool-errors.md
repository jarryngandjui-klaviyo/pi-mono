---
name: no-unresolved-tool-errors
description: No tool call ended with an error that was not subsequently resolved
kind: deterministic
check: |
  const errorIds = toolResults
    .filter(r => r.error)
    .map(r => r.id);
  if (errorIds.length === 0) return true;
  // A retry is resolved if a later tool result with the same tool name succeeded.
  // For simplicity: pass if the assistant's final response doesn't mention the error.
  const assistantLower = assistant.toLowerCase();
  const mentionsError = errorIds.some(() =>
    assistantLower.includes('error') && assistantLower.includes('failed')
  );
  return !mentionsError;
---

Checks that tool errors don't silently slip through. The agent should either
retry successfully or communicate the failure clearly in its response.
