---
name: no-hallucinated-paths
description: File paths passed to Read/Edit must match paths returned by previous Ls/Find calls or explicit user mentions
kind: deterministic
activate:
  any:
    - any_tool: read
    - any_tool: edit
check: |
  // Collect all paths that were "discovered" via ls or find
  const discoveredPaths = toolResults
    .filter(r => {
      const tc = toolCalls.find(t => t.id === r.id);
      return tc && (tc.name === 'ls' || tc.name === 'find');
    })
    .flatMap(r => {
      // Split output lines and extract file-like paths
      return r.output.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
    });

  // Paths the user explicitly mentioned
  const userMentions = toolCalls
    .filter(t => (t.name === 'read' || t.name === 'edit') && t.args.file_path)
    .map(t => String(t.args.file_path));

  // If no ls/find was done, pass — we can't validate without discovery
  if (discoveredPaths.length === 0) return true;

  // All read/edit paths should appear in discovered paths or user message
  return userMentions.every(p =>
    discoveredPaths.some(d => d.includes(p) || p.includes(d)) ||
    user.includes(p)
  );
---

Prevents the agent from editing or reading files at paths it never actually discovered
(via ls/find) or that the user didn't mention. Catches hallucinated paths.
