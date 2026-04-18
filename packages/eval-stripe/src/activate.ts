/**
 * Activate predicate evaluator.
 *
 * Evaluates the YAML activate predicate language against a TurnContext.
 * Returns true if the case should run for this turn.
 */

import type { ActivatePredicate, TurnContext } from "./types.js";

/**
 * Evaluate an activation predicate against a turn.
 * Returns true when the case should run (i.e., it activates).
 * A missing predicate always activates.
 */
export function evaluate(predicate: ActivatePredicate | undefined, turn: TurnContext): boolean {
	if (predicate === undefined) return true;

	if ("any_tool" in predicate) {
		return turn.toolCalls.some((t) => t.name === predicate.any_tool);
	}

	if ("no_tool" in predicate) {
		return !turn.toolCalls.some((t) => t.name === predicate.no_tool);
	}

	if ("user_message_regex" in predicate) {
		try {
			return new RegExp(predicate.user_message_regex, "i").test(turn.user);
		} catch {
			return false;
		}
	}

	if ("assistant_regex" in predicate) {
		try {
			return new RegExp(predicate.assistant_regex, "i").test(turn.assistant);
		} catch {
			return false;
		}
	}

	if ("min_tool_calls" in predicate) {
		return turn.toolCalls.length >= predicate.min_tool_calls;
	}

	if ("max_tool_calls" in predicate) {
		return turn.toolCalls.length <= predicate.max_tool_calls;
	}

	if ("all" in predicate) {
		return predicate.all.every((p) => evaluate(p, turn));
	}

	if ("any" in predicate) {
		return predicate.any.some((p) => evaluate(p, turn));
	}

	if ("not" in predicate) {
		return !evaluate(predicate.not, turn);
	}

	// Unknown predicate shape — safe default is to activate
	return true;
}
