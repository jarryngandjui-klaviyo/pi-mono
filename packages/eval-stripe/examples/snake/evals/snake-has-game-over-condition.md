---
name: snake-has-game-over-condition
description: Snake should have a defined game-over state
kind: llm
activate:
  any:
    - user_message_regex: "snake"
    - assistant_regex: "snake"
window: -1
---

The user asked for a snake game. Pass if the assistant's code defines a
clear game-over condition — death stops the loop, resets state, or
displays a "game over" screen/message with the final score. Fail if the
game can never end, game-over is TODO/stubbed, or the loop continues
running after collision without any feedback.
