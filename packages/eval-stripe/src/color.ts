/**
 * Color math for the eval stripe bar.
 *
 * Filled cells span hue 60° (yellow) → 120° (green) along the bar's full width
 * (not just the filled portion), so the gradient covers the same positions
 * regardless of score. Score=0.3 shows yellow-leaning cells; score=0.9 shows
 * mostly-green cells.
 *
 * Unfilled cells use the same position-based hue but at very low luminance (~15%).
 *
 * Outputs 24-bit ANSI escape sequences. Falls back to 256-color when
 * $COLORTERM is not "truecolor" or "24bit".
 */

export interface CellSpec {
	char: string;
	/** ANSI-escaped string ready for terminal output */
	ansi: string;
	/** Hue in degrees (0–360) */
	hue: number;
	/** Whether this cell is filled */
	filled: boolean;
}

// ============================================================================
// HSL → RGB → ANSI
// ============================================================================

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	// h: 0–360, s: 0–1, l: 0–1
	s = Math.max(0, Math.min(1, s));
	l = Math.max(0, Math.min(1, l));
	h = ((h % 360) + 360) % 360;

	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;

	let r = 0;
	let g = 0;
	let b = 0;

	if (h < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (h < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (h < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (h < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		g = 0;
		b = c;
	} else {
		r = c;
		g = 0;
		b = x;
	}

	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function ansi24bit(r: number, g: number, b: number, text: string): string {
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

/** Nearest 6-level cube index for 256-color fallback */
function nearestCubeIndex(v: number): number {
	// The 6×6×6 cube starts at index 16
	// Values: 0, 95, 135, 175, 215, 255
	if (v < 48) return 0;
	if (v < 115) return 1;
	if (v < 155) return 2;
	if (v < 195) return 3;
	if (v < 235) return 4;
	return 5;
}

function ansi256(r: number, g: number, b: number, text: string): string {
	const ri = nearestCubeIndex(r);
	const gi = nearestCubeIndex(g);
	const bi = nearestCubeIndex(b);
	const idx = 16 + 36 * ri + 6 * gi + bi;
	return `\x1b[38;5;${idx}m${text}\x1b[0m`;
}

function supports24bit(): boolean {
	const ct = process.env.COLORTERM;
	return ct === "truecolor" || ct === "24bit";
}

function coloredText(h: number, s: number, l: number, text: string): string {
	const [r, g, b] = hslToRgb(h, s, l);
	return supports24bit() ? ansi24bit(r, g, b, text) : ansi256(r, g, b, text);
}

// ============================================================================
// Public API
// ============================================================================

const FILLED_SATURATION = 1.0;
const FILLED_LIGHTNESS = 0.55;
const UNFILLED_SATURATION = 0.5;
const UNFILLED_LIGHTNESS = 0.15;

const CHAR_FILLED = "█";
const CHAR_LEADING = "▓"; // leading-edge cell
const CHAR_UNFILLED = "░";

/**
 * Generate a CellSpec array for a progress bar of `width` cells at the given `score`.
 *
 * score: 0..1 (or null → all unfilled, idle state).
 * width: number of cells.
 *
 * Hue is position-based: index 0 → 60° (yellow), index W-1 → 120° (green).
 * This means the gradient always spans the full width regardless of score.
 */
export function cellsForScore(score: number | null, width: number): CellSpec[] {
	if (width <= 0) return [];

	const fillCount = score === null ? 0 : Math.round(score * width);
	const cells: CellSpec[] = [];

	for (let i = 0; i < width; i++) {
		// Hue interpolated across the full bar width
		const hue = 60 + (i / Math.max(width - 1, 1)) * 60;
		const filled = i < fillCount;
		const isLeading = filled && i === fillCount - 1;

		const char = filled ? (isLeading ? CHAR_LEADING : CHAR_FILLED) : CHAR_UNFILLED;
		const s = filled ? FILLED_SATURATION : UNFILLED_SATURATION;
		const l = filled ? FILLED_LIGHTNESS : UNFILLED_LIGHTNESS;

		const ansi = coloredText(hue, s, l, char);

		cells.push({ char, ansi, hue, filled });
	}

	return cells;
}
