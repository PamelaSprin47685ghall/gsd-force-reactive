import { INTERCEPT_TOOL, INTERCEPT_TOOL_ALIAS } from "./constants.js";
import { createReactiveController } from "./controller.js";

export default function forceReactiveExtension(pi) {
  const controller = createReactiveController(pi);

  pi.on("tool_result", (event) => {
    if (event.toolName === INTERCEPT_TOOL || event.toolName === INTERCEPT_TOOL_ALIAS) {
      controller.handleToolResult(event);
    }
  });

  pi.on("session_switch", () => controller.reset());
}
