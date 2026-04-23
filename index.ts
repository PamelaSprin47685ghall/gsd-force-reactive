import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * GSD Force Reactive Extension
 * 
 * Enforces fine-grained task decomposition and correct I/O annotation
 * for GSD's reactive execution engine.
 */

// Track which slices have already been intercepted to prevent loops
const interceptedSlices = new Set<string>();

/**
 * Reads max_parallel from ~/.gsd/PREFERENCES.md
 */
function getMaxParallel(): number {
  try {
    const prefsPath = path.join(os.homedir(), ".gsd", "PREFERENCES.md");
    if (fs.existsSync(prefsPath)) {
      const content = fs.readFileSync(prefsPath, "utf-8");
      // Match reactive_execution: ... max_parallel: X
      const match = content.match(/reactive_execution:[\s\S]*?max_parallel:\s*(\d+)/i);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }
  } catch {
    // Fallback to a sensible default if parsing fails
  }
  return 8;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    // Only intercept successful gsd_plan_slice (or its alias)
    if (event.toolName !== "gsd_plan_slice" && event.toolName !== "gsd_slice_plan") {
      return;
    }

    if (event.isError) {
      return;
    }

    // Try to extract sliceId from input arguments
    let sliceId = "unknown";
    try {
      const input = typeof event.input === "string" ? JSON.parse(event.input) : event.input;
      if (input?.sliceId) {
        sliceId = input.sliceId;
      }
    } catch {
      // Ignore parsing errors
    }

    // Deduplicate: only intercept once per sliceId per session
    if (sliceId !== "unknown") {
      if (interceptedSlices.has(sliceId)) return;
      interceptedSlices.add(sliceId);
    }

    const maxParallel = getMaxParallel();

    // Construct the intercept prompt
    const prompt = 
      `**Wait! Before we conclude the slice planning phase and move on to execution, we MUST ensure the tasks are fully prepared for fine-grained reactive (parallel) execution.**\n\n` +
      `GSD's reactive execution engine builds a dependency graph by statically parsing the \`Inputs\` and \`Expected Output\` sections of every \`TXX-PLAN.md\` file. If **even one** pending task lacks valid I/O annotations, the entire slice will fall back to slow, sequential execution.\n\n` +
      `Furthermore, to maximize execution speed, you MUST break down the work into fine-grained tasks. The reactive engine is configured to execute up to **${maxParallel}** tasks in parallel. If you created a monolithic task, execution will be slow. You must ensure tasks are independent where possible and properly chained where dependencies exist.\n\n` +
      `Please rigorously verify and fix the task plans you just generated:\n\n` +
      `1.  **Check Task Granularity:** Review the tasks. If you did not split the work into at least 5-6 fine-grained tasks (to take advantage of the ${maxParallel} max parallel workers), you **MUST** use the \`gsd_replan_slice\` tool to redefine the tasks. (Use a dummy \`blockerTaskId\` like "T00" and \`blockerDescription\` like "Increasing granularity for reactive parallelism").\n` +
      `2.  **Verify Backtick Syntax:** Look at the \`### Inputs\` and \`### Expected Output\` sections in the \`TXX-PLAN.md\` files. Every file path **MUST** be wrapped in backticks (e.g., \`- \`src/index.ts\`\`) and MUST contain at least a dot (\`.\`) or a slash (\`/\`).\n` +
      `3.  **Fix Missing Annotations:** If any task has empty I/O sections, you must use the \`edit\` tool to add them. A task cannot have 0 inputs AND 0 outputs. If a task truly does not read or write files (e.g., pure API calls), you **must** add a placeholder file (like \`package.json\`) to both sections to prevent the graph from becoming ambiguous.\n` +
      `4.  **Verify Dependency Chains:** Ensure that if Task B depends on Task A, Task B's \`Inputs\` includes at least one file from Task A's \`Expected Output\`. If they don't overlap in file paths, they will run in parallel!\n\n` +
      `**Action Required Now:**\n` +
      `If you need to add new tasks, use \`gsd_replan_slice\`. If you only need to fix backticks or add missing I/O annotations, use \`edit\` on the \`TXX-PLAN.md\` files. Once everything is perfect, reply saying: **"All task plans are verified and optimized for reactive execution."** Only then will we proceed to the execution phase.`;

    // Deliver the prompt as 'steer' to intercept the flow immediately
    pi.sendUserMessage(prompt, { deliverAs: "steer" });
  });
}
