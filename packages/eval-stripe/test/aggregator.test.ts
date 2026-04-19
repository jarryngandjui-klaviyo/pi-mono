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
		const agg = new Aggregator([makeCase("a")], 1, "last");
		const s = agg.score();
		expect(s.score).toBeNull();
		expect(s.activated).toBe(0);
	});

	it("reflects only the most recent activation", () => {
		const agg = new Aggregator([makeCase("a")], 1, "last");
		agg.push(makeTurn("1", [gr("a", false)]));
		agg.push(makeTurn("2", [gr("a", true)]));

		const s = agg.score();
		// window:1 on case "a" — only the last activation counts
		expect(s.activated).toBe(1);
		expect(s.passed).toBe(1);
		expect(s.score).toBe(1);
	});

	it("recentFailed comes from the last turn", () => {
		const agg = new Aggregator([makeCase("a")], 1, "last");
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

		const agg = new Aggregator([caseA, caseB], 1, "last");

		// Turn 1: both activate
		agg.push(makeTurn("t1", [gr("a", false), gr("b", false)]));
		// Turn 2: both activate
		agg.push(makeTurn("t2", [gr("a", true), gr("b", true)]));
		// Turn 3: only A activates
		agg.push(makeTurn("t3", [gr("a", false)]));

		const s = agg.score();

		// Case A (window:1, aggregator:last): only turn 3's result: 0 passed / 1 activated
		// Case B (window:5, aggregator:last): only the most recent of turns 1+2: 1 passed / 1 activated
		expect(s.activated).toBe(2); // 1 (a) + 1 (b)
		expect(s.passed).toBe(1); // 0 (a) + 1 (b)
		expect(s.score).toBeCloseTo(1 / 2);
	});
});

// ---------------------------------------------------------------------------
// 3. Mixed window:-1 (session) alongside numeric window — no cross-contamination
// ---------------------------------------------------------------------------

describe("session window (-1) alongside numeric window", () => {
	it("session case accumulates; numeric case slices independently", () => {
		const caseSession = makeCase("session-case", -1);
		caseSession.aggregator = "all"; // use "all" to accumulate
		const caseFixed = makeCase("fixed-case", 1);

		const agg = new Aggregator([caseSession, caseFixed], 1, "last");

		agg.push(makeTurn("t1", [gr("session-case", true), gr("fixed-case", false)]));
		agg.push(makeTurn("t2", [gr("session-case", true), gr("fixed-case", true)]));

		const s = agg.score();

		// session-case (all, session window): 2 activations, 2 passed
		// fixed-case (last, window:1): only t2 counts: 1 passed / 1 activated
		expect(s.activated).toBe(3); // 2 + 1
		expect(s.passed).toBe(3); // 2 + 1
		expect(s.score).toBe(1);
	});

	it("session and numeric cases don't share history", () => {
		const caseSession = makeCase("s", -1);
		caseSession.aggregator = "all"; // use "all" to accumulate all activations
		const caseNumeric = makeCase("n", 2);
		caseNumeric.aggregator = "all"; // use "all" to sum window results
		const agg = new Aggregator([caseSession, caseNumeric], 1, "last");

		// 3 turns of both activating
		agg.push(makeTurn("t1", [gr("s", false), gr("n", false)]));
		agg.push(makeTurn("t2", [gr("s", false), gr("n", true)]));
		agg.push(makeTurn("t3", [gr("s", true), gr("n", true)]));

		const s = agg.score();

		// s (all, session window): 3 activations, 1 passed
		// n (all, window:2): last 2 activations (t2+t3): 2 passed / 2 activated
		expect(s.activated).toBe(5); // 3 + 2
		expect(s.passed).toBe(3); // 1 + 2
	});
});

// ---------------------------------------------------------------------------
// 4. Sparse activation — window:3 on a case that activates only twice
// ---------------------------------------------------------------------------

describe("sparse activation", () => {
	it("window:3 case that activated only twice → activated=2 with all, 1 with last", () => {
		const c = makeCase("c", 3);
		c.aggregator = "all"; // use "all" to count all 2 activations
		const agg = new Aggregator([c], 1, "last");

		agg.push(makeTurn("t1", [gr("c", true)]));
		agg.push(makeTurn("t2", [])); // c doesn't activate
		agg.push(makeTurn("t3", [gr("c", false)]));

		const s = agg.score();
		expect(s.activated).toBe(2); // all: both activations count
		expect(s.passed).toBe(1); // only t1 passed
	});
});

// ---------------------------------------------------------------------------
// 5. setCases() drops a case — its past contributions no longer count
// ---------------------------------------------------------------------------

describe("setCases()", () => {
	it("dropped case no longer contributes to score()", () => {
		const caseA = makeCase("a");
		const caseB = makeCase("b");
		const agg = new Aggregator([caseA, caseB], 1, "last");

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
		const agg = new Aggregator([caseA], 1, "last");

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
		caseA.aggregator = "all"; // use "all" to count all activations
		const caseB = makeCase("b", 5); // explicit
		caseB.aggregator = "all"; // use "all" to count all activations
		const agg = new Aggregator([caseA, caseB], 5, "last");

		// Push 4 activations of both
		for (let i = 1; i <= 4; i++) {
			agg.push(makeTurn(`t${i}`, [gr("a", true), gr("b", true)]));
		}

		// Both should have 4 entries (with "all" aggregator)
		expect(agg.score().activated).toBe(8);

		// Shrink default to 2 → caseA trimmed to 2, caseB unchanged
		agg.setWindowDefault(2);
		const s = agg.score();
		// caseA (all): 2 activations; caseB (all): 4 activations (explicit window:5, not trimmed)
		expect(s.activated).toBe(6);
		expect(s.passed).toBe(6); // all were passing
	});

	it("does not trim cases with explicit window overrides", () => {
		const caseExplicit = makeCase("explicit", 10);
		caseExplicit.aggregator = "all"; // use "all" to count all 5 activations
		const agg = new Aggregator([caseExplicit], 10, "last");

		for (let i = 1; i <= 5; i++) {
			agg.push(makeTurn(`t${i}`, [gr("explicit", true)]));
		}

		// Shrink default — explicit case should keep all 5 activations (explicit window:10, not affected)
		agg.setWindowDefault(1);
		expect(agg.score().activated).toBe(5); // all: counts all 5
	});
});

