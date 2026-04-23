import { getMaxParallel } from "./utils.js";
import { STEER_DELIVERY_MODE } from "./constants.js";

export function createReactiveController(pi) {
  const interceptedSlices = new Set();

  function buildPrompt(maxParallel) {
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

  return {
    handleToolResult(event) {
      if (event.isError) return;

      let sliceId = "unknown";
      try {
        const input = typeof event.input === "string" ? JSON.parse(event.input) : event.input;
        if (input?.sliceId) {
          sliceId = input.sliceId;
        }
      } catch {
        // ignore
      }

      if (sliceId !== "unknown") {
        if (interceptedSlices.has(sliceId)) return;
        interceptedSlices.add(sliceId);
      }

      const maxParallel = getMaxParallel();
      const prompt = buildPrompt(maxParallel);

      pi.sendUserMessage(prompt, { deliverAs: STEER_DELIVERY_MODE });
    },
    
    reset() {
      interceptedSlices.clear();
    }
  };
}
