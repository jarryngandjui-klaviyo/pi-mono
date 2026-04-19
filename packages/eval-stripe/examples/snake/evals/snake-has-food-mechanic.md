---
name: snake-has-food-mechanic
description: Snake should spawn food and grow/score when eaten
kind: llm
activate:
  any:
    - user_message_regex: "snake"
    - assistant_regex: "snake"
window: -1
---

The user asked for a snake game. Pass if the assistant's code spawns
food on the board AND has an observable effect when the snake eats it —
the snake grows in length, the score increases, or both. Fail if food
is missing, is never replaced after being eaten, or eating has no
effect on game state.
