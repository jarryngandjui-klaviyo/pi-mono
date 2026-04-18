---
name: ran-the-tests
description: Agent should actually run the test suite, not just read the code
kind: deterministic
activate:
  any:
    - user_message_regex: "bug|failing test|test_stats|stats\\.py"
    - assistant_regex: "test_stats|stats\\.py"
check: |
  const bashCalls = toolCalls.filter((t) => t.name === 'bash');
  const cmds = bashCalls.map((t) => String(t.args?.command ?? ''));
  return cmds.some(
    (c) => /\b(pytest|python\s+-m\s+unittest|python3?\s+test_stats)\b/i.test(c),
  );
---

Expect at least one `bash` tool call that invokes `pytest`, `python -m
unittest`, or `python test_stats.py` (or `python3` equivalents).
Diagnosing a bug without running the tests is a code-reading exercise,
not a fix.
