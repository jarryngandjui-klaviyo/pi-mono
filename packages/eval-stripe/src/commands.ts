/**
 * Slash commands for the eval stripe extension.
 *
 * /eval run         — force-run all cases against the most recent turn
 * /eval last        — show per-case results for the most recent turn
 * /eval list        — list all loaded eval cases
 * /eval open <name> — open a case file in the terminal editor
 * /eval window <N|session> — change the aggregation window
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Aggregator } from "./aggregator.js";
import type { Runner } from "./runner.js";
import type { AggregatedScore, EvalCase, EvalSettings } from "./types.js";
import { renderWidget } from "./widget.js";

export interface CommandDeps {
	getRunner: () => Runner | null;
	getAggregator: () => Aggregator;
	getSettings: () => Required<EvalSettings>;
	setSettings: (s: Required<EvalSettings>) => void;
	getLastScore: () => AggregatedScore | null;
	getCases: () => EvalCase[];
}

export function registerEvalCommands(pi: ExtensionAPI, deps: CommandDeps): void {
	pi.registerCommand("eval", {
		description: "Eval stripe commands: run | last | list | open <name> | window <N|session>",
		getArgumentCompletions(prefix: string) {
			const cmds = ["run", "last", "list", "open", "window"];
			return cmds.filter((c) => c.startsWith(prefix)).map((c) => ({ label: c, value: c }));
		},
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const parts = args.trim().split(/\s+/);
			const sub = parts[0] ?? "";
			const rest = parts.slice(1).join(" ").trim();

			switch (sub) {
				case "run":
					await handleRun(ctx, deps);
					break;
				case "last":
					await handleLast(ctx, deps);
					break;
				case "list":
					await handleList(ctx, deps);
					break;
				case "open":
					await handleOpen(ctx, deps, rest);
					break;
				case "window":
					await handleWindow(ctx, deps, rest);
					break;
				default:
					ctx.ui.notify(
						`eval: unknown subcommand '${sub}'. Use: run | last | list | open <name> | window <N|session>`,
						"warning",
					);
			}
		},
	});
}

async function handleRun(ctx: ExtensionCommandContext, deps: CommandDeps): Promise<void> {
	const runner = deps.getRunner();
	if (!runner) {
		ctx.ui.notify("eval: no runner active (no session started yet)", "warning");
		return;
	}

	ctx.ui.notify("eval: running cases against last turn…", "info");

	const result = await runner.forceRun(ctx);
	if (!result) {
		ctx.ui.notify("eval: no turn data available to grade", "warning");
		return;
	}

	const score = deps.getAggregator().score();
	ctx.ui.setWidget("eval-stripe", renderWidget(score, deps.getSettings().barWidth));

	ctx.ui.notify(
		`eval run: ${result.passed}/${result.activated} passed (${result.failed} failed)`,
		result.failed > 0 ? "warning" : "info",
	);
}

async function handleLast(ctx: ExtensionCommandContext, deps: CommandDeps): Promise<void> {
	const agg = deps.getAggregator();
	const results = agg.getRecentResults(1);
	if (results.length === 0) {
		ctx.ui.notify("eval: no results yet — wait for a turn to complete", "info");
		return;
	}

	const last = results[0];
	const lines: string[] = [`Last turn: ${last.passed}/${last.activated} passed (${last.failed} failed)`, ""];

	for (const r of last.caseResults) {
		const icon = r.pass ? "✓" : "✗";
		const tag = r.graderError ? " [grader error]" : "";
		lines.push(`  ${icon} ${r.caseName}${tag}: ${r.reason}`);
	}

	ctx.ui.notify(lines.join("\n"), "info");
}

async function handleList(ctx: ExtensionCommandContext, deps: CommandDeps): Promise<void> {
	const cases = deps.getCases();

	if (cases.length === 0) {
		ctx.ui.notify("eval: no cases loaded — check evals.path", "warning");
		return;
	}

	const lines: string[] = [`eval: ${cases.length} case(s) loaded`, ""];
	for (const c of cases) {
		lines.push(`  ${c.name} — ${c.kind} — ${c.description}`);
	}
	ctx.ui.notify(lines.join("\n"), "info");
}

async function handleOpen(ctx: ExtensionCommandContext, deps: CommandDeps, name: string): Promise<void> {
	if (!name) {
		ctx.ui.notify("eval open: provide a case name", "warning");
		return;
	}

	const settings = deps.getSettings();
	const filePath = join(ctx.cwd, settings.path, `${name}.md`);

	let prefill: string | undefined;
	try {
		prefill = readFileSync(filePath, "utf8");
	} catch {
		prefill = undefined;
	}

	const content = await ctx.ui.editor(`Eval case: ${name}`, prefill);
	if (content !== undefined) {
		writeFileSync(filePath, content, "utf8");
		ctx.ui.notify(`eval: saved ${filePath}`, "info");
	}
}

async function handleWindow(ctx: ExtensionCommandContext, deps: CommandDeps, raw: string): Promise<void> {
	if (!raw) {
		const current = deps.getSettings().window;
		ctx.ui.notify(`eval: current window = ${current}`, "info");
		return;
	}

	let window: number | "session";
	if (raw === "session") {
		window = "session";
	} else {
		const n = parseInt(raw, 10);
		if (Number.isNaN(n) || n < 1) {
			ctx.ui.notify(`eval window: expected a positive integer or 'session', got '${raw}'`, "warning");
			return;
		}
		window = n;
	}

	const settings = deps.getSettings();
	deps.setSettings({ ...settings, window });
	ctx.ui.notify(`eval: window set to ${window}`, "info");

	// Re-render widget with updated score
	const score = deps.getAggregator().score();
	ctx.ui.setWidget("eval-stripe", renderWidget(score, settings.barWidth));
}
