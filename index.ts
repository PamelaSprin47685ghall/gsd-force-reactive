import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// 用于记录已经强制检查过的 slice，防止在单次会话中无限死循环
const verifiedSlices = new Set<string>();

// 简单读取并解析 PREFERENCES.md 中的 max_parallel
function getMaxParallel(): number {
  try {
    const prefsPath = path.join(os.homedir(), ".gsd", "PREFERENCES.md");
    if (fs.existsSync(prefsPath)) {
      const content = fs.readFileSync(prefsPath, "utf-8");
      // 简单正则匹配 reactive_execution 下的 max_parallel
      const match = content.match(/reactive_execution:[\s\S]*?max_parallel:\s*(\d+)/);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }
  } catch (e) {
    // 忽略错误，返回默认值
  }
  return 8; // 默认值
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    // 仅拦截规划 slice 的工具
    if (event.toolName !== "gsd_plan_slice" && event.toolName !== "gsd_slice_plan") {
      return;
    }

    // 仅当工具执行成功时拦截
    if (event.isError) {
      return;
    }

    // 尝试解析 sliceId
    let sliceId = "unknown";
    try {
      const args = (event as any).input;
      const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
      if (parsedArgs && parsedArgs.sliceId) {
        sliceId = parsedArgs.sliceId;
      }
    } catch (e) {
      // 忽略解析错误
    }

    // 如果该 slice 已经验证过，直接放行
    if (sliceId !== "unknown" && verifiedSlices.has(sliceId)) {
      return;
    }

    if (sliceId !== "unknown") {
      verifiedSlices.add(sliceId);
    }

    const maxParallel = getMaxParallel();

    const prompt = 
      `Wait! Before we conclude the slice planning phase and move on to execution, we MUST ensure the tasks are fully prepared for fine-grained reactive (parallel) execution.\n\n` +
      `GSD's reactive execution engine builds a dependency graph by statically parsing the Inputs and Expected Output sections of every \`TXX-PLAN.md\` file. If **even one** pending task lacks valid I/O annotations, the entire slice will fall back to slow, sequential execution.\n\n` +
      `Furthermore, to maximize execution speed, you MUST break down the work into fine-grained tasks. The reactive engine is configured to execute up to **${maxParallel}** tasks in parallel. If you created a monolithic task, the execution will still be slow. You must ensure tasks are independent where possible and properly chained where dependencies exist.\n\n` +
      `Please rigorously verify and fix the task plans (\`TXX-PLAN.md\`) you just generated:\n\n` +
      `1. **Check Task Granularity:** Review the tasks. If you did not split the work into at least 5-6 fine-grained tasks (to take advantage of the ${maxParallel} max parallel workers), you MUST use the \`gsd_replan_slice\` tool to redefine the tasks. (Use a dummy \`blockerTaskId\` like "T01" and \`blockerDescription\` like "Need finer granularity for reactive parallelism"). Do NOT just create Markdown files with \`write\` or \`edit\`, as the database will not recognize them.\n` +
      `2. **Check Every Task's I/O:** Use the \`read\` tool to inspect every \`TXX-PLAN.md\` file in this slice.\n` +
      `3. **Verify Backtick Syntax:** Look at the \`### Inputs\` and \`### Expected Output\` sections. Every file path MUST be wrapped in backticks (e.g., \`src/index.ts\`) and MUST contain at least a dot (\`.\`) or a slash (\`/\`).\n` +
      `4. **Fix Missing Annotations:** If any task has empty I/O sections, you must use the \`edit\` tool to add them. A task cannot have 0 inputs AND 0 outputs. If a task truly does not read or write files (e.g., pure API calls or commands), you **must** add a dummy file (like \`package.json\`) to both sections to prevent the graph from becoming ambiguous.\n` +
      `5. **Verify Dependency Chains:** Ensure that if Task B depends on Task A, Task B's \`Inputs\` includes at least one file from Task A's \`Expected Output\`. This is how the engine knows the execution order. If they don't overlap in file paths, they will run in parallel!\n` +
      `6. **No Naked Paths:** Paths like \`- src/index.ts\` (without backticks) will NOT be parsed. Change them to \`- \`src/index.ts\`\`.\n\n` +
      `**Action Required Now:**\n` +
      `If you need to add new tasks to increase parallelism, use \`gsd_replan_slice\`. If you only need to fix backticks or add missing I/O annotations to existing tasks, use \`edit\` on the \`TXX-PLAN.md\` files. Once everything is perfect, reply saying "All task plans are verified and optimized for reactive execution." Only then will we proceed to the execution phase.`;

    // 使用 steer 模式，在当前工具执行完毕后立即阻断并注入消息
    pi.sendUserMessage(prompt, { mode: "steer" });
  });
}
