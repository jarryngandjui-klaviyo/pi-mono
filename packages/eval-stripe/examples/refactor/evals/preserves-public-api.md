---
name: preserves-public-api
description: Refactor should keep the original top-level function names callable
kind: deterministic
activate:
  any:
    - user_message_regex: "refactor|user_manager"
    - assistant_regex: "user_manager"
check: |
  const required = [
    'add_user', 'get_user', 'get_users_by_role', 'remove_user',
    'deactivate_user', 'activate_user', 'update_email',
    'save_to_file', 'load_from_file',
  ];
  const writes = toolCalls.filter(
    (t) => t.name === 'write' || t.name === 'edit'
  );
  const corpus = writes
    .map((t) => String(t.args?.content ?? t.args?.new_string ?? ''))
    .join('\n');
  return required.every((name) => new RegExp(`\\bdef\\s+${name}\\b`).test(corpus));
---

Every top-level callable from the original `user_manager.py` must still
be defined somewhere in the refactored code — `add_user`, `get_user`,
`get_users_by_role`, `remove_user`, `deactivate_user`, `activate_user`,
`update_email`, `save_to_file`, `load_from_file`. Consumers must still
be able to call the same functions, even if they live in different
modules now.
