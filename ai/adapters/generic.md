# Generic tool contract

Use this contract for any coding assistant that is not Cursor, Codex, or ChatGPT.

## Load

1. Read `ai/README.md`.
2. Read `ai/core/lifecycle.md` before the first application edit on a development task.
3. Read `ai/project/profile.json`, `ai/core/issue-tracker.md`, `ai/rules/git-and-delivery.md`, and `ai/rules/minimal-implementation.md`. Treat a pasted story as a valid task source. Prepare a task branch even when no ticket ID is present.
4. Read the file-scoped rule that matches the files being changed.
5. Read `ai/agents/implementer.md`, `ai/agents/code-reviewer.md`, and `ai/agents/test-engineer.md` before those phases.

Do not copy those files into a vendor prompt library. Point the tool at them. If the tool can only store one instruction file, store a pointer that names these paths and tell the operator to have the tool read them.

## Execute

- If the tool can start separate agents, map them to the three role names and run the lifecycle order. Pass the story or ticket, acceptance criteria, branch, paths, and prior verdict. Wait for evidence.
- If it cannot, run **Single-agent fallback** and disclose that.
- Record the execution mode in the final report.

## Evidence

- Do not invent ticket text, diffs, or test results. Do not assume a tracker the profile does not name.
- A check that did not run is `NOT RUN` or `BLOCKED`.
- Do not edit `ai/` during a feature task unless the user authorizes instruction maintenance.

## Git approval

Read and follow `ai/rules/git-and-delivery.md`. A generic tool may not provide a hard-lock that guarantees approval before staging or committing; enforce the canonical approval gate when Git operations are available, and do not duplicate it here.

## Drift

After a change to `ai/core/lifecycle.md` or `ai/agents/`, run `node ai/validate.mjs`. Fix adapters that no longer point at the canonical files. Do not add engineering requirements to the adapter.