// ---------------------------------------------------------------------------
// getLastTurnResult() and getRecentResults()
// ---------------------------------------------------------------------------

describe("getLastTurnResult()", () => {
	it("returns null when empty", () => {
		expect(new Aggregator([], 1, "last").getLastTurnResult()).toBeNull();
	});

	it("returns the most recent turn", () => {
		const agg = new Aggregator([makeCase("a")], 1, "last");
		agg.push(makeTurn("t1", [gr("a", true)]));
		agg.push(makeTurn("t2", [gr("a", false)]));
		expect(agg.getLastTurnResult()?.turnId).toBe("t2");
	});
});

describe("getRecentResults()", () => {
	it("returns last N turns from allTurns", () => {
		const agg = new Aggregator([makeCase("a")], 1, "last");
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
		const agg = new Aggregator([makeCase("a")], 1, "last");
		agg.push(makeTurn("t1", [gr("a", true)]));

		agg.reset();

		expect(agg.score().activated).toBe(0);
		expect(agg.score().score).toBeNull();
		expect(agg.getLastTurnResult()).toBeNull();
		expect(agg.getRecentResults(5)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Aggregator strategy tests (new)
// ---------------------------------------------------------------------------

describe("aggregator strategy", () => {
	it('default is "last" — case with 7 activations counts as 1', () => {
		const c = makeCase("c");
		const agg = new Aggregator([c], 1, "last");

		// 7 turns where case activates and passes
		for (let i = 1; i <= 7; i++) {
			agg.push(makeTurn(`t${i}`, [gr("c", true)]));
		}

		const s = agg.score();
		// aggregator is "last": only the most recent activation counts
		expect(s.activated).toBe(1);
		expect(s.passed).toBe(1);
		expect(s.score).toBe(1);
	});

	it('"all" strategy — case with 7 activations counts as 7', () => {
		const c = makeCase("c", -1); // session window to keep all 7
		const agg = new Aggregator([c], 1, "all");

		// 7 turns where case activates: 5 pass, 2 fail
		agg.push(makeTurn("t1", [gr("c", true)]));
		agg.push(makeTurn("t2", [gr("c", true)]));
		agg.push(makeTurn("t3", [gr("c", false)]));
		agg.push(makeTurn("t4", [gr("c", true)]));
		agg.push(makeTurn("t5", [gr("c", false)]));
		agg.push(makeTurn("t6", [gr("c", true)]));
		agg.push(makeTurn("t7", [gr("c", true)]));

		const s = agg.score();
		expect(s.activated).toBe(7);
		expect(s.passed).toBe(5);
		expect(s.score).toBeCloseTo(5 / 7);
	});

	it("per-case override: case A uses all, case B uses last", () => {
		const caseA = makeCase("a", -1); // session window for "all" to accumulate
		caseA.aggregator = "all";
		const caseB = makeCase("b"); // default window: 1
		caseB.aggregator = "last";

		const agg = new Aggregator([caseA, caseB], 1, "last");

		// 3 turns of both activating, mixed pass/fail
		agg.push(makeTurn("t1", [gr("a", true), gr("b", false)]));
		agg.push(makeTurn("t2", [gr("a", true), gr("b", true)]));
		agg.push(makeTurn("t3", [gr("a", false), gr("b", true)]));

		const s = agg.score();
		// a (all, session window): 3 activations, 2 passed
		// b (last, window:1): 1 activation, 1 passed (the most recent one, t3)
		expect(s.activated).toBe(4); // 3 + 1
		expect(s.passed).toBe(3); // 2 + 1
	});

	it("setAggregatorDefault() updates scoring immediately", () => {
		const c = makeCase("c", -1);
		const agg = new Aggregator([c], 1, "all");

		agg.push(makeTurn("t1", [gr("c", true)]));
		agg.push(makeTurn("t2", [gr("c", true)]));

		// Initially "all": 2 activated, 2 passed
		expect(agg.score().activated).toBe(2);

		// Switch to "last"
		agg.setAggregatorDefault("last");
		const s = agg.score();
		// Now: 1 activated, 1 passed
		expect(s.activated).toBe(1);
		expect(s.passed).toBe(1);
	});

	it('"last" on a never-activated case contributes nothing', () => {
		const caseA = makeCase("a", -1);
		caseA.aggregator = "last";
		const caseB = makeCase("b", -1);
		caseB.aggregator = "last";

		const agg = new Aggregator([caseA, caseB], 1, "last");

		// Only case B activates
		agg.push(makeTurn("t1", [gr("b", true)]));
		agg.push(makeTurn("t2", [gr("b", false)]));

		const s = agg.score();
		// Only case B: 1 activated, 0 passed
		expect(s.activated).toBe(1);
		expect(s.passed).toBe(0);
	});
});
