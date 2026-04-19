# Snake-game demo

Eight domain-specific eval cases that grade an agent building a snake game.
Designed to pair with a six-turn demo that makes the bar move visibly — some
turns pass, one deliberately regresses, the last brings everything green.

## Setup

From the repo root:

```bash
./packages/eval-stripe/scripts/bootstrap-demo.sh snake
```

That preps `~/tmp/snake/` with the 8 eval cases and a
`.pi/settings.json` pointing at the built extension, then launches Pi
in it. Default `windowDefault: 1` is what this demo wants — each bar
reading reflects only the current turn, so the movement tells a story
prompt-by-prompt.

Six feature-presence cases (`snake-handles-collisions`,
`snake-handles-keyboard-input`, `snake-has-food-mechanic`,
`snake-has-game-over-condition`, `snake-no-stubs-or-todos`,
`snake-uses-game-loop`) override to `window: -1` in their frontmatter so
a feature that was added in an earlier turn still contributes to the
session-level signal even when later turns don't mention it explicitly.

First time: build the extension once with
`cd packages/eval-stripe && npm run build`.

## The six-turn arc

Include the word "snake" in every prompt so the deterministic cases activate
(they're scoped to user-message mentions). LLM cases fire on either the user
message or the assistant response mentioning "snake", so they carry through
follow-ups.

| # | Prompt | Passes | Fails | Expected bar |
|---|---|---|---|---|
| 1 | `Start a snake game — create a single snake.html file with a canvas element and a green square to represent the snake head. No game logic yet.` | creates-game-file | game-loop, collisions, food, input, game-over, no-stubs, ran | ~15%, deep yellow |
| 2 | `Add a game loop to the snake that redraws the canvas every 150ms and moves the snake head to the right.` | creates-game-file, game-loop | collisions, food, input, game-over | ~30%, yellow-orange |
| 3 | `Wire up arrow keys so the snake changes direction. Prevent 180° reversals so it can't turn directly into itself.` | game-loop, keyboard-input | collisions, food, game-over | ~45%, mid |
| 4 | **Regression:** `For debugging, temporarily comment out any collision detection in the snake game — just let it phase through the walls and its own body.` | game-loop, keyboard-input | collisions, game-over explicitly broken | drops back to ~25% — the visual hook |
| 5 | `Restore the collision checks, add food that spawns randomly, and make the snake grow and the score increase when it eats food.` | collisions, food, game-over, game-loop, keyboard-input | ran | ~75%, yellow-green |
| 6 | `Review the full snake game for any TODOs or stubs, clean it up, and then run it with open snake.html to verify.` | all 8 | — | ~100%, full green |

## Commands to run during the demo

- `/eval list` — before turn 1, prove the 8-case suite loaded.
- `/eval last` — after turn 4, surface which cases flipped red.
- `/eval window -1` — after turn 6, show the cumulative view.

## Tips

- **Rehearse turn 4.** If the bar doesn't pull back, phrase the regression
  more forcefully ("remove collision detection entirely").
- LLM grader rulings are non-deterministic; running the arc twice may show
  slightly different bars. That's expected.
- `asciinema rec` captures terminal color cleanly — better than screen GIFs
  for the #r-and-d-team share-out.
