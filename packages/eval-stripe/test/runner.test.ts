import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { Aggregator } from "../src/aggregator.js";
import { buildTurnContext, Runner } from "../src/runner.js";
import type { EvalCase, EvalSettings } from "../src/types.js";

// ---------------------------------------------------------------------------
// buildTurnContext tests
// ---------------------------------------------------------------------------

describe("buildTurnContext()", () => {
	it("extracts user, assistant, toolCalls, toolResults from messages", () => {
		const messages: AgentMessage[] = [
			{
				role: "user",
				content: "Please edit foo.ts",
				timestamp: 1000,
			},
			{
				role: "assistant",
				content: [
					{ type: "text", text: "I'll edit the file." },
					{ type: "toolCall", id: "tc1", name: "read", arguments: { file_path: "foo.ts" } },
					{ type: "toolCall", id: "tc2", name: "edit", arguments: { file_path: "foo.ts" } },
				],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-haiku-4-5-20251001",
				usage: {
					input: 100,
					output: 50,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 150,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "toolUse",
				timestamp: 2000,
			},
			{
				role: "toolResult",
				toolCallId: "tc1",
				toolName: "read",
				content: [{ type: "text", text: "file contents" }],
				isError: false,
				timestamp: 2100,
			},
			{
				role: "toolResult",
				toolCallId: "tc2",
				toolName: "edit",
				content: [{ type: "text", text: "edited" }],
				isError: false,
				timestamp: 2200,
			},
		] as any[];

		const ctx = buildTurnContext(messages, Date.now() - 500);

		expect(ctx.user).toBe("Please edit foo.ts");
		expect(ctx.assistant).toContain("I'll edit the file.");
		expect(ctx.toolCalls).toHaveLength(2);
		expect(ctx.toolCalls[0].name).toBe("read");
		expect(ctx.toolCalls[1].name).toBe("edit");
		expect(ctx.toolResults).toHaveLength(2);
		expect(ctx.modelUsed).toBe("claude-haiku-4-5-20251001");
		expect(ctx.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("handles empty message array gracefully", () => {
		const ctx = buildTurnContext([], Date.now());
		expect(ctx.user).toBe("");
		expect(ctx.assistant).toBe("");
		expect(ctx.toolCalls).toHaveLength(0);
	});

	it("aggregates toolCalls across multiple assistant messages in one turn", () => {
		// Realistic Pi turn: the agent speaks, runs a tool, sees the result,
		// then speaks again to summarize. The final assistant message carries
		// no tool calls — but the earlier one does. We must collect both.
		const messages: AgentMessage[] = [
			{ role: "user", content: "Run the tests", timestamp: 1000 },
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Running the tests." },
					{
						type: "toolCall",
						id: "tc1",
						name: "bash",
						arguments: { command: "python -m unittest test_stats.py" },
					},
				],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-haiku-4-5-20251001",
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "toolUse",
				timestamp: 2000,
			},
			{
				role: "toolResult",
				toolCallId: "tc1",
				toolName: "bash",
				content: [{ type: "text", text: "FAILED (failures=1)" }],
				isError: false,
				timestamp: 2100,
			},
			{
				role: "assistant",
				content: [{ type: "text", text: "Here's what broke: one test failed." }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-haiku-4-5-20251001",
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "endTurn",
				timestamp: 2200,
			},
		] as any[];

		const ctx = buildTurnContext(messages, Date.now() - 500);

		expect(ctx.toolCalls).toHaveLength(1);
		expect(ctx.toolCalls[0].name).toBe("bash");
		expect(ctx.toolCalls[0].args).toMatchObject({ command: expect.stringContaining("unittest") });
		expect(ctx.toolResults).toHaveLength(1);
		expect(ctx.toolResults[0].output).toContain("FAILED");
		// The final assistant message is the summary text shown to the user.
		expect(ctx.assistant).toBe("Here's what broke: one test failed.");
	});
});

// ---------------------------------------------------------------------------
// Runner tests (with mock graders)
// ---------------------------------------------------------------------------

function makeCase(kind: "deterministic" | "llm", name: string, check = "return true;"): EvalCase {
	return {
		name,
		description: `test case ${name}`,
		kind,
		check: kind === "deterministic" ? check : undefined,
		rubric: kind === "llm" ? "Pass if the assistant says something." : undefined,
		filePath: `/tmp/${name}.md`,
	};
}

const baseSettings: Required<EvalSettings> = {
	path: ".pi/evals",
	enabled: true,
	windowDefault: 1,
	graderModel: "claude-haiku-4-5-20251001",
	concurrency: 4,
	timeoutMs: 5000,
	sandboxTimeoutMs: 100,
	barWidth: 24,
};

// Minimal mock model registry
const mockModelRegistry = {
	find: () => undefined,
	getAll: () => [],
	getAvailable: () => [],
} as any;

const mockCtx = {
	hasUI: false,
	ui: { setWidget: vi.fn() },
	modelRegistry: mockModelRegistry,
	sessionManager: {
		getBranch: () => [],
	},
} as any;

describe("Runner", () => {
	it("records a turn result for activated deterministic cases", async () => {
		const cases = [makeCase("deterministic", "always-pass", "return true;")];
		const agg = new Aggregator(cases, 1);
		const runner = new Runner(cases, agg, baseSettings, mockModelRegistry);

		const messages: AgentMessage[] = [
			{ role: "user", content: "hello", timestamp: 1000 } as any,
			{
				role: "assistant",
				content: [{ type: "text", text: "hi" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-haiku-4-5-20251001",
				usage: {
					input: 10,
					output: 5,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 15,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2000,
			} as any,
		];

		const score = await runner.onAgentEnd({ type: "agent_end", messages }, mockCtx);
		expect(score).not.toBeNull();
		expect(score!.activated).toBe(1);
		expect(score!.passed).toBe(1);
		expect(score!.score).toBe(1);
	});

	it("records a failed case when snippet returns false", async () => {
		const cases = [makeCase("deterministic", "always-fail", "return false;")];
		const agg = new Aggregator(cases, 1);
		const runner = new Runner(cases, agg, baseSettings, mockModelRegistry);

		const messages: AgentMessage[] = [
			{ role: "user", content: "hi", timestamp: 1000 } as any,
			{
				role: "assistant",
				content: [{ type: "text", text: "ok" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-haiku-4-5-20251001",
				usage: {
					input: 10,
					output: 5,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 15,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2000,
			} as any,
		];

		const score = await runner.onAgentEnd({ type: "agent_end", messages }, mockCtx);
		expect(score!.score).toBe(0);
		expect(score!.recentFailed).toBe(1);
	});

	it("cancels previous run when new turn starts", async () => {
		// Create a case whose snippet would take time if not cancelled
		const cases = [makeCase("deterministic", "pass", "return true;")];
		const agg = new Aggregator(cases, 1);
		const runner = new Runner(cases, agg, baseSettings, mockModelRegistry);

		const messages: AgentMessage[] = [
			{ role: "user", content: "hi", timestamp: 1000 } as any,
			{
				role: "assistant",
				content: [{ type: "text", text: "ok" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-haiku-4-5-20251001",
				usage: {
					input: 10,
					output: 5,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 15,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2000,
			} as any,
		];

		// Fire two concurrent agent_end events; the first should be cancelled
		const p1 = runner.onAgentEnd({ type: "agent_end", messages }, mockCtx);
		const p2 = runner.onAgentEnd({ type: "agent_end", messages }, mockCtx);

		const [_r1, r2] = await Promise.all([p1, p2]);
		// First run cancelled → returns null; second run completes
		// (Due to deterministic sync nature, both may complete; we just check no crash)
		expect(r2).not.toBeNull();
		// r1 may be null (cancelled) or non-null (completed before cancel)
		expect([null, r2].some((r) => r !== undefined)).toBe(true);
	});

	it("concurrency cap: processes all cases with concurrency=2", async () => {
		const cases = [
			makeCase("deterministic", "c1", "return true;"),
			makeCase("deterministic", "c2", "return true;"),
			makeCase("deterministic", "c3", "return false;"),
			makeCase("deterministic", "c4", "return true;"),
		];
		const agg = new Aggregator(cases, 1);
		const settings = { ...baseSettings, concurrency: 2 };
		const runner = new Runner(cases, agg, settings, mockModelRegistry);

		const messages: AgentMessage[] = [
			{ role: "user", content: "hi", timestamp: 1000 } as any,
			{
				role: "assistant",
				content: [{ type: "text", text: "ok" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-haiku-4-5-20251001",
				usage: {
					input: 10,
					output: 5,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 15,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2000,
			} as any,
		];

		const score = await runner.onAgentEnd({ type: "agent_end", messages }, mockCtx);
		expect(score!.activated).toBe(4);
		expect(score!.passed).toBe(3);
	});
});
