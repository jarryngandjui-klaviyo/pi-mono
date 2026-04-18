/**
 * LLM grader — calls the grader model with a rubric + TurnContext and expects
 * { pass: boolean, reason: string } in the response.
 *
 * Uses @mariozechner/pi-ai's completeSimple() with temperature=0.
 */

import { completeSimple } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { EvalCase, GraderResult, TurnContext } from "../types.js";

const GRADER_SYSTEM_PROMPT = `You are a strict binary evaluator for an AI coding assistant.
You will be given a rubric describing what PASS looks like, and a transcript of one agent turn.
Respond with ONLY a JSON object in this exact format:
{"pass": <true or false>, "reason": "<one sentence explanation>"}

Be concise. Do not include any text outside the JSON object.`;

function buildGraderPrompt(rubric: string, turn: TurnContext): string {
	const lines: string[] = [
		"## Rubric",
		"",
		rubric,
		"",
		"## Turn Transcript",
		"",
		`**User message:** ${turn.user}`,
		"",
		`**Assistant response:** ${turn.assistant}`,
		"",
	];

	if (turn.toolCalls.length > 0) {
		lines.push("**Tool calls:**");
		for (const tc of turn.toolCalls) {
			lines.push(`- ${tc.name}(${JSON.stringify(tc.args).slice(0, 200)})`);
		}
		lines.push("");
	}

	if (turn.toolResults.length > 0) {
		lines.push("**Tool results:**");
		for (const tr of turn.toolResults) {
			const preview = tr.output.slice(0, 200);
			const suffix = tr.output.length > 200 ? "..." : "";
			if (tr.error) {
				lines.push(`- [ERROR] ${tr.id}: ${tr.error}`);
			} else {
				lines.push(`- ${tr.id}: ${preview}${suffix}`);
			}
		}
		lines.push("");
	}

	lines.push(
		`**Duration:** ${turn.durationMs}ms`,
		`**Model:** ${turn.modelUsed}`,
		"",
		'Respond with ONLY the JSON object: {"pass": <true|false>, "reason": "..."}',
	);

	return lines.join("\n");
}

function parseGraderResponse(text: string): { pass: boolean; reason: string } | null {
	// Try to extract JSON from the response
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return null;

	try {
		const parsed = JSON.parse(jsonMatch[0]);
		if (typeof parsed.pass === "boolean" && typeof parsed.reason === "string") {
			return { pass: parsed.pass, reason: parsed.reason };
		}
		return null;
	} catch {
		return null;
	}
}

export async function gradeLlm(
	evalCase: EvalCase,
	turn: TurnContext,
	modelRegistry: ModelRegistry,
	defaultGraderModel: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<GraderResult> {
	const rubric = evalCase.rubric;
	if (!rubric) {
		return {
			caseName: evalCase.name,
			pass: false,
			reason: "LLM case missing rubric body",
			graderError: true,
		};
	}

	const targetModelId = evalCase.graderModel ?? defaultGraderModel;

	// Find the model in the registry — try anthropic provider first
	let model = modelRegistry.find("anthropic", targetModelId);
	if (!model) {
		// Fall back to any provider that has this model ID
		model = modelRegistry.getAll().find((m) => m.id === targetModelId);
	}
	if (!model) {
		return {
			caseName: evalCase.name,
			pass: false,
			reason: `Grader model '${targetModelId}' not found in model registry`,
			graderError: true,
		};
	}

	const prompt = buildGraderPrompt(rubric, turn);
	const messages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: prompt }],
			timestamp: Date.now(),
		},
	];

	const auth = await modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		return {
			caseName: evalCase.name,
			pass: false,
			reason: `Grader auth error: ${auth.error}`,
			graderError: true,
		};
	}

	const gradeOnce = async (): Promise<GraderResult> => {
		const response = await completeSimple(
			model!,
			{ systemPrompt: GRADER_SYSTEM_PROMPT, messages },
			{ temperature: 0, signal, apiKey: auth.apiKey, headers: auth.headers },
		);

		if (response.stopReason === "error" || response.stopReason === "aborted") {
			throw new Error(response.errorMessage ?? "Grader request failed");
		}

		const textContent = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");

		const parsed = parseGraderResponse(textContent);
		if (!parsed) {
			throw new Error(`Grader returned unparseable response: ${textContent.slice(0, 200)}`);
		}

		return {
			caseName: evalCase.name,
			pass: parsed.pass,
			reason: parsed.reason,
		};
	};

	// One retry on failure
	let attempt = 0;
	while (attempt < 2) {
		try {
			let timerId: ReturnType<typeof setTimeout> | undefined;
			const timeoutPromise = new Promise<never>((_, reject) => {
				timerId = setTimeout(() => reject(new Error(`Grader timed out after ${timeoutMs}ms`)), timeoutMs);
			});
			const result = await Promise.race([gradeOnce().finally(() => clearTimeout(timerId)), timeoutPromise]);
			clearTimeout(timerId);
			return result;
		} catch (err) {
			attempt++;
			if (attempt >= 2 || signal?.aborted) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					caseName: evalCase.name,
					pass: false,
					reason: `Grader error: ${msg}`,
					graderError: true,
				};
			}
			// Brief pause before retry
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}

	// Should not reach here
	return {
		caseName: evalCase.name,
		pass: false,
		reason: "Grader exhausted retries",
		graderError: true,
	};
}
