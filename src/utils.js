import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MAX_PARALLEL_DEFAULT } from "./constants.js";

/**
 * Reads max_parallel from ~/.gsd/PREFERENCES.md
 */
export function getMaxParallel() {
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
    // ignore
  }
  return MAX_PARALLEL_DEFAULT;
}
