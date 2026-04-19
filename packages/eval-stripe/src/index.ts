/**
 * eval-stripe — Live Eval Stripe extension for Pi.
 *
 * Registers a segmented progress bar above Pi's input that reflects the pass
 * rate of a user-authored eval suite, updated after every agent turn.
 *
 * Usage in .pi/settings.json:
 *   { "extensions": ["./packages/eval-stripe"] }
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { Aggregator } from "./aggregator.js";
import { loadCases } from "./cases.js";
import { registerEvalCommands } from "./commands.js";
import { Runner } from "./runner.js";
import type { AggregatedScore, EvalCase, EvalSettings } from "./types.js";
import { renderWidget } from "./widget.js";

const DEFAULT_SETTINGS: Required<EvalSettings> = {
	path: ".pi/evals",
	enabled: true,
	windowDefault: 1,
	aggregatorDefault: "last",
	graderModel: "claude-haiku-4-5-20251001",
	concurrency: 4,
	timeoutMs: 5000,
	sandboxTimeoutMs: 100,
	barWidth: 24,
};

const WIDGET_KEY = "eval-stripe";

export default function evalStripeExtension(pi: ExtensionAPI): void {
	let settings: Required<EvalSettings> = { ...DEFAULT_SETTINGS };
	let aggregator = new Aggregator([], settings.windowDefault, settings.aggregatorDefault);
	let runner: Runner | null = null;
	let lastScore: AggregatedScore | null = null;
	let loadedCases: EvalCase[] = [];

	// -------------------------------------------------------------------------
	// Session start — load settings + cases, initialize runner, show idle bar
	// -------------------------------------------------------------------------
	pi.on("session_start", async (_event, ctx) => {
		// Merge settings from session-level evals.* keys if available
		// (Settings integration is minimal: read from DEFAULT_SETTINGS for now;
		//  full settings-manager integration would require reading settings.json here)
		settings = readEvalSettings(ctx);

		if (!settings.enabled) {
			if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}

		// Load eval cases
		const { cases, errors } = await loadCases(settings.path, ctx.cwd);
		for (const err of errors) {
			console.error(`[eval-stripe] Case load error: ${err}`);
		}
		loadedCases = cases;

		// Initialise aggregator + runner
		aggregator = new Aggregator(cases, settings.windowDefault, settings.aggregatorDefault);
		runner = new Runner(cases, aggregator, settings, ctx.modelRegistry);
		lastScore = null;

		// Show idle (dim) bar
		if (ctx.hasUI) {
			ctx.ui.setWidget(WIDGET_KEY, renderWidget(null, settings.barWidth));
		}
	});

	// -------------------------------------------------------------------------
	// Track turn start time
	// -------------------------------------------------------------------------
	pi.on("agent_start", async (_event, _ctx) => {
		if (runner) runner.notifyAgentStart();
	});

	// -------------------------------------------------------------------------
	// Agent end — grade the turn and update the widget
	// -------------------------------------------------------------------------
	pi.on("agent_end", async (event, ctx) => {
		if (!settings.enabled || !runner) return;

		try {
			const score = await runner.onAgentEnd(event, ctx);
			if (score !== null) {
				lastScore = score;
				if (ctx.hasUI) {
					ctx.ui.setWidget(WIDGET_KEY, renderWidget(score, settings.barWidth));
				}
			}
		} catch (err) {
			console.error(`[eval-stripe] Runner error: ${err instanceof Error ? err.message : String(err)}`);
		}
	});

	// -------------------------------------------------------------------------
	// Slash commands
	// -------------------------------------------------------------------------
	registerEvalCommands(pi, {
		getRunner: () => runner,
		getAggregator: () => aggregator,
		getSettings: () => settings,
		setSettings: (s) => {
			settings = s;
			aggregator.setWindowDefault(s.windowDefault);
			aggregator.setAggregatorDefault(s.aggregatorDefault);
			if (runner) runner.updateSettings(s);
		},
		getLastScore: () => lastScore,
		getCases: () => loadedCases,
	});
}

// ---------------------------------------------------------------------------
// Read evals.* settings from .pi/settings.json in the project directory,
// merged over DEFAULT_SETTINGS so unset fields fall back to defaults.
// ---------------------------------------------------------------------------

function readEvalSettings(ctx: { cwd: string }): Required<EvalSettings> {
	const settingsPath = join(ctx.cwd, ".pi", "settings.json");
	if (!existsSync(settingsPath)) {
		return { ...DEFAULT_SETTINGS };
	}

	try {
		const raw = readFileSync(settingsPath, "utf8");
		const parsed = JSON.parse(raw) as { evals?: Partial<EvalSettings> };
		const evalsBlock = parsed.evals ?? {};
		const merged = { ...DEFAULT_SETTINGS, ...evalsBlock };
		// Validate aggregatorDefault is a recognized strategy; silently fall back otherwise
		if (merged.aggregatorDefault !== "all" && merged.aggregatorDefault !== "last") {
			merged.aggregatorDefault = DEFAULT_SETTINGS.aggregatorDefault;
		}
		return merged;
	} catch {
		// Malformed settings.json — fall back to defaults silently
		return { ...DEFAULT_SETTINGS };
	}
}
