import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GSD_HOME = process.env.GSD_HOME ?? join(homedir(), ".gsd");
const MAX_PARALLEL_DEFAULT = 8;

/**
 * Planning-phase prompt signatures — substrings that uniquely identify
 * a prompt as belonging to a slice/milestone planning or replanning unit.
 * These appear in the `prompt` field of `before_agent_start` (the user
 * message that kicks off the agent turn).
 */
/**
 * Slice-level planning prompts — these are the phases that produce
 * TXX-PLAN.md files with Inputs/Expected Output that the reactive
 * engine parses. Milestone-level planning (roadmap) does NOT produce
 * task plans, so it is excluded.
 */
const PLAN_PHASE_SIGNATURES = [
	"## UNIT: Plan Slice",
	"## UNIT: Replan Slice",
	"## UNIT: Refine Slice",
];

function isPlanPhasePrompt(prompt) {
	if (typeof prompt !== "string") return false;
	return PLAN_PHASE_SIGNATURES.some((sig) => prompt.includes(sig));
}

function getMaxParallel() {
	try {
		const prefsPath = join(GSD_HOME, "PREFERENCES.md");
		if (existsSync(prefsPath)) {
			const content = readFileSync(prefsPath, "utf-8");
			const match = content.match(
				/reactive_execution:[\s\S]*?max_parallel:\s*(\d+)/i,
			);
			return match?.[1] ? parseInt(match[1], 10) : MAX_PARALLEL_DEFAULT;
		}
	} catch {
		/* ignore */
	}
	return MAX_PARALLEL_DEFAULT;
}

function buildSteerMessage(maxParallel) {
	return (
		`**Wait! Before we conclude the slice planning phase and move on to execution, we MUST ensure the tasks are fully prepared for high-concurrency reactive (parallel) execution.**\n\n` +
		`GSD's reactive execution engine builds a dependency graph by statically parsing the \`Inputs\` and \`Expected Output\` sections of every \`TXX-PLAN.md\` file. If **even one** pending task lacks valid I/O annotations, the entire slice will fall back to slow, sequential execution.\n\n` +
		`**Critical Requirements to maximize concurrency:**\n\n` +
		`1.  **Maximize DAG Width:** The reactive engine is configured to execute up to **${maxParallel}** tasks in parallel. You MUST ensure that at any given moment in the dependency graph, there are at least **${maxParallel}** independent tasks ready to be dispatched. If your current breakdown results in a narrow "chain" of tasks, you MUST use \`gsd_replan_slice\` to decompose them into finer, parallelizable units.\n` +
		`2.  **Verify Backtick Syntax:** Look at the \`### Inputs\` and \`### Expected Output\` sections in the \`TXX-PLAN.md\` files. Every file path **MUST** be wrapped in backticks (e.g., \`- \`src/index.ts\`\`) and MUST contain at least a dot (\`.\`) or a slash (\`/\`).\n` +
		`3.  **No Empty I/O:** A task cannot have 0 inputs AND 0 outputs. If a task truly does not read or write files (e.g., pure API calls or config setup), you **must** add a unique task-specific placeholder file (like \`.gsd/placeholders/TXX.marker\`) to both sections. Do NOT use common files like \`package.json\` or \`README.md\`, as this will cause dependency collisions and destroy parallelism.\n` +
		`4.  **Verify Dependency Chains:** Ensure that if Task B depends on Task A, Task B's \`Inputs\` includes at least one file from Task A's \`Expected Output\`. If they don't overlap in file paths, they will run in parallel!\n\n` +
		`**Action Required Now:**\n` +
		`Review the tasks you just generated. If the DAG width is less than **${maxParallel}**, use \`gsd_replan_slice\`. If you only need to fix backticks or add missing I/O annotations, use \`edit\` on the \`TXX-PLAN.md\` files. Once everything is perfect, reply saying: **"All task plans are verified and optimized for reactive execution with maximum DAG width."** Only then will we proceed to the execution phase.`
	);
}

/**
 * Force Reactive Extension (v2.0.0)
 *
 * Strategy: listen to `agent_end`, look back at the prompt that started
 * this agent turn (captured from `before_agent_start`). If the prompt
 * indicates a planning phase (plan-slice, plan-milestone, replan-slice,
 * refine-slice), inject a steer message demanding the LLM optimize the
 * plan for reactive execution concurrency.
 *
 * Why agent_end instead of tool_result:
 * - The old approach tried intercepting gsd_plan_slice tool results, but
 *   pi's extension runner doesn't reliably surface those for GSD tools.
 * - agent_end fires reliably after every agent turn, giving us a clean
 *   hook point to inspect what just happened and steer the next turn.
 */
export default function (pi) {
	/** The prompt from the most recent before_agent_start event. */
	let lastPrompt = "";

	/** Guard: only steer once per planning phase to avoid loops. */
	let alreadySteered = false;

	pi.on("before_agent_start", (event) => {
		lastPrompt = typeof event.prompt === "string" ? event.prompt : "";
		alreadySteered = false;
	});

	pi.on("agent_end", () => {
		// Skip if we already steered this planning turn, or the prompt
		// wasn't a planning phase.
		if (alreadySteered) return;
		if (!isPlanPhasePrompt(lastPrompt)) return;

		alreadySteered = true;
		pi.sendUserMessage(buildSteerMessage(getMaxParallel()), {
			deliverAs: "steer",
		});
	});

	pi.on("session_switch", () => {
		lastPrompt = "";
		alreadySteered = false;
	});
}
