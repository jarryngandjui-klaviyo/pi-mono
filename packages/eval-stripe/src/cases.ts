/**
 * Case loader — reads .pi/evals/*.md files, parses YAML frontmatter + body,
 * validates the schema, and returns EvalCase[].
 *
 * File format:
 *   ---
 *   name: reads-before-edit
 *   description: ...
 *   kind: deterministic | llm
 *   activate: { any_tool: edit }   # optional
 *   window: 5                       # optional
 *   aggregator: all | last          # optional
 *   check: |                        # deterministic: TS snippet returning boolean
 *     return toolCalls.length > 0;
 *   grader_model: claude-haiku-4-5-20251001  # llm, optional
 *   ---
 *
 *   Rubric body (llm cases) / human notes (deterministic cases).
 */

import { readdirSync, readFileSync } from "fs";
import yaml from "js-yaml";
import { join } from "path";
import type { ActivatePredicate, AggregatorStrategy, EvalCase, EvalKind } from "./types.js";

interface RawFrontmatter {
	name?: unknown;
	description?: unknown;
	kind?: unknown;
	activate?: unknown;
	check?: unknown;
	grader_model?: unknown;
	window?: unknown;
	aggregator?: unknown;
}

function parseActivate(raw: unknown): ActivatePredicate | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`'activate' must be an object, got: ${JSON.stringify(raw)}`);
	}
	const obj = raw as Record<string, unknown>;

	if ("any_tool" in obj) return { any_tool: String(obj.any_tool) };
	if ("no_tool" in obj) return { no_tool: String(obj.no_tool) };
	if ("user_message_regex" in obj) return { user_message_regex: String(obj.user_message_regex) };
	if ("assistant_regex" in obj) return { assistant_regex: String(obj.assistant_regex) };
	if ("min_tool_calls" in obj) return { min_tool_calls: Number(obj.min_tool_calls) };
	if ("max_tool_calls" in obj) return { max_tool_calls: Number(obj.max_tool_calls) };

	if ("all" in obj) {
		if (!Array.isArray(obj.all)) throw new Error(`'all' must be an array`);
		return { all: obj.all.map((item: unknown) => parseActivate(item) as ActivatePredicate) };
	}
	if ("any" in obj) {
		if (!Array.isArray(obj.any)) throw new Error(`'any' must be an array`);
		return { any: obj.any.map((item: unknown) => parseActivate(item) as ActivatePredicate) };
	}
	if ("not" in obj) {
		return { not: parseActivate(obj.not) as ActivatePredicate };
	}

	throw new Error(`Unknown activate predicate keys: ${Object.keys(obj).join(", ")}`);
}

/**
 * Validate and parse the optional `window` frontmatter field.
 * Valid values: -1 (session) or a positive integer >= 1.
 * Rejects: 0, other negatives, non-integers, strings (including "session").
 */
function parseWindow(raw: unknown, filePath: string): number | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (typeof raw !== "number") {
		throw new Error(
			`'window' must be a number (-1 for session, or a positive integer), got: ${JSON.stringify(raw)} in ${filePath}`,
		);
	}
	if (!Number.isInteger(raw)) {
		throw new Error(`'window' must be an integer, got: ${raw} in ${filePath}`);
	}
	if (raw !== -1 && raw < 1) {
		throw new Error(`'window' must be -1 (session) or a positive integer >= 1, got: ${raw} in ${filePath}`);
	}
	return raw;
}

/**
 * Validate and parse the optional `aggregator` frontmatter field.
 * Valid values: exactly "all" or "last".
 * Rejects: wrong type, other strings, any other value.
 */
function parseAggregator(raw: unknown, filePath: string): AggregatorStrategy | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (typeof raw !== "string") {
		throw new Error(`'aggregator' must be a string ("all" or "last"), got: ${JSON.stringify(raw)} in ${filePath}`);
	}
	if (raw !== "all" && raw !== "last") {
		throw new Error(`'aggregator' must be "all" or "last", got: "${raw}" in ${filePath}`);
	}
	return raw as AggregatorStrategy;
}

function parseCase(filePath: string, content: string): EvalCase {
	// Split on frontmatter delimiters
	const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!fmMatch) {
		throw new Error(`Missing YAML frontmatter (--- block) in ${filePath}`);
	}

	const frontmatter = yaml.load(fmMatch[1]) as RawFrontmatter;
	const body = fmMatch[2].trim();

	if (typeof frontmatter.name !== "string" || !frontmatter.name.trim()) {
		throw new Error(`'name' must be a non-empty string in ${filePath}`);
	}
	if (typeof frontmatter.description !== "string") {
		throw new Error(`'description' must be a string in ${filePath}`);
	}
	if (frontmatter.kind !== "deterministic" && frontmatter.kind !== "llm") {
		throw new Error(`'kind' must be 'deterministic' or 'llm' in ${filePath}, got: ${String(frontmatter.kind)}`);
	}

	const kind = frontmatter.kind as EvalKind;
	const activate = parseActivate(frontmatter.activate);
	const window = parseWindow(frontmatter.window, filePath);
	const aggregator = parseAggregator(frontmatter.aggregator, filePath);

	if (kind === "deterministic") {
		if (typeof frontmatter.check !== "string" || !frontmatter.check.trim()) {
			throw new Error(`'check' must be a non-empty string for deterministic case in ${filePath}`);
		}
		return {
			name: frontmatter.name,
			description: String(frontmatter.description),
			kind: "deterministic",
			activate,
			check: String(frontmatter.check),
			window,
			aggregator,
			filePath,
		};
	} else {
		// llm: rubric is the markdown body
		const rubric = body || undefined;
		const graderModel = frontmatter.grader_model !== undefined ? String(frontmatter.grader_model) : undefined;
		return {
			name: frontmatter.name,
			description: String(frontmatter.description),
			kind: "llm",
			activate,
			rubric,
			graderModel,
			window,
			aggregator,
			filePath,
		};
	}
}

export interface LoadCasesResult {
	cases: EvalCase[];
	errors: string[];
}

/**
 * Load all *.md eval cases from `evalsDir` (relative to `cwd`).
 * Returns successfully parsed cases plus error messages for failed ones.
 */
export async function loadCases(evalsDir: string, cwd: string): Promise<LoadCasesResult> {
	const absoluteDir = evalsDir.startsWith("/") ? evalsDir : join(cwd, evalsDir);
	const cases: EvalCase[] = [];
	const errors: string[] = [];

	let entries: string[];
	try {
		entries = readdirSync(absoluteDir);
	} catch (_err) {
		// Dir doesn't exist yet — not an error, just no cases
		return { cases: [], errors: [] };
	}

	const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();

	for (const file of mdFiles) {
		const filePath = join(absoluteDir, file);
		try {
			const content = readFileSync(filePath, "utf8");
			const evalCase = parseCase(filePath, content);
			cases.push(evalCase);
		} catch (err) {
			errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	return { cases, errors };
}
