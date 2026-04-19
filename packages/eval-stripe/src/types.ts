/**
 * Core types shared across eval-stripe modules.
 */

// ============================================================================
// TurnContext — built from AgentEndEvent messages
// ============================================================================

export interface TurnToolCall {
	name: string;
	args: Record<string, unknown>;
	id: string;
}

export interface TurnToolResult {
	id: string;
	output: string;
	error?: string;
}

export interface TurnContext {
	user: string;
	assistant: string;
	toolCalls: TurnToolCall[];
	toolResults: TurnToolResult[];
	durationMs: number;
	modelUsed: string;
}

// ============================================================================
// Eval case types
// ============================================================================

export type EvalKind = "deterministic" | "llm";

/** A single activation predicate node */
export type ActivatePredicate =
	| { any_tool: string }
	| { no_tool: string }
	| { user_message_regex: string }
	| { assistant_regex: string }
	| { min_tool_calls: number }
	| { max_tool_calls: number }
	| { all: ActivatePredicate[] }
	| { any: ActivatePredicate[] }
	| { not: ActivatePredicate };

export interface EvalCase {
	name: string;
	description: string;
	kind: EvalKind;
	/** Activation predicate — undefined means always active */
	activate?: ActivatePredicate;
	/** For deterministic: the TS snippet (returns boolean) */
	check?: string;
	/** For llm: the rubric text (markdown body) */
	rubric?: string;
	/** For llm: override grader model */
	graderModel?: string;
	/**
	 * Per-case aggregation window override (optional).
	 * Positive integer = last N activations of this case.
	 * -1 = entire session (capped at MAX_RING_SIZE activations).
	 * Omitted = use settings.windowDefault.
	 */
	window?: number;
	/** Source file path */
	filePath: string;
}

// ============================================================================
// Grader result
// ============================================================================

export interface GraderResult {
	caseName: string;
	pass: boolean;
	reason: string;
	/** Set when the grader itself failed (timeout, network error, etc.) */
	graderError?: boolean;
}

// ============================================================================
// Per-turn run result
// ============================================================================

export interface TurnResult {
	turnId: string; // monotonic counter stringified
	timestamp: number;
	activated: number; // how many cases activated
	passed: number; // how many passed among activated
	failed: number; // how many failed among activated
	caseResults: GraderResult[];
}

// ============================================================================
// Aggregated score
// ============================================================================

export interface AggregatedScore {
	/** Total activated cases across the window */
	activated: number;
	/** Total passed cases across the window */
	passed: number;
	/** Total failed in the most-recent turn (for the failure indicator) */
	recentFailed: number;
	/** Score 0..1, or null when no cases activated */
	score: number | null;
}

// ============================================================================
// Settings schema for evals.*
// ============================================================================

export interface EvalSettings {
	path?: string; // default: ".pi/evals"
	enabled?: boolean; // default: true
	/**
	 * Default aggregation window for cases that do not declare their own window.
	 * Positive integer = last N activations. -1 = entire session.
	 * Default: 1.
	 */
	windowDefault?: number;
	graderModel?: string; // default: "claude-haiku-4-5-20251001"
	concurrency?: number; // default: 4
	timeoutMs?: number; // default: 5000
	sandboxTimeoutMs?: number; // default: 100
	barWidth?: number; // default: 24
}

// ============================================================================
// Window sentinel helpers
// ============================================================================

/** Safety cap for session windows — max activations kept per case */
export const MAX_RING_SIZE = 1000;

/** Returns true when the window value means "entire session." */
export function isSessionWindow(w: number): boolean {
	return w === -1;
}

/**
 * Converts the raw window number into the actual deque capacity to use.
 * -1 (session sentinel) maps to MAX_RING_SIZE; positive integers pass through.
 */
export function effectiveWindow(w: number): number {
	return isSessionWindow(w) ? MAX_RING_SIZE : w;
}
