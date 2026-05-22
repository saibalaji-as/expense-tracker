# How To Maintain AI Project Memory

## Purpose
- Chats are temporary.
- The files inside `/ai` are permanent project memory.
- Future AI sessions should read these files first, then work from the real codebase.
- Keep memory dense, factual, and architecture-aware.

## Memory Files
- `ai/PROJECT_CONTEXT.md`
  - Stable long-term architecture.
  - Update only when architecture, data flow, storage, auth, deployment, integrations, or core business rules change.

- `ai/CURRENT_STATE.md`
  - Active short-term project status.
  - Update after every meaningful coding/debugging/design session.
  - Keep it concise but specific.

- `ai/AI_RULES.md`
  - Rules future AI must follow while editing this project.
  - Update when a new convention, restriction, or repeated mistake is discovered.

- `ai/TASK_HISTORY.md`
  - Historical engineering memory.
  - Update when a task is completed, a bug is fixed, a decision is made, or an approach is rejected.

## What To Tell A New AI Chat
Start future coding chats with this:

```text
Before working, read:
- ai/PROJECT_CONTEXT.md
- ai/CURRENT_STATE.md
- ai/AI_RULES.md
- ai/TASK_HISTORY.md

Treat those files as persistent project memory.
Verify the current code before making changes.
After completing the task, update CURRENT_STATE.md and TASK_HISTORY.md.
Update PROJECT_CONTEXT.md only if architecture changed.
Update AI_RULES.md only if new project rules emerged.
```

## Session-End Checklist
At the end of every major task:

1. Re-read changed files.
2. Update `ai/CURRENT_STATE.md` with:
   - completed work
   - changed files/modules
   - current bugs/issues
   - blockers
   - immediate next steps

3. Update `ai/TASK_HISTORY.md` with:
   - what was done
   - why it was done
   - bugs fixed
   - decisions made
   - rejected approaches
   - test/build results

4. Update `ai/PROJECT_CONTEXT.md` only if:
   - storage/data model changed
   - auth/backup mode changed
   - app architecture changed
   - deployment/build changed
   - external integrations changed
   - core business rules changed

5. Update `ai/AI_RULES.md` only if:
   - a new convention was introduced
   - a pattern must be enforced
   - a risky area needs a warning
   - a repeated mistake should be prevented

## What Good Memory Looks Like
- Specific file names and module names.
- Exact business rules.
- Exact storage keys, schemas, and service ownership.
- Current source of truth clearly stated.
- Known risks and technical debt clearly listed.
- Test/build commands and results recorded.
- No vague phrases like “improved the app” or “fixed some bugs.”

## What Not To Do
- Do not rely on chat history for important context.
- Do not overwrite useful history with a short summary.
- Do not remove architectural decisions unless they are truly obsolete.
- Do not record guesses as facts.
- Do not duplicate business logic without checking existing services/utilities.
- Do not update `PROJECT_CONTEXT.md` for minor UI tweaks.

## Current Project Memory Rule
For this project, future AI must remember:

- Active app root is `personal-finance-pwa/`.
- Google Drive JSON backup is the current source of truth.
- Google Sheets is migration/legacy, not primary persistence.
- `ExpenseStore` owns active expense/limit/monthly-income state.
- `GoogleDriveService` owns raw Drive operations.
- `BackupModeService` owns single/family mode state.
- Family mode is folder-based: `Spenza Family` contains `spenza-backup.json` and `Receipts/`.
- AI/Gemini features are optional and require user-supplied key.
- Local deterministic fallbacks are required for AI insight and receipt extraction features.

## Recommended Commit Habit
After memory updates, commit the `/ai` files with code changes when possible.

Example commit message:

```text
docs(ai): update persistent project memory
```
