/**
 * Ring-buffer aggregator for per-turn eval results.
 *
 * Supports window sizes: number N (last N turns) or "session" (all turns).
 * score() returns pass rate over the window or null if no cases activated.
 */

import type { AggregatedScore, TurnResult } from "./types.js";

const MAX_RING_SIZE = 1000; // safety cap for "session" windows

export class Aggregator {
	private buffer: TurnResult[] = [];
	private window: number | "session";

	constructor(window: number | "session" = 1) {
		this.window = window;
	}

	setWindow(window: number | "session"): void {
		this.window = window;
		// Trim buffer if numeric window shrunk
		if (typeof window === "number" && this.buffer.length > window) {
			this.buffer = this.buffer.slice(this.buffer.length - window);
		}
	}

	push(result: TurnResult): void {
		this.buffer.push(result);

		// Trim ring buffer
		const maxSize = this.window === "session" ? MAX_RING_SIZE : Math.max(this.window, 1);
		if (this.buffer.length > maxSize) {
			this.buffer.shift();
		}
	}

	/**
	 * Compute the aggregated score over the current window.
	 * Returns null score if zero cases activated across the window.
	 */
	score(): AggregatedScore {
		const windowResults = this.getWindow();

		let totalActivated = 0;
		let totalPassed = 0;
		let recentFailed = 0;

		for (const tr of windowResults) {
			totalActivated += tr.activated;
			totalPassed += tr.passed;
		}

		// recentFailed = failed count in the most recent turn
		if (windowResults.length > 0) {
			const last = windowResults[windowResults.length - 1];
			recentFailed = last.failed;
		}

		return {
			activated: totalActivated,
			passed: totalPassed,
			recentFailed,
			score: totalActivated > 0 ? totalPassed / totalActivated : null,
		};
	}

	private getWindow(): TurnResult[] {
		if (this.window === "session") {
			return this.buffer;
		}
		const n = Math.max(this.window, 1);
		return this.buffer.slice(Math.max(0, this.buffer.length - n));
	}

	getLastTurnResult(): TurnResult | null {
		return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
	}

	/** Get all buffered turn results (for /eval last) */
	getRecentResults(n = 1): TurnResult[] {
		return this.buffer.slice(Math.max(0, this.buffer.length - n));
	}

	reset(): void {
		this.buffer = [];
	}
}
