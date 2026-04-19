import { describe, expect, it } from "vitest";
import { Aggregator } from "../src/aggregator.js";
import type { EvalCase, GraderResult, TurnResult } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCase(name: string, window?: number): EvalCase {
	return {
		name,
		description: `test case ${name}`,
		kind: "deterministic",
		check: "return true;",
		window,
		filePath: `/tmp/${name}.md`,
	};
}

function makeTurn(id: string, caseResults: GraderResult[]): TurnResult {
	const activated = caseResults.length;
	const passed = caseResults.filter((r) => r.pass).length;
	const failed = activated - passed;
	return {
		turnId: id,
		timestamp: Date.now(),
		activated,
		passed,
		failed,
		caseResults,
	};
}

function gr(caseName: string, pass: boolean): GraderResult {
	return { caseName, pass, reason: pass ? "ok" : "fail" };
}

// ---------------------------------------------------------------------------
// 1. Single case, window:1 — regression equivalence with old behaviour
// ---------------------------------------------------------------------------

describe("single case, window:1 (default)", () => {
	it("returns null score when empty", () => {
		const agg = new Aggregator([makeCase("a")], 1);
		const s = agg.score();
		expect(s.score).toBeNull();
		expect(s.activated).toBe(0);
	});

	it("reflects only the most recent activation", () => {
		const agg = new Aggregator([makeCase("a")], 1);
		agg.push(makeTurn("1", [gr("a", false)]));
		agg.push(makeTurn("2", [gr("a", true)]));

		const s = agg.score();
		// window:1 on case "a" — only the last activation counts
		expect(s.activated).toBe(1);
		expect(s.passed).toBe(1);
		expect(s.score).toBe(1);
	});

	it("recentFailed comes from the last turn", () => {
		const agg = new Aggregator([makeCase("a")], 1);
		agg.push(makeTurn("1", [gr("a", false)]));
		expect(agg.score().recentFailed).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 2. Two cases, windows 1 and 5 — per-case slicing
// ---------------------------------------------------------------------------

describe("two cases with different windows", () => {
	it("case A (window:1) vs case B (window:5) — independent slicing", () => {
		// Case A activates every turn; case B every other turn.
		const caseA = makeCase("a", 1); // last 1 activation only
		const caseB = makeCase("b", 5); // last 5 activations

		const agg = new Aggregator([caseA, caseB], 1);

		// Turn 1: both activate
		agg.push(makeTurn("t1", [gr("a", false), gr("b", false)]));
		// Turn 2: both activate
		agg.push(makeTurn("t2", [gr("a", true), gr("b", true)]));
		// Turn 3: only A activates
		agg.push(makeTurn("t3", [gr("a", false)]));

		const s = agg.score();

		// Case A: window:1 → only turn 3's result: 0 passed / 1 activated
		// Case B: window:5 → turns 1+2 results (both within cap of 5): 1 passed / 2 activated
		expect(s.activated).toBe(3); // 1 (a) + 2 (b)
		expect(s.passed).toBe(1); // 0 (a) + 1 (b)
		expect(s.score).toBeCloseTo(1 / 3);
	});
});

// ---------------------------------------------------------------------------
// 3. Mixed window:-1 (session) alongside numeric window — no cross-contamination
// ---------------------------------------------------------------------------

describe("session window (-1) alongside numeric window", () => {
	it("session case accumulates; numeric case slices independently", () => {
		const caseSession = makeCase("session-case", -1);
		const caseFixed = makeCase("fixed-case", 1);

		const agg = new Aggregator([caseSession, caseFixed], 1);

		agg.push(makeTurn("t1", [gr("session-case", true), gr("fixed-case", false)]));
		agg.push(makeTurn("t2", [gr("session-case", true), gr("fixed-case", true)]));

		const s = agg.score();

		// session-case: 2 activations, 2 passed
		// fixed-case: window:1 → only t2 counts: 1 passed / 1 activated
		expect(s.activated).toBe(3); // 2 + 1
		expect(s.passed).toBe(3); // 2 + 1
		expect(s.score).toBe(1);
	});

	it("session and numeric cases don't share history", () => {
		const caseSession = makeCase("s", -1);
		const caseNumeric = makeCase("n", 2);
		const agg = new Aggregator([caseSession, caseNumeric], 1);

		// 3 turns of both activating
		agg.push(makeTurn("t1", [gr("s", false), gr("n", false)]));
		agg.push(makeTurn("t2", [gr("s", false), gr("n", true)]));
		agg.push(makeTurn("t3", [gr("s", true), gr("n", true)]));

		const s = agg.score();

		// s (session): 3 activations, 1 passed
		// n (window:2): last 2 activations (t2+t3): 2 passed / 2 activated
		expect(s.activated).toBe(5); // 3 + 2
		expect(s.passed).toBe(3); // 1 + 2
	});
});

// ---------------------------------------------------------------------------
// 4. Sparse activation — window:3 on a case that activates only twice
// ---------------------------------------------------------------------------

describe("sparse activation", () => {
	it("window:3 case that activated only twice → activated=2, not 3", () => {
		const c = makeCase("c", 3);
		const agg = new Aggregator([c], 1);

		agg.push(makeTurn("t1", [gr("c", true)]));
		agg.push(makeTurn("t2", [])); // c doesn't activate
		agg.push(makeTurn("t3", [gr("c", false)]));

		const s = agg.score();
		expect(s.activated).toBe(2);
		expect(s.passed).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 5. setCases() drops a case — its past contributions no longer count
// ---------------------------------------------------------------------------

describe("setCases()", () => {
	it("dropped case no longer contributes to score()", () => {
		const caseA = makeCase("a");
		const caseB = makeCase("b");
		const agg = new Aggregator([caseA, caseB], 1);

		agg.push(makeTurn("t1", [gr("a", true), gr("b", false)]));

		// score with both: 1 pass + 1 fail
		expect(agg.score().activated).toBe(2);

		// Remove case B
		agg.setCases([caseA]);
		const s = agg.score();
		// Only case A's deque contributes
		expect(s.activated).toBe(1);
		expect(s.passed).toBe(1);
	});

	// 6. setCases() adds a case — contributes 0/0 until it activates
	it("added case contributes nothing until it activates", () => {
		const caseA = makeCase("a");
		const agg = new Aggregator([caseA], 1);

		agg.push(makeTurn("t1", [gr("a", true)]));
		expect(agg.score().activated).toBe(1);

		const caseB = makeCase("b");
		agg.setCases([caseA, caseB]);
		const s = agg.score();
		// Case B has no history yet
		expect(s.activated).toBe(1); // only a
		expect(s.passed).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 7. setWindowDefault() shrinks — deques of inheriting cases trim correctly
// ---------------------------------------------------------------------------

describe("setWindowDefault()", () => {
	it("shrinks deques of cases that inherit the default", () => {
		// caseA has no per-case window (inherits default)
		// caseB has explicit window:5 (should NOT be affected by default change)
		const caseA = makeCase("a"); // inherits default
		const caseB = makeCase("b", 5); // explicit
		const agg = new Aggregator([caseA, caseB], 5);

		// Push 4 activations of both
		for (let i = 1; i <= 4; i++) {
			agg.push(makeTurn(`t${i}`, [gr("a", true), gr("b", true)]));
		}

		// Both should have 4 entries
		expect(agg.score().activated).toBe(8);

		// Shrink default to 2 → caseA trimmed to 2, caseB unchanged
		agg.setWindowDefault(2);
		const s = agg.score();
		// caseA: 2 activations; caseB: 4 activations (explicit window:5, not trimmed)
		expect(s.activated).toBe(6);
		expect(s.passed).toBe(6); // all were passing
	});

	it("does not trim cases with explicit window overrides", () => {
		const caseExplicit = makeCase("explicit", 10);
		const agg = new Aggregator([caseExplicit], 10);

		for (let i = 1; i <= 5; i++) {
			agg.push(makeTurn(`t${i}`, [gr("explicit", true)]));
		}

		// Shrink default — explicit case should keep all 5
		agg.setWindowDefault(1);
		expect(agg.score().activated).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// getLastTurnResult() and getRecentResults()
// ---------------------------------------------------------------------------

describe("getLastTurnResult()", () => {
	it("returns null when empty", () => {
		expect(new Aggregator([], 1).getLastTurnResult()).toBeNull();
	});

	it("returns the most recent turn", () => {
		const agg = new Aggregator([makeCase("a")], 1);
		agg.push(makeTurn("t1", [gr("a", true)]));
		agg.push(makeTurn("t2", [gr("a", false)]));
		expect(agg.getLastTurnResult()?.turnId).toBe("t2");
	});
});

describe("getRecentResults()", () => {
	it("returns last N turns from allTurns", () => {
		const agg = new Aggregator([makeCase("a")], 1);
		agg.push(makeTurn("t1", [gr("a", true)]));
		agg.push(makeTurn("t2", [gr("a", false)]));
		agg.push(makeTurn("t3", [gr("a", true)]));

		const results = agg.getRecentResults(2);
		expect(results).toHaveLength(2);
		expect(results[0].turnId).toBe("t2");
		expect(results[1].turnId).toBe("t3");
	});
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe("reset()", () => {
	it("clears history, allTurns, and lastTurn", () => {
		const agg = new Aggregator([makeCase("a")], 1);
		agg.push(makeTurn("t1", [gr("a", true)]));

		agg.reset();

		expect(agg.score().activated).toBe(0);
		expect(agg.score().score).toBeNull();
		expect(agg.getLastTurnResult()).toBeNull();
		expect(agg.getRecentResults(5)).toHaveLength(0);
	});
});
