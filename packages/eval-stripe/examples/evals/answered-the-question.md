---
name: answered-the-question
description: The assistant's response addressed the user's actual question
kind: llm
---

The user sent a message. The assistant responded.

Pass if the assistant's response clearly and directly addresses what the user asked for.
Fail if the response is off-topic, deflects without answering, or only addresses a
rephrased version of the question.

Tip: it's OK if the assistant also did extra things (like editing files) — as long
as the user's core ask was answered.

Return `{"pass": true/false, "reason": "..."}`.
