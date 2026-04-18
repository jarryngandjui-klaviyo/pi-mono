import { describe, expect, it } from "vitest";
import { Aggregator } from "../src/aggregator.js";
import type { TurnResult } from "../src/types.js";

function makeTurn(id: string, activated: number, passed: number): TurnResult {
	const failed = activated - passed;
	return {
		turnId: id,
		timestamp: Date.now(),
		activated,
		passed,
		failed,
		caseResults: [],
	};
}

describe("Aggregator", () => {
	describe("window=1 (default)", () => {
		it("returns null score when empty", () => {
			const agg = new Aggregator(1);
			const s = agg.score();
			expect(s.score).toBeNull();
			expect(s.activated).toBe(0);
		});

		it("reflects only the most recent turn", () => {
			const agg = new Aggregator(1);
			agg.push(makeTurn("1", 10, 5));
			agg.push(makeTurn("2", 10, 8));

			const s = agg.score();
			expect(s.activated).toBe(10);
			expect(s.passed).toBe(8);
			expect(s.score).toBe(0.8);
		});

		it("recentFailed comes from the last turn", () => {
			const agg = new Aggregator(1);
			agg.push(makeTurn("1", 10, 7));
			expect(agg.score().recentFailed).toBe(3);
		});
	});

	describe("window=N", () => {
		it("sums activated and passed across N turns", () => {
			const agg = new Aggregator(3);
			agg.push(makeTurn("1", 10, 8));
			agg.push(makeTurn("2", 10, 6));
			agg.push(makeTurn("3", 10, 9));

			const s = agg.score();
			expect(s.activated).toBe(30);
			expect(s.passed).toBe(23);
			expect(s.score).toBeCloseTo(23 / 30);
		});

		it("uses only last N turns when buffer is larger", () => {
			const agg = new Aggregator(2);
			agg.push(makeTurn("1", 10, 1)); // older
			agg.push(makeTurn("2", 10, 8));
			agg.push(makeTurn("3", 10, 9));

			const s = agg.score();
			expect(s.activated).toBe(20);
			expect(s.passed).toBe(17);
		});
	});

	describe('window="session"', () => {
		it("includes all turns since start", () => {
			const agg = new Aggregator("session");
			agg.push(makeTurn("1", 10, 5));
			agg.push(makeTurn("2", 10, 5));
			agg.push(makeTurn("3", 10, 5));

			const s = agg.score();
			expect(s.activated).toBe(30);
			expect(s.passed).toBe(15);
			expect(s.score).toBe(0.5);
		});
	});

	describe("zero-activated turns", () => {
		it("returns null score when no cases activated", () => {
			const agg = new Aggregator(5);
			agg.push(makeTurn("1", 0, 0));
			agg.push(makeTurn("2", 0, 0));
			const s = agg.score();
			expect(s.score).toBeNull();
		});

		it("mixed zero and non-zero turns", () => {
			const agg = new Aggregator("session");
			agg.push(makeTurn("1", 0, 0));
			agg.push(makeTurn("2", 10, 7));
			const s = agg.score();
			expect(s.activated).toBe(10);
			expect(s.passed).toBe(7);
			expect(s.score).toBe(0.7);
		});
	});

	describe("setWindow()", () => {
		it("resizes buffer when shrinking window", () => {
			const agg = new Aggregator(5);
			agg.push(makeTurn("1", 10, 1));
			agg.push(makeTurn("2", 10, 2));
			agg.push(makeTurn("3", 10, 9));

			agg.setWindow(1);
			const s = agg.score();
			expect(s.activated).toBe(10);
			expect(s.passed).toBe(9); // only the last turn
		});

		it("switches to session window", () => {
			const agg = new Aggregator(1);
			agg.push(makeTurn("1", 10, 5));
			agg.push(makeTurn("2", 10, 8));

			agg.setWindow("session");
			const s = agg.score();
			// With session window, both turns should count
			// But buffer was trimmed to 1 under previous window=1
			// Only turn 2 is in buffer; total = 10/10 = 0.8
			expect(s.activated).toBe(10);
		});
	});

	describe("getLastTurnResult()", () => {
		it("returns null when empty", () => {
			expect(new Aggregator(1).getLastTurnResult()).toBeNull();
		});

		it("returns the most recent turn", () => {
			const agg = new Aggregator(5);
			agg.push(makeTurn("1", 10, 5));
			agg.push(makeTurn("2", 10, 8));
			expect(agg.getLastTurnResult()?.turnId).toBe("2");
		});
	});
});
