/**
 * Sandboxed TypeScript snippet executor.
 *
 * Uses Node's built-in `vm.runInNewContext` to execute a deterministic check
 * snippet in an isolated context. The snippet must return a boolean.
 *
 * Security posture: this is a convenience sandbox against accidental bugs
 * (infinite loops, typos), NOT a security boundary. Cases are user-authored
 * local files — trusted code.
 *
 * Restrictions:
 * - No access to `require`, `process`, `fs`, or any Node global
 * - 100ms default timeout (configurable via timeoutMs)
 * - The snippet receives TurnContext fields as globals
 */

import { runInNewContext } from "vm";
import type { TurnContext } from "./types.js";

export interface SandboxResult {
	pass: boolean;
	error?: string;
}

/**
 * Execute a deterministic check snippet against the given turn context.
 *
 * The snippet is wrapped in a function body so `return` works at the top
 * level. The sandbox globals are the TurnContext fields only.
 */
export function runSandbox(snippet: string, turn: TurnContext, timeoutMs = 100): SandboxResult {
	// Wrap snippet in an IIFE so `return` is valid
	const wrappedCode = `(function() { ${snippet} })()`;

	// Provide only the TurnContext fields — no Node globals
	const sandbox: Record<string, unknown> = {
		user: turn.user,
		assistant: turn.assistant,
		toolCalls: turn.toolCalls,
		toolResults: turn.toolResults,
		durationMs: turn.durationMs,
		modelUsed: turn.modelUsed,
		// Safe primitives
		JSON: JSON,
		Math: Math,
		Array: Array,
		Object: Object,
		String: String,
		Number: Number,
		Boolean: Boolean,
		RegExp: RegExp,
		parseInt: parseInt,
		parseFloat: parseFloat,
		isNaN: Number.isNaN,
		isFinite: Number.isFinite,
		undefined: undefined,
		null: null,
		true: true,
		false: false,
	};

	try {
		const result = runInNewContext(wrappedCode, sandbox, { timeout: timeoutMs });
		if (typeof result !== "boolean") {
			return {
				pass: false,
				error: `Check snippet must return a boolean, got: ${typeof result} (${String(result)})`,
			};
		}
		return { pass: result };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const isTimeout = msg.includes("Script execution timed out") || msg.includes("ERR_SCRIPT_EXECUTION_TIMEOUT");
		return {
			pass: false,
			error: isTimeout ? `Sandbox timed out after ${timeoutMs}ms` : `Snippet error: ${msg}`,
		};
	}
}
