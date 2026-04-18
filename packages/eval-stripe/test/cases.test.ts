import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCases } from "../src/cases.js";

const tmp = () => join(tmpdir(), `eval-stripe-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

describe("loadCases", () => {
	let dir: string;
	let evalsDir: string;

	beforeEach(() => {
		dir = tmp();
		evalsDir = join(dir, ".pi", "evals");
		mkdirSync(evalsDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns empty arrays when evals dir does not exist", async () => {
		const result = await loadCases(".pi/evals", "/nonexistent-dir-xyz");
		expect(result.cases).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it("parses a deterministic case", async () => {
		writeFileSync(
			join(evalsDir, "test-case.md"),
			`---
name: test-case
description: A test case
kind: deterministic
activate:
  any_tool: edit
check: |
  return toolCalls.length > 0;
---

Human notes here.
`,
		);

		const result = await loadCases(".pi/evals", dir);
		expect(result.errors).toEqual([]);
		expect(result.cases).toHaveLength(1);
		const c = result.cases[0];
		expect(c.name).toBe("test-case");
		expect(c.kind).toBe("deterministic");
		expect(c.activate).toEqual({ any_tool: "edit" });
		expect(c.check).toContain("return toolCalls.length > 0");
	});

	it("parses an llm case with rubric body", async () => {
		writeFileSync(
			join(evalsDir, "llm-case.md"),
			`---
name: concise-when-asked
description: Conciseness check
kind: llm
activate:
  user_message_regex: "(briefly|tl;?dr)"
grader_model: claude-haiku-4-5-20251001
---

The user asked for brevity. Pass only if the response is one sentence.
`,
		);

		const result = await loadCases(".pi/evals", dir);
		expect(result.errors).toEqual([]);
		expect(result.cases).toHaveLength(1);
		const c = result.cases[0];
		expect(c.name).toBe("concise-when-asked");
		expect(c.kind).toBe("llm");
		expect(c.rubric).toContain("Pass only if the response is one sentence");
		expect(c.graderModel).toBe("claude-haiku-4-5-20251001");
	});

	it("rejects case with missing frontmatter", async () => {
		writeFileSync(join(evalsDir, "bad.md"), "no frontmatter here\n");
		const result = await loadCases(".pi/evals", dir);
		expect(result.cases).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("Missing YAML frontmatter");
	});

	it("rejects case with unknown kind", async () => {
		writeFileSync(
			join(evalsDir, "unknown-kind.md"),
			`---
name: bad-kind
description: bad
kind: scenario
check: |
  return true;
---
`,
		);
		const result = await loadCases(".pi/evals", dir);
		expect(result.cases).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("'kind' must be 'deterministic' or 'llm'");
	});

	it("rejects deterministic case with missing check", async () => {
		writeFileSync(
			join(evalsDir, "no-check.md"),
			`---
name: no-check
description: missing check
kind: deterministic
---
`,
		);
		const result = await loadCases(".pi/evals", dir);
		expect(result.cases).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("'check' must be a non-empty string");
	});

	it("surfaces errors without dropping valid cases", async () => {
		writeFileSync(
			join(evalsDir, "a-good.md"),
			`---
name: good-case
description: valid
kind: deterministic
check: |
  return true;
---
`,
		);
		writeFileSync(join(evalsDir, "b-bad.md"), "no frontmatter\n");

		const result = await loadCases(".pi/evals", dir);
		expect(result.cases).toHaveLength(1);
		expect(result.errors).toHaveLength(1);
		expect(result.cases[0].name).toBe("good-case");
	});

	it("parses a case with no activate (always activates)", async () => {
		writeFileSync(
			join(evalsDir, "always.md"),
			`---
name: always-on
description: no activate
kind: deterministic
check: |
  return true;
---
`,
		);
		const result = await loadCases(".pi/evals", dir);
		expect(result.errors).toEqual([]);
		expect(result.cases[0].activate).toBeUndefined();
	});

	it("parses composite activate predicates", async () => {
		writeFileSync(
			join(evalsDir, "composite.md"),
			`---
name: composite
description: composite predicate
kind: deterministic
activate:
  all:
    - any_tool: edit
    - min_tool_calls: 2
check: |
  return true;
---
`,
		);
		const result = await loadCases(".pi/evals", dir);
		expect(result.errors).toEqual([]);
		expect(result.cases[0].activate).toEqual({
			all: [{ any_tool: "edit" }, { min_tool_calls: 2 }],
		});
	});
});
