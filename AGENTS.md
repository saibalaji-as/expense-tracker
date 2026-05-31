## Persistent project memory

Use project memory selectively. Do not load every `/ai` file in full at the start of each chat.

For substantial code changes, read:
- `ai/PROJECT_CONTEXT.md`
- `ai/AI_RULES.md`

For small, isolated tasks, read only the relevant sections of those files.

Use these as targeted lookups:
- `ai/CURRENT_STATE.md`: check active bugs, blockers, unfinished work, and immediate next steps when relevant.
- `ai/TASK_HISTORY.md`: search with `rg` when historical reasoning, prior fixes, or rejected approaches matter. Do not read the full archive by default.
- `ai/ACCOUNT_BALANCES_DEBT_EMI_PLAN.md`: read only for finance-account or debt/EMI planning work.
- `drive-ai.md`: maintenance guide for the memory system; do not load for normal feature work.

Treat `/ai` as curated product and decision memory. Treat Graphify as generated live code intelligence.
Use Graphify and relevant source files to verify current implementation details before editing; memory may be stale.
Use `graphify affected "<concept>"` before changing shared services or cross-cutting state.
On a fresh clone or second machine, run `./scripts/setup-ai-context.sh` once to install and configure
local Graphify integration. Future `git pull` merges refresh the local graph through a machine-local hook.

After major tasks:
- Update `ai/CURRENT_STATE.md` with concise active status only.
- Append a brief decision-oriented entry to `ai/TASK_HISTORY.md`.
- Update `ai/PROJECT_CONTEXT.md` only when stable architecture, data flow, integrations, or business rules change.
- Update `ai/AI_RULES.md` only when a durable engineering rule emerges.
- Do not copy Graphify output, touched-file inventories, or long verification logs into startup memory.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
