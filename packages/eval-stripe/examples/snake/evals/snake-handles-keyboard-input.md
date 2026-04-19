---
name: snake-handles-keyboard-input
description: Snake should respond to arrow keys / WASD to change direction
kind: llm
activate:
  any:
    - user_message_regex: "snake"
    - assistant_regex: "snake"
window: -1
---

The user asked for a snake game. Pass if the assistant's code registers
keyboard input (arrow keys, WASD, or platform-appropriate equivalent
like curses.getch in Python) to change the snake's direction. Bonus
credit for preventing 180° reversals (snake can't immediately flip into
its own body). Fail if input is not handled or if the snake moves in
only one fixed direction.
