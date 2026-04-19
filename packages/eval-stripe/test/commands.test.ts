import { describe, expect, it, vi } from "vitest";
import type { CommandDeps } from "../src/commands.js";
import { registerEvalCommands } from "../src/commands.js";
import type { EvalCase, EvalSettings } from "../src/types.js";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeCtx() {
	const notifications: Array<{ message: string; type?: string }> = [];
	return {
		notifications,
		cwd: "/tmp/test-cwd",
		ui: {
			notify: (message: string, type?: string) => {
				notifications.push({ message, type });
			},
			setWidget: vi.fn(),
		},
		hasUI: true,
		sessionManager: {} as any,
		modelRegistry: {} as any,
		model: undefined,
		isIdle: () => true,
		signal: undefined,
		abort: vi.fn(),
		hasPendingMessages: () => false,
		shutdown: vi.fn(),
		getContextUsage: () => undefined,
		compact: vi.fn(),
		getSystemPrompt: () => "",
		waitForIdle: async () => {},
		newSession: async () => ({ cancelled: false }),
		fork: async () => ({ cancelled: false }),
		navigateTree: async () => ({ cancelled: false }),
		switchSession: async () => ({ cancelled: false }),
		reload: async () => {},
	};
}

function makeDeps(overrides: Partial<CommandDeps> = {}): CommandDeps {
	return {
		getRunner: () => null,
		getAggregator: () =>
			({
				score: () => null,
				getRecentResults: () => [],
				getLastTurnResult: () => null,
			}) as any,
		getSettings: () => ({
			path: ".pi/evals",
			enabled: true,
			windowDefault: 1,
			aggregatorDefault: "last",
			graderModel: "claude-haiku-4-5-20251001",
			concurrency: 4,
			timeoutMs: 5000,
			sandboxTimeoutMs: 100,
			barWidth: 24,
		}),
		setSettings: vi.fn(),
		getLastScore: () => null,
		getCases: () => [],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// /eval list
// ---------------------------------------------------------------------------

describe("/eval list", () => {
	it("shows empty-state message when no cases loaded", async () => {
		const ctx = makeCtx();
		const deps = makeDeps({ getCases: () => [] });

		// Register commands and invoke the list handler directly
		const handlers: Array<(args: string, ctx: any) => Promise<void>> = [];
		const pi = {
			registerCommand: (_name: string, opts: any) => {
				handlers.push(opts.handler);
			},
		} as any;

		registerEvalCommands(pi, deps);
		await handlers[0]("list", ctx as any);

		expect(ctx.notifications).toHaveLength(1);
		expect(ctx.notifications[0].message).toContain("no cases loaded");
		expect(ctx.notifications[0].message).toContain("evals.path");
		expect(ctx.notifications[0].type).toBe("warning");
	});

	it("lists case name, kind, and description for each loaded case", async () => {
		const cases: EvalCase[] = [
			{
				name: "reads-before-edit",
				description: "Edits must be preceded by a read",
				kind: "deterministic",
				filePath: "/tmp/reads-before-edit.md",
			},
			{
				name: "concise-when-asked",
				description: "Response is brief when user asks",
				kind: "llm",
				filePath: "/tmp/concise-when-asked.md",
			},
		];

		const ctx = makeCtx();
		const deps = makeDeps({ getCases: () => cases });

		const handlers: Array<(args: string, ctx: any) => Promise<void>> = [];
		const pi = {
			registerCommand: (_name: string, opts: any) => {
				handlers.push(opts.handler);
			},
		} as any;

		registerEvalCommands(pi, deps);
		await handlers[0]("list", ctx as any);

		expect(ctx.notifications).toHaveLength(1);
		const msg = ctx.notifications[0].message;
		expect(msg).toContain("2 case(s) loaded");
		expect(msg).toContain("reads-before-edit");
		expect(msg).toContain("deterministic");
		expect(msg).toContain("Edits must be preceded by a read");
		expect(msg).toContain("concise-when-asked");
		expect(msg).toContain("llm");
		expect(msg).toContain("Response is brief when user asks");
	});
});

// ---------------------------------------------------------------------------
// /eval aggregator
// ---------------------------------------------------------------------------

describe("/eval aggregator", () => {
	it("shows current aggregatorDefault when no arg", async () => {
		const ctx = makeCtx();
		const settings: Required<EvalSettings> = {
			path: ".pi/evals",
			enabled: true,
			windowDefault: 1,
			aggregatorDefault: "last" as const,
			graderModel: "claude-haiku-4-5-20251001",
			concurrency: 4,
			timeoutMs: 5000,
			sandboxTimeoutMs: 100,
			barWidth: 24,
		};
		const deps = makeDeps({ getSettings: () => settings });

		const handlers: Array<(args: string, ctx: any) => Promise<void>> = [];
		const pi = {
			registerCommand: (_name: string, opts: any) => {
				handlers.push(opts.handler);
			},
		} as any;

		registerEvalCommands(pi, deps);
		await handlers[0]("aggregator", ctx as any);

		expect(ctx.notifications).toHaveLength(1);
		expect(ctx.notifications[0].message).toContain("aggregatorDefault = last");
	});

	it("sets aggregatorDefault to 'all' and re-renders widget", async () => {
		const ctx = makeCtx();
		const setSettingsMock = vi.fn();
		const settings: Required<EvalSettings> = {
			path: ".pi/evals",
			enabled: true,
			windowDefault: 1,
			aggregatorDefault: "last" as const,
			graderModel: "claude-haiku-4-5-20251001",
			concurrency: 4,
			timeoutMs: 5000,
			sandboxTimeoutMs: 100,
			barWidth: 24,
		};
		const deps = makeDeps({ getSettings: () => settings, setSettings: setSettingsMock });

		const handlers: Array<(args: string, ctx: any) => Promise<void>> = [];
		const pi = {
			registerCommand: (_name: string, opts: any) => {
				handlers.push(opts.handler);
			},
		} as any;

		registerEvalCommands(pi, deps);
		await handlers[0]("aggregator all", ctx as any);

		expect(setSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ aggregatorDefault: "all" }));
		expect(ctx.notifications[0].message).toContain("aggregatorDefault set to all");
	});

	it("rejects invalid aggregator value", async () => {
		const ctx = makeCtx();
		const deps = makeDeps();

		const handlers: Array<(args: string, ctx: any) => Promise<void>> = [];
		const pi = {
			registerCommand: (_name: string, opts: any) => {
				handlers.push(opts.handler);
			},
		} as any;

		registerEvalCommands(pi, deps);
		await handlers[0]("aggregator invalid", ctx as any);

		expect(ctx.notifications).toHaveLength(1);
		expect(ctx.notifications[0].message).toContain("expected 'all' or 'last'");
		expect(ctx.notifications[0].type).toBe("warning");
	});
});
