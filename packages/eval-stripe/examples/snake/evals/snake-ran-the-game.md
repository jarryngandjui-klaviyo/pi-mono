---
name: snake-ran-the-game
description: Agent should actually try running the snake game
kind: deterministic
activate:
  user_message_regex: "snake"
check: |
  const bashCalls = toolCalls.filter(t => t.name === 'bash');
  const cmds = bashCalls.map(t => String(t.args?.command ?? ''));
  return cmds.some(c => /\b(node|python3?|bun|deno|npx|npm (?:start|run)|open\s+.*\.html)\b/i.test(c));
---

Deterministic check: expect at least one `bash` call that looks like
it's launching the game — `node snake.js`, `python3 snake.py`, `bun`,
`deno`, `npx`, `npm start`, or `open index.html`. Fails if the agent
wrote code but never attempted to run it.
