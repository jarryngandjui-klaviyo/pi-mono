import { describe, expect, it } from "vitest";
import { runSandbox } from "../src/sandbox.js";
import type { TurnContext } from "../src/types.js";

const turn: TurnContext = {
	user: "edit this file",
	assistant: "Done",
	toolCalls: [
		{ name: "read", args: { file_path: "a.ts" }, id: "tc1" },
		{ name: "edit", args: { file_path: "a.ts" }, id: "tc2" },
	],
	toolResults: [
		{ id: "tc1", output: "content" },
		{ id: "tc2", output: "ok" },
	],
	durationMs: 500,
	modelUsed: "claude-haiku-4-5-20251001",
};

describe("runSandbox()", () => {
	it("returns pass=true for a snippet that returns true", () => {
		const result = runSandbox("return true;", turn);
		expect(result.pass).toBe(true);
		expect(result.error).toBeUndefined();
	});

	it("returns pass=false for a snippet that returns false", () => {
		const result = runSandbox("return false;", turn);
		expect(result.pass).toBe(false);
		expect(result.error).toBeUndefined();
	});

	it("has access to TurnContext globals", () => {
		const snippet = `
      const edits = toolCalls.filter(t => t.name === 'edit').map(t => t.args.file_path);
      const reads = toolCalls.filter(t => t.name === 'read').map(t => t.args.file_path);
      return edits.every(p => reads.includes(p));
    `;
		const result = runSandbox(snippet, turn);
		expect(result.pass).toBe(true);
	});

	it("fails when snippet uses reads-before-edit pattern and it is violated", () => {
		const noReadTurn: TurnContext = {
			...turn,
			toolCalls: [{ name: "edit", args: { file_path: "b.ts" }, id: "tc3" }],
		};
		const snippet = `
      const edits = toolCalls.filter(t => t.name === 'edit').map(t => t.args.file_path);
      const reads = toolCalls.filter(t => t.name === 'read').map(t => t.args.file_path);
      return edits.every(p => reads.includes(p));
    `;
		const result = runSandbox(snippet, noReadTurn);
		expect(result.pass).toBe(false);
	});

	it("returns error when snippet throws", () => {
		const result = runSandbox("throw new Error('boom');", turn);
		expect(result.pass).toBe(false);
		expect(result.error).toContain("boom");
	});

	it("times out at sandboxTimeoutMs", () => {
		// Infinite loop
		const result = runSandbox("while(true){}", turn, 50);
		expect(result.pass).toBe(false);
		expect(result.error).toContain("timed out");
	});

	it("denies access to process", () => {
		const result = runSandbox("return typeof process === 'undefined';", turn);
		expect(result.pass).toBe(true);
	});

	it("denies access to require", () => {
		const result = runSandbox("return typeof require === 'undefined';", turn);
		expect(result.pass).toBe(true);
	});

	it("denies access to global fs", () => {
		const result = runSandbox("return typeof fs === 'undefined';", turn);
		expect(result.pass).toBe(true);
	});

	it("returns error when snippet does not return a boolean", () => {
		const result = runSandbox("return 42;", turn);
		expect(result.pass).toBe(false);
		expect(result.error).toContain("boolean");
	});

	it("works with user, assistant, durationMs, modelUsed globals", () => {
		const result = runSandbox(
			`return typeof user === 'string' && typeof assistant === 'string' && typeof durationMs === 'number' && typeof modelUsed === 'string';`,
			turn,
		);
		expect(result.pass).toBe(true);
	});
});
