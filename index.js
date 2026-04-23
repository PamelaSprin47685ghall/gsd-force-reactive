import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GSD_HOME = process.env.GSD_HOME ?? join(homedir(), ".gsd");
const MAX_PARALLEL_DEFAULT = 8;

/** Substrings that identify a slice-level planning prompt. */
const PLAN_SIGNATURES = [
	"## UNIT: Plan Slice",
	"## UNIT: Replan Slice",
	"## UNIT: Refine Slice",
];

function isPlanPrompt(text) {
	return typeof text === "string" && PLAN_SIGNATURES.some((s) => text.includes(s));
}

function readMaxParallel() {
	try {
		const p = join(GSD_HOME, "PREFERENCES.md");
		if (!existsSync(p)) return MAX_PARALLEL_DEFAULT;
		const m = readFileSync(p, "utf-8").match(
			/reactive_execution:[\s\S]*?max_parallel:\s*(\d+)/i,
		);
		return m?.[1] ? parseInt(m[1], 10) : MAX_PARALLEL_DEFAULT;
	} catch {
		return MAX_PARALLEL_DEFAULT;
	}
}

function steerContent(maxP) {
	return [
		"**Before proceeding to execution, verify the task plans are ready for reactive (parallel) execution.**",
		"",
		"The reactive engine parses `Inputs` and `Expected Output` from every `TXX-PLAN.md` to build a DAG.",
		"Missing or malformed annotations force sequential fallback.",
		"",
		"**Checklist:**",
		`1. **DAG width ≥ ${maxP}:** Decompose narrow chains into independent tasks (use \`gsd_replan_slice\` if needed).`,
		"2. **Backtick file paths:** Every path in `### Inputs` / `### Expected Output` must be in backticks and contain a `.` or `/`.",
		"3. **No empty I/O:** Every task needs at least one input or output. Use a unique placeholder (e.g. `.gsd/placeholders/TXX.marker`) if the task has no real files.",
		"4. **Dependency links:** If Task B depends on Task A, Task B's `Inputs` must include a file from Task A's `Expected Output`.",
		"",
		"Fix issues with `edit` on the `TXX-PLAN.md` files, or `gsd_replan_slice` for structural changes.",
		'Reply **"All task plans verified for reactive execution."** when done.',
	].join("\n");
}

/**
 * Force Reactive Extension (v3.0.0)
 *
 * After a slice-level planning unit finishes (Plan Slice / Replan Slice /
 * Refine Slice), inject a steer message that forces the LLM to verify and
 * fix task I/O annotations before execution begins.
 *
 * Hook: agent_end — fires once after the entire agent loop completes.
 * Guard: per-session flag prevents re-injection on the same planning turn.
 */
export default function (pi) {
	let lastPrompt = "";
	let steered = false;

	pi.on("before_agent_start", (event) => {
		lastPrompt = typeof event.prompt === "string" ? event.prompt : "";
		steered = false;
	});

	pi.on("agent_end", () => {
		if (steered) return;
		if (!isPlanPrompt(lastPrompt)) return;
		steered = true;

		pi.sendMessage(
			{
				customType: "gsd-force-reactive",
				content: steerContent(readMaxParallel()),
				display: true,
			},
			{ triggerTurn: true, deliverAs: "steer" },
		);
	});

	pi.on("session_switch", () => {
		lastPrompt = "";
		steered = false;
	});
}
