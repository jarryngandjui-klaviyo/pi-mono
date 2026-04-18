/**
 * Bar widget renderer.
 *
 * Returns a string[] (one line) for use with ctx.ui.setWidget().
 * Format: "EVALS N/M · xx% [bar cells] ❌ K"
 *
 * Idle state (null score): "EVALS —  [dim cells]"
 */

import { cellsForScore } from "./color.js";
import type { AggregatedScore } from "./types.js";

// Reset ANSI escape
const RESET = "\x1b[0m";

// Dim color for the label (soft white)
function dim(text: string): string {
	return `\x1b[2m${text}${RESET}`;
}

// Muted red for failure indicator — we use a dim approach to keep it from
// looking too alarming, per the plan's "no red" spirit (this is a hint, not an alarm).
function mutedRed(text: string): string {
	return `\x1b[2;33m${text}${RESET}`; // dim yellow — muted enough to not cry wolf
}

/**
 * Render the eval stripe bar to a one-element string array.
 *
 * @param score - Aggregated score object, or null for idle state
 * @param barWidth - Width in cells (default 24)
 */
export function renderWidget(score: AggregatedScore | null, barWidth = 24): string[] {
	const width = Math.max(4, barWidth);

	// Build bar cells
	const cells = cellsForScore(score?.score ?? null, width);
	const barStr = cells.map((c) => c.ansi).join("");

	// Build label
	let label: string;
	if (score === null || score.activated === 0) {
		label = dim("EVALS —");
	} else {
		const pct = Math.round((score.score ?? 0) * 100);
		label = dim(`EVALS ${score.passed}/${score.activated} · ${pct}%`);
	}

	// Failure indicator
	let failIndicator = "";
	if (score !== null && score.recentFailed > 0) {
		failIndicator = ` ${mutedRed(`❌ ${score.recentFailed}`)}`;
	}

	const line = `${label}  ${barStr}${failIndicator}`;
	return [line];
}
