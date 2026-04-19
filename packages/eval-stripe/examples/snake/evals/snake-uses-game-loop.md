---
name: snake-uses-game-loop
description: Snake implementation should include a tick/update cycle
kind: llm
activate:
  any:
    - user_message_regex: "snake"
    - assistant_regex: "snake"
---

The user asked for a snake game. Pass if the assistant's response or code
includes a recurring game loop — `setInterval`, `setTimeout` recursion,
`requestAnimationFrame`, a `while` loop with a sleep, a terminal redraw
loop, or any equivalent tick/update cycle. Fail if the code is static,
one-shot, or has no mechanism for advancing state over time.
