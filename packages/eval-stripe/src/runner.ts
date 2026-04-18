/**
 * Runner — listens on AgentEndEvent, builds TurnContext, filters by activate,
 * dispatches graders in parallel (capped by concurrency), cancels in-flight
 * runs on new turn.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AgentEndEvent, ExtensionContext, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { evaluate } from "./activate.js";
import type { Aggregator } from "./aggregator.js";
import { gradeDeterministic } from "./graders/deterministic.js";
import { gradeLlm } from "./graders/llm.js";
import type { AggregatedScore, EvalCase, EvalSettings, GraderResult, TurnContext, TurnResult } from "./types.js";

let _turnCounter = 0;

/**
 * Build a TurnContext from the messages in an AgentEndEvent.
 *
 * We scan backwards from the end of the messages array to find:
 * - The last user message
 * - The last assistant message
 * - All tool calls + results from the most recent agent turn
 */
export function buildTurnContext(messages: AgentMessage[], turnStartMs: number): TurnContext {
	// Find the last user message
	let user = "";
	let assistant = "";
	const toolCalls: TurnContext["toolCalls"] = [];
	const toolResults: TurnContext["toolResults"] = [];
	let modelUsed = "unknown";

	// Walk messages to reconstruct the most recent turn.
	// A "turn" is everything from the last user message forward: possibly
	// multiple assistant messages interleaved with toolResult messages.
	// `assistant` holds the text of the *final* assistant message (the
	// summary shown to the user); `toolCalls` aggregates calls from every
	// assistant message in the turn, in chronological order.
	let turnStartIdx = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		if ((messages[i] as any).role === "user") {
			turnStartIdx = i;
			break;
		}
	}

	const turnMessages = messages.slice(turnStartIdx);
	for (const m of turnMessages) {
		const msg = m as any;
		if (msg.role === "user" && user === "") {
			if (typeof msg.content === "string") {
				user = msg.content;
			} else if (Array.isArray(msg.content)) {
				user = msg.content
					.filter((c: any) => c.type === "text")
					.map((c: any) => c.text as string)
					.join("\n");
			}
		} else if (msg.role === "assistant") {
			const textBlocks = (msg.content ?? [])
				.filter((c: any) => c.type === "text")
				.map((c: any) => c.text as string)
				.join("\n");
			// Keep overwriting so `assistant` ends up as the final text.
			if (textBlocks) assistant = textBlocks;
			modelUsed = msg.model ?? modelUsed;
			const calls = (msg.content ?? []).filter((c: any) => c.type === "toolCall");
			for (const tc of calls) {
				toolCalls.push({
					name: tc.name,
					args: tc.arguments ?? {},
					id: tc.id,
				});
			}
		} else if (msg.role === "toolResult") {
			const textContent = (msg.content ?? [])
				.filter((c: any) => c.type === "text")
				.map((c: any) => c.text as string)
				.join("\n");
			if (toolResults.findIndex((tr) => tr.id === msg.toolCallId) === -1) {
				toolResults.push({
					id: msg.toolCallId,
					output: textContent,
					error: msg.isError ? textContent : undefined,
				});
			}
		}
	}

	const durationMs = Date.now() - turnStartMs;

	return { user, assistant, toolCalls, toolResults, durationMs, modelUsed };
}

export class Runner {
	private cases: EvalCase[];
	private aggregator: Aggregator;
	private settings: Required<EvalSettings>;
	private modelRegistry: ModelRegistry;
	private currentRunController: AbortController | null = null;
	private turnStartMs = 0;

	constructor(
		cases: EvalCase[],
		aggregator: Aggregator,
		settings: Required<EvalSettings>,
		modelRegistry: ModelRegistry,
	) {
		this.cases = cases;
		this.aggregator = aggregator;
		this.settings = settings;
		this.modelRegistry = modelRegistry;
	}

	updateCases(cases: EvalCase[]): void {
		this.cases = cases;
	}

	updateSettings(settings: Required<EvalSettings>): void {
		this.settings = settings;
	}

	notifyAgentStart(): void {
		this.turnStartMs = Date.now();
	}

