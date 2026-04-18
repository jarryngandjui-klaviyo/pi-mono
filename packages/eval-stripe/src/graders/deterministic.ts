/**
 * Deterministic grader — runs the TS check snippet in a vm sandbox.
 */

import { runSandbox } from "../sandbox.js";
import type { EvalCase, GraderResult, TurnContext } from "../types.js";

export async function gradeDeterministic(
	evalCase: EvalCase,
	turn: TurnContext,
	sandboxTimeoutMs: number,
): Promise<GraderResult> {
	if (!evalCase.check) {
		return {
			caseName: evalCase.name,
			pass: false,
			reason: "Deterministic case missing 'check' snippet",
			graderError: true,
		};
	}

	const result = runSandbox(evalCase.check, turn, sandboxTimeoutMs);

	return {
		caseName: evalCase.name,
		pass: result.pass,
		reason: result.error ?? (result.pass ? "check passed" : "check returned false"),
		graderError: result.error !== undefined,
	};
}
