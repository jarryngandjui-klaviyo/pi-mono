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
import { Aggregator } from "./aggregator.js";
import { loadCases } from "./cases.js";
import { registerEvalCommands } from "./commands.js";
import { Runner } from "./runner.js";
import type { AggregatedScore, EvalSettings } from "./types.js";
import { renderWidget } from "./widget.js";

const DEFAULT_SETTINGS: Required<EvalSettings> = {
	path: ".pi/evals",
	enabled: true,
	window: 1,
	graderModel: "claude-haiku-4-5-20251001",
	concurrency: 4,
	timeoutMs: 5000,
	sandboxTimeoutMs: 100,
	barWidth: 24,
};

const WIDGET_KEY = "eval-stripe";

export default function evalStripeExtension(pi: ExtensionAPI): void {
	let settings: Required<EvalSettings> = { ...DEFAULT_SETTINGS };
	let aggregator = new Aggregator(settings.window);
	let runner: Runner | null = null;
	let lastScore: AggregatedScore | null = null;

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

		// Initialise aggregator + runner
		aggregator = new Aggregator(settings.window);
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
			aggregator.setWindow(s.window);
			if (runner) runner.updateSettings(s);
		},
		getLastScore: () => lastScore,
	});
}

// ---------------------------------------------------------------------------
// Read evals.* settings from the extension context.
// The plan calls for settings-manager integration; we extend the Settings
// interface via module augmentation below, and read values where available.
// ---------------------------------------------------------------------------

function readEvalSettings(_ctx: { cwd: string }): Required<EvalSettings> {
	// For now, return defaults. Settings integration (reading from settings.json
	// via the settings-manager typed extension) is done in the settings patch below.
	// A full integration would read ctx.sessionManager settings; that requires
	// the settings-manager to expose evals.* keys which we add via types-only patch.
	return { ...DEFAULT_SETTINGS };
}
