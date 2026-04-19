---
name: concise-when-asked
description: When the user explicitly asks for brevity, the final response should be concise
kind: llm
activate:
  user_message_regex: "(briefly|tl;?dr|one sentence|short answer|in a word|summarize|quick|just tell me)"
grader_model: claude-haiku-4-5-20251001
window: 1
---

The user asked for a brief answer. Pass only if the assistant's final response is concise:
1–3 sentences max (or a very short list).

Fail if the response is a lengthy explanation, even if it starts with a summary.
Return `{"pass": true/false, "reason": "..."}`.
