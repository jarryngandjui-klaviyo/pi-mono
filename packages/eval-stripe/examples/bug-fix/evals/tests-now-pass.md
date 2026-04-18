---
name: tests-now-pass
description: After the fix, the test suite should actually pass (not just be run)
kind: deterministic
activate:
  any:
    - user_message_regex: "bug|failing test|test_stats|stats\\.py"
    - assistant_regex: "test_stats|stats\\.py"
check: |
  const bashCalls = toolCalls.filter((t) => t.name === 'bash');
  const testIds = new Set(
    bashCalls
      .filter((t) => /\b(pytest|unittest|test_stats)\b/i.test(String(t.args?.command ?? '')))
      .map((t) => t.id),
  );
  if (testIds.size === 0) return false;
  const testResults = toolResults.filter((r) => testIds.has(r.id));
  return testResults.some((r) => {
    if (r.error) return false;
    const out = String(r.output ?? '');
    // pytest: "8 passed", unittest: "OK"
    return /\b\d+\s+passed\b/.test(out) || /\bOK\b\s*$/m.test(out);
  });
---

Expect the agent to re-run the tests after making changes and see them
pass. Reading the failing test, writing a fix, and stopping without
re-running the suite is a common miss — the agent assumes the fix
works instead of verifying. `pytest` output shows `N passed`;
`unittest` prints `OK` on success.
