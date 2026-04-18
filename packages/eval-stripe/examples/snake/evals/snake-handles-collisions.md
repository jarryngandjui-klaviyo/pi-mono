---
name: snake-handles-collisions
description: Snake should detect both wall and self collisions
kind: llm
activate:
  any:
    - user_message_regex: "snake"
    - assistant_regex: "snake"
---

The user asked for a snake game. Pass if the assistant's code handles
BOTH wall collisions (snake hitting the board boundary, or wrapping
intentionally) AND self-collisions (snake running into its own body).
Fail if either is missing, if collision detection is stubbed/TODO, or
if the snake can overlap itself without consequence.
