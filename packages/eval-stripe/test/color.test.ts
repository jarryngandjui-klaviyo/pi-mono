import { describe, expect, it } from "vitest";
import { cellsForScore } from "../src/color.js";

describe("cellsForScore()", () => {
	it("returns W cells for any valid score", () => {
		expect(cellsForScore(0, 10)).toHaveLength(10);
		expect(cellsForScore(0.5, 10)).toHaveLength(10);
		expect(cellsForScore(1, 10)).toHaveLength(10);
		expect(cellsForScore(null, 10)).toHaveLength(10);
	});

	it("score=0 → 0 filled cells", () => {
		const cells = cellsForScore(0, 10);
		expect(cells.filter((c) => c.filled)).toHaveLength(0);
		expect(cells.every((c) => c.char === "░")).toBe(true);
	});

	it("score=1 → all W cells filled", () => {
		const cells = cellsForScore(1, 10);
		expect(cells.filter((c) => c.filled)).toHaveLength(10);
	});

	it("null score → 0 filled cells (idle state)", () => {
		const cells = cellsForScore(null, 10);
		expect(cells.filter((c) => c.filled)).toHaveLength(0);
	});

	it("score=0.5, width=10 → 5 filled cells", () => {
		const cells = cellsForScore(0.5, 10);
		expect(cells.filter((c) => c.filled)).toHaveLength(5);
	});

	it("first filled cell (index 0) has hue ~60° (yellow)", () => {
		const cells = cellsForScore(1, 10);
		expect(cells[0].hue).toBeCloseTo(60, 0);
	});

	it("last cell (index W-1) has hue ~120° (green)", () => {
		const cells = cellsForScore(1, 10);
		const lastCell = cells[cells.length - 1];
		expect(lastCell.hue).toBeCloseTo(120, 0);
	});

	it("filled cells span yellow(60°)→green(120°) based on position", () => {
		const width = 10;
		const cells = cellsForScore(1, width);
		for (let i = 0; i < width; i++) {
			const expectedHue = 60 + (i / (width - 1)) * 60;
			expect(cells[i].hue).toBeCloseTo(expectedHue, 1);
		}
	});

	it("unfilled cells are not filled", () => {
		const cells = cellsForScore(0.3, 10);
		const filled = cells.filter((c) => c.filled).length;
		const unfilled = cells.filter((c) => !c.filled).length;
		expect(filled + unfilled).toBe(10);
		expect(unfilled).toBe(10 - filled);
	});

	it("leading edge cell (last filled) uses ▓ character", () => {
		const cells = cellsForScore(0.5, 10);
		const filledCells = cells.filter((c) => c.filled);
		const lastFilled = filledCells[filledCells.length - 1];
		expect(lastFilled.char).toBe("▓");
	});

	it("non-leading filled cells use █ character", () => {
		const cells = cellsForScore(0.6, 10);
		const filledCells = cells.filter((c) => c.filled);
		const nonLeading = filledCells.slice(0, -1);
		expect(nonLeading.every((c) => c.char === "█")).toBe(true);
	});

	it("unfilled cells use ░ character", () => {
		const cells = cellsForScore(0.3, 10);
		expect(cells.filter((c) => !c.filled).every((c) => c.char === "░")).toBe(true);
	});

	it("ansi strings contain ANSI escape sequences", () => {
		const cells = cellsForScore(0.5, 4);
		for (const cell of cells) {
			expect(cell.ansi).toContain("\x1b[");
			expect(cell.ansi).toContain("\x1b[0m"); // reset
		}
	});

	it("returns empty array for width=0", () => {
		expect(cellsForScore(0.5, 0)).toHaveLength(0);
	});

	it("works with width=1", () => {
		const cells = cellsForScore(1, 1);
		expect(cells).toHaveLength(1);
		// Single cell: hue should be 60 (position 0)
		expect(cells[0].hue).toBeCloseTo(60, 0);
	});
});
