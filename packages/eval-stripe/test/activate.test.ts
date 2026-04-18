import { describe, expect, it } from "vitest";
import { evaluate } from "../src/activate.js";
import type { ActivatePredicate, TurnContext } from "../src/types.js";

const baseTurn: TurnContext = {
	user: "Please edit the file briefly",
	assistant: "Done editing.",
	toolCalls: [
		{ name: "read", args: { file_path: "foo.ts" }, id: "tc1" },
		{ name: "edit", args: { file_path: "foo.ts" }, id: "tc2" },
	],
	toolResults: [
		{ id: "tc1", output: "content" },
		{ id: "tc2", output: "edited" },
	],
	durationMs: 1200,
	modelUsed: "claude-haiku-4-5-20251001",
};

describe("evaluate()", () => {
	it("returns true for undefined predicate (always activates)", () => {
		expect(evaluate(undefined, baseTurn)).toBe(true);
	});

	describe("any_tool", () => {
		it("matches when tool name exists in toolCalls", () => {
			expect(evaluate({ any_tool: "edit" }, baseTurn)).toBe(true);
		});

		it("does not match when tool name absent", () => {
			expect(evaluate({ any_tool: "bash" }, baseTurn)).toBe(false);
		});
	});

	describe("no_tool", () => {
		it("returns true when tool is absent", () => {
			expect(evaluate({ no_tool: "bash" }, baseTurn)).toBe(true);
		});

		it("returns false when tool is present", () => {
			expect(evaluate({ no_tool: "edit" }, baseTurn)).toBe(false);
		});
	});

	describe("user_message_regex", () => {
		it("matches against user message (case-insensitive)", () => {
			expect(evaluate({ user_message_regex: "briefly" }, baseTurn)).toBe(true);
		});

		it("does not match non-present text", () => {
			expect(evaluate({ user_message_regex: "delete everything" }, baseTurn)).toBe(false);
		});

		it("handles invalid regex gracefully (returns false)", () => {
			expect(evaluate({ user_message_regex: "[invalid(regex" }, baseTurn)).toBe(false);
		});
	});

	describe("assistant_regex", () => {
		it("matches against assistant message", () => {
			expect(evaluate({ assistant_regex: "Done" }, baseTurn)).toBe(true);
		});

		it("does not match absent text", () => {
			expect(evaluate({ assistant_regex: "error occurred" }, baseTurn)).toBe(false);
		});
	});

	describe("min_tool_calls", () => {
		it("passes when tool count meets minimum", () => {
			expect(evaluate({ min_tool_calls: 2 }, baseTurn)).toBe(true);
		});

		it("passes when tool count exceeds minimum", () => {
			expect(evaluate({ min_tool_calls: 1 }, baseTurn)).toBe(true);
		});

		it("fails when tool count is below minimum", () => {
			expect(evaluate({ min_tool_calls: 5 }, baseTurn)).toBe(false);
		});
	});

	describe("max_tool_calls", () => {
		it("passes when tool count meets maximum", () => {
			expect(evaluate({ max_tool_calls: 2 }, baseTurn)).toBe(true);
		});

		it("fails when tool count exceeds maximum", () => {
			expect(evaluate({ max_tool_calls: 1 }, baseTurn)).toBe(false);
		});
	});

	describe("all combinator", () => {
		it("returns true when all sub-predicates pass", () => {
			const pred: ActivatePredicate = {
				all: [{ any_tool: "edit" }, { min_tool_calls: 2 }],
			};
			expect(evaluate(pred, baseTurn)).toBe(true);
		});

		it("returns false when any sub-predicate fails", () => {
			const pred: ActivatePredicate = {
				all: [{ any_tool: "edit" }, { any_tool: "bash" }],
			};
			expect(evaluate(pred, baseTurn)).toBe(false);
		});
	});

	describe("any combinator", () => {
		it("returns true when any sub-predicate passes", () => {
			const pred: ActivatePredicate = {
				any: [{ any_tool: "bash" }, { any_tool: "edit" }],
			};
			expect(evaluate(pred, baseTurn)).toBe(true);
		});

		it("returns false when all sub-predicates fail", () => {
			const pred: ActivatePredicate = {
				any: [{ any_tool: "bash" }, { any_tool: "write" }],
			};
			expect(evaluate(pred, baseTurn)).toBe(false);
		});
	});

	describe("not combinator", () => {
		it("negates a passing predicate", () => {
			expect(evaluate({ not: { any_tool: "edit" } }, baseTurn)).toBe(false);
		});

		it("negates a failing predicate", () => {
			expect(evaluate({ not: { any_tool: "bash" } }, baseTurn)).toBe(true);
		});
	});

	it("handles nested combinators", () => {
		const pred: ActivatePredicate = {
			all: [{ any: [{ any_tool: "edit" }, { any_tool: "write" }] }, { not: { any_tool: "bash" } }],
		};
		expect(evaluate(pred, baseTurn)).toBe(true);
	});
});