	/**
	 * Called when AgentEndEvent fires. Cancels any in-flight run, starts a new one.
	 * Returns the updated AggregatedScore or null if eval is disabled / no cases activated.
	 */
	async onAgentEnd(event: AgentEndEvent, ctx: ExtensionContext): Promise<AggregatedScore | null> {
		// Cancel previous run
		if (this.currentRunController) {
			this.currentRunController.abort();
		}
		const controller = new AbortController();
		this.currentRunController = controller;

		const turnId = String(++_turnCounter);
		const turn = buildTurnContext(event.messages, this.turnStartMs || Date.now() - 1000);
		this.turnStartMs = 0;

		// Filter to activated cases
		const activatedCases = this.cases.filter((c) => evaluate(c.activate, turn));

		if (activatedCases.length === 0) {
			// Record a zero-activated turn
			const turnResult: TurnResult = {
				turnId,
				timestamp: Date.now(),
				activated: 0,
				passed: 0,
				failed: 0,
				caseResults: [],
			};
			this.aggregator.push(turnResult);
			return this.aggregator.score();
		}

		// Run graders in parallel, capped by concurrency
		const caseResults = await this.runGraders(activatedCases, turn, controller.signal, ctx);

		// If this run was cancelled, discard results
		if (controller.signal.aborted) {
			return null;
		}

		const passed = caseResults.filter((r) => r.pass).length;
		const failed = caseResults.filter((r) => !r.pass).length;

		const turnResult: TurnResult = {
			turnId,
			timestamp: Date.now(),
			activated: activatedCases.length,
			passed,
			failed,
			caseResults,
		};

		this.aggregator.push(turnResult);
		return this.aggregator.score();
	}

	private async runGraders(
		cases: EvalCase[],
		turn: TurnContext,
		signal: AbortSignal,
		ctx: ExtensionContext,
	): Promise<GraderResult[]> {
		const results: GraderResult[] = [];
		const concurrency = this.settings.concurrency;

		// Process in batches of `concurrency`
		for (let i = 0; i < cases.length; i += concurrency) {
			if (signal.aborted) break;

			const batch = cases.slice(i, i + concurrency);
			const batchResults = await Promise.all(batch.map((c) => this.gradeOne(c, turn, signal, ctx)));
			results.push(...batchResults);
		}

		return results;
	}

	private async gradeOne(
		evalCase: EvalCase,
		turn: TurnContext,
		signal: AbortSignal,
		_ctx: ExtensionContext,
	): Promise<GraderResult> {
		if (signal.aborted) {
			return { caseName: evalCase.name, pass: false, reason: "Run cancelled", graderError: true };
		}

		try {
			if (evalCase.kind === "deterministic") {
				return await gradeDeterministic(evalCase, turn, this.settings.sandboxTimeoutMs);
			} else {
				return await gradeLlm(
					evalCase,
					turn,
					this.modelRegistry,
					this.settings.graderModel,
					this.settings.timeoutMs,
					signal,
				);
			}
		} catch (err) {
			return {
				caseName: evalCase.name,
				pass: false,
				reason: `Unexpected grader error: ${err instanceof Error ? err.message : String(err)}`,
				graderError: true,
			};
		}
	}

	/** Force-run all cases against the most recent turn (for /eval run command) */
	async forceRun(ctx: ExtensionContext): Promise<TurnResult | null> {
		// We don't have a stored turn; this is a best-effort force run
		// It uses the session manager to reconstruct from the last messages
		const sessionMessages = ctx.sessionManager.getBranch();
		if (sessionMessages.length === 0) return null;

		// Convert session entries to AgentMessages
		const messages: AgentMessage[] = sessionMessages
			.filter((e) => e.type === "message")
			.map((e) => (e as any).message);

		if (messages.length === 0) return null;

		const syntheticEvent: AgentEndEvent = { type: "agent_end", messages };
		const score = await this.onAgentEnd(syntheticEvent, ctx);
		if (score === null) return null;

		// Return the most recent turn result from the aggregator
		return this.aggregator.getLastTurnResult();
	}

	getLastTurnResult(): TurnResult | null {
		return this.aggregator.getLastTurnResult();
	}
}
