# GSD Force Reactive Extension

A GSD extension that enforces fine-grained reactive (parallel) execution.

This plugin intercepts the `gsd_plan_slice` tool result. When a slice is planned, it pauses the workflow and injects a prompt instructing the LLM to:
1. Break down tasks into fine-grained units to maximize parallel workers (dynamically reads `max_parallel` from `~/.gsd/PREFERENCES.md`).
2. Properly annotate `### Inputs` and `### Expected Output` in every `TXX-PLAN.md` file using backticks.
3. Establish clear, correct dependency chains to ensure GSD's reactive engine can construct an unambiguous DAG.

## Usage

Run `pi` with the extension flag:

```bash
pi -e ./index.ts
```

Or copy the script to your project's `.gsd/extensions/` directory for automatic loading.
