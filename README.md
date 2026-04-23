# GSD Force Reactive Extension

A GSD extension that enforces fine-grained reactive (parallel) execution.

When a slice-level planning unit completes (Plan Slice, Replan Slice, Refine Slice), this extension injects a steer message that forces the LLM to verify and fix task I/O annotations before execution begins.

**What it checks:**
1. DAG width meets `max_parallel` (read from `~/.gsd/PREFERENCES.md`, default 8).
2. File paths in `### Inputs` / `### Expected Output` use backtick syntax.
3. No task has empty I/O — placeholder files added where needed.
4. Dependency chains are correct (Task B inputs overlap Task A outputs).

## Install

```bash
gsd install ./path/to/gsd-force-reactive
```

Or copy into `.gsd/extensions/gsd-force-reactive/` for auto-discovery.
