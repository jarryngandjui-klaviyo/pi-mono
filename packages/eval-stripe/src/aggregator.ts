/**
 * Per-case aggregator for eval results.
 *
 * Maintains a separate activation history deque per case name so that each
 * case's window applies to *that case's activations*, not to turn count.
 *
 * Window semantics:
 *   - Positive integer N: keep the last N activations of this case.
 *   - -1 (session sentinel): keep up to MAX_RING_SIZE activations.
 *
 * Aggregator semantics:
 *   - "all": every activation in the deque contributes to totals.
 *   - "last": only the most recent activation contributes.
 *
 * score() sums (passed, activated) across all current cases' deques and
 * returns a single aggregated score for the widget.
 */

import type { AggregatedScore, AggregatorStrategy, EvalCase, GraderResult, TurnResult } from "./types.js";
import { effectiveWindow, MAX_RING_SIZE } from "./types.js";

export class Aggregator {
	/** Per-case activation history. Deque stored as plain array (push/shift). */
	private history: Map<string, GraderResult[]> = new Map();
	/** Last completed turn — used for recentFailed and getLastTurnResult(). */
	private lastTurn: TurnResult | null = null;
	/** Full turn history capped at MAX_RING_SIZE — used by /eval last. */
	private allTurns: TurnResult[] = [];
	/** Current case list (drives score(); hot-reload safe). */
	private cases: EvalCase[];
	/** Fallback window for cases that don't declare their own. */
	private windowDefault: number;
	/** Fallback aggregator strategy for cases that don't declare their own. */
	private aggregatorDefault: AggregatorStrategy;

	constructor(cases: EvalCase[], windowDefault: number = 1, aggregatorDefault: AggregatorStrategy = "last") {
		this.cases = cases;
		this.windowDefault = windowDefault;
		this.aggregatorDefault = aggregatorDefault;
	}

	/** Return the effective window for a given case (respects per-case override). */
	private caseWindow(caseName: string): number {
		const c = this.cases.find((ec) => ec.name === caseName);
		const raw = c?.window ?? this.windowDefault;
		return effectiveWindow(raw);
	}

	/** Return the effective aggregator strategy for a given case. */
	private caseAggregator(caseName: string): AggregatorStrategy {
		const c = this.cases.find((ec) => ec.name === caseName);
		return c?.aggregator ?? this.aggregatorDefault;
	}

	/**
	 * Record a turn's results into the per-case history deques.
	 * Also appends to allTurns (capped at MAX_RING_SIZE).
	 */
	push(turn: TurnResult): void {
		// Maintain full turn list for /eval last
		this.allTurns.push(turn);
		if (this.allTurns.length > MAX_RING_SIZE) {
			this.allTurns.shift();
		}

		// Push each case result into its deque and trim to window
		for (const gr of turn.caseResults) {
			let deque = this.history.get(gr.caseName);
			if (!deque) {
				deque = [];
				this.history.set(gr.caseName, deque);
			}
			deque.push(gr);

			// Trim to this case's effective window
			const cap = this.caseWindow(gr.caseName);
			while (deque.length > cap) {
				deque.shift();
			}
		}

		this.lastTurn = turn;
	}

	/**
	 * Compute the aggregated score over all current cases' windows.
	 * Returns null score when no cases have activated.
	 *
	 * For each case:
	 *   - If aggregator is "all": sum all entries in the deque.
	 *   - If aggregator is "last": count 1 activation if deque is non-empty;
	 *     count 1 pass iff the last entry passed.
	 */
	score(): AggregatedScore {
		let totalActivated = 0;
		let totalPassed = 0;

		for (const c of this.cases) {
			const deque = this.history.get(c.name);
			if (!deque || deque.length === 0) continue;

			const strategy = this.caseAggregator(c.name);
			if (strategy === "all") {
				totalActivated += deque.length;
				totalPassed += deque.filter((gr) => gr.pass).length;
			} else {
				// "last"
				totalActivated += 1;
				if (deque[deque.length - 1].pass) {
					totalPassed += 1;
				}
			}
		}

		return {
			activated: totalActivated,
			passed: totalPassed,
			recentFailed: this.lastTurn?.failed ?? 0,
			score: totalActivated > 0 ? totalPassed / totalActivated : null,
		};
	}

	/**
	 * Update the case list (hot-reload).
	 * Deques for removed cases are kept in history (they just won't contribute
	 * to score() until re-added), so case edits don't cause bar jumps.
	 * Deques for existing cases are re-trimmed to their new effective window.
	 */
	setCases(cases: EvalCase[]): void {
		this.cases = cases;
		// Re-trim each case's deque in case its window changed
		for (const c of cases) {
			const deque = this.history.get(c.name);
			if (!deque) continue;
			const cap = this.caseWindow(c.name);
			while (deque.length > cap) {
				deque.shift();
			}
		}
	}

	/**
	 * Update the default window (e.g. from /eval window command).
	 * Re-trims deques of cases that inherit the default (window === undefined).
	 */
	setWindowDefault(w: number): void {
		this.windowDefault = w;
		for (const c of this.cases) {
			// Only re-trim cases that rely on the default (no per-case override)
			if (c.window !== undefined) continue;
			const deque = this.history.get(c.name);
			if (!deque) continue;
			const cap = effectiveWindow(w);
			while (deque.length > cap) {
				deque.shift();
			}
		}
	}

	/**
	 * Update the default aggregator strategy (e.g. from /eval aggregator command).
	 * Affects score() immediately for cases without per-case overrides.
	 */
	setAggregatorDefault(strategy: AggregatorStrategy): void {
		this.aggregatorDefault = strategy;
	}

	getLastTurnResult(): TurnResult | null {
		return this.lastTurn;
	}

	/** Get the most recent N turn results (for /eval last). */
	getRecentResults(n = 1): TurnResult[] {
		return this.allTurns.slice(Math.max(0, this.allTurns.length - n));
	}

	reset(): void {
		this.history = new Map();
		this.allTurns = [];
		this.lastTurn = null;
	}
}
